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
  private ultimoBattito = 0;
  private ultimoStato: StatoLive | null = null;
  private intervalloPing: NodeJS.Timeout;
  private intervalloBattito: NodeJS.Timeout;

  constructor(
    server: Server,
    private store: Store,
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
        // La pagina sta per chiudersi: passa subito il comando.
        if (client === this.motore) {
          this.motore = null;
          this.promuoviOppureOffline(client);
        }
        return;
      }

      if (m.tipo === "comando") {
        const origine = `${client.ruolo === "regia" ? "mac" : "telefono"}·${client.id4}`;
        const comando = (m as { comando?: string }).comando ?? "";
        this.ultimoComando = { comando, origine, quando: Date.now() };
        if (comando === "fade") this.annota({ tipo: "fade", origine });
        if (comando === "stopTutto") this.annota({ tipo: "stop tutto", origine });
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

    const adesso = new Map((stato.attivi ?? []).map((a) => [a.istanzaId, a.titolo]));
    for (const [id, titolo] of adesso) {
      if (!prec.istanze.has(id)) {
        this.annota({ tipo: "suono partito", cue: titolo, fase, format, origine: this.origineDi(["play"], motore) });
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
      }
    }

    this.diarioPrec = { istanze: adesso, faseId: stato.faseId, formatId: stato.formatId, parla, fatti };
  }
}
