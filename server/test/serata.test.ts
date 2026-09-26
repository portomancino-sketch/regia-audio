import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import type { AddressInfo } from "node:net";

// Un server tutto suo, con cartella dati temporanea e senza demo.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regia-serata-"));
process.env.REGIA_DIR = tempDir;
process.env.REGIA_DEMO = "0";
process.env.REGIA_HUE_MDNS = "0";

const { creaApp } = await import("../src/app");
const { app, store, avviaHub } = creaApp();
let porta = 0;

beforeAll(async () => {
  avviaHub();
  await app.listen({ port: 0, host: "127.0.0.1" });
  porta = (app.server.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const ws of aperti) ws.close();
  await app.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const get = async (url: string) => (await app.inject({ method: "GET", url })).json();
const post = (url: string, payload?: unknown) => app.inject({ method: "POST", url, payload: payload as never });

/** Un telecomando collegato al WebSocket che raccoglie i messaggi (per "serataCambiata").
 *  Pronto solo dopo il primo "stato": da lì in poi il server lo conosce. */
const aperti: WebSocket[] = [];
async function telecomando(): Promise<{ messaggi: string[]; chiudi: () => void }> {
  const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws`);
  aperti.push(ws);
  const messaggi: string[] = [];
  ws.on("message", (d) => messaggi.push((JSON.parse(String(d)) as { tipo: string }).tipo));
  await new Promise<void>((ok) => {
    ws.on("open", () => ws.send(JSON.stringify({ ruolo: "telecomando", pin: store.config.impostazioni.pin })));
    ws.on("message", () => ok());
  });
  return { messaggi, chiudi: () => ws.close() };
}
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("la serata di oggi", () => {
  let formatId = "";
  let cueId = "";

  it("una serata nuova: numero 0, nessun soundcheck, avviso non mostrato", async () => {
    const f = (await post("/api/formats", { nome: "Giallo" })).json();
    formatId = f.id;
    const fase = (await post(`/api/formats/${formatId}/fasi`, { nome: "Atto 1" })).json();
    cueId = (await post(`/api/fasi/${fase.id}/cue`, { titolo: "Sparo" })).json().id;
    const s = await get("/api/serata");
    expect(s.indice).toBe(0);
    expect(s.id).toMatch(/^\d{4}-\d{2}-\d{2}#0$/);
    expect(s.soundcheck).toEqual({});
    expect(s.avvisoMostrato).toBe(false);
    expect(s.eventi).toEqual([]);
  });

  it("il soundcheck del Mac finisce nel diario con l'esito (un evento solo) e nello stato", async () => {
    const tel = await telecomando();
    const r = await post("/api/serata/soundcheck", {
      formatId,
      inizio: new Date().toISOString(),
      caselle: 4,
      problemi: 1,
      mancanti: [{ cueId, titolo: "Sparo", fase: "Atto 1", esito: "mancante" }],
      completo: true,
    });
    expect(r.statusCode).toBe(200);
    const s = await get("/api/serata");
    expect(s.soundcheck[formatId]).toMatchObject({ caselle: 4, problemi: 1, completo: true, mancanti: { [cueId]: "mancante" } });
    const oggi = (await get("/api/diario"))[0];
    const { eventi } = await get(`/api/diario/${oggi.data}`);
    const sc = eventi.filter((e: { tipo: string }) => e.tipo === "soundcheck");
    expect(sc).toHaveLength(1);
    expect(sc[0].format).toBe("Giallo");
    expect(sc[0].dettagli.formatId).toBe(formatId);
    await attendi(150);
    expect(tel.messaggi).toContain("serataCambiata");
    tel.chiudi();
  });

  it("un soundcheck interrotto (ESC) va nel diario ma non conta come fatto", async () => {
    const f2 = (await post("/api/formats", { nome: "Rosa" })).json();
    await post("/api/serata/soundcheck", { formatId: f2.id, caselle: 2, problemi: 0, mancanti: [], completo: false });
    const s = await get("/api/serata");
    expect(s.soundcheck[f2.id]).toBeUndefined();
    expect(s.soundcheck[formatId]).toBeDefined();
    await app.inject({ method: "DELETE", url: `/api/formats/${f2.id}` });
  });

  it("un format inesistente è rifiutato", async () => {
    expect((await post("/api/serata/soundcheck", { formatId: "no", caselle: 1 })).statusCode).toBe(404);
  });

  it("l'avviso 'Non hai ancora provato' resta segnato per tutta la serata", async () => {
    const r = await post("/api/serata/avviso", { formatId, scelta: "avanti" });
    expect(r.json().avvisoMostrato).toBe(true);
    expect((await get("/api/serata")).avvisoMostrato).toBe(true);
  });

  it("'Chiudi serata' passa anche col lucchetto: lo spegne, scrive fine_serata, apre una serata nuova, avvisa i telefoni", async () => {
    await app.inject({ method: "PATCH", url: "/api/impostazioni", payload: { bloccoModifiche: true } });
    // Col lucchetto le scritture normali sono bloccate...
    expect((await post("/api/formats", { nome: "X" })).statusCode).toBe(423);
    const tel = await telecomando();
    const r = await post("/api/serata/chiudi");
    expect(r.statusCode).toBe(200);
    const chiusa = r.json();
    expect(chiusa.serata).toBe(0);
    expect(chiusa.riepilogo.chiusa).toBe(true);
    expect(chiusa.riepilogo.soundcheck).toMatchObject({ problemi: 1, completo: true });
    expect(chiusa.eventi.at(-1).tipo).toBe("fine_serata");
    // ...il lucchetto è spento, con il suo evento.
    expect(store.config.impostazioni.bloccoModifiche).toBe(false);
    expect(chiusa.eventi.some((e: { tipo: string }) => e.tipo === "blocco_off")).toBe(true);
    // La serata di oggi è la numero 1, pulita.
    const s = await get("/api/serata");
    expect(s.indice).toBe(1);
    expect(s.soundcheck).toEqual({});
    expect(s.avvisoMostrato).toBe(false);
    expect(s.eventi).toEqual([]);
    await attendi(150);
    expect(tel.messaggi).toContain("serataCambiata");
    tel.chiudi();
  });

  it("due serate chiuse lo stesso giorno: due righe nel Diario, eventi e CSV separati", async () => {
    await post("/api/serata/avviso", { formatId, scelta: "prova" });
    const r = await post("/api/serata/chiudi");
    expect(r.json().serata).toBe(1);
    const righe = await get("/api/diario");
    expect(righe.length).toBe(2);
    expect(righe.map((x: { serata: number }) => x.serata)).toEqual([1, 0]);
    expect(righe[0].data).toBe(righe[1].data);
    expect(righe.every((x: { chiusa: boolean }) => x.chiusa)).toBe(true);
    expect(righe[1].soundcheck).toMatchObject({ problemi: 1, completo: true });
    expect(righe[0].soundcheck).toBeNull();
    const data = righe[0].data;
    const prima = await get(`/api/diario/${data}?serata=0`);
    const seconda = await get(`/api/diario/${data}?serata=1`);
    expect(prima.eventi.some((e: { tipo: string }) => e.tipo === "soundcheck")).toBe(true);
    expect(seconda.eventi.some((e: { tipo: string }) => e.tipo === "soundcheck")).toBe(false);
    expect(seconda.riepilogo.chiusa).toBe(true);
    const tutto = await get(`/api/diario/${data}`);
    expect(tutto.eventi.length).toBe(prima.eventi.length + seconda.eventi.length);
    const csv = (await app.inject({ method: "GET", url: `/api/diario/${data}/csv?serata=0` })).body;
    expect(csv).toContain("chiusa,si");
    expect(csv).toContain("fatto alle");
    expect(csv).toContain("fine_serata");
    const csv2 = (await app.inject({ method: "GET", url: `/api/diario/${data}/csv?serata=1` })).body;
    expect(csv2).toContain("non fatto");
    // La serata numero 2 (aperta ora) non esiste ancora: niente eventi.
    expect((await get(`/api/diario/${data}?serata=2`)).eventi).toEqual([]);
  });

  it("statistiche: quante delle ultime serate senza soundcheck", async () => {
    const st = await get("/api/statistiche/mai-usati");
    expect(st.serate.length).toBe(2);
    expect(st.senzaSoundcheck).toBe(1);
  });
});
