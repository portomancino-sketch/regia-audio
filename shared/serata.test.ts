import { describe, it, expect } from "vitest";
import { oraBreve, rigaSoundcheck, serataCorrente, soundcheckDellaSerata, spezzaInSerate, statoSerata, type EventoSerata } from "./serata";

const T0 = new Date("2026-09-26T16:00:00Z").getTime();
const ora = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const ev = (sec: number, tipo: string, dettagli?: Record<string, unknown>): EventoSerata => ({ ora: ora(sec), tipo, dettagli });

describe("serate dentro un giorno", () => {
  it("senza chiusure il giorno è una serata sola", () => {
    const eventi = [ev(0, "format aperto"), ev(10, "suono partito")];
    expect(spezzaInSerate(eventi)).toEqual([eventi]);
    expect(serataCorrente(eventi)).toEqual({ indice: 0, eventi });
  });

  it("'fine_serata' chiude la serata (l'evento resta dentro); dopo comincia la successiva", () => {
    const eventi = [ev(0, "suono partito"), ev(100, "fine_serata"), ev(200, "suono partito"), ev(300, "suono fermato")];
    const serate = spezzaInSerate(eventi);
    expect(serate.map((s) => s.length)).toEqual([2, 2]);
    expect(serate[0]![1]!.tipo).toBe("fine_serata");
    expect(serataCorrente(eventi)).toEqual({ indice: 1, eventi: eventi.slice(2) });
  });

  it("subito dopo la chiusura la serata corrente è vuota, col numero giusto", () => {
    const eventi = [ev(0, "suono partito"), ev(100, "fine_serata")];
    expect(serataCorrente(eventi)).toEqual({ indice: 1, eventi: [] });
    expect(serataCorrente([])).toEqual({ indice: 0, eventi: [] });
  });

  it("due chiusure lo stesso giorno → tre tratti possibili, due serate chiuse", () => {
    const eventi = [ev(0, "a"), ev(1, "fine_serata"), ev(2, "b"), ev(3, "fine_serata")];
    expect(spezzaInSerate(eventi).length).toBe(2);
    expect(serataCorrente(eventi).indice).toBe(2);
  });
});

describe("stato della serata", () => {
  it("serata nuova: niente soundcheck, avviso non ancora mostrato, id giorno#numero", () => {
    const s = statoSerata("2026-09-26", 0, []);
    expect(s).toEqual({ id: "2026-09-26#0", data: "2026-09-26", indice: 0, inizio: null, soundcheck: {}, avvisoMostrato: false });
  });

  it("un soundcheck completo conta, per il suo format; uno interrotto (ESC) no", () => {
    const eventi = [
      ev(0, "format aperto"),
      ev(10, "soundcheck", { formatId: "f1", fine: ora(30), caselle: 2, problemi: 0, mancanti: [], completo: false }),
      ev(40, "soundcheck", {
        formatId: "f1",
        inizio: ora(40),
        fine: ora(60),
        caselle: 6,
        problemi: 2,
        mancanti: [{ cueId: "c1", esito: "mancante" }, { cueId: "c2", esito: "nonDecodificabile" }],
        completo: true,
      }),
      ev(70, "soundcheck", { formatId: "f2", fine: ora(80), caselle: 3, problemi: 0, mancanti: [], completo: false }),
    ];
    const s = statoSerata("2026-09-26", 0, eventi);
    expect(s.inizio).toBe(ora(0));
    expect(Object.keys(s.soundcheck)).toEqual(["f1"]);
    expect(s.soundcheck.f1).toEqual({
      ora: ora(60),
      caselle: 6,
      problemi: 2,
      mancanti: { c1: "mancante", c2: "nonDecodificabile" },
      completo: true,
    });
  });

  it("l'avviso 'Non hai ancora provato' risulta mostrato dopo il suo evento", () => {
    expect(statoSerata("d", 0, [ev(0, "avviso_soundcheck", { scelta: "avanti" })]).avvisoMostrato).toBe(true);
  });

  it("il soundcheck per il riepilogo: un giro completo vince su uno interrotto", () => {
    const eventi = [
      ev(0, "soundcheck", { formatId: "f", fine: ora(5), problemi: 1, completo: true }),
      ev(10, "soundcheck", { formatId: "f", fine: ora(12), problemi: 0, completo: false }),
    ];
    expect(soundcheckDellaSerata(eventi)).toEqual({ ora: ora(5), problemi: 1, completo: true });
    expect(soundcheckDellaSerata([])).toBeNull();
    expect(soundcheckDellaSerata([eventi[1]!])).toEqual({ ora: ora(12), problemi: 0, completo: false });
  });
});

describe("la riga del foglio 'Prima di iniziare'", () => {
  const alle = new Date(2026, 8, 26, 18, 40).toISOString();
  it("non fatto (anche se interrotto), tutto ok, N problemi", () => {
    expect(rigaSoundcheck(null)).toEqual({ stato: "nonFatto", testo: "Soundcheck di oggi: NON FATTO" });
    expect(rigaSoundcheck({ ora: alle, caselle: 6, problemi: 0, mancanti: {}, completo: false }).stato).toBe("nonFatto");
    expect(rigaSoundcheck({ ora: alle, caselle: 6, problemi: 0, mancanti: {}, completo: true })).toEqual({
      stato: "ok",
      testo: "Soundcheck fatto alle 18:40 · tutto ok",
    });
    expect(rigaSoundcheck({ ora: alle, caselle: 6, problemi: 2, mancanti: {}, completo: true })).toEqual({
      stato: "problemi",
      testo: "Soundcheck fatto alle 18:40 · 2 problemi",
    });
    expect(rigaSoundcheck({ ora: alle, caselle: 6, problemi: 1, mancanti: {}, completo: true }).testo).toContain("1 problema");
  });
  it("ora breve nell'ora locale", () => {
    expect(oraBreve(alle)).toBe("18:40");
  });
});
