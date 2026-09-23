// Il soundcheck "Prova tutti": la sequenza delle caselle audio di un format.
import type { Cue, Fase, Format } from "./tipi";

export const SOUNDCHECK_DURATA_MS = 3000;
export const SOUNDCHECK_PAUSA_MS = 300;

export interface PassoSoundcheck {
  cue: Cue;
  fase: Fase;
}

/** Riga Sempre per prima, poi le fasi in ordine; dentro ogni fase le caselle
 *  in ordine. I promemoria non suonano e vengono saltati. Le caselle senza
 *  file restano in sequenza: l'esito le elenca tra i "file mancanti". */
export function sequenzaSoundcheck(format: Format): PassoSoundcheck[] {
  const fasi = [...format.fasi].sort((a, b) => {
    if (a.sempre !== b.sempre) return a.sempre ? -1 : 1;
    return a.ordine - b.ordine;
  });
  const passi: PassoSoundcheck[] = [];
  for (const fase of fasi) {
    for (const cue of [...fase.cue].sort((a, b) => a.ordine - b.ordine)) {
      if (cue.tipo === "promemoria") continue;
      passi.push({ cue, fase });
    }
  }
  return passi;
}

export interface EsitoCasella {
  cueId: string;
  titolo: string;
  fase: string;
  esito: "ok" | "mancante" | "nonDecodificabile";
  /** Picco in dBFS (null se non misurabile). */
  piccoDb: number | null;
}

/** L'esito ordinato: prima i problemi, poi i picchi dal più basso al più alto. */
export function ordinaEsito(esiti: EsitoCasella[]): {
  mancanti: EsitoCasella[];
  nonDecodificabili: EsitoCasella[];
  picchi: EsitoCasella[];
} {
  return {
    mancanti: esiti.filter((e) => e.esito === "mancante"),
    nonDecodificabili: esiti.filter((e) => e.esito === "nonDecodificabile"),
    picchi: esiti
      .filter((e) => e.esito === "ok")
      .sort((a, b) => (a.piccoDb ?? Infinity) - (b.piccoDb ?? Infinity)),
  };
}

/** Picco lineare (0..1) → dBFS, con -100 come pavimento. */
export function piccoInDb(picco: number): number {
  if (picco <= 0) return -100;
  return Math.max(-100, Math.round(20 * Math.log10(picco) * 10) / 10);
}
