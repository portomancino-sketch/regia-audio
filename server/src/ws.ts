// Il canale in diretta tra la pagina Regia (il "motore") e i telecomandi.
// Regola: comanda SEMPRE l'ultima pagina Regia che si presenta.
import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "node:http";
import type { StatoLive, Presentazione } from "../../shared/tipi";
import type { Store } from "./store";

interface Client {
  ws: WebSocket;
  ruolo: "regia" | "telecomando";
  ip: string;
  vivo: boolean;
  sessioneId: string | null;
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
        client = { ws, ruolo: p.ruolo, ip, vivo: true, sessioneId: p.sessioneId ?? null };
        this.clienti.add(client);

        // L'ULTIMA pagina Regia che si presenta prende il comando.
        if (p.ruolo === "regia") this.nominaMotore(client);

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
        // I comandi vanno SOLO al motore corrente.
        if (this.motore && this.motore.ws.readyState === WebSocket.OPEN) {
          this.motore.ws.send(JSON.stringify(msg));
        }
        return;
      }

      if (m.tipo === "stato" && client === this.motore) {
        const stato = msg as StatoLive;
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
}
