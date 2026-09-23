// I contatori "già suonato": quante volte ogni casella è partita davvero.
// Vivono nello stato di serata (come le spunte) e si azzerano al cambio di giorno.
import type { Cue } from "./tipi";

export type Usi = Record<string, number>;

/** Una partenza vera (non soundcheck). I promemoria non contano. */
export function incrementaUsi(usi: Usi, cue: Pick<Cue, "id" | "tipo">): Usi {
  if (cue.tipo === "promemoria") return usi;
  return { ...usi, [cue.id]: (usi[cue.id] ?? 0) + 1 };
}

/** "Azzera serata" di una fase: via i contatori delle sue caselle. */
export function azzeraUsi(usi: Usi, cueIds: Iterable<string>): Usi {
  const via = new Set(cueIds);
  const nuovo: Usi = {};
  for (const [id, n] of Object.entries(usi)) if (!via.has(id)) nuovo[id] = n;
  return nuovo;
}

/** Il giorno "YYYY-MM-DD" di una data locale (stessa logica del diario). */
export function giornoDi(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** I contatori valgono per un giorno: se il giorno è cambiato ripartono da zero. */
export function usiDelGiorno(memoria: { giorno: string; usi: Usi }, oggi: string): { giorno: string; usi: Usi } {
  return memoria.giorno === oggi ? memoria : { giorno: oggi, usi: {} };
}

/** Come si presenta la casella: quante volte è partita, se ha finito gli usi previsti. */
export function statoUsi(cue: Pick<Cue, "id" | "usiPrevisti">, usi: Usi | undefined): {
  usati: number;
  previsti: number | null;
  esauriti: boolean;
  giaSuonato: boolean;
} {
  const usati = usi?.[cue.id] ?? 0;
  const previsti = typeof cue.usiPrevisti === "number" && cue.usiPrevisti > 0 ? cue.usiPrevisti : null;
  return { usati, previsti, esauriti: previsti !== null && usati >= previsti, giaSuonato: usati > 0 };
}
