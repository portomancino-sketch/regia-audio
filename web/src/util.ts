// Piccole utilità condivise dall'interfaccia.
import type { Cue, TipoCue } from "../../shared/tipi";

export const COLORI_TIPO: Record<TipoCue, string> = {
  sottofondo: "#2563eb", // blu
  brano: "#7c3aed", // viola
  effetto: "#d97706", // ambra
};

export const NOMI_TIPO: Record<TipoCue, string> = {
  sottofondo: "Sottofondo",
  brano: "Brano",
  effetto: "Effetto",
};

export const SCELTE_COLORE = ["#2563eb", "#7c3aed", "#d97706", "#dc2626", "#059669", "#db2777"];

export function coloreCue(cue: Cue): string {
  return cue.colore ?? COLORI_TIPO[cue.tipo];
}

export function formattaTempo(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "–:––";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
