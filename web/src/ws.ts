// Collegamento WebSocket con riconnessione automatica (1 → 5 s).
import type { Comando, StatoLive } from "../../shared/tipi";

export interface MessaggiRicevuti {
  stato?: (s: StatoLive) => void;
  comando?: (c: Comando) => void;
  ruoloAssegnato?: (motore: boolean) => void;
  telefoni?: (telefoni: { ip: string }[]) => void;
  configCambiata?: () => void;
  connesso?: (ok: boolean) => void;
  pinRifiutato?: () => void;
}

export class ClientWs {
  private ws: WebSocket | null = null;
  private attesaMs = 1000;
  private timerRiconnessione: number | null = null;
  private timerPing: number | null = null;
  private ultimoMessaggio = 0;
  private fermo = false;

  constructor(
    private ruolo: "regia" | "telecomando",
    private pin: () => string | null,
    private su: MessaggiRicevuti,
  ) {
    this.apri();
  }

  private apri(): void {
    if (this.fermo) return;
    const protocollo = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocollo}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.attesaMs = 1000;
      this.ultimoMessaggio = Date.now();
      ws.send(JSON.stringify({ ruolo: this.ruolo, pin: this.pin() ?? undefined }));
      this.su.connesso?.(true);
      // Ping ogni 10 s; se il server tace per 25 s, si ricomincia.
      this.timerPing = window.setInterval(() => {
        if (Date.now() - this.ultimoMessaggio > 25_000) {
          ws.close();
          return;
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: "ping" }));
      }, 10_000);
    };

    ws.onmessage = (ev) => {
      this.ultimoMessaggio = Date.now();
      let msg: { tipo?: string };
      try {
        msg = JSON.parse(String(ev.data)) as { tipo?: string };
      } catch {
        return;
      }
      if (msg.tipo === "stato") this.su.stato?.(msg as unknown as StatoLive);
      else if (msg.tipo === "comando") this.su.comando?.(msg as unknown as Comando);
      else if (msg.tipo === "ruoloAssegnato") this.su.ruoloAssegnato?.((msg as { motore?: boolean }).motore === true);
      else if (msg.tipo === "telefoni") this.su.telefoni?.((msg as { telefoni?: { ip: string }[] }).telefoni ?? []);
      else if (msg.tipo === "configCambiata") this.su.configCambiata?.();
    };

    ws.onclose = (ev) => {
      if (this.timerPing) {
        clearInterval(this.timerPing);
        this.timerPing = null;
      }
      this.su.connesso?.(false);
      if (ev.code === 4001) {
        // PIN errato: niente riconnessione, serve un PIN nuovo.
        this.su.pinRifiutato?.();
        return;
      }
      if (this.fermo) return;
      this.timerRiconnessione = window.setTimeout(() => this.apri(), this.attesaMs);
      this.attesaMs = Math.min(5000, this.attesaMs + 1000);
    };

    ws.onerror = () => ws.close();
  }

  invia(msg: Comando | StatoLive | { tipo: string; [k: string]: unknown }): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Riprova subito (per esempio dopo aver scritto un PIN nuovo). */
  riparti(): void {
    this.fermo = false;
    this.ws?.close();
    if (this.timerRiconnessione) clearTimeout(this.timerRiconnessione);
    this.apri();
  }

  chiudi(): void {
    this.fermo = true;
    if (this.timerRiconnessione) clearTimeout(this.timerRiconnessione);
    if (this.timerPing) clearInterval(this.timerPing);
    this.ws?.close();
  }
}
