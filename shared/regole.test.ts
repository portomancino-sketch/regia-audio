import { describe, it, expect } from "vitest";
import type { Cue } from "./tipi";
import {
  statoIniziale,
  premi,
  stop,
  sfumaCue,
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
const BRANO_PAUSA = cue({ id: "br1", tipo: "brano", sulSottofondo: "pausa" });
const BRANO_ABBASSA = cue({ id: "br2", tipo: "brano", sulSottofondo: "abbassa" });

function nuovo(): StatoRegole {
  return statoIniziale({ master: 1, livelloAbbassa: 0.2, fadeOutMs: 1500 });
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

  it("con due effetti 'abbassa', il sottofondo risale solo alla fine del secondo", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    r = premi(r.stato, EFFETTO_ABBASSA); // seconda istanza sovrapposta
    const istanze = r.stato.attivi.filter((i) => i.cueId === "fx1");
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
  it("ripremere un effetto crea una nuova istanza, la precedente continua", () => {
    let r = premi(nuovo(), EFFETTO_NIENTE);
    r = premi(r.stato, EFFETTO_NIENTE);
    expect(r.stato.attivi).toHaveLength(2);
    expect(azione(r.azioni, "ferma")).toHaveLength(0);
    const ids = r.stato.attivi.map((i) => i.istanzaId);
    expect(new Set(ids).size).toBe(2);
  });

  it("un effetto si sovrappone a sottofondo e brano", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, BRANO_ABBASSA);
    r = premi(r.stato, EFFETTO_NIENTE);
    expect(r.stato.attivi).toHaveLength(3);
  });
});

describe("stop, stop tutto, fade out", () => {
  it("stop di un cue ferma tutte le sue istanze e ripristina il sottofondo", () => {
    let r = premi(nuovo(), SOTTOFONDO);
    r = premi(r.stato, EFFETTO_ABBASSA);
    r = premi(r.stato, EFFETTO_ABBASSA);
    r = stop(r.stato, "fx1");
    expect(azione(r.azioni, "ferma")).toHaveLength(2);
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

  it("sfumaCue su un effetto sfuma tutte le sue istanze", () => {
    let r = premi(nuovo(), EFFETTO_NIENTE);
    r = premi(r.stato, EFFETTO_NIENTE);
    r = sfumaCue(r.stato, "fx2");
    expect(azione(r.azioni, "ferma")).toHaveLength(2);
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
