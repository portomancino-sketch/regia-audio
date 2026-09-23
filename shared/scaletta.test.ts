import { describe, it, expect } from "vitest";
import { formattaDurata, scarto, testoScarto } from "./scaletta";

const T0 = new Date("2026-09-24T20:00:00Z").getTime();
const min = (n: number) => n * 60_000;
const ev = (tipo: string, minuto: number, fase?: string) => ({ tipo, ora: new Date(T0 + min(minuto)).toISOString(), fase });

const SCALETTA = [
  { nome: "Accoglienza", durataPrevista: 15 },
  { nome: "Atto 1", durataPrevista: 30 },
  { nome: "Atto 2" },
  { nome: "Finale", durataPrevista: 10 },
];

describe("orologio di scaletta", () => {
  it("senza suoni veri la serata non è iniziata", () => {
    expect(scarto(SCALETTA, [ev("format aperto", 0, "Accoglienza")], T0 + min(5))).toMatchObject({ fase: null, scartoMs: null });
  });

  it("nella prima fase: trascorso e previsto, nessuno scarto (niente fasi precedenti)", () => {
    const r = scarto(SCALETTA, [ev("format aperto", -3, "Accoglienza"), ev("suono partito", 0, "Accoglienza")], T0 + min(12) + 40_000);
    expect(r.fase).toBe("Accoglienza");
    expect(formattaDurata(r.trascorsoMs)).toBe("12:40");
    expect(formattaDurata(r.previstoMs!)).toBe("15:00");
    expect(r.scartoMs).toBeNull();
    expect(r.colore).toBeNull();
  });

  it("in ritardo: entrata in Atto 1 dopo 23 min contro i 15 previsti → +8 min, rosso", () => {
    const eventi = [ev("suono partito", 0, "Accoglienza"), ev("fase cambiata", 23, "Atto 1")];
    const r = scarto(SCALETTA, eventi, T0 + min(25));
    expect(r.fase).toBe("Atto 1");
    expect(r.scartoMs).toBe(min(8));
    expect(testoScarto(r.scartoMs)).toBe("in ritardo di 8 min");
    expect(r.colore).toBe("rosso");
    expect(formattaDurata(r.trascorsoMs)).toBe("2:00");
  });

  it("in anticipo: verde entro 2 min, ambra entro 5", () => {
    const anticipo = scarto(SCALETTA, [ev("suono partito", 0, "Accoglienza"), ev("fase cambiata", 13, "Atto 1")], T0 + min(14));
    expect(testoScarto(anticipo.scartoMs)).toBe("in anticipo di 2 min");
    expect(anticipo.colore).toBe("verde");
    const ambra = scarto(SCALETTA, [ev("suono partito", 0, "Accoglienza"), ev("fase cambiata", 11, "Atto 1")], T0 + min(14));
    expect(ambra.colore).toBe("ambra");
    expect(testoScarto(0)).toBe("in orario");
  });

  it("una fase senza durata prevista: solo il trascorso, ma lo scarto cumulato resta", () => {
    const eventi = [ev("suono partito", 0, "Accoglienza"), ev("fase cambiata", 15, "Atto 1"), ev("fase cambiata", 50, "Atto 2")];
    const r = scarto(SCALETTA, eventi, T0 + min(53));
    expect(r.previstoMs).toBeNull();
    expect(r.scartoMs).toBe(min(5)); // 50 reali contro 45 previsti
    expect(r.colore).toBe("ambra");
  });

  it("gli eventi prima dell'inizio serata (soundcheck, format aperto) non contano", () => {
    const eventi = [ev("format aperto", -30, "Finale"), ev("soundcheck", -20), ev("suono partito", 0, "Accoglienza")];
    expect(scarto(SCALETTA, eventi, T0 + min(1)).fase).toBe("Accoglienza");
  });
});
