import { describe, it, expect } from "vitest";
import type { Cue } from "./tipi";
import { MAX_EVIDENZA, altriSempre, inEvidenza, puoMettereInEvidenza } from "./sempre";

function cue(id: string, ordine: number, evidenza?: boolean): Cue {
  return {
    id, titolo: id, nota: "", tipo: "effetto", file: `${id}.mp3`, fileOriginale: null,
    durataSec: 3, volume: 1, loop: false, sulSottofondo: "abbassa", colore: null, ordine,
    ...(evidenza === undefined ? {} : { evidenza }),
  };
}

describe("riga Sempre: in evidenza e altri", () => {
  it("con 4 caselle o meno sono tutte in evidenza, anche senza il campo (config vecchie)", () => {
    const riga = [cue("a", 0), cue("b", 1), cue("c", 2), cue("d", 3)];
    expect(inEvidenza(riga).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(altriSempre(riga)).toHaveLength(0);
  });

  it("con più di 4 e nessuna scelta (config vecchie): nessuna in evidenza, tutte in Altri", () => {
    const riga = [cue("a", 0), cue("b", 1), cue("c", 2), cue("d", 3), cue("e", 4)];
    expect(inEvidenza(riga)).toHaveLength(0);
    expect(altriSempre(riga)).toHaveLength(5);
  });

  it("le pillole seguono l'ordine di Modifica, le altre pure", () => {
    const riga = [cue("e", 4, true), cue("a", 0), cue("c", 2, true), cue("b", 1), cue("d", 3, true), cue("f", 5), cue("g", 6)];
    expect(inEvidenza(riga).map((c) => c.id)).toEqual(["c", "d", "e"]);
    expect(altriSempre(riga).map((c) => c.id)).toEqual(["a", "b", "f", "g"]);
  });

  it("mai più di 4 in evidenza, anche se i dati ne hanno di più", () => {
    const riga = [0, 1, 2, 3, 4, 5].map((i) => cue(`c${i}`, i, true));
    expect(inEvidenza(riga)).toHaveLength(MAX_EVIDENZA);
    expect(altriSempre(riga).map((c) => c.id)).toEqual(["c4", "c5"]);
  });

  it("la quinta non si può mettere in evidenza; una già in evidenza resta ammessa", () => {
    const riga = [cue("a", 0, true), cue("b", 1, true), cue("c", 2, true), cue("d", 3, true), cue("e", 4)];
    expect(puoMettereInEvidenza(riga, "e")).toBe(false);
    expect(puoMettereInEvidenza(riga, "d")).toBe(true);
  });
});
