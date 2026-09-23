// L'orologio di scaletta: quanto siamo dentro la fase e quanto siamo in
// anticipo o in ritardo rispetto alle durate previste. Tutto calcolato dagli
// eventi del diario di oggi (inizio serata = primo suono vero).
export interface VoceScaletta {
  nome: string;
  /** Minuti previsti (assente = nessuna previsione). */
  durataPrevista?: number;
}

/** Il minimo di un evento del diario che serve qui. */
export interface EventoScaletta {
  ora: string; // ISO
  tipo: string;
  fase?: string;
}

export interface Scarto {
  /** Nome della fase corrente secondo il diario (null se non è ancora iniziata la serata). */
  fase: string | null;
  /** Quanto dura la fase corrente finora, in ms. */
  trascorsoMs: number;
  /** Quanto era previsto per la fase corrente, in ms (null se non previsto). */
  previstoMs: number | null;
  /** Scarto cumulato all'ingresso nella fase corrente: positivo = in ritardo. Null se
   *  nessuna fase precedente aveva una durata prevista. */
  scartoMs: number | null;
  colore: "verde" | "ambra" | "rosso" | null;
}

const MIN = 60_000;

/** Calcola lo stato della scaletta all'istante `ora` (ms). */
export function scarto(scaletta: VoceScaletta[], eventi: EventoScaletta[], ora: number): Scarto {
  const t = (e: EventoScaletta) => new Date(e.ora).getTime();
  const inizio = eventi.find((e) => e.tipo === "suono partito");
  if (!inizio) return { fase: null, trascorsoMs: 0, previstoMs: null, scartoMs: null, colore: null };
  const inizioMs = t(inizio);

  // La fase corrente: l'ultimo cambio di fase (o l'apertura del format) dopo l'inizio;
  // se non ce n'è, la fase in cui era il primo suono.
  let faseCorrente: string | null = inizio.fase ?? null;
  let entrataMs = inizioMs;
  for (const e of eventi) {
    const em = t(e);
    if (em < inizioMs) continue;
    if ((e.tipo === "fase cambiata" || e.tipo === "format aperto") && e.fase) {
      faseCorrente = e.fase;
      entrataMs = em;
    }
  }
  if (!faseCorrente) return { fase: null, trascorsoMs: Math.max(0, ora - inizioMs), previstoMs: null, scartoMs: null, colore: null };

  const indice = scaletta.findIndex((v) => v.nome === faseCorrente);
  const voce = indice >= 0 ? scaletta[indice] : undefined;
  const previstoMs = voce?.durataPrevista !== undefined && voce.durataPrevista > 0 ? voce.durataPrevista * MIN : null;

  // Scarto cumulato: tempo reale passato prima di entrare in questa fase, contro la
  // somma delle durate previste delle fasi precedenti (solo se almeno una ce l'ha).
  const precedenti = indice > 0 ? scaletta.slice(0, indice) : [];
  const conPrevisione = precedenti.filter((v) => v.durataPrevista !== undefined && v.durataPrevista > 0);
  let scartoMs: number | null = null;
  if (conPrevisione.length > 0) {
    const previstoPrimaMs = conPrevisione.reduce((s, v) => s + v.durataPrevista! * MIN, 0);
    scartoMs = entrataMs - inizioMs - previstoPrimaMs;
  }
  const assoluto = scartoMs === null ? 0 : Math.abs(scartoMs);
  const colore = scartoMs === null ? null : assoluto <= 2 * MIN ? "verde" : assoluto <= 5 * MIN ? "ambra" : "rosso";
  return { fase: faseCorrente, trascorsoMs: Math.max(0, ora - entrataMs), previstoMs, scartoMs, colore };
}

/** "in anticipo di 3 min" / "in ritardo di 8 min" / "in orario". */
export function testoScarto(scartoMs: number | null): string | null {
  if (scartoMs === null) return null;
  const minuti = Math.round(Math.abs(scartoMs) / MIN);
  if (minuti === 0) return "in orario";
  return scartoMs > 0 ? `in ritardo di ${minuti} min` : `in anticipo di ${minuti} min`;
}

/** "12:40" da millisecondi (mm:ss, oppure h:mm:ss oltre l'ora). */
export function formattaDurata(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const z = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${z(m)}:${z(s)}` : `${m}:${z(s)}`;
}
