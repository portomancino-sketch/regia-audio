// Le regole audio della Regia, come macchina a stati pura.
// Nessun Web Audio qui: riceve eventi, restituisce il nuovo stato
// e le azioni che il motore deve eseguire.

import type { Cue, SulSottofondo, TipoCue } from "./tipi";
import { dbALineare, guadagnoCasellaDb } from "./livello";

// Durate dei fade, in millisecondi.
export const FADE_SOSTITUZIONE_SOTTOFONDO_MS = 500;
export const FADE_STOP_ESCLUSIVO_MS = 200;
export const FADE_ABBASSA_MS = 300;
export const FADE_RIPRISTINO_MS = 800;
export const FADE_STOP_TUTTO_MS = 100;
export const FADE_MASTER_MS = 50;

/** Un suono in riproduzione (ogni cue ha al massimo un'istanza attiva). */
export interface Istanza {
  istanzaId: string;
  cueId: string;
  titolo: string;
  tipo: TipoCue;
  volume: number;
  loop: boolean;
  sulSottofondo: SulSottofondo;
  durataSec: number | null;
  /** Solo per il sottofondo: true se è fermo ma tiene la posizione. */
  inPausa: boolean;
  /** Guadagno della casella in dB (automatico + ritocco), sopra a volume e master. */
  guadagnoDb: number;
}

/** Un sottofondo "in uscita": non è più attivo, ma il motore lo sta sfumando. */
export interface Uscita {
  istanzaId: string;
  cueId: string;
  rampMs: number;
}

export interface StatoRegole {
  master: number;
  livelloAbbassa: number;
  fadeOutMs: number;
  attivi: Istanza[];
  /** Contatore per generare id di istanza deterministici. */
  contatore: number;
  /** PARLA: l'operatore sta parlando al microfono (abbassa il sottofondo). */
  parla: boolean;
  /** 0..1 — a quanto scende il sottofondo mentre si parla. */
  livelloParla: number;
  /** Passaggio morbido tra sottofondi, in ms (assente = comportamento classico: 500 ms / 15 ms). */
  crossfadeMs?: number;
  /** I sottofondi in uscita durante un passaggio (li chiude STOP TUTTO / FADE OUT). */
  uscite: Uscita[];
}

/** Cosa deve fare il motore audio. */
export type Azione =
  | { tipo: "avvia"; istanzaId: string; cueId: string; guadagno: number; loop: boolean; inPausa: boolean; rampMs?: number }
  | { tipo: "ferma"; istanzaId: string; rampMs: number }
  | { tipo: "mettiInPausa"; istanzaId: string; rampMs: number }
  | { tipo: "riprendi"; istanzaId: string; guadagno: number; rampMs: number }
  | { tipo: "cambiaGuadagno"; istanzaId: string; guadagno: number; rampMs: number };

export interface Risultato {
  stato: StatoRegole;
  azioni: Azione[];
}

export function statoIniziale(opzioni: {
  master: number;
  livelloAbbassa: number;
  fadeOutMs: number;
  livelloParla?: number;
  crossfadeMs?: number;
}): StatoRegole {
  return {
    master: opzioni.master,
    livelloAbbassa: opzioni.livelloAbbassa,
    fadeOutMs: opzioni.fadeOutMs,
    attivi: [],
    contatore: 0,
    parla: false,
    livelloParla: opzioni.livelloParla ?? 0.25,
    ...(opzioni.crossfadeMs === undefined ? {} : { crossfadeMs: opzioni.crossfadeMs }),
    uscite: [],
  };
}

/** Il livello a cui deve stare il sottofondo, guardando TUTTI i cue attivi. */
export type LivelloSottofondo = "pieno" | "abbassa" | "pausa";

export function livelloSottofondo(attivi: readonly Istanza[]): LivelloSottofondo {
  let abbassa = false;
  for (const i of attivi) {
    if (i.tipo === "sottofondo") continue;
    if (i.sulSottofondo === "pausa") return "pausa";
    if (i.sulSottofondo === "abbassa") abbassa = true;
  }
  return abbassa ? "abbassa" : "pieno";
}

/** Il fattore del sottofondo: il minimo tra le regole dei cue attivi e PARLA.
    "pausa" vince sempre (valore 0 + posizione mantenuta). */
export interface FattoreSottofondo {
  pausa: boolean;
  valore: number;
}

export function fattoreStato(stato: StatoRegole): FattoreSottofondo {
  const livello = livelloSottofondo(stato.attivi);
  if (livello === "pausa") return { pausa: true, valore: 0 };
  let valore = livello === "abbassa" ? stato.livelloAbbassa : 1;
  if (stato.parla) valore = Math.min(valore, stato.livelloParla);
  return { pausa: false, valore };
}

/** Guadagno effettivo di un'istanza: master × volume × guadagno dB × fattore sottofondo.
 *  L'ordine non conta (sono moltiplicazioni), ma il fattore del sottofondo
 *  (abbassa / PARLA / pausa) si applica per ultimo e "pausa" vale 0. */
export function guadagnoIstanza(stato: StatoRegole, istanza: Istanza): number {
  const f = istanza.tipo === "sottofondo" ? fattoreStato(stato).valore : 1;
  return stato.master * istanza.volume * dbALineare(istanza.guadagnoDb ?? 0) * f;
}

/**
 * Dopo un cambiamento negli attivi, confronta il livello del sottofondo
 * prima/dopo e produce le azioni per abbassarlo, metterlo in pausa,
 * farlo riprendere o risalire.
 */
function transizioneSottofondo(
  prima: FattoreSottofondo,
  stato: StatoRegole,
): { stato: StatoRegole; azioni: Azione[] } {
  const dopo = fattoreStato(stato);
  if (prima.pausa === dopo.pausa && prima.valore === dopo.valore) return { stato, azioni: [] };

  const azioni: Azione[] = [];
  const attivi = stato.attivi.map((i) => {
    if (i.tipo !== "sottofondo") return i;
    const guadagno = stato.master * i.volume * dbALineare(i.guadagnoDb ?? 0) * dopo.valore;
    if (dopo.pausa) {
      if (!i.inPausa) azioni.push({ tipo: "mettiInPausa", istanzaId: i.istanzaId, rampMs: FADE_ABBASSA_MS });
      return { ...i, inPausa: true };
    }
    if (i.inPausa) {
      // Riprende dalla stessa posizione; risale solo fino al livello
      // permesso da ciò che resta attivo (abbassa, PARLA...).
      azioni.push({ tipo: "riprendi", istanzaId: i.istanzaId, guadagno, rampMs: FADE_RIPRISTINO_MS });
      return { ...i, inPausa: false };
    }
    // Scendere è rapido (300 ms), risalire è morbido (800 ms).
    const rampMs = dopo.valore < prima.valore ? FADE_ABBASSA_MS : FADE_RIPRISTINO_MS;
    azioni.push({ tipo: "cambiaGuadagno", istanzaId: i.istanzaId, guadagno, rampMs });
    return i;
  });
  return { stato: { ...stato, attivi }, azioni };
}

/** Toglie un'istanza dagli attivi e sistema il sottofondo di conseguenza. */
function rimuovi(stato: StatoRegole, istanzaId: string, rampMs: number): Risultato {
  const istanza = stato.attivi.find((i) => i.istanzaId === istanzaId);
  if (!istanza) return { stato, azioni: [] };
  const prima = fattoreStato(stato);
  const dopoStato: StatoRegole = {
    ...stato,
    attivi: stato.attivi.filter((i) => i.istanzaId !== istanzaId),
  };
  const azioni: Azione[] = [{ tipo: "ferma", istanzaId, rampMs }];
  const t = transizioneSottofondo(prima, dopoStato);
  return { stato: t.stato, azioni: [...azioni, ...t.azioni] };
}

/** Pressione di un pulsante cue. */
export function premi(stato: StatoRegole, cue: Cue): Risultato {
  // I promemoria non suonano mai: non entrano tra gli attivi,
  // non toccano il sottofondo, non contano come esclusivi.
  if (cue.tipo === "promemoria") return { stato, azioni: [] };

  // Ripremere un cue in riproduzione = fermarlo. Vale per tutti i tipi:
  // l'effetto si somma agli ALTRI suoni, mai a sé stesso (regola S9).
  const giaAttivo = stato.attivi.find((i) => i.cueId === cue.id);
  if (giaAttivo) return rimuovi(stato, giaAttivo.istanzaId, FADE_STOP_ESCLUSIVO_MS);

  // Il livello del sottofondo si ricalcola UNA volta sola, alla fine,
  // così la sostituzione di un esclusivo non fa "rimbalzare" il sottofondo.
  const prima = fattoreStato(stato);
  let s = stato;
  const azioni: Azione[] = [];

  // Esclusività: un solo sottofondo, un solo brano. Tra due sottofondi il
  // passaggio è morbido (crossfade): il vecchio sfuma mentre il nuovo entra
  // nello stesso tempo; nello STATO il vecchio è "in uscita", non più attivo.
  const crossfade = cue.tipo === "sottofondo" && s.crossfadeMs !== undefined ? s.crossfadeMs : null;
  if (cue.tipo === "sottofondo" || cue.tipo === "brano") {
    const rampMs =
      cue.tipo === "sottofondo" ? (crossfade ?? FADE_SOSTITUZIONE_SOTTOFONDO_MS) : FADE_STOP_ESCLUSIVO_MS;
    const daFermare = s.attivi.filter((i) => i.tipo === cue.tipo);
    for (const i of daFermare) azioni.push({ tipo: "ferma", istanzaId: i.istanzaId, rampMs });
    const uscite =
      cue.tipo === "sottofondo"
        ? [...s.uscite, ...daFermare.map((i) => ({ istanzaId: i.istanzaId, cueId: i.cueId, rampMs }))]
        : s.uscite;
    s = { ...s, attivi: s.attivi.filter((i) => i.tipo !== cue.tipo), uscite };
  }
  const contatore = s.contatore + 1;
  const nuova: Istanza = {
    istanzaId: `i${contatore}`,
    cueId: cue.id,
    titolo: cue.titolo,
    tipo: cue.tipo,
    volume: cue.volume,
    loop: cue.tipo === "sottofondo" ? cue.loop : false,
    sulSottofondo: cue.tipo === "sottofondo" ? "niente" : cue.sulSottofondo,
    durataSec: cue.durataSec,
    inPausa: false,
    guadagnoDb: guadagnoCasellaDb(cue),
  };

  let s2: StatoRegole = { ...s, contatore, attivi: [...s.attivi, nuova] };

  // Un sottofondo che parte mentre un cue "pausa" è attivo nasce in pausa.
  const fattoreAllaPartenza = fattoreStato(s2);
  const nasceInPausa = nuova.tipo === "sottofondo" && fattoreAllaPartenza.pausa;
  if (nasceInPausa) {
    s2 = {
      ...s2,
      attivi: s2.attivi.map((i) => (i.istanzaId === nuova.istanzaId ? { ...i, inPausa: true } : i)),
    };
  }

  const guadagno =
    s2.master *
    nuova.volume *
    dbALineare(nuova.guadagnoDb) *
    (nuova.tipo === "sottofondo" ? fattoreAllaPartenza.valore : 1);

  azioni.push({
    tipo: "avvia",
    istanzaId: nuova.istanzaId,
    cueId: cue.id,
    guadagno,
    loop: nuova.loop,
    inPausa: nasceInPausa,
    // Il nuovo sottofondo entra da 0 nello stesso tempo in cui il vecchio esce.
    ...(crossfade !== null && crossfade > 0 ? { rampMs: crossfade } : {}),
  });

  // Se il nuovo cue abbassa o mette in pausa il sottofondo, applica la transizione.
  const t = transizioneSottofondo(prima, s2);
  return { stato: t.stato, azioni: [...azioni, ...t.azioni] };
}

/** Stop di un singolo cue (tutte le sue istanze). */
export function stop(stato: StatoRegole, cueId: string): Risultato {
  let s = stato;
  const azioni: Azione[] = [];
  for (const i of [...s.attivi]) {
    if (i.cueId === cueId) {
      const r = rimuovi(s, i.istanzaId, FADE_STOP_ESCLUSIVO_MS);
      s = r.stato;
      azioni.push(...r.azioni);
    }
  }
  return { stato: s, azioni };
}

/** Sfuma un singolo cue (tutte le sue istanze) in fadeOutMs, poi lo ferma. */
export function sfumaCue(stato: StatoRegole, cueId: string): Risultato {
  let s = stato;
  const azioni: Azione[] = [];
  for (const i of [...s.attivi]) {
    if (i.cueId === cueId) {
      const r = rimuovi(s, i.istanzaId, stato.fadeOutMs);
      s = r.stato;
      azioni.push(...r.azioni);
    }
  }
  return { stato: s, azioni };
}

/** Il file è finito da solo (o il fade del motore si è completato). */
export function finita(stato: StatoRegole, istanzaId: string): Risultato {
  const istanza = stato.attivi.find((i) => i.istanzaId === istanzaId);
  if (!istanza) {
    // Un sottofondo in uscita ha finito di sfumare: via dall'elenco.
    if (stato.uscite.some((u) => u.istanzaId === istanzaId)) {
      return { stato: { ...stato, uscite: stato.uscite.filter((u) => u.istanzaId !== istanzaId) }, azioni: [] };
    }
    return { stato, azioni: [] };
  }
  const prima = fattoreStato(stato);
  const dopoStato: StatoRegole = {
    ...stato,
    attivi: stato.attivi.filter((i) => i.istanzaId !== istanzaId),
  };
  const t = transizioneSottofondo(prima, dopoStato);
  return { stato: t.stato, azioni: t.azioni };
}

/** STOP TUTTO: ferma tutto subito, con una piccola rampa anti-click.
 *  Interrompe anche un passaggio tra sottofondi in corso. */
export function stopTutto(stato: StatoRegole): Risultato {
  const azioni: Azione[] = [...stato.attivi, ...stato.uscite].map((i) => ({
    tipo: "ferma",
    istanzaId: i.istanzaId,
    rampMs: FADE_STOP_TUTTO_MS,
  }));
  return { stato: { ...stato, attivi: [], uscite: [] }, azioni };
}

/** FADE OUT: sfuma tutto in fadeOutMs, poi silenzio (anche i sottofondi in uscita). */
export function fadeOut(stato: StatoRegole): Risultato {
  const azioni: Azione[] = [...stato.attivi, ...stato.uscite].map((i) => ({
    tipo: "ferma",
    istanzaId: i.istanzaId,
    rampMs: stato.fadeOutMs,
  }));
  return { stato: { ...stato, attivi: [], uscite: [] }, azioni };
}

/** PARLA: l'operatore parla al microfono; il sottofondo scende a livelloParla.
    Nota: STOP TUTTO non lo spegne (è un'intenzione dell'operatore). */
export function parla(stato: StatoRegole, acceso: boolean): Risultato {
  if (stato.parla === acceso) return { stato, azioni: [] };
  const prima = fattoreStato(stato);
  const s: StatoRegole = { ...stato, parla: acceso };
  return transizioneSottofondo(prima, s);
}

/** Cambio del volume master (0..1). */
export function master(stato: StatoRegole, valore: number): Risultato {
  const v = Math.min(1, Math.max(0, valore));
  const s: StatoRegole = { ...stato, master: v };
  const azioni: Azione[] = s.attivi
    .filter((i) => !i.inPausa)
    .map((i) => ({
      tipo: "cambiaGuadagno",
      istanzaId: i.istanzaId,
      guadagno: guadagnoIstanza(s, i),
      rampMs: FADE_MASTER_MS,
    }));
  return { stato: s, azioni };
}

/** Cambio del volume di un cue mentre suona (dallo slider in Modifica). */
export function volumeCue(stato: StatoRegole, cueId: string, volume: number): Risultato {
  const v = Math.min(1, Math.max(0, volume));
  const attivi = stato.attivi.map((i) => (i.cueId === cueId ? { ...i, volume: v } : i));
  const s: StatoRegole = { ...stato, attivi };
  const azioni: Azione[] = attivi
    .filter((i) => i.cueId === cueId && !i.inPausa)
    .map((i) => ({
      tipo: "cambiaGuadagno",
      istanzaId: i.istanzaId,
      guadagno: guadagnoIstanza(s, i),
      rampMs: FADE_MASTER_MS,
    }));
  return { stato: s, azioni };
}
