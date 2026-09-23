import { describe, it, expect } from "vitest";
import type { Cue } from "./tipi";
import {
  statoIniziale,
  premi,
  stop,
  sfumaCue,
  parla,
  finita,
  stopTutto,
  fadeOut,
  master,
  livelloSottofondo,
  FADE_SOSTITUZIONE_SOTTOFONDO_MS,
  FADE_STOP_ESCLUSIVO_MS,
  FADE_ABBASSA_MS,
  FADE_RIPRISTINO_MS,
  FADE_STOP_TUTTO_MS,
  guadagnoIstanza,
  type StatoRegole,
  type Azione,
} from "./regole";

function cue(parziale: Partial<Cue> & { id: string; tipo: Cue["tipo"] }): Cue {
  return {
    titolo: parziale.id,
    nota: "",
    file: `${parziale.id}.mp3`,
    fileOriginale: null,
    durataSec: 60,
    volume: 1,
    loop: parziale.tipo === "sottofondo",
    sulSottofondo: "niente",
    colore: null,
    ordine: 0,
    ...parziale,
  };
}

const SOTTOFONDO = cue({ id: "sf", tipo: "sottofondo", volume: 0.9 });
const EFFETTO_ABBASSA = cue({ id: "fx1", tipo: "effetto", sulSottofondo: "abbassa" });
const EFFETTO_NIENTE = cue({ id: "fx2", tipo: "effetto", sulSottofondo: "niente" });
const EFFETTO_ABBASSA_2 = cue({ id: "fx3", tipo: "effetto", sulSottofondo: "abbassa" });
const BRANO_PAUSA = cue({ id: "br1", tipo: "brano", sulSottofondo: "pausa" });
const BRANO_ABBASSA = cue({ id: "br2", tipo: "brano", sulSottofondo: "abbassa" });

function nuovo(): StatoRegole {
  return statoIniziale({ master: 1, livelloAbbassa: 0.2, fadeOutMs: 1500, livelloParla: 0.25 });
}

function azione<T extends Azione["tipo"]>(azioni: Azione[], tipo: T) {
  return azioni.filter((a) => a.tipo === tipo) as Extract<Azione, { tipo: T }>[];
}

function idIstanza(s: StatoRegole, cueId: string): string {
  const i = s.attivi.find((x) => x.cueId === cueId);
  if (!i) throw new Error(`nessuna istanza per ${cueId}`);
  return i.istanzaId;
}

describe("avvio e guadagni", () => {
  it("avvia un sottofondo a volume pieno", () => {
    const r = premi(nuovo(), SOTTOFONDO);
    const [avvia] = azione(r.azioni, "avvia");
    expect(avvia?.guadagno).toBeCloseTo(0.9); // master 1 × volume 0.9 × fattore 1
    expect(avvia?.loop).toBe(true);
    expect(r.stato.attivi).toHaveLength(1);
  });

  it("il guadagno usa master × volume × fattore", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = master(r.stato, 0.5);
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi[0]?.guadagno).toBeCloseTo(0.5 * 0.9 * 1);
  });
});

describe("effetto con 'abbassa'", () => {
  it("abbassa il sottofondo a livelloAbbassa in 300 ms", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi).toHaveLength(1);
    expect(cambi[0]?.guadagno).toBeCloseTo(0.9 * 0.2);
    expect(cambi[0]?.rampMs).toBe(FADE_ABBASSA_MS);
  });

  it("il sottofondo risale in 800 ms quando l'ultimo 'abbassa' finisce", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    const fx = idIstanza(r.stato, "fx1");
    r = finita(r.stato, fx);
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi[0]?.guadagno).toBeCloseTo(0.9);
    expect(cambi[0]?.rampMs).toBe(FADE_RIPRISTINO_MS);
  });

  it("con due effetti 'abbassa' diversi, il sottofondo risale solo alla fine del secondo", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    r = premi(r.stato, EFFETTO_ABBASSA_2); // un altro effetto, sovrapposto
    const istanze = r.stato.attivi.filter((i) => i.tipo === "effetto");
    expect(istanze).toHaveLength(2);

    r = finita(r.stato, istanze[0]!.istanzaId);
    expect(azione(r.azioni, "cambiaGuadagno")).toHaveLength(0); // resta abbassato

    r = finita(r.stato, istanze[1]!.istanzaId);
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi[0]?.guadagno).toBeCloseTo(0.9);
  });

  it("un effetto 'niente' non tocca il sottofondo", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_NIENTE);
    expect(azione(r.azioni, "cambiaGuadagno")).toHaveLength(0);
    expect(azione(r.azioni, "mettiInPausa")).toHaveLength(0);
  });
});

describe("brano con 'pausa'", () => {
  it("mette in pausa il sottofondo in 300 ms", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_PAUSA);
    const pause = azione(r.azioni, "mettiInPausa");
    expect(pause).toHaveLength(1);
    expect(pause[0]?.rampMs).toBe(FADE_ABBASSA_MS);
    expect(r.stato.attivi.find((i) => i.tipo === "sottofondo")?.inPausa).toBe(true);
  });

  it("riprende dalla pausa con fade-in 800 ms quando il brano finisce", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_PAUSA);
    r = finita(r.stato, idIstanza(r.stato, "br1"));
    const riprese = azione(r.azioni, "riprendi");
    expect(riprese).toHaveLength(1);
    expect(riprese[0]?.rampMs).toBe(FADE_RIPRISTINO_MS);
    expect(riprese[0]?.guadagno).toBeCloseTo(0.9);
    expect(r.stato.attivi.find((i) => i.tipo === "sottofondo")?.inPausa).toBe(false);
  });

  it("pausa vince su abbassa (precedenza su TUTTI gli attivi)", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    expect(livelloSottofondo(r.stato.attivi)).toBe("abbassa");
    r = premi(r.stato, BRANO_PAUSA);
    expect(livelloSottofondo(r.stato.attivi)).toBe("pausa");
    expect(azione(r.azioni, "mettiInPausa")).toHaveLength(1);
  });

  it("se finisce la pausa ma resta un 'abbassa', risale solo a livelloAbbassa", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    r = premi(r.stato, BRANO_PAUSA);
    r = finita(r.stato, idIstanza(r.stato, "br1"));
    const riprese = azione(r.azioni, "riprendi");
    expect(riprese).toHaveLength(1);
    expect(riprese[0]?.guadagno).toBeCloseTo(0.9 * 0.2); // solo fino a livelloAbbassa
    // ...e quando finisce anche l'effetto, torna pieno.
    r = finita(r.stato, idIstanza(r.stato, "fx1"));
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi[0]?.guadagno).toBeCloseTo(0.9);
  });

  it("se finisce un 'abbassa' ma resta una 'pausa', il sottofondo resta in pausa", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_PAUSA);
    r = premi(r.stato, EFFETTO_ABBASSA);
    r = finita(r.stato, idIstanza(r.stato, "fx1"));
    expect(azione(r.azioni, "riprendi")).toHaveLength(0);
    expect(r.stato.attivi.find((i) => i.tipo === "sottofondo")?.inPausa).toBe(true);
  });
});

describe("esclusività", () => {
  it("un nuovo sottofondo sfuma il precedente in 500 ms", () => {
    const altro = cue({ id: "sf2", tipo: "sottofondo" });
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, altro);
    const ferma = azione(r.azioni, "ferma");
    expect(ferma).toHaveLength(1);
    expect(ferma[0]?.rampMs).toBe(FADE_SOSTITUZIONE_SOTTOFONDO_MS);
    expect(r.stato.attivi.filter((i) => i.tipo === "sottofondo")).toHaveLength(1);
    expect(r.stato.attivi[0]?.cueId).toBe("sf2");
  });

  it("un nuovo brano ferma il precedente (fade 200 ms)", () => {
    let r = premi(nuovo(), BRANO_ABBASSA);
    r = premi(r.stato, BRANO_PAUSA);
    const ferma = azione(r.azioni, "ferma");
    expect(ferma).toHaveLength(1);
    expect(ferma[0]?.rampMs).toBe(FADE_STOP_ESCLUSIVO_MS);
    expect(r.stato.attivi.map((i) => i.cueId)).toEqual(["br1"]);
  });

  it("la sostituzione di un brano 'pausa' con uno 'abbassa' fa risalire il sottofondo a livelloAbbassa", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_PAUSA);
    r = premi(r.stato, BRANO_ABBASSA);
    const riprese = azione(r.azioni, "riprendi");
    expect(riprese).toHaveLength(1);
    expect(riprese[0]?.guadagno).toBeCloseTo(0.9 * 0.2);
  });

  it("ripremere un brano in riproduzione lo ferma", () => {
    let r = premi(nuovo(), BRANO_PAUSA);
    r = premi(r.stato, BRANO_PAUSA);
    expect(r.stato.attivi).toHaveLength(0);
    expect(azione(r.azioni, "avvia")).toHaveLength(0);
    expect(azione(r.azioni, "ferma")[0]?.rampMs).toBe(FADE_STOP_ESCLUSIVO_MS);
  });

  it("ripremere il sottofondo lo ferma", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, SOTTOFONDO);
    expect(r.stato.attivi).toHaveLength(0);
  });
});

describe("effetti sovrapposti", () => {
  it("ripremere un effetto che suona lo FERMA: nessuna istanza attiva (mai a sé stesso)", () => {
    let r = premi(nuovo(), EFFETTO_NIENTE);
    expect(r.stato.attivi).toHaveLength(1);
    r = premi(r.stato, EFFETTO_NIENTE);
    expect(r.stato.attivi).toHaveLength(0);
    const ferma = azione(r.azioni, "ferma");
    expect(ferma).toHaveLength(1);
    expect(ferma[0]?.rampMs).toBe(FADE_STOP_ESCLUSIVO_MS);
    expect(azione(r.azioni, "avvia")).toHaveLength(0);
  });

  it("premi-premi-premi su un effetto: parte, si ferma, riparte (una sola istanza)", () => {
    let r = premi(nuovo(), EFFETTO_NIENTE);
    r = premi(r.stato, EFFETTO_NIENTE);
    r = premi(r.stato, EFFETTO_NIENTE);
    expect(r.stato.attivi.map((i) => i.cueId)).toEqual(["fx2"]);
    expect(azione(r.azioni, "avvia")).toHaveLength(1);
  });

  it("ripremere un effetto 'abbassa' lo ferma e il sottofondo risale", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    r = premi(r.stato, EFFETTO_ABBASSA);
    expect(r.stato.attivi.map((i) => i.cueId)).toEqual(["sf"]);
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi.at(-1)?.guadagno).toBeCloseTo(0.9);
    expect(cambi.at(-1)?.rampMs).toBe(FADE_RIPRISTINO_MS);
  });

  it("due effetti DIVERSI si sommano", () => {
    let r = premi(nuovo(), EFFETTO_NIENTE);
    r = premi(r.stato, EFFETTO_ABBASSA);
    expect(r.stato.attivi).toHaveLength(2);
    expect(azione(r.azioni, "ferma")).toHaveLength(0);
  });

  it("un effetto si sovrappone a sottofondo e brano", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_ABBASSA);
    r = premi(r.stato, EFFETTO_NIENTE);
    expect(r.stato.attivi).toHaveLength(3);
  });
});

describe("stop, stop tutto, fade out", () => {
  it("stop di un cue lo ferma e ripristina il sottofondo", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    r = stop(r.stato, "fx1");
    expect(azione(r.azioni, "ferma")).toHaveLength(1);
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi.at(-1)?.guadagno).toBeCloseTo(0.9); // sottofondo di nuovo pieno
    expect(r.stato.attivi.map((i) => i.cueId)).toEqual(["sf"]);
  });

  it("STOP TUTTO ferma tutto con rampa 100 ms, sottofondo compreso", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_PAUSA);
    r = premi(r.stato, EFFETTO_NIENTE);
    r = stopTutto(r.stato);
    const ferma = azione(r.azioni, "ferma");
    expect(ferma).toHaveLength(3);
    for (const f of ferma) expect(f.rampMs).toBe(FADE_STOP_TUTTO_MS);
    expect(r.stato.attivi).toHaveLength(0);
  });

  it("sfumaCue sfuma solo quel cue in fadeOutMs e ripristina il sottofondo", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_PAUSA);
    r = sfumaCue(r.stato, "br1");
    const ferma = azione(r.azioni, "ferma");
    expect(ferma).toHaveLength(1);
    expect(ferma[0]?.rampMs).toBe(1500); // il fadeOutMs delle impostazioni
    // Il sottofondo era in pausa: riprende.
    expect(azione(r.azioni, "riprendi")).toHaveLength(1);
    expect(r.stato.attivi.map((i) => i.cueId)).toEqual(["sf"]);
  });

  it("sfumaCue su un effetto lo sfuma in fadeOutMs", () => {
    let r = premi(nuovo(), EFFETTO_NIENTE);
    r = sfumaCue(r.stato, "fx2");
    const ferma = azione(r.azioni, "ferma");
    expect(ferma).toHaveLength(1);
    expect(ferma[0]?.rampMs).toBe(1500);
    expect(r.stato.attivi).toHaveLength(0);
  });

  it("FADE OUT sfuma tutto in fadeOutMs", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_NIENTE);
    r = fadeOut(r.stato);
    const ferma = azione(r.azioni, "ferma");
    expect(ferma).toHaveLength(2);
    for (const f of ferma) expect(f.rampMs).toBe(1500);
    expect(r.stato.attivi).toHaveLength(0);
  });
});

describe("master", () => {
  it("cambia il guadagno di tutti gli attivi non in pausa", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_NIENTE);
    r = master(r.stato, 0.4);
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi).toHaveLength(2);
    expect(r.stato.master).toBe(0.4);
  });

  it("non tocca il sottofondo in pausa (riprenderà col guadagno giusto)", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_PAUSA);
    r = master(r.stato, 0.4);
    const cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi).toHaveLength(1); // solo il brano
    r = finita(r.stato, idIstanza(r.stato, "br1"));
    expect(azione(r.azioni, "riprendi")[0]?.guadagno).toBeCloseTo(0.4 * 0.9);
  });

  it("il valore è limitato tra 0 e 1", () => {
    let r = master(nuovo(), 5);
    expect(r.stato.master).toBe(1);
    r = master(r.stato, -3);
    expect(r.stato.master).toBe(0);
  });
});

describe("promemoria", () => {
  const PROMEMORIA = cue({ id: "pm1", tipo: "promemoria", file: null });

  it("premere un promemoria non fa nulla: mai tra gli attivi", () => {
    const r = premi(nuovo(), PROMEMORIA);
    expect(r.stato.attivi).toHaveLength(0);
    expect(r.azioni).toHaveLength(0);
  });

  it("non tocca il sottofondo e non conta come esclusivo", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_ABBASSA);
    const primaAttivi = r.stato.attivi.map((i) => i.cueId);
    r = premi(r.stato, PROMEMORIA);
    expect(r.azioni).toHaveLength(0); // niente fade, niente pause, niente stop
    expect(r.stato.attivi.map((i) => i.cueId)).toEqual(primaAttivi);
    expect(livelloSottofondo(r.stato.attivi)).toBe("abbassa"); // invariato
  });
});

describe("PARLA", () => {
  it("acceso: il sottofondo scende a livelloParla in 300 ms; spento: risale in 800 ms", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = parla(r.stato, true);
    let cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi).toHaveLength(1);
    expect(cambi[0]?.guadagno).toBeCloseTo(0.9 * 0.25);
    expect(cambi[0]?.rampMs).toBe(FADE_ABBASSA_MS);

    r = parla(r.stato, false);
    cambi = azione(r.azioni, "cambiaGuadagno");
    expect(cambi[0]?.guadagno).toBeCloseTo(0.9);
    expect(cambi[0]?.rampMs).toBe(FADE_RIPRISTINO_MS);
  });

  it("con un 'abbassa' attivo vince il livello più basso; spegnere PARLA risale solo a livelloAbbassa", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA); // sottofondo a 0.2
    r = parla(r.stato, true); // livelloParla 0.25 > 0.2: resta 0.2, nessuna azione
    expect(azione(r.azioni, "cambiaGuadagno")).toHaveLength(0);
    // spegnere PARLA con l'abbassa ancora attivo: resta a livelloAbbassa
    r = parla(r.stato, false);
    expect(azione(r.azioni, "cambiaGuadagno")).toHaveLength(0);
    // quando l'effetto finisce, torna pieno
    r = finita(r.stato, idIstanza(r.stato, "fx1"));
    expect(azione(r.azioni, "cambiaGuadagno")[0]?.guadagno).toBeCloseTo(0.9);
  });

  it("PARLA sotto livelloAbbassa: comanda PARLA; e 'pausa' vince sempre", () => {
    let r = statoIniziale({ master: 1, livelloAbbassa: 0.5, fadeOutMs: 1500, livelloParla: 0.1 });
    let r2 = premi(r, SOTTOFONDO);
    r2 = premi(r2.stato, EFFETTO_ABBASSA); // → 0.5
    r2 = parla(r2.stato, true); // → 0.1 (più basso)
    const cambi = azione(r2.azioni, "cambiaGuadagno");
    expect(cambi[0]?.guadagno).toBeCloseTo(0.9 * 0.1);
    // pausa vince: il sottofondo si ferma anche con PARLA acceso
    r2 = premi(r2.stato, BRANO_PAUSA);
    expect(azione(r2.azioni, "mettiInPausa")).toHaveLength(1);
    // fine del brano: riprende ma solo fino a livello PARLA (0.1)
    r2 = finita(r2.stato, idIstanza(r2.stato, "br1"));
    expect(azione(r2.azioni, "riprendi")[0]?.guadagno).toBeCloseTo(0.9 * 0.1);
  });

  it("STOP TUTTO non spegne PARLA", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = parla(r.stato, true);
    r = stopTutto(r.stato);
    expect(r.stato.parla).toBe(true);
    // un sottofondo nuovo parte già abbassato al livello PARLA
    r = premi(r.stato, SOTTOFONDO);
    const [avvia] = azione(r.azioni, "avvia");
    expect(avvia?.guadagno).toBeCloseTo(0.9 * 0.25);
  });

  it("acceso due volte non produce azioni doppie", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = parla(r.stato, true);
    r = parla(r.stato, true);
    expect(r.azioni).toHaveLength(0);
  });
});

describe("casi particolari", () => {
  it("un sottofondo avviato mentre c'è un cue 'pausa' nasce in pausa", () => {
    let r = premi(nuovo(), BRANO_PAUSA);
    r = premi(r.stato, SOTTOFONDO);
    const [avvia] = azione(r.azioni, "avvia").filter((a) => a.cueId === "sf");
    expect(avvia?.inPausa).toBe(true);
    // Quando il brano finisce, il sottofondo parte davvero.
    r = finita(r.stato, idIstanza(r.stato, "br1"));
    expect(azione(r.azioni, "riprendi")).toHaveLength(1);
  });

  it("'finita' su un'istanza sconosciuta non fa nulla", () => {
    const r = finita(nuovo(), "ix");
    expect(r.azioni).toHaveLength(0);
  });
});

describe("guadagno in dB della casella (automatico + ritocco)", () => {
  const SF_DB = cue({ id: "sfdb", tipo: "sottofondo", volume: 0.8, guadagnoAuto: 6, ritocco: -2 }); // +4 dB
  const FX_DB = cue({ id: "fxdb", tipo: "effetto", sulSottofondo: "abbassa", guadagnoAuto: -6 });

  it("alla partenza: master × volume × 10^(dB/20)", () => {
    const r = premi(nuovo(), SF_DB);
    const avvia = azione(r.azioni, "avvia")[0]!;
    expect(avvia.guadagno).toBeCloseTo(1 * 0.8 * Math.pow(10, 4 / 20), 4); // ≈ 1.268
  });

  it("il ritocco negativo abbassa: -6 dB = metà", () => {
    const r = premi(nuovo(), FX_DB);
    expect(azione(r.azioni, "avvia")[0]!.guadagno).toBeCloseTo(0.501, 2);
  });

  it("con 'abbassa' attivo il fattore si applica dopo il guadagno dB; con 'pausa' vale 0", () => {
    let r = premi(nuovo(), SF_DB);
    r = premi(r.stato, FX_DB);
    const cambio = azione(r.azioni, "cambiaGuadagno")[0]!;
    expect(cambio.guadagno).toBeCloseTo(0.8 * Math.pow(10, 4 / 20) * 0.2, 4);
    r = premi(r.stato, BRANO_PAUSA);
    const sf = r.stato.attivi.find((i) => i.cueId === "sfdb")!;
    expect(sf.inPausa).toBe(true);
    expect(guadagnoIstanza(r.stato, sf)).toBe(0);
  });

  it("PARLA e master si combinano col guadagno dB nell'ordine giusto", () => {
    let r = premi(nuovo(), SF_DB);
    r = master(r.stato, 0.5);
    r = parla(r.stato, true);
    const sf = r.stato.attivi[0]!;
    // master 0.5 × volume 0.8 × +4 dB × PARLA 0.25
    expect(guadagnoIstanza(r.stato, sf)).toBeCloseTo(0.5 * 0.8 * Math.pow(10, 4 / 20) * 0.25, 4);
    const ultimo = azione(r.azioni, "cambiaGuadagno").at(-1)!;
    expect(ultimo.guadagno).toBeCloseTo(guadagnoIstanza(r.stato, sf), 4);
  });

  it("senza campi (config vecchie) il guadagno dB è 0: niente cambia", () => {
    const r = premi(nuovo(), SOTTOFONDO);
    expect(azione(r.azioni, "avvia")[0]!.guadagno).toBeCloseTo(0.9, 4);
  });
});

describe("passaggio morbido tra sottofondi (crossfade)", () => {
  const SF2 = cue({ id: "sf2", tipo: "sottofondo" });
  function conCrossfade(ms: number): StatoRegole {
    return statoIniziale({ master: 1, livelloAbbassa: 0.2, fadeOutMs: 1500, crossfadeMs: ms });
  }

  it("il nuovo è attivo, il vecchio è 'in uscita' con la sua scadenza; il motore sfuma ed entra nello stesso tempo", () => {
    let r = premi(conCrossfade(2000), SOTTOFONDO);
    r = premi(r.stato, SF2);
    expect(r.stato.attivi.map((i) => i.cueId)).toEqual(["sf2"]);
    expect(r.stato.uscite).toEqual([{ istanzaId: "i1", cueId: "sf", rampMs: 2000 }]);
    expect(azione(r.azioni, "ferma")[0]).toMatchObject({ istanzaId: "i1", rampMs: 2000 });
    expect(azione(r.azioni, "avvia")[0]).toMatchObject({ cueId: "sf2", rampMs: 2000 });
  });

  it("quando il vecchio ha finito di sfumare esce dall'elenco", () => {
    let r = premi(conCrossfade(2000), SOTTOFONDO);
    r = premi(r.stato, SF2);
    r = finita(r.stato, "i1");
    expect(r.stato.uscite).toEqual([]);
    expect(r.stato.attivi).toHaveLength(1);
  });

  it("STOP TUTTO e FADE OUT chiudono anche il passaggio in corso", () => {
    let r = premi(conCrossfade(3000), SOTTOFONDO);
    r = premi(r.stato, SF2);
    const st = stopTutto(r.stato);
    expect(azione(st.azioni, "ferma").map((a) => a.istanzaId).sort()).toEqual(["i1", "i2"]);
    expect(st.stato.uscite).toEqual([]);
    const fo = fadeOut(r.stato);
    expect(azione(fo.azioni, "ferma")).toHaveLength(2);
    for (const f of fo.azioni) expect((f as { rampMs: number }).rampMs).toBe(1500);
  });

  it("con crossfade 0 il comportamento è quello classico (500 ms di uscita, entrata secca)", () => {
    let r = premi(conCrossfade(0), SOTTOFONDO);
    r = premi(r.stato, SF2);
    expect(azione(r.azioni, "ferma")[0]!.rampMs).toBe(0);
    expect(azione(r.azioni, "avvia")[0]!.rampMs).toBeUndefined();
  });

  it("senza crossfade nello stato (config vecchie) resta il fade di 500 ms", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, SF2);
    expect(azione(r.azioni, "ferma")[0]!.rampMs).toBe(FADE_SOSTITUZIONE_SOTTOFONDO_MS);
  });
});
