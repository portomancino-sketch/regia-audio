// Luci Philips Hue: tre effetti globali (luce1, luce2, luce3) + "torna com'era".
// Tutto puro: da un effetto, dalla mappa del locale e dall'intensità ai comandi
// per la centralina. Niente rete qui.
export type NomeEffetto = "luce1" | "luce2" | "luce3";
export type ComandoLuceCue = NomeEffetto | "torna";
export const EFFETTI: NomeEffetto[] = ["luce1", "luce2", "luce3"];
export const NOMI_DEFAULT: Record<NomeEffetto, string> = { luce1: "Buio", luce2: "Rosso", luce3: "Caldo" };
export const COLORI_PULSANTE_DEFAULT: Record<NomeEffetto, string> = { luce1: "#3a3f47", luce2: "#d93b31", luce3: "#d97a00" };
/** Un gruppo con almeno tante luci usa un gruppo sulla centralina: un comando solo. */
export const SOGLIA_GRUPPO_BRIDGE = 3;
export const INTENSITA_MIN = 10;
export const INTENSITA_MAX = 100;

/** La palette di 10 colori (valori dell'API Hue v1: hue 0–65535, sat 0–254, ct in mired). */
export const COLORI_LUCE = {
  "bianco-caldo": { nome: "Bianco caldo", hex: "#ffd9a0", ct: 400 },
  "bianco-freddo": { nome: "Bianco freddo", hex: "#e8f1ff", ct: 180 },
  rosso: { nome: "Rosso", hex: "#e0312c", hue: 0, sat: 254 },
  arancio: { nome: "Arancio", hex: "#ff8a1f", hue: 5000, sat: 254 },
  giallo: { nome: "Giallo", hex: "#ffd23f", hue: 10500, sat: 254 },
  verde: { nome: "Verde", hex: "#3fbf5f", hue: 25500, sat: 254 },
  azzurro: { nome: "Azzurro", hex: "#5ec8ff", hue: 38000, sat: 200 },
  blu: { nome: "Blu", hex: "#2f5cff", hue: 46920, sat: 254 },
  viola: { nome: "Viola", hex: "#8f4fd8", hue: 50500, sat: 254 },
  rosa: { nome: "Rosa", hex: "#ff6fb0", hue: 58000, sat: 210 },
} as const;
export type ColoreLuce = keyof typeof COLORI_LUCE;
export const COLORI_ORDINE = Object.keys(COLORI_LUCE) as ColoreLuce[];

/** Cosa fa un effetto su un gruppo della Regia (intero, o solo alcune luci dentro). */
export interface VoceEffetto {
  acceso: boolean;
  /** 0–100 */
  luminosita: number;
  colore: ColoreLuce;
  /** Secondi, 0–10 */
  transizione: number;
  /** Solo queste luci del gruppo (assente = tutto il gruppo). */
  luci?: string[];
}
export interface Effetto {
  nome: string;
  /** Colore del pulsante (esadecimale). */
  colore: string;
  /** gruppoRegiaId → cosa fare. Gruppi assenti: non toccati. */
  voci: Record<string, VoceEffetto>;
}
export interface GruppoRegia {
  id: string;
  nome: string;
  /** Id delle lampadine della centralina. Una lampadina può stare in più gruppi. */
  luci: string[];
  /** Il gruppo gemello creato sulla centralina (solo per i gruppi grandi). */
  gruppoBridge?: string;
}
/** Tutto ciò che il locale ha deciso, per una centralina. */
export interface MappaLuci {
  /** Nomi propri della Regia per le lampadine (non toccano la centralina). */
  lampade: Record<string, { nome?: string }>;
  gruppi: Record<string, GruppoRegia>;
  effetti: Record<NomeEffetto, Effetto>;
}

/** Lo stato di una luce (o di un gruppo) come lo dà/vuole la centralina (API v1). */
export interface StatoHue {
  on: boolean;
  bri?: number;
  hue?: number;
  sat?: number;
  ct?: number;
  colormode?: string;
  transitiontime?: number;
}
export type Bersaglio = { tipo: "luce"; id: string } | { tipo: "gruppo"; id: string };
export interface ComandoLuce {
  bersaglio: Bersaglio;
  stato: StatoHue;
}
export const chiaveBersaglio = (b: Bersaglio) => `${b.tipo}:${b.id}`;

export function effettoVuoto(nome: NomeEffetto): Effetto {
  return { nome: NOMI_DEFAULT[nome], colore: COLORI_PULSANTE_DEFAULT[nome], voci: {} };
}
export function mappaVuota(): MappaLuci {
  return { lampade: {}, gruppi: {}, effetti: { luce1: effettoVuoto("luce1"), luce2: effettoVuoto("luce2"), luce3: effettoVuoto("luce3") } };
}
export function voceDefault(): VoceEffetto {
  return { acceso: true, luminosita: 60, colore: "bianco-caldo", transizione: 1 };
}

const limita = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** La luminosità 0–100 → bri 1–254, scalata dall'intensità master (10–100 %). */
export function luminositaInBri(luminosita: number, intensita = 100): number {
  const base = 1 + (limita(luminosita, 0, 100) / 100) * 253;
  const fattore = limita(intensita, INTENSITA_MIN, INTENSITA_MAX) / 100;
  return Math.max(1, Math.round(base * fattore));
}

function statoDiVoce(v: VoceEffetto, intensita: number): StatoHue {
  const transitiontime = Math.round(limita(v.transizione, 0, 10) * 10);
  if (!v.acceso) return { on: false, transitiontime };
  const colore = COLORI_LUCE[v.colore] ?? COLORI_LUCE["bianco-caldo"];
  const stato: StatoHue = { on: true, bri: luminositaInBri(v.luminosita, intensita), transitiontime };
  if ("ct" in colore) stato.ct = colore.ct;
  else {
    stato.hue = colore.hue;
    stato.sat = colore.sat;
  }
  return stato;
}

/** Un effetto → comandi. Gruppo intero e grande (con gemello sulla centralina):
 *  un comando solo al gruppo; altrimenti un comando per lampadina. */
export function effettoInComandi(effetto: Effetto, mappa: MappaLuci, intensita = 100): ComandoLuce[] {
  const comandi: ComandoLuce[] = [];
  for (const [gruppoId, voce] of Object.entries(effetto.voci)) {
    const gruppo = mappa.gruppi[gruppoId];
    if (!gruppo) continue;
    const stato = statoDiVoce(voce, intensita);
    const intero = !voce.luci;
    if (intero && gruppo.gruppoBridge && gruppo.luci.length >= SOGLIA_GRUPPO_BRIDGE) {
      comandi.push({ bersaglio: { tipo: "gruppo", id: gruppo.gruppoBridge }, stato });
      continue;
    }
    const luci = intero ? gruppo.luci : gruppo.luci.filter((l) => voce.luci!.includes(l));
    for (const id of luci) comandi.push({ bersaglio: { tipo: "luce", id }, stato: { ...stato } });
  }
  return comandi;
}

/** Le lampadine toccate da almeno un effetto (per la foto prima del primo effetto). */
export function luciCoinvolte(mappa: MappaLuci): string[] {
  const ids = new Set<string>();
  for (const e of Object.values(mappa.effetti)) {
    for (const [gruppoId, voce] of Object.entries(e.voci)) {
      const gruppo = mappa.gruppi[gruppoId];
      if (!gruppo) continue;
      for (const id of voce.luci ? gruppo.luci.filter((l) => voce.luci!.includes(l)) : gruppo.luci) ids.add(id);
    }
  }
  return [...ids];
}

/** Tiene solo ciò che serve dello stato di una luce letto dalla centralina. */
export function fotografaLuce(state: Partial<StatoHue> & { on?: boolean }): StatoHue {
  const s: StatoHue = { on: state.on === true };
  if (typeof state.bri === "number") s.bri = state.bri;
  if (typeof state.hue === "number") s.hue = state.hue;
  if (typeof state.sat === "number") s.sat = state.sat;
  if (typeof state.ct === "number") s.ct = state.ct;
  if (typeof state.colormode === "string") s.colormode = state.colormode;
  return s;
}

/** Da una foto ("com'era") ai comandi per lampadina che la ripristinano: esatti, l'intensità non conta. */
export function comandiRipristino(foto: Record<string, StatoHue>, transizioneSec = 1): ComandoLuce[] {
  const transitiontime = Math.round(limita(transizioneSec, 0, 10) * 10);
  return Object.entries(foto).map(([id, s]) => {
    const bersaglio: Bersaglio = { tipo: "luce", id };
    if (!s.on) return { bersaglio, stato: { on: false, transitiontime } };
    const stato: StatoHue = { on: true, transitiontime };
    if (typeof s.bri === "number") stato.bri = s.bri;
    if (s.colormode === "ct" && typeof s.ct === "number") stato.ct = s.ct;
    else if (typeof s.hue === "number" && typeof s.sat === "number") {
      stato.hue = s.hue;
      stato.sat = s.sat;
    } else if (typeof s.ct === "number") stato.ct = s.ct;
    return { bersaglio, stato };
  });
}

/** La coda verso la centralina: al massimo N comandi al secondo; se ne arrivano
 *  di più, per la stessa lampadina/gruppo resta solo l'ultimo. */
export class CodaLuci {
  private inAttesa = new Map<string, ComandoLuce>();
  private ordine: string[] = [];
  private inviati: number[] = [];
  constructor(private massimoAlSecondo = 10) {}

  aggiungi(c: ComandoLuce): void {
    const k = chiaveBersaglio(c.bersaglio);
    if (!this.inAttesa.has(k)) this.ordine.push(k);
    this.inAttesa.set(k, c);
  }
  get lunghezza(): number {
    return this.inAttesa.size;
  }
  /** Il prossimo comando da mandare adesso, o null se bisogna aspettare. */
  prossimo(oraMs: number): ComandoLuce | null {
    this.inviati = this.inviati.filter((t) => oraMs - t < 1000);
    if (this.inviati.length >= this.massimoAlSecondo) return null;
    const k = this.ordine.shift();
    if (k === undefined) return null;
    const c = this.inAttesa.get(k)!;
    this.inAttesa.delete(k);
    this.inviati.push(oraMs);
    return c;
  }
  svuota(): void {
    this.inAttesa.clear();
    this.ordine = [];
  }
}

/** Cosa chiede una casella quando parte (null = niente). Vale anche per i promemoria. */
export function luceAllaPartenza(cue: { luce?: ComandoLuceCue }): ComandoLuceCue | null {
  return cue.luce ?? null;
}
/** Cosa chiede una casella quando finisce o viene fermata. */
export function luceAllaFine(cue: { luceFine?: boolean }): "torna" | null {
  return cue.luceFine ? "torna" : null;
}
/** Cosa chiede una fase al suo ingresso (la riga Sempre non ha luci). */
export function luceAllaFase(fase: { luce?: ComandoLuceCue; sempre?: boolean }): ComandoLuceCue | null {
  if (fase.sempre) return null;
  return fase.luce ?? null;
}
/** STOP TUTTO manda sempre "torna com'era"; FADE OUT no. */
export const LUCE_SU_STOP_TUTTO: "torna" = "torna";
