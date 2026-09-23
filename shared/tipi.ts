// Tipi condivisi tra server e web.

export type TipoCue = "sottofondo" | "brano" | "effetto" | "promemoria";
export type SulSottofondo = "niente" | "abbassa" | "pausa";

export interface Cue {
  id: string;
  titolo: string;
  nota: string;
  tipo: TipoCue;
  /** Nome del file audio salvato, es. "abc123.mp3". Null se non ancora caricato. */
  file: string | null;
  /** Nome originale del file caricato, per mostrarlo in Modifica. */
  fileOriginale: string | null;
  durataSec: number | null;
  /** 0..1 */
  volume: number;
  loop: boolean;
  sulSottofondo: SulSottofondo;
  colore: string | null;
  ordine: number;
}

export interface Fase {
  id: string;
  nome: string;
  ordine: number;
  cue: Cue[];
  /** "Cosa succede" in questa fase: 2–3 righe di guida per l'assistente. */
  nota?: string;
  /** La riga "Sempre": visibile in ogni fase, non eliminabile, una per format. */
  sempre?: boolean;
}

export interface Format {
  id: string;
  nome: string;
  ordine: number;
  fasi: Fase[];
  /** "Prima di iniziare": promemoria mostrato all'apertura del format in Live. */
  notaInizio?: string;
}

export interface Impostazioni {
  pin: string;
  /** 0..1 */
  volumeMaster: number;
  fadeOutMs: number;
  /** 0..1 — a quanto scende il sottofondo con "abbassa". */
  livelloAbbassa: number;
  /** 0..0.6 — a quanto scende il sottofondo mentre si parla (default 0.25). */
  livelloParla?: number;
}

export interface Config {
  versione: 1;
  impostazioni: Impostazioni;
  formats: Format[];
}

// ---- WebSocket ----

export interface CueAttivo {
  /** Identificativo dell'istanza in riproduzione (un effetto può averne più d'una). */
  istanzaId: string;
  cueId: string;
  titolo: string;
  tipo: TipoCue;
  posizioneSec: number;
  durataSec: number | null;
  inPausa: boolean;
  /** true per un sottofondo che ricomincia da capo (niente conto alla rovescia). */
  loop?: boolean;
}

export interface StatoLive {
  tipo: "stato";
  formatId: string | null;
  faseId: string | null;
  /** 0..1 */
  master: number;
  attivi: CueAttivo[];
  motoreOnline: boolean;
  /** Id dei promemoria già spuntati (condivisi tra Mac e telefoni). */
  fatti?: string[];
  /** PARLA acceso (il sottofondo è abbassato per la voce). */
  parla?: boolean;
}

export type Comando =
  | { tipo: "comando"; comando: "play"; cueId: string }
  | { tipo: "comando"; comando: "stop"; cueId: string }
  | { tipo: "comando"; comando: "sfuma"; cueId: string }
  | { tipo: "comando"; comando: "spunta"; cueId: string }
  | { tipo: "comando"; comando: "azzeraSpunte"; faseId: string }
  | { tipo: "comando"; comando: "parla"; acceso: boolean }
  | { tipo: "comando"; comando: "fade" }
  | { tipo: "comando"; comando: "stopTutto" }
  | { tipo: "comando"; comando: "master"; valore: number }
  | { tipo: "comando"; comando: "fase"; faseId: string }
  | { tipo: "comando"; comando: "format"; formatId: string };

export interface Presentazione {
  ruolo: "regia" | "telecomando";
  pin?: string;
  /** Solo per le pagine Regia: identifica la finestra e quando si è aperta. */
  sessioneId?: string;
  apertaAlle?: number;
}

export type MessaggioWs =
  | StatoLive
  | Comando
  | { tipo: "ping" }
  | { tipo: "pong" }
  | { tipo: "battito" }
  | { tipo: "rilascio" }
  | { tipo: "prendi_comando" }
  | { tipo: "motore_sostituito" };

export interface InfoRete {
  ip: string;
  urlTelecomando: string;
  pin: string;
}
