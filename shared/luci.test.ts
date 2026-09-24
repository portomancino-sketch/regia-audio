import { describe, it, expect } from "vitest";
import {
  CodaLuci,
  comandiRipristino,
  effettoInComandi,
  fotografaLuce,
  luceAllaFase,
  luceAllaFine,
  luceAllaPartenza,
  luciCoinvolte,
  luminositaInBri,
  mappaVuota,
  LUCE_SU_STOP_TUTTO,
  type Effetto,
  type MappaLuci,
} from "./luci";

const MAPPA: MappaLuci = {
  ...mappaVuota(),
  gruppi: {
    sala: { id: "sala", nome: "Sala", luci: ["1", "2", "3"], gruppoBridge: "10" },
    bar: { id: "bar", nome: "Bar", luci: ["4", "5"] },
  },
};
const BUIO: Effetto = {
  nome: "Buio",
  colore: "#333",
  voci: {
    sala: { acceso: false, luminosita: 0, colore: "bianco-caldo", transizione: 2 },
    bar: { acceso: true, luminosita: 5, colore: "blu", transizione: 0.5 },
  },
};

describe("effettoInComandi", () => {
  it("gruppo grande intero → un comando solo al gruppo della centralina; gruppo piccolo → per lampadina", () => {
    const c = effettoInComandi(BUIO, MAPPA);
    expect(c).toHaveLength(3);
    expect(c[0]).toEqual({ bersaglio: { tipo: "gruppo", id: "10" }, stato: { on: false, transitiontime: 20 } });
    expect(c[1]).toEqual({ bersaglio: { tipo: "luce", id: "4" }, stato: { on: true, bri: 14, hue: 46920, sat: 254, transitiontime: 5 } });
    expect(c[2]!.bersaglio).toEqual({ tipo: "luce", id: "5" });
  });
  it("solo alcune luci di un gruppo → comandi per quelle lampadine, anche se il gruppo è grande", () => {
    const e: Effetto = { nome: "x", colore: "#000", voci: { sala: { acceso: true, luminosita: 100, colore: "rosso", transizione: 0, luci: ["2", "9"] } } };
    const c = effettoInComandi(e, MAPPA);
    expect(c.map((x) => x.bersaglio)).toEqual([{ tipo: "luce", id: "2" }]);
    expect(c[0]!.stato).toEqual({ on: true, bri: 254, hue: 0, sat: 254, transitiontime: 0 });
  });
  it("i bianchi usano la temperatura (ct); gruppi sconosciuti si ignorano", () => {
    const e: Effetto = { nome: "x", colore: "#000", voci: { bar: { acceso: true, luminosita: 50, colore: "bianco-freddo", transizione: 1 }, fantasma: { acceso: true, luminosita: 1, colore: "rosa", transizione: 1 } } };
    const c = effettoInComandi(e, MAPPA);
    expect(c).toHaveLength(2);
    expect(c[0]!.stato).toEqual({ on: true, bri: 128, ct: 180, transitiontime: 10 });
  });
  it("intensità 50 % = luminosità dimezzata, colori intatti; 10 % è il minimo", () => {
    const e: Effetto = { nome: "x", colore: "#000", voci: { bar: { acceso: true, luminosita: 100, colore: "verde", transizione: 1 } } };
    const pieno = effettoInComandi(e, MAPPA, 100)[0]!.stato;
    const meta = effettoInComandi(e, MAPPA, 50)[0]!.stato;
    expect(pieno.bri).toBe(254);
    expect(meta.bri).toBe(127);
    expect(meta.hue).toBe(pieno.hue);
    expect(meta.sat).toBe(pieno.sat);
    expect(luminositaInBri(100, 0)).toBe(25); // sotto il 10 % vale 10 %
    expect(luminositaInBri(0, 10)).toBe(1);
  });
  it("le luci coinvolte sono l'unione dei tre effetti (gruppi interi e luci singole)", () => {
    const mappa: MappaLuci = { ...MAPPA, effetti: { ...MAPPA.effetti, luce1: BUIO, luce2: { nome: "R", colore: "#f00", voci: { sala: { acceso: true, luminosita: 1, colore: "rosso", transizione: 1, luci: ["2"] } } } } };
    expect(luciCoinvolte(mappa).sort()).toEqual(["1", "2", "3", "4", "5"]);
    expect(luciCoinvolte(mappaVuota())).toEqual([]);
  });
});

describe("foto e ripristino ('torna com'era')", () => {
  it("il ripristino è per lampadina, esatto, e ignora l'intensità", () => {
    const foto = {
      "1": fotografaLuce({ on: true, bri: 200, hue: 1000, sat: 100, ct: 300, colormode: "ct", reachable: true } as never),
      "2": fotografaLuce({ on: true, bri: 120, hue: 25500, sat: 254, ct: 153, colormode: "hs" }),
      "3": fotografaLuce({ on: false, bri: 50 }),
    };
    expect(foto["1"]).toEqual({ on: true, bri: 200, hue: 1000, sat: 100, ct: 300, colormode: "ct" });
    const r = comandiRipristino(foto, 1);
    expect(r.find((c) => c.bersaglio.id === "1")!.stato).toEqual({ on: true, bri: 200, ct: 300, transitiontime: 10 });
    expect(r.find((c) => c.bersaglio.id === "2")!.stato).toEqual({ on: true, bri: 120, hue: 25500, sat: 254, transitiontime: 10 });
    expect(r.find((c) => c.bersaglio.id === "3")!.stato).toEqual({ on: false, transitiontime: 10 });
    expect(r.every((c) => c.bersaglio.tipo === "luce")).toBe(true);
  });
});

describe("coda verso la centralina", () => {
  it("al massimo 10 comandi al secondo", () => {
    const coda = new CodaLuci(10);
    for (let i = 0; i < 15; i++) coda.aggiungi({ bersaglio: { tipo: "luce", id: String(i) }, stato: { on: true } });
    let n = 0;
    while (coda.prossimo(1000)) n++;
    expect(n).toBe(10);
    expect(coda.lunghezza).toBe(5);
    expect(coda.prossimo(1500)).toBeNull();
    expect(coda.prossimo(2001)).not.toBeNull();
  });
  it("per la stessa lampadina (o gruppo) resta solo l'ultimo comando", () => {
    const coda = new CodaLuci(10);
    for (let i = 1; i <= 25; i++) coda.aggiungi({ bersaglio: { tipo: "luce", id: "7" }, stato: { on: true, bri: i } });
    coda.aggiungi({ bersaglio: { tipo: "gruppo", id: "7" }, stato: { on: false } });
    expect(coda.lunghezza).toBe(2);
    expect(coda.prossimo(0)!.stato.bri).toBe(25);
    expect(coda.prossimo(0)!.bersaglio.tipo).toBe("gruppo");
  });
});

describe("caselle, fasi e stop", () => {
  it("casella con luce → effetto alla partenza; luceFine → torna; promemoria compreso", () => {
    expect(luceAllaPartenza({ luce: "luce2" })).toBe("luce2");
    expect(luceAllaPartenza({})).toBeNull();
    expect(luceAllaFine({ luceFine: true })).toBe("torna");
    expect(luceAllaFine({})).toBeNull();
  });
  it("fase con luce → effetto all'ingresso; la riga Sempre mai", () => {
    expect(luceAllaFase({ luce: "luce1" })).toBe("luce1");
    expect(luceAllaFase({ luce: "luce1", sempre: true })).toBeNull();
    expect(luceAllaFase({})).toBeNull();
  });
  it("STOP TUTTO manda sempre 'torna'", () => {
    expect(LUCE_SU_STOP_TUTTO).toBe("torna");
  });
});
