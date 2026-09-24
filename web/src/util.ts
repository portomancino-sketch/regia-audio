// Piccole utilità condivise dall'interfaccia.
import type { Cue, CueAttivo, TipoCue } from "../../shared/tipi";

/** Tinte discrete dei tipi (definite nei token CSS): pillole e barre, mai pulsanti interi. */
export const COLORI_TIPO: Record<TipoCue, string> = {
  sottofondo: "var(--tipo-sottofondo)",
  brano: "var(--tipo-brano)",
  effetto: "var(--tipo-effetto)",
  promemoria: "var(--tipo-promemoria)",
};

export const NOMI_TIPO: Record<TipoCue, string> = {
  sottofondo: "Sottofondo",
  brano: "Brano",
  effetto: "Effetto",
  promemoria: "Promemoria",
};

/** Le 6 scelte di colore personalizzato di un cue (valori salvati nei dati). */
export const SCELTE_COLORE = ["#2563eb", "#7c3aed", "#d97706", "#dc2626", "#059669", "#db2777"];

export function coloreCue(cue: Cue): string {
  return cue.colore ?? COLORI_TIPO[cue.tipo];
}

/** Il testo del tempo su una card che suona: "finisce tra 0:42", "in loop"…
    null = nessun numero (effetti brevissimi). */
export function tempoRimanente(a: CueAttivo): { testo: string | null; ambra: boolean } {
  if (a.inPausa) return { testo: "in pausa", ambra: false };
  if (a.loop) return { testo: "in loop", ambra: false };
  if (a.durataSec == null) return { testo: null, ambra: false };
  if (a.tipo === "effetto" && a.durataSec < 3) return { testo: null, ambra: false };
  const resta = Math.max(0, a.durataSec - a.posizioneSec);
  return { testo: `finisce tra ${formattaTempo(resta)}`, ambra: resta <= 10 };
}

export function formattaTempo(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "–:––";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Il colore del pallino "luci" di una casella (o fase): quello dell'effetto, grigio per "torna". */
export function coloreLuceDi(luce: string | undefined, luci: { abbinata: boolean; colori: Record<string, string> } | null | undefined): string | undefined {
  if (!luce || !luci?.abbinata) return undefined;
  if (luce === "torna") return "var(--testo-3)";
  return luci.colori[luce];
}
