import { describe, it, expect } from "vitest";
import type { Cue, Format } from "./tipi";
import { ordinaEsito, piccoInDb, sequenzaSoundcheck } from "./soundcheck";

function cue(id: string, ordine: number, tipo: Cue["tipo"] = "effetto", file: string | null = `${id}.wav`): Cue {
  return { id, titolo: id, nota: "", tipo, file, fileOriginale: null, durataSec: 3, volume: 1, loop: false, sulSottofondo: "niente", colore: null, ordine };
}

const FORMAT: Format = {
  id: "f",
  nome: "Prova",
  ordine: 0,
  fasi: [
    { id: "b", nome: "Atto 2", ordine: 1, cue: [cue("b2", 1), cue("b1", 0), cue("bp", 2, "promemoria", null)] },
    { id: "s", nome: "Sempre", ordine: -1, sempre: true, cue: [cue("s1", 0), cue("sp", 1, "promemoria", null)] },
    { id: "a", nome: "Atto 1", ordine: 0, cue: [cue("a1", 0, "sottofondo"), cue("a2", 1, "brano", null)] },
  ],
};

describe("sequenza del soundcheck", () => {
  it("riga Sempre per prima, poi le fasi e le caselle in ordine; promemoria saltati", () => {
    const ids = sequenzaSoundcheck(FORMAT).map((p) => p.cue.id);
    expect(ids).toEqual(["s1", "a1", "a2", "b1", "b2"]);
  });

  it("ogni passo sa in che fase sta; le caselle senza file restano (finiranno tra i mancanti)", () => {
    const passi = sequenzaSoundcheck(FORMAT);
    expect(passi.find((p) => p.cue.id === "a2")?.fase.nome).toBe("Atto 1");
    expect(passi.some((p) => p.cue.file === null)).toBe(true);
  });

  it("un format senza caselle audio dà una sequenza vuota", () => {
    expect(sequenzaSoundcheck({ ...FORMAT, fasi: [{ id: "x", nome: "X", ordine: 0, cue: [cue("p", 0, "promemoria", null)] }] })).toEqual([]);
  });
});

describe("esito del soundcheck", () => {
  it("separa mancanti e non decodificabili; i picchi dal più basso al più alto", () => {
    const r = ordinaEsito([
      { cueId: "1", titolo: "alto", fase: "A", esito: "ok", piccoDb: -1 },
      { cueId: "2", titolo: "manca", fase: "A", esito: "mancante", piccoDb: null },
      { cueId: "3", titolo: "basso", fase: "A", esito: "ok", piccoDb: -24 },
      { cueId: "4", titolo: "rotto", fase: "B", esito: "nonDecodificabile", piccoDb: null },
    ]);
    expect(r.mancanti.map((e) => e.titolo)).toEqual(["manca"]);
    expect(r.nonDecodificabili.map((e) => e.titolo)).toEqual(["rotto"]);
    expect(r.picchi.map((e) => e.titolo)).toEqual(["basso", "alto"]);
  });

  it("converte il picco in dBFS", () => {
    expect(piccoInDb(1)).toBe(0);
    expect(piccoInDb(0.5)).toBeCloseTo(-6, 0);
    expect(piccoInDb(0)).toBe(-100);
  });
});
