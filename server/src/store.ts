// Lettura e salvataggio di regia.json, con autosave e copie di sicurezza.
import fs from "node:fs";
import path from "node:path";
import type { Config } from "../../shared/tipi";
import { percorsoConfig, cartellaAudio, cartellaBackup, cartellaDati } from "./percorsi";
import { creaConfigIniziale } from "./demo";

const DEBOUNCE_MS = 500;
const BACKUP_DA_TENERE = 50;

export class Store {
  config: Config;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    fs.mkdirSync(cartellaDati(), { recursive: true });
    fs.mkdirSync(cartellaAudio(), { recursive: true });
    fs.mkdirSync(cartellaBackup(), { recursive: true });
    this.config = this.carica();
  }

  private carica(): Config {
    const percorso = percorsoConfig();
    if (fs.existsSync(percorso)) {
      const testo = fs.readFileSync(percorso, "utf8");
      return JSON.parse(testo) as Config;
    }
    const config = creaConfigIniziale(cartellaAudio(), process.env.REGIA_DEMO !== "0");
    fs.writeFileSync(percorso, JSON.stringify(config, null, 2));
    return config;
  }

  /** Programma un salvataggio (debounce 500 ms). */
  salva(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.salvaSubito(), DEBOUNCE_MS);
  }

  salvaSubito(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const testo = JSON.stringify(this.config, null, 2);
    fs.writeFileSync(percorsoConfig(), testo);
    this.scriviBackup(testo);
  }

  private scriviBackup(testo: string): void {
    const d = new Date();
    const z = (n: number, l = 2) => String(n).padStart(l, "0");
    const nome = `regia-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.json`;
    fs.writeFileSync(path.join(cartellaBackup(), nome), testo);
    // Tiene solo le ultime 50 copie.
    const copie = fs
      .readdirSync(cartellaBackup())
      .filter((f) => f.startsWith("regia-") && f.endsWith(".json"))
      .sort();
    for (const vecchia of copie.slice(0, Math.max(0, copie.length - BACKUP_DA_TENERE))) {
      fs.unlinkSync(path.join(cartellaBackup(), vecchia));
    }
  }

  /** Sostituisce l'intera configurazione (usato da PUT /api/config e import). */
  sostituisci(nuova: Config): void {
    this.config = nuova;
    this.salva();
  }
}
