// La "serata": dal foglio "Prima di iniziare" al pulsante "Chiudi serata".
// Il diario resta un file al giorno; una serata è il tratto di eventi che
// finisce con "fine_serata". Se nessuno chiude, vale il taglio a mezzanotte.
// Tutto qui è puro: eventi → serate, stato del soundcheck, testi.

/** Il minimo di un evento del diario che serve qui. */
export interface EventoSerata {
  ora: string; // ISO
  tipo: string;
  format?: string;
  dettagli?: Record<string, unknown>;
}

/** Com'è andato il soundcheck di un format in questa serata. */
export interface SoundcheckSerata {
  /** Quando è finito (ISO). */
  ora: string;
  caselle: number;
  problemi: number;
  /** Le caselle con problemi: id → "mancante" | "nonDecodificabile". */
  mancanti: Record<string, "mancante" | "nonDecodificabile">;
  /** Falso se è stato interrotto (ESC): non conta come fatto. */
  completo: boolean;
}

export interface StatoSerata {
  /** "2026-09-26#0": giorno e numero della serata in quel giorno. */
  id: string;
  data: string;
  indice: number;
  /** Il primo evento della serata (null se non è ancora successo niente). */
  inizio: string | null;
  /** Il soundcheck completo più recente, per id del format. */
  soundcheck: Record<string, SoundcheckSerata>;
  /** La finestra "Non hai ancora provato i suoni" è già comparsa in questa serata. */
  avvisoMostrato: boolean;
}

/** Spezza gli eventi di un giorno nelle sue serate: ogni "fine_serata" chiude
 *  la sua (l'evento resta dentro). L'ultimo tratto, se non vuoto, è la serata
 *  aperta. Un giorno senza chiusure è una serata sola. */
export function spezzaInSerate<E extends EventoSerata>(eventi: E[]): E[][] {
  const serate: E[][] = [];
  let corrente: E[] = [];
  for (const e of eventi) {
    corrente.push(e);
    if (e.tipo === "fine_serata") {
      serate.push(corrente);
      corrente = [];
    }
  }
  if (corrente.length > 0) serate.push(corrente);
  return serate;
}

/** Gli eventi della serata aperta (dopo l'ultima chiusura) e il suo numero. */
export function serataCorrente<E extends EventoSerata>(eventi: E[]): { indice: number; eventi: E[] } {
  const serate = spezzaInSerate(eventi);
  const ultima = serate[serate.length - 1];
  if (!ultima || ultima[ultima.length - 1]!.tipo === "fine_serata") return { indice: serate.length, eventi: [] };
  return { indice: serate.length - 1, eventi: ultima };
}

/** Il soundcheck registrato in un evento "soundcheck" (dettagli scritti dal Mac). */
function leggiSoundcheck(e: EventoSerata): { formatId: string; sc: SoundcheckSerata } | null {
  const d = e.dettagli ?? {};
  const formatId = typeof d.formatId === "string" ? d.formatId : null;
  if (!formatId) return null;
  const mancanti: SoundcheckSerata["mancanti"] = {};
  const lista = Array.isArray(d.mancanti) ? (d.mancanti as unknown[]) : [];
  for (const m of lista) {
    if (m && typeof m === "object" && typeof (m as { cueId?: unknown }).cueId === "string") {
      const esito = (m as { esito?: unknown }).esito;
      mancanti[(m as { cueId: string }).cueId] = esito === "nonDecodificabile" ? "nonDecodificabile" : "mancante";
    }
  }
  return {
    formatId,
    sc: {
      ora: typeof d.fine === "string" ? d.fine : e.ora,
      caselle: typeof d.caselle === "number" ? d.caselle : 0,
      problemi: typeof d.problemi === "number" ? d.problemi : Object.keys(mancanti).length,
      mancanti,
      completo: d.completo !== false,
    },
  };
}

/** Lo stato di una serata a partire dai suoi eventi. */
export function statoSerata(data: string, indice: number, eventi: EventoSerata[]): StatoSerata {
  const soundcheck: Record<string, SoundcheckSerata> = {};
  for (const e of eventi) {
    if (e.tipo !== "soundcheck") continue;
    const letto = leggiSoundcheck(e);
    // Conta solo un giro completo: uno interrotto con ESC non è "fatto".
    if (letto && letto.sc.completo) soundcheck[letto.formatId] = letto.sc;
  }
  return {
    id: `${data}#${indice}`,
    data,
    indice,
    inizio: eventi[0]?.ora ?? null,
    soundcheck,
    avvisoMostrato: eventi.some((e) => e.tipo === "avviso_soundcheck"),
  };
}

/** Il soundcheck di un evento "soundcheck" (per il riepilogo): anche se interrotto. */
export function soundcheckDellaSerata(eventi: EventoSerata[]): { ora: string; problemi: number; completo: boolean } | null {
  let ultimo: { ora: string; problemi: number; completo: boolean } | null = null;
  for (const e of eventi) {
    if (e.tipo !== "soundcheck") continue;
    const d = e.dettagli ?? {};
    const problemi = typeof d.problemi === "number" ? d.problemi : 0;
    const completo = d.completo !== false;
    const ora = typeof d.fine === "string" ? d.fine : e.ora;
    // Un giro completo vince su uno interrotto; tra due completi, l'ultimo.
    if (!ultimo || completo || !ultimo.completo) ultimo = { ora, problemi, completo };
  }
  return ultimo;
}

/** "18:40" da un ISO, nell'ora locale. */
export function oraBreve(iso: string): string {
  const d = new Date(iso);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** La riga grande del foglio "Prima di iniziare": cosa dice e di che colore è. */
export function rigaSoundcheck(sc: SoundcheckSerata | null | undefined): {
  stato: "nonFatto" | "ok" | "problemi";
  testo: string;
} {
  if (!sc || !sc.completo) return { stato: "nonFatto", testo: "Soundcheck di oggi: NON FATTO" };
  const quando = `Soundcheck fatto alle ${oraBreve(sc.ora)}`;
  if (sc.problemi === 0) return { stato: "ok", testo: `${quando} · tutto ok` };
  return { stato: "problemi", testo: `${quando} · ${sc.problemi} ${sc.problemi === 1 ? "problema" : "problemi"}` };
}
