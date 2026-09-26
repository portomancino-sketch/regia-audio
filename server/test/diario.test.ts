import { describe, it, expect } from "vitest";
import type { Config } from "../../shared/tipi";
import { calcolaMaiUsati, riepilogoSerata, type EventoDiario } from "../src/diario";

// Una serata scritta a mano, come le righe del jsonl.
const T0 = new Date("2026-09-24T20:00:00Z").getTime();
const ora = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const SERATA: EventoDiario[] = [
  { ora: ora(-600), tipo: "format aperto", format: "Orient", origine: "mac·1111" },
  { ora: ora(-500), tipo: "soundcheck", format: "Orient", origine: "mac·1111", dettagli: { caselle: 5 } },
  { ora: ora(0), tipo: "suono partito", cue: "Treno", fase: "Accoglienza", format: "Orient", origine: "mac·1111" },
  { ora: ora(1), tipo: "suono partito", cue: "Campanello", fase: "Accoglienza", format: "Orient", origine: "telefono·2222" },
  { ora: ora(2), tipo: "suono fermato", cue: "Campanello", fase: "Accoglienza", format: "Orient", origine: "telefono·2222" }, // entro 2 s: errore
  { ora: ora(900), tipo: "fase cambiata", fase: "Atto 1", format: "Orient", origine: "telefono·2222" }, // 15 min
  { ora: ora(1000), tipo: "suono partito", cue: "Tensione", fase: "Atto 1", format: "Orient", origine: "mac·1111" },
  { ora: ora(1300), tipo: "suono fermato", cue: "Tensione", fase: "Atto 1", format: "Orient", origine: "mac·1111" }, // 300 s dopo: ok
  { ora: ora(1400), tipo: "stop tutto", format: "Orient", origine: "telefono·2222" },
  { ora: ora(2700), tipo: "fase cambiata", fase: "Finale", format: "Orient", origine: "mac·1111" }, // 30 min in Atto 1
  { ora: ora(3000), tipo: "suono fermato", cue: "Treno", fase: "Finale", format: "Orient", origine: "mac·1111" },
];

const CONFIG: Config = {
  versione: 1,
  impostazioni: { pin: "1234", volumeMaster: 0.8, fadeOutMs: 1500, livelloAbbassa: 0.2 },
  formats: [
    {
      id: "f1",
      nome: "Orient",
      ordine: 0,
      fasi: [
        { id: "s", nome: "Sempre", ordine: -1, sempre: true, cue: [] },
        { id: "a", nome: "Accoglienza", ordine: 0, durataPrevista: 12, cue: [c("Treno"), c("Campanello"), c("Fischio")] },
        { id: "b", nome: "Atto 1", ordine: 1, durataPrevista: 30, cue: [c("Tensione"), c("Sparo")] },
        { id: "c", nome: "Finale", ordine: 2, cue: [c("Chiusura"), { ...c("Luci"), tipo: "promemoria" }] },
      ],
    },
  ],
};
function c(titolo: string) {
  return { id: titolo, titolo, nota: "", tipo: "effetto" as const, file: `${titolo}.wav`, fileOriginale: null, durataSec: 3, volume: 1, loop: false, sulSottofondo: "niente" as const, colore: null, ordine: 0 };
}

describe("riepilogo di una serata", () => {
  const r = riepilogoSerata(SERATA, CONFIG);
  it("inizio = primo suono vero (non il soundcheck), fine = ultimo evento, durata", () => {
    expect(r.inizio).toBe(ora(0));
    expect(r.fine).toBe(ora(3000));
    expect(r.durataMin).toBe(50);
  });
  it("tabella per fase: previsti / reali / scarto", () => {
    expect(r.fasi).toEqual([
      { nome: "Accoglienza", previstiMin: 12, realiMin: 15, scartoMin: 3 },
      { nome: "Atto 1", previstiMin: 30, realiMin: 30, scartoMin: 0 },
      { nome: "Finale", previstiMin: null, realiMin: 5, scartoMin: null },
    ]);
  });
  it("STOP TUTTO, possibili errori (fermato entro 2 s), comandi telefono vs Mac", () => {
    expect(r.stopTutto).toBe(1);
    expect(r.possibiliErrori).toBe(1);
    expect(r.comandi).toEqual({ telefono: 4, mac: 6 }); // soundcheck escluso
  });
  it("una serata vuota non rompe niente", () => {
    expect(riepilogoSerata([], CONFIG)).toMatchObject({ inizio: null, fine: null, durataMin: 0, fasi: [], stopTutto: 0, chiusa: false, soundcheck: null });
  });
  it("con 'Chiudi serata' la fine è quella esplicita, e il soundcheck compare nel riepilogo", () => {
    const chiusa: EventoDiario[] = [
      ...SERATA.slice(0, 2),
      { ora: ora(-400), tipo: "soundcheck", format: "Orient", origine: "mac", dettagli: { formatId: "f1", fine: ora(-400), caselle: 5, problemi: 2, completo: true } },
      ...SERATA.slice(2),
      { ora: ora(3600), tipo: "fine_serata", origine: "mac" },
      { ora: ora(3700), tipo: "luce", origine: "avvio" }, // dopo la chiusura: non conta
    ];
    const r = riepilogoSerata(chiusa, CONFIG);
    expect(r.chiusa).toBe(true);
    expect(r.fine).toBe(ora(3600));
    expect(r.durataMin).toBe(60);
    expect(r.soundcheck).toEqual({ ora: ora(-400), problemi: 2, completo: true });
    expect(r.comandi).toEqual({ telefono: 4, mac: 6 }); // fine_serata e luce esclusi
  });
});

describe("suoni mai usati nelle ultime serate", () => {
  it("per ogni format usato, le caselle mai partite; promemoria esclusi; soundcheck escluso", () => {
    const altra: EventoDiario[] = [{ ora: ora(0), tipo: "suono partito", cue: "Sparo", fase: "Atto 1", format: "Orient", origine: "mac·1" }];
    const r = calcolaMaiUsati(CONFIG, [
      { data: "2026-09-24", eventi: SERATA },
      { data: "2026-09-20", eventi: altra },
    ]);
    expect(r.serate).toEqual(["2026-09-24", "2026-09-20"]);
    expect(r.formats).toEqual([{ nome: "Orient", caselle: ["Fischio", "Chiusura"] }]);
  });
  it("un format mai usato non compare (non si può dire nulla)", () => {
    expect(calcolaMaiUsati(CONFIG, []).formats).toEqual([]);
  });
});
