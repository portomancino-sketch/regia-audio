import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regia-simulate-"));
process.env.REGIA_DIR = tempDir;
process.env.REGIA_DEMO = "0";
process.env.REGIA_HUE_MDNS = "0";

const { creaApp } = await import("../src/app");
const { app, luci, avviaHub } = creaApp();
const get = async (url: string) => (await app.inject({ method: "GET", url })).json();
const post = (url: string, payload?: unknown) => app.inject({ method: "POST", url, payload: payload as never });

beforeAll(async () => {
  avviaHub();
  await app.listen({ port: 0, host: "127.0.0.1" });
  void (app.server.address() as AddressInfo).port;
});
afterAll(async () => {
  luci.chiudi();
  await app.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("luci simulate", () => {
  it("mai attive di default: stato 'nessuna', niente lampadine finte", async () => {
    expect((await get("/api/luci/simulate")).attive).toBe(false);
    expect((await get("/api/luci/stato")).simulate).toBe(false);
    expect((await get("/api/luci/stato")).stato).toBe("nessuna");
  });

  it("accese: centralina 'Luci simulate' abbinata, 6 lampadine in 'Sala' e 'Palco' coi gemelli, tre effetti pronti; Live le vede", async () => {
    const r = (await post("/api/luci/simulate", { attive: true })).json();
    expect(r.attive).toBe(true);
    expect(r.lampadine).toHaveLength(6);
    const st = await get("/api/luci/stato");
    expect(st.simulate).toBe(true);
    expect(st.stato).toBe("abbinata");
    expect(st.bridge.nome).toBe("Luci simulate");
    const gruppi = Object.values(st.mappa.gruppi) as { nome: string; luci: string[]; gruppoBridge?: string }[];
    expect(gruppi.map((g) => g.nome).sort()).toEqual(["Palco", "Sala"]);
    expect(gruppi.every((g) => g.luci.length === 3 && g.gruppoBridge)).toBe(true);
    expect(Object.keys(st.mappa.effetti.luce2.voci)).toHaveLength(2);
    const lampadine = await get("/api/luci/lampadine");
    expect(lampadine).toHaveLength(6);
    const live = await get("/api/luci/live");
    expect(live.abbinata).toBe(true);
    expect(live.raggiungibile).toBe(true);
    expect(live.nomi.luce2).toBe("Rosso");
  });

  it("un effetto cambia davvero le lampadine finte; 'torna' le rimette com'erano", async () => {
    const prima = (await get("/api/luci/simulate")).lampadine;
    expect(prima[0].stato.colormode).toBe("ct");
    expect((await post("/api/luci/esegui", { effetto: "luce2", origine: "prova" })).json().ok).toBe(true);
    await luci.attendiCoda();
    const rosse = (await get("/api/luci/simulate")).lampadine;
    expect(rosse.every((l: { stato: { hue: number; colormode: string } }) => l.stato.colormode === "hs" && l.stato.hue === 0)).toBe(true);
    expect((await post("/api/luci/torna")).json().ok).toBe(true);
    await luci.attendiCoda();
    const dopo = (await get("/api/luci/simulate")).lampadine;
    // Com'era: accesa, stessa luminosità, bianco (ct) — come farebbe una centralina vera.
    const essenziale = (s: { on: boolean; bri: number; colormode: string; ct: number }) => ({ on: s.on, bri: s.bri, colormode: s.colormode, ct: s.ct });
    expect(essenziale(dopo[0].stato)).toEqual(essenziale(prima[0].stato));
  });

  it("non scrivono in luci.json", () => {
    expect(fs.existsSync(path.join(tempDir, "luci.json"))).toBe(false);
  });

  it("'Torna alle luci vere': tutto sparisce, stato 'nessuna', Live non vede più nulla", async () => {
    const r = (await post("/api/luci/simulate", { attive: false })).json();
    expect(r.attive).toBe(false);
    expect(r.lampadine).toEqual([]);
    const st = await get("/api/luci/stato");
    expect(st.simulate).toBe(false);
    expect(st.stato).toBe("nessuna");
    expect(Object.keys(st.mappa.gruppi)).toHaveLength(0);
    expect((await get("/api/luci/live")).abbinata).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "luci.json"))).toBe(false);
  });

  it("versione e cartella dati; crossfade di default per i format nuovi", async () => {
    const v = await get("/api/versione");
    expect(v.versione).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.cartellaDati).toBe(tempDir);
    await app.inject({ method: "PATCH", url: "/api/impostazioni", payload: { crossfadeDefault: 3.5 } });
    const f = (await post("/api/formats", { nome: "Nuovo" })).json();
    expect(f.crossfade).toBe(3.5);
    await app.inject({ method: "PATCH", url: "/api/impostazioni", payload: { crossfadeDefault: 2 } });
    const f2 = (await post("/api/formats", { nome: "Nuovo 2" })).json();
    expect(f2.crossfade).toBeUndefined();
  });
});
