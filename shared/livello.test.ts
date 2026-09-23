import { describe, it, expect } from "vitest";
import { analizzaCampioni, calcolaGuadagno, dbALineare, guadagnoCasellaDb, lineareADb } from "./livello";

describe("calcolaGuadagno", () => {
  it("un file già a -18 dBFS non si tocca", () => {
    expect(calcolaGuadagno(-18, -6)).toBe(0);
  });
  it("un file a -40 dBFS si ferma a +12 dB", () => {
    expect(calcolaGuadagno(-40, -20)).toBe(12);
  });
  it("un file troppo forte si ferma a -12 dB", () => {
    expect(calcolaGuadagno(-2, -0.5)).toBe(-12);
  });
  it("con un picco alto il guadagno si riduce perché il picco resti a -1 dBFS", () => {
    // medio -30 → vorrebbe +12, ma il picco è a -6: al massimo +5
    expect(calcolaGuadagno(-30, -6)).toBe(5);
  });
  it("un picco già oltre -1 dBFS viene abbassato anche se il medio è basso", () => {
    expect(calcolaGuadagno(-25, 0)).toBe(-1);
  });
  it("auto + ritocco si sommano in dB", () => {
    expect(guadagnoCasellaDb({ guadagnoAuto: 4, ritocco: -2 })).toBe(2);
    expect(guadagnoCasellaDb({})).toBe(0);
  });
  it("dB ↔ lineare", () => {
    expect(dbALineare(0)).toBe(1);
    expect(dbALineare(-6)).toBeCloseTo(0.501, 2);
    expect(lineareADb(0.5)).toBeCloseTo(-6.02, 1);
    expect(lineareADb(0)).toBe(-100);
  });
});

describe("analizzaCampioni", () => {
  function sinusoide(ampiezza: number, secondi: number, sr = 8000): Float32Array {
    const n = Math.round(sr * secondi);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = ampiezza * Math.sin((2 * Math.PI * 440 * i) / sr);
    return out;
  }
  it("una sinusoide piena: picco 0 dB, medio -3 dB", () => {
    const r = analizzaCampioni([sinusoide(1, 2)], 8000);
    expect(r.picco).toBeCloseTo(0, 0);
    expect(r.rms).toBeCloseTo(-3, 0);
  });
  it("il silenzio in coda non abbassa la media (gate a -50 dBFS)", () => {
    const suono = sinusoide(0.5, 1.2); // multiplo del tratto di 0,4 s
    const silenzio = new Float32Array(8000 * 3);
    const tutto = new Float32Array(suono.length + silenzio.length);
    tutto.set(suono, 0);
    tutto.set(silenzio, suono.length);
    const r = analizzaCampioni([tutto], 8000);
    expect(r.rms).toBeCloseTo(-9, 0); // 0.5 di ampiezza → -6 di picco, -9 di medio
    expect(r.picco).toBeCloseTo(-6, 0);
  });
  it("un file tutto silenzio dà -100", () => {
    expect(analizzaCampioni([new Float32Array(8000)], 8000)).toEqual({ rms: -100, picco: -100 });
  });
});
