import { describe, it, expect } from "vitest";
import { azzeraUsi, incrementaUsi, statoUsi, usiDelGiorno } from "./usi";

describe("contatori 'già suonato'", () => {
  it("una partenza vera incrementa; i promemoria non contano", () => {
    let usi = incrementaUsi({}, { id: "a", tipo: "effetto" });
    usi = incrementaUsi(usi, { id: "a", tipo: "effetto" });
    usi = incrementaUsi(usi, { id: "p", tipo: "promemoria" });
    expect(usi).toEqual({ a: 2 });
  });

  it("'Azzera serata' toglie solo le caselle della fase", () => {
    const usi = azzeraUsi({ a: 2, b: 1, c: 5 }, ["a", "b"]);
    expect(usi).toEqual({ c: 5 });
  });

  it("al cambio di giorno i contatori ripartono da zero", () => {
    const ieri = { giorno: "2026-09-22", usi: { a: 3 } };
    expect(usiDelGiorno(ieri, "2026-09-22")).toBe(ieri);
    expect(usiDelGiorno(ieri, "2026-09-23")).toEqual({ giorno: "2026-09-23", usi: {} });
  });

  it("stato della card: 'usato 1/3', esaurita a 3/3, 'già suonato' senza previsione", () => {
    expect(statoUsi({ id: "a", usiPrevisti: 3 }, { a: 1 })).toEqual({ usati: 1, previsti: 3, esauriti: false, giaSuonato: true });
    expect(statoUsi({ id: "a", usiPrevisti: 3 }, { a: 3 })).toMatchObject({ esauriti: true });
    expect(statoUsi({ id: "a", usiPrevisti: 3 }, { a: 5 })).toMatchObject({ esauriti: true, usati: 5 });
    expect(statoUsi({ id: "a" }, { a: 1 })).toEqual({ usati: 1, previsti: null, esauriti: false, giaSuonato: true });
    expect(statoUsi({ id: "a", usiPrevisti: 0 }, undefined)).toEqual({ usati: 0, previsti: null, esauriti: false, giaSuonato: false });
  });
});
