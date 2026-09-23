// Le regole audio della Regia, come macchina a stati pura.
// Nessun Web Audio qui: riceve eventi, restituisce il nuovo stato
// e le azioni che il motore deve eseguire.

import type { Cue, SulSottofondo, TipoCue } from "./tipi";

// Durate dei fade, in millisecondi.
export const FADE_SOSTITUZIONE_SOTTOFONDO_MS = 500;
export const FADE_STOP_ESCLUSIVO_MS = 200;
export const FADE_ABBASSA_MS = 300;
export const FADE_RIPRISTINO_MS = 800;
export const FADE_STOP_TUTTO_MS = 100;
export const FADE_MASTER_MS = 50;

/** Un suono in riproduzione (un cue può avere più istanze se è un effetto). */
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
}

export interface StatoRegole {
  master: number;
  livelloAbbassa: number;
  fadeOutMs: number;
  attivi: Istanza[];
  /** Contatore per generare id di istanza deterministici. */
  contatore: number;
}

/** Cosa deve fare il motore audio. */
export type Azione =
  | { tipo: "avvia"; istanzaId: string; cueId: string; guadagno: number; loop: boolean; inPausa: boolean }
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
}): StatoRegole {
  return {
    master: opzioni.master,
    livelloAbbassa: opzioni.livelloAbbassa,
    fadeOutMs: opzioni.fadeOutMs,
    attivi: [],
    contatore: 0,
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

function fattore(livello: LivelloSottofondo, livelloAbbassa: number): number {
  if (livello === "pausa") return 0;
  if (livello === "abbassa") return livelloAbbassa;
  return 1;
}

/** Guadagno effettivo di un'istanza: master × volume × fattore sottofondo. */
export function guadagnoIstanza(stato: StatoRegole, istanza: Istanza): number {
  const f =
    istanza.tipo === "sottofondo"
      ? fattore(livelloSottofondo(stato.attivi), stato.livelloAbbassa)
      : 1;
  return stato.master * istanza.volume * f;
}

/**
 * Dopo un cambiamento negli attivi, confronta il livello del sottofondo
 * prima/dopo e produce le azioni per abbassarlo, metterlo in pausa,
 * farlo riprendere o risalire.
 */
function transizioneSottofondo(
  prima: LivelloSottofondo,
  stato: StatoRegole,
): { stato: StatoRegole; azioni: Azione[] } {
  const dopo = livelloSottofondo(stato.attivi);
  if (prima === dopo) return { stato, azioni: [] };

  const azioni: Azione[] = [];
  const attivi = stato.attivi.map((i) => {
    if (i.tipo !== "sottofondo") return i;
    const guadagno = stato.master * i.volume * fattore(dopo, stato.livelloAbbassa);
    if (dopo === "pausa") {
      if (!i.inPausa) azioni.push({ tipo: "mettiInPausa", istanzaId: i.istanzaId, rampMs: FADE_ABBASSA_MS });
      return { ...i, inPausa: true };
    }
    if (i.inPausa) {
      // Riprende dalla stessa posizione; se restano cue "abbassa",
      // risale solo fino a livelloAbbassa.
      azioni.push({ tipo: "riprendi", istanzaId: i.istanzaId, guadagno, rampMs: FADE_RIPRISTINO_MS });
      return { ...i, inPausa: false };
    }
    const rampMs = dopo === "abbassa" && prima === "pieno" ? FADE_ABBASSA_MS : FADE_RIPRISTINO_MS;
    azioni.push({ tipo: "cambiaGuadagno", istanzaId: i.istanzaId, guadagno, rampMs });
    return i;
  });
  return { stato: { ...stato, attivi }, azioni };
}

/** Toglie un'istanza dagli attivi e sistema il sottofondo di conseguenza. */
function rimuovi(stato: StatoRegole, istanzaId: string, rampMs: number): Risultato {
  const istanza = stato.attivi.find((i) => i.istanzaId === istanzaId);
  if (!istanza) return { stato, azioni: [] };
  const prima = livelloSottofondo(stato.attivi);
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
  // Ripremere un sottofondo o un brano in riproduzione = fermarlo.
  if (cue.tipo !== "effetto") {
    const giaAttivo = stato.attivi.find((i) => i.cueId === cue.id);
    if (giaAttivo) return rimuovi(stato, giaAttivo.istanzaId, FADE_STOP_ESCLUSIVO_MS);
  }

  // Il livello del sottofondo si ricalcola UNA volta sola, alla fine,
  // così la sostituzione di un esclusivo non fa "rimbalzare" il sottofondo.
  const prima = livelloSottofondo(stato.attivi);
  let s = stato;
  const azioni: Azione[] = [];

  // Esclusività: un solo sottofondo, un solo brano.
  if (cue.tipo === "sottofondo" || cue.tipo === "brano") {
    const rampMs = cue.tipo === "sottofondo" ? FADE_SOSTITUZIONE_SOTTOFONDO_MS : FADE_STOP_ESCLUSIVO_MS;
    const daFermare = s.attivi.filter((i) => i.tipo === cue.tipo);
    for (const i of daFermare) azioni.push({ tipo: "ferma", istanzaId: i.istanzaId, rampMs });
    s = { ...s, attivi: s.attivi.filter((i) => i.tipo !== cue.tipo) };
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
  };

  let s2: StatoRegole = { ...s, contatore, attivi: [...s.attivi, nuova] };

  // Un sottofondo che parte mentre un cue "pausa" è attivo nasce in pausa.
  const livelloAllaPartenza = livelloSottofondo(s2.attivi);
  const nasceInPausa = nuova.tipo === "sottofondo" && livelloAllaPartenza === "pausa";
  if (nasceInPausa) {
    s2 = {
      ...s2,
      attivi: s2.attivi.map((i) => (i.istanzaId === nuova.istanzaId ? { ...i, inPausa: true } : i)),
    };
  }

  const guadagno =
    s2.master *
    nuova.volume *
    (nuova.tipo === "sottofondo" ? fattore(livelloAllaPartenza, s2.livelloAbbassa) : 1);

  azioni.push({
    tipo: "avvia",
    istanzaId: nuova.istanzaId,
    cueId: cue.id,
    guadagno,
    loop: nuova.loop,
    inPausa: nasceInPausa,
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

/** Il file è finito da solo (o il fade del motore si è completato). */
export function finita(stato: StatoRegole, istanzaId: string): Risultato {
  const istanza = stato.attivi.find((i) => i.istanzaId === istanzaId);
  if (!istanza) return { stato, azioni: [] };
  const prima = livelloSottofondo(stato.attivi);
  const dopoStato: StatoRegole = {
    ...stato,
    attivi: stato.attivi.filter((i) => i.istanzaId !== istanzaId),
  };
  const t = transizioneSottofondo(prima, dopoStato);
  return { stato: t.stato, azioni: t.azioni };
}

/** STOP TUTTO: ferma tutto subito, con una piccola rampa anti-click. */
export function stopTutto(stato: StatoRegole): Risultato {
  const azioni: Azione[] = stato.attivi.map((i) => ({
    tipo: "ferma",
    istanzaId: i.istanzaId,
    rampMs: FADE_STOP_TUTTO_MS,
  }));
  return { stato: { ...stato, attivi: [] }, azioni };
}

/** FADE OUT: sfuma tutto in fadeOutMs, poi silenzio. */
export function fadeOut(stato: StatoRegole): Risultato {
  const azioni: Azione[] = stato.attivi.map((i) => ({
    tipo: "ferma",
    istanzaId: i.istanzaId,
    rampMs: stato.fadeOutMs,
  }));
  return { stato: { ...stato, attivi: [] }, azioni };
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
