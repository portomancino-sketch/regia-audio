// La riga "Sempre" in Live: al massimo 4 caselle "in evidenza" sempre visibili,
// le altre in un menu "Altri". Con 4 caselle o meno sono tutte in evidenza.
import type { Cue } from "./tipi";

export const MAX_EVIDENZA = 4;

/** Le caselle della riga Sempre da mostrare come pillole, nell'ordine di Modifica. */
export function inEvidenza(cueSempre: readonly Cue[]): Cue[] {
  const ordinate = [...cueSempre].sort((a, b) => a.ordine - b.ordine);
  if (ordinate.length <= MAX_EVIDENZA) return ordinate;
  return ordinate.filter((c) => c.evidenza === true).slice(0, MAX_EVIDENZA);
}

/** Le altre: quelle che finiscono nel menu "Altri (N)". */
export function altriSempre(cueSempre: readonly Cue[]): Cue[] {
  const mostrate = new Set(inEvidenza(cueSempre).map((c) => c.id));
  return [...cueSempre].sort((a, b) => a.ordine - b.ordine).filter((c) => !mostrate.has(c.id));
}

/** Si può mettere in evidenza un'altra casella? (massimo 4) */
export function puoMettereInEvidenza(cueSempre: readonly Cue[], cueId: string): boolean {
  const gia = cueSempre.filter((c) => c.evidenza === true && c.id !== cueId).length;
  return gia < MAX_EVIDENZA;
}
