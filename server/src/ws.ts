// Il canale in diretta tra la pagina Regia (il "motore") e i telecomandi.
// Regola "chi c'è comanda": una pagina nuova prende il comando da sola solo
// se nessun motore è vivo; altrimenti si apre in sola lettura, e serve il
// pulsante "Prendi il controllo" per scalzare quella che sta comandando.
import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import type { StatoLive, Presentazione } from "../../shared/tipi";
import type { Store } from "./store";
import { scriviEvento, type EventoDiario } from "./diario";
import type { Luci } from "./luci";
import { luceAllaFase, luceAllaFine, luceAllaPartenza, LUCE_SU_STOP_TUTTO } from "../../shared/luci";

interface Client {
  ws: WebSocket;
  ruolo: "regia" | "telecomando";
  ip: string;
  vivo: boolean;
  sessioneId: string | null;
  /** Quattro caratteri per riconoscere la finestra nel diario. */
  id4: string;
}

const STATO_VUOTO: Omit<StatoLive, "motoreOnline"> = {
  tipo: "stato",
  formatId: null,
  faseId: null,
  master: 0.8,
  attivi: [],
};

// Se il motore non manda un battito per questo tempo, è considerato spento
// (una finestra congelata dal browser risponde ai ping di rete ma non batte).
const BATTITO_TIMEOUT_MS = Number(process.env.REGIA_BATTITO_MS || 12_000);

export class Hub {
  private clienti = new Set<Client>();
  private motore: Client | null = null;
  /** Per il diario: memoria dell'ultimo stato e dell'ultimo comando ricevuto. */
  private diarioPrec: { istanze: Map<string, string>; faseId: string | null; formatId: string | null; parla: boolean; fatti: Set<string> } =
    { istanze: new Map(), faseId: null, formatId: null, parla: false, fatti: new Set() };
  private ultimoComando: { comando: string; origine: string; quando: number } | null = null;
  /** Soundcheck in corso: quando è partito e quante caselle ha provato. */
  private soundcheck: { inizio: string; provate: number } | null = null;
  private ultimoBattito = 0;
  private ultimoStato: StatoLive | null = null;
  /** istanzaId → cueId, per sapere quale casella è finita (le luci "a fine suono"). */
  private diarioCueId = new Map<string, string>();
  private intervalloPing: NodeJS.Timeout;
  private intervalloBattito: NodeJS.Timeout;

  constructor(
    server: Server,
    private store: Store,
    private luci: Luci | null = null,
  ) {
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (ws, req) => this.nuovaConnessione(ws, req));

    // Ping/pong ogni 10 s: chi non risponde viene scollegato.
    this.intervalloPing = setInterval(() => {
      for (const c of [...this.clienti]) {
        if (!c.vivo) {
          c.ws.terminate();
          continue;
        }
        c.vivo = false;
        c.ws.ping();
      }
    }, 10_000);
    this.intervalloPing.unref();

    // Battito del motore: senza battito per troppo tempo → offline o promozione.
    this.intervalloBattito = setInterval(
      () => {
        if (!this.motore) return;
        if (Date.now() - this.ultimoBattito <= BATTITO_TIMEOUT_MS) return;
        const congelato = this.motore;
        this.motore = null;
        this.invia(congelato.ws, { tipo: "motore_sostituito" });
        this.promuoviOppureOffline(congelato);
      },
      Math.max(250, Math.min(2000, BATTITO_TIMEOUT_MS / 4)),
    );
    this.intervalloBattito.unref();
  }

  /** Il motore attuale è vivo (collegato e coi battiti freschi)? */
  private motoreVivo(): boolean {
    return this.motore !== null && Date.now() - this.ultimoBattito <= BATTITO_TIMEOUT_MS;
  }

  /** Rende `client` il motore; la pagina precedente viene avvisata. */
  private nominaMotore(client: Client): void {
    const precedente = this.motore;
    this.motore = client;
    this.ultimoBattito = Date.now();
    if (precedente && precedente !== client) {
      this.invia(precedente.ws, { tipo: "motore_sostituito" });
    }
    this.invia(client.ws, { tipo: "ruoloAssegnato", motore: true });
  }

  /** Il motore se n'è andato: promuovi un'altra pagina Regia, o segnala offline. */
  private promuoviOppureOffline(escluso: Client | null): void {
    const prossima = [...this.clienti].find((c) => c.ruolo === "regia" && c !== escluso);
    if (prossima) {
      this.nominaMotore(prossima);
    } else {
      this.ultimoStato = { ...this.statoCorrente(), motoreOnline: false };
      this.aTutti(this.ultimoStato);
    }
  }

  private nuovaConnessione(ws: WebSocket, req: IncomingMessage): void {
    const ip = req.socket.remoteAddress ?? "?";
    let client: Client | null = null;

    ws.on("pong", () => {
      if (client) client.vivo = true;
    });

    ws.on("message", (dati) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(dati));
      } catch {
        return;
      }

      // Primo messaggio: chi sei?
      if (!client) {
        const p = msg as Presentazione;
        if (p.ruolo !== "regia" && p.ruolo !== "telecomando") {
          ws.close(4000, "Presentazione non valida");
          return;
        }
        if (p.ruolo === "telecomando" && p.pin !== this.store.config.impostazioni.pin) {
          ws.close(4001, "PIN errato");
          return;
        }
        client = {
          ws,
          ruolo: p.ruolo,
          ip,
          vivo: true,
          sessioneId: p.sessioneId ?? null,
          id4: (p.sessioneId ?? randomBytes(2).toString("hex")).slice(-4),
        };
        this.clienti.add(client);

        // "Chi c'è comanda": la pagina nuova prende il comando da sola solo
        // se nessun motore è vivo; altrimenti resta in sola lettura.
        if (p.ruolo === "regia") {
          if (this.motoreVivo()) {
            this.invia(ws, { tipo: "ruoloAssegnato", motore: false });
          } else {
            this.nominaMotore(client);
          }
        }

        // Stato corrente a chi si collega.
        this.invia(ws, this.statoCorrente());
        this.aggiornaTelefoni();
        return;
      }

      const m = msg as { tipo?: string };
      if (m.tipo === "ping") {
        this.invia(ws, { tipo: "pong" });
        return;
      }

      if (m.tipo === "battito") {
        if (client === this.motore) this.ultimoBattito = Date.now();
        return;
      }

      if (m.tipo === "prendi_comando") {
        // Una pagina Regia (ri)prende il comando.
        if (client.ruolo === "regia" && client !== this.motore) this.nominaMotore(client);
        else if (client === this.motore) this.ultimoBattito = Date.now();
        return;
      }

      if (m.tipo === "rilascio") {
        // La pagina sta per chiudersi: passa subito il comando ed esce dai
        // clienti (il socket può restare aperto ancora un po' dopo un ricaricamento:
        // un "fantasma" non deve mai essere promosso al posto di una pagina viva).
        this.clienti.delete(client);
        if (client === this.motore) {
          this.motore = null;
          this.promuoviOppureOffline(client);
        }
        this.aggiornaTelefoni();
        return;
      }

      if (m.tipo === "comando") {
        const origine = `${client.ruolo === "regia" ? "mac" : "telefono"}·${client.id4}`;
        const comando = (m as { comando?: string }).comando ?? "";
        // Durante il soundcheck i telefoni non comandano.
        if (client.ruolo === "telecomando" && this.ultimoStato?.soundcheck) return;
        this.ultimoComando = { comando, origine, quando: Date.now() };
        if (comando === "fade") this.annota({ tipo: "fade", origine });
        if (comando === "stopTutto") {
          this.annota({ tipo: "stop tutto", origine });
          // STOP TUTTO: le luci tornano com'erano (FADE OUT no).
          void this.luci?.esegui(LUCE_SU_STOP_TUTTO, "stop tutto");
        }
        // I comandi vanno SOLO al motore corrente.
        if (this.motore && this.motore.ws.readyState === WebSocket.OPEN) {
          this.motore.ws.send(JSON.stringify(msg));
        }
        return;
      }

      if (m.tipo === "stato" && client === this.motore) {
        const stato = msg as StatoLive;
        this.diarioDaStato(stato, client);
        this.ultimoStato = { ...stato, motoreOnline: true };
        this.ultimoBattito = Date.now(); // anche lo stato vale come battito
        // Il volume master resta salvato nelle impostazioni.
        if (Math.abs(this.store.config.impostazioni.volumeMaster - stato.master) > 0.001) {
          this.store.config.impostazioni.volumeMaster = stato.master;
          this.store.salva();
        }
        this.aTutti(this.ultimoStato);
      }
    });

    ws.on("close", () => {
      if (!client) return;
      this.clienti.delete(client);
      if (client === this.motore) {
        this.motore = null;
        this.promuoviOppureOffline(client);
      }
      this.aggiornaTelefoni();
    });

    ws.on("error", () => ws.terminate());
  }

  private statoCorrente(): StatoLive {
    if (this.ultimoStato) return { ...this.ultimoStato, motoreOnline: this.motore !== null };
    return {
      ...STATO_VUOTO,
      master: this.store.config.impostazioni.volumeMaster,
      motoreOnline: this.motore !== null,
    };
  }

  private aggiornaTelefoni(): void {
    const telefoni = [...this.clienti].filter((c) => c.ruolo === "telecomando").map((c) => ({ ip: c.ip }));
    for (const c of this.clienti) {
      if (c.ruolo === "regia") this.invia(c.ws, { tipo: "telefoni", telefoni });
    }
  }

  /** Avvisa tutti quando il PIN cambia: i telefoni con PIN vecchio vengono scollegati. */
  pinCambiato(): void {
    for (const c of [...this.clienti]) {
      if (c.ruolo === "telecomando") {
        c.ws.close(4001, "PIN errato");
        this.clienti.delete(c);
      }
    }
    this.aggiornaTelefoni();
  }

  /** La configurazione è cambiata (da REST): avvisa tutte le pagine. */
  configCambiata(): void {
    this.aTutti({ tipo: "configCambiata" });
  }

  private aTutti(msg: unknown): void {
    const testo = JSON.stringify(msg);
    for (const c of this.clienti) {
      if (c.ws.readyState === WebSocket.OPEN) c.ws.send(testo);
    }
  }

  private invia(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  chiudi(): void {
    clearInterval(this.intervalloPing);
    clearInterval(this.intervalloBattito);
  }

  // ---- Diario di serata ----

  private annota(e: Omit<EventoDiario, "ora">): void {
    scriviEvento({ ora: new Date().toISOString(), ...e });
  }

  /** Se un comando dello stesso genere è arrivato da poco, l'evento è suo. */
  private origineDi(comandi: string[], motore: Client): string {
    const u = this.ultimoComando;
    if (u && comandi.includes(u.comando) && Date.now() - u.quando < 2000) return u.origine;
    return `mac·${motore.id4}`;
  }

  private nomi(stato: StatoLive): { fase?: string; format?: string } {
    const format = this.store.config.formats.find((f) => f.id === stato.formatId);
    const fase = format?.fasi.find((f) => f.id === stato.faseId);
    return { fase: fase?.nome, format: format?.nome };
  }

  /** Gli eventi nascono dallo stato reale del motore (diff), non dai comandi. */
  private diarioDaStato(stato: StatoLive, motore: Client): void {
    const prec = this.diarioPrec;
    const { fase, format } = this.nomi(stato);

    if (stato.formatId !== prec.formatId && stato.formatId) {
      this.annota({ tipo: "format aperto", format, origine: this.origineDi(["format"], motore) });
    }
    if (stato.faseId !== prec.faseId && stato.faseId && stato.formatId === prec.formatId) {
      this.annota({ tipo: "fase cambiata", fase, format, origine: this.origineDi(["fase"], motore) });
    }
    // Luci all'ingresso della fase (da qualsiasi dispositivo; anche quando si apre il format).
    if (stato.faseId !== prec.faseId && stato.faseId) {
      const faseObj = this.store.config.formats.flatMap((f) => f.fasi).find((f) => f.id === stato.faseId);
      const luce = faseObj ? luceAllaFase(faseObj) : null;
      if (luce) void this.luci?.esegui(luce, `fase: ${faseObj?.nome ?? "?"}`);
    }

    // L'anteprima "Ascolta" non è un suono vero: niente diario.
    const adesso = new Map((stato.attivi ?? []).filter((a) => !a.anteprima).map((a) => [a.istanzaId, a.titolo]));

    // Soundcheck: i suoni di prova non sono suoni veri. Un solo evento alla fine.
    if (stato.soundcheck) {
      if (!this.soundcheck) this.soundcheck = { inizio: new Date().toISOString(), provate: 0 };
      this.soundcheck.provate = Math.max(this.soundcheck.provate, stato.soundcheck.indice);
      this.diarioPrec = { ...prec, istanze: new Map(), faseId: stato.faseId, formatId: stato.formatId };
      return;
    }
    if (this.soundcheck) {
      const sc = this.soundcheck;
      this.soundcheck = null;
      this.annota({
        tipo: "soundcheck",
        format,
        origine: `mac·${motore.id4}`,
        dettagli: { inizio: sc.inizio, fine: new Date().toISOString(), caselle: sc.provate },
      });
      // Ciò che suona adesso (se qualcosa) è la base: niente "partito" fantasma.
      this.diarioPrec = { ...prec, istanze: adesso, faseId: stato.faseId, formatId: stato.formatId };
      return;
    }

    const tutteLeCaselle = () => this.store.config.formats.flatMap((f) => f.fasi).flatMap((f) => f.cue);
    for (const [id, titolo] of adesso) {
      if (!prec.istanze.has(id)) {
        this.annota({ tipo: "suono partito", cue: titolo, fase, format, origine: this.origineDi(["play"], motore) });
        const a = (stato.attivi ?? []).find((x) => x.istanzaId === id);
        if (a) this.diarioCueId.set(id, a.cueId);
        const cue = a ? tutteLeCaselle().find((c) => c.id === a.cueId) : undefined;
        const luce = cue ? luceAllaPartenza(cue) : null;
        if (luce) void this.luci?.esegui(luce, `casella: ${titolo}`);
      }
    }
    for (const [id, titolo] of prec.istanze) {
      if (!adesso.has(id)) {
        this.annota({
          tipo: "suono fermato",
          cue: titolo,
          fase,
          format,
          origine: this.origineDi(["play", "stop", "sfuma", "stopTutto", "fade"], motore),
        });
        const cueId = this.diarioCueId.get(id);
        this.diarioCueId.delete(id);
        const cue = cueId ? tutteLeCaselle().find((c) => c.id === cueId) : undefined;
        const luce = cue ? luceAllaFine(cue) : null;
        if (luce) void this.luci?.esegui(luce, `fine: ${titolo}`);
      }
    }

    const parla = stato.parla === true;
    if (parla !== prec.parla) {
      this.annota({ tipo: parla ? "parla acceso" : "parla spento", format, origine: this.origineDi(["parla"], motore) });
    }

    const fatti = new Set(stato.fatti ?? []);
    for (const cueId of fatti) {
      if (!prec.fatti.has(cueId)) {
        const cue = this.store.config.formats
          .flatMap((f) => f.fasi)
          .flatMap((f) => f.cue)
          .find((c) => c.id === cueId);
        this.annota({ tipo: "promemoria fatto", cue: cue?.titolo ?? "?", fase, format, origine: this.origineDi(["spunta"], motore) });
        const luce = cue ? luceAllaPartenza(cue) : null;
        if (luce) void this.luci?.esegui(luce, `promemoria: ${cue?.titolo ?? "?"}`);
      }
    }

    this.diarioPrec = { istanze: adesso, faseId: stato.faseId, formatId: stato.formatId, parla, fatti };
  }
}
