// Il canale in diretta tra la pagina Regia (il "motore") e i telecomandi.
import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "node:http";
import type { StatoLive, Comando, Presentazione } from "../../shared/tipi";
import type { Store } from "./store";

interface Client {
  ws: WebSocket;
  ruolo: "regia" | "telecomando";
  ip: string;
  vivo: boolean;
}

const STATO_VUOTO: Omit<StatoLive, "motoreOnline"> = {
  tipo: "stato",
  formatId: null,
  faseId: null,
  master: 0.8,
  attivi: [],
};

export class Hub {
  private clienti = new Set<Client>();
  private motore: Client | null = null;
  private ultimoStato: StatoLive | null = null;
  private intervallo: NodeJS.Timeout;

  constructor(
    server: Server,
    private store: Store,
  ) {
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (ws, req) => this.nuovaConnessione(ws, req));
    // Ping/pong ogni 10 s: chi non risponde viene scollegato.
    this.intervallo = setInterval(() => {
      for (const c of [...this.clienti]) {
        if (!c.vivo) {
          c.ws.terminate();
          continue;
        }
        c.vivo = false;
        c.ws.ping();
      }
    }, 10_000);
    this.intervallo.unref();
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
        client = { ws, ruolo: p.ruolo, ip, vivo: true };
        this.clienti.add(client);

        if (p.ruolo === "regia") {
          // Un solo motore: la prima finestra Regia suona, le altre no.
          const sonoIlMotore = this.motore === null;
          if (sonoIlMotore) this.motore = client;
          this.invia(ws, { tipo: "ruoloAssegnato", motore: sonoIlMotore });
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

      if (m.tipo === "comando") {
        // I comandi vanno al motore, che è l'unico a suonare.
        if (this.motore && this.motore.ws.readyState === WebSocket.OPEN) {
          this.motore.ws.send(JSON.stringify(msg));
        }
        return;
      }

      if (m.tipo === "stato" && client === this.motore) {
        const stato = msg as StatoLive;
        this.ultimoStato = { ...stato, motoreOnline: true };
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
        // Se c'è un'altra finestra Regia aperta, diventa lei il motore.
        const prossima = [...this.clienti].find((c) => c.ruolo === "regia");
        if (prossima) {
          this.motore = prossima;
          this.invia(prossima.ws, { tipo: "ruoloAssegnato", motore: true });
        } else {
          this.ultimoStato = { ...this.statoCorrente(), motoreOnline: false };
          this.aTutti(this.ultimoStato);
        }
      }
      this.aggiornaTelefoni();
    });

    ws.on("error", () => ws.terminate());
  }

  private statoCorrente(): StatoLive {
    if (this.ultimoStato) return this.ultimoStato;
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
    clearInterval(this.intervallo);
  }
}
