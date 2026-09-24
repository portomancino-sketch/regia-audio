import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import type { AddressInfo } from "node:net";
// @ts-expect-error modulo JavaScript senza tipi
import { avviaBridgeFinto } from "../../scripts/bridge-finto.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regia-luci-"));
process.env.REGIA_DIR = tempDir;
process.env.REGIA_DEMO = "0";
process.env.REGIA_HUE_MDNS = "0";
process.env.REGIA_BATTITO_MS = "600";

const { creaApp } = await import("../src/app");
const { Luci } = await import("../src/luci");
const { app, store, luci, avviaHub } = creaApp();

let porta = 0;
let bridge: Awaited<ReturnType<typeof avviaBridgeFinto>>;
const post = (url: string, payload?: unknown) => app.inject({ method: "POST", url, payload: payload as never });
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  bridge = await avviaBridgeFinto();
  await app.listen({ port: 0, host: "127.0.0.1" });
  porta = (app.server.address() as AddressInfo).port;
  avviaHub();
});
afterAll(async () => {
  luci.chiudi();
  await app.close();
  await bridge.chiudi();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("centralina: scoperta e abbinamento", () => {
  it("senza centralina: stato 'nessuna', Live non mostra nulla, esegui non fa niente e non sbaglia", async () => {
    expect((await app.inject({ method: "GET", url: "/api/luci/stato" })).json().stato).toBe("nessuna");
    const live = (await app.inject({ method: "GET", url: "/api/luci/live" })).json();
    expect(live.abbinata).toBe(false);
    const r = (await post("/api/luci/esegui", { effetto: "luce1" })).json();
    expect(r.ok).toBe(false);
    expect(bridge.comandi).toHaveLength(0);
  });
  it("cerca con IP a mano → trovata, da abbinare; abbina fallisce finché non si preme il pulsante", async () => {
    const c = (await post("/api/luci/cerca", { ip: bridge.ip })).json();
    expect(c.trovata).toBe(true);
    expect(c.stato).toBe("daAbbinare");
    let a = (await post("/api/luci/abbina")).json();
    expect(a.abbinata).toBe(false);
    expect(a.errore).toContain("Premi il pulsante");
    bridge.premiPulsante();
    a = (await post("/api/luci/abbina")).json();
    expect(a.abbinata).toBe(true);
    expect((await app.inject({ method: "GET", url: "/api/luci/stato" })).json().stato).toBe("abbinata");
    const salvato = JSON.parse(fs.readFileSync(path.join(tempDir, "luci.json"), "utf8"));
    expect(salvato.bridge.chiave).toBe("chiavefinta123");
    expect(salvato.bridge.id).toBe("FINTO000000001");
  });
});

describe("lampadine e gruppi", () => {
  it("elenco lampadine (nome, accesa, raggiungibile), nome proprio della Regia, lampeggia 3 volte", async () => {
    const l = (await app.inject({ method: "GET", url: "/api/luci/lampadine" })).json();
    expect(l).toHaveLength(5);
    expect(l.find((x: { id: string }) => x.id === "5")).toMatchObject({ raggiungibile: false, accesa: false });
    await app.inject({ method: "PATCH", url: "/api/luci/lampadine/1", payload: { nome: "Palco" } });
    const l2 = (await app.inject({ method: "GET", url: "/api/luci/lampadine" })).json();
    expect(l2.find((x: { id: string }) => x.id === "1")).toMatchObject({ nome: "Palco", nomeBridge: "Faretto palco" });
    expect(bridge.lights()["1"].name).toBe("Faretto palco"); // la centralina non è stata toccata
    bridge.azzeraComandi();
    await post("/api/luci/lampadine/2/lampeggia");
    await attendi(2100);
    const lampeggi = bridge.comandi.filter((c: { id: string; stato: { alert?: string } }) => c.id === "2" && c.stato.alert === "select");
    expect(lampeggi).toHaveLength(3);
  });
  it("gruppo grande → gemello sulla centralina; gruppo piccolo no; importa le stanze", async () => {
    const grande = (await post("/api/luci/gruppi", { nome: "Sala", luci: ["1", "3", "4"] })).json();
    expect(grande.gruppoBridge).toBeDefined();
    expect(bridge.groups()[grande.gruppoBridge].lights).toEqual(["1", "3", "4"]);
    const piccolo = (await post("/api/luci/gruppi", { nome: "Bar", luci: ["2"] })).json();
    expect(piccolo.gruppoBridge).toBeUndefined();
    // togliere luci a un gruppo grande lo rende piccolo: via il gemello
    const ridotto = (await app.inject({ method: "PATCH", url: `/api/luci/gruppi/${grande.id}`, payload: { luci: ["1", "3"] } })).json();
    expect(ridotto.gruppoBridge).toBeUndefined();
    await app.inject({ method: "PATCH", url: `/api/luci/gruppi/${grande.id}`, payload: { luci: ["1", "3", "4"] } });
    const importati = (await post("/api/luci/importa-stanze")).json();
    expect(importati.map((g: { nome: string }) => g.nome)).toEqual([]); // "Sala" e "Bar" esistono già: niente doppioni
  });
});

describe("effetti, catena e 'torna com'era'", () => {
  let idSala = "";
  let idBar = "";
  it("gli effetti si salvano; 'Buio' spegne la sala con UN comando al gruppo e abbassa il bar per lampadina", async () => {
    const stato = (await app.inject({ method: "GET", url: "/api/luci/stato" })).json();
    idSala = Object.values(stato.mappa.gruppi as Record<string, { id: string; nome: string }>).find((g) => g.nome === "Sala")!.id;
    idBar = Object.values(stato.mappa.gruppi as Record<string, { id: string; nome: string }>).find((g) => g.nome === "Bar")!.id;
    await app.inject({
      method: "PUT",
      url: "/api/luci/effetti",
      payload: {
        effetti: {
          luce1: { nome: "Buio", colore: "#222222", voci: { [idSala]: { acceso: false, luminosita: 0, colore: "bianco-caldo", transizione: 1 }, [idBar]: { acceso: true, luminosita: 10, colore: "blu", transizione: 1 } } },
          luce2: { nome: "Rosso", colore: "#d93b31", voci: { [idSala]: { acceso: true, luminosita: 80, colore: "rosso", transizione: 0.5 } } },
        },
      },
    });
    const live = (await app.inject({ method: "GET", url: "/api/luci/live" })).json();
    expect(live).toMatchObject({ abbinata: true, raggiungibile: true, nomi: { luce1: "Buio", luce2: "Rosso", luce3: "Caldo" } });
    bridge.azzeraComandi();
    const r = (await post("/api/luci/esegui", { effetto: "luce1", origine: "manuale" })).json();
    expect(r.ok).toBe(true);
    await luci.attendiCoda();
    expect(bridge.comandi).toHaveLength(2);
    expect(bridge.comandi[0]).toMatchObject({ tipo: "gruppo", stato: { on: false, transitiontime: 10 } });
    expect(bridge.comandi[1]).toMatchObject({ tipo: "luce", id: "2", stato: { on: true, bri: 26, hue: 46920 } });
    expect(fs.existsSync(path.join(tempDir, "luci-foto.json"))).toBe(true);
  });
  it("catena Rosso → Buio → torna = com'era all'inizio (rosso sul palco), non il buio", async () => {
    // Stato di partenza: la lampadina 1 (palco) è rossa, la 3 spenta, la 4 bianca calda.
    await post("/api/luci/esegui", { effetto: "torna" });
    await luci.attendiCoda();
    const prima = JSON.parse(JSON.stringify(bridge.lights()));
    expect(prima["1"].state).toMatchObject({ on: true, hue: 0, sat: 254, colormode: "hs" });
    await post("/api/luci/esegui", { effetto: "luce2" }); // Rosso: foto scattata qui
    await luci.attendiCoda();
    await post("/api/luci/esegui", { effetto: "luce1" }); // Buio: NON rifotografa
    await luci.attendiCoda();
    expect(bridge.lights()["1"].state.on).toBe(false);
    await post("/api/luci/esegui", { effetto: "torna" });
    await luci.attendiCoda();
    const dopo = bridge.lights();
    for (const id of ["1", "2", "3", "4"]) {
      expect(dopo[id].state.on).toBe(prima[id].state.on);
      if (prima[id].state.on) expect(dopo[id].state.bri).toBe(prima[id].state.bri);
    }
    expect(dopo["1"].state).toMatchObject({ hue: 0, sat: 254 });
    expect(fs.existsSync(path.join(tempDir, "luci-foto.json"))).toBe(false);
  });
  it("intensità 50 % dimezza la luminosità e riapplica subito l'effetto in corso; torna la ignora", async () => {
    await post("/api/luci/esegui", { effetto: "luce2" });
    await luci.attendiCoda();
    bridge.azzeraComandi();
    await app.inject({ method: "PUT", url: "/api/luci/intensita", payload: { valore: 50 } });
    await luci.attendiCoda();
    const riapplicato = bridge.comandi.find((c: { tipo: string }) => c.tipo === "gruppo");
    expect(riapplicato.stato.bri).toBe(Math.round((1 + 0.8 * 253) * 0.5)); // 80 % → 203 → 102
    expect(riapplicato.stato.hue).toBe(0);
    bridge.azzeraComandi();
    await post("/api/luci/torna");
    await luci.attendiCoda();
    const ripristino = bridge.comandi.find((c: { id: string }) => c.id === "1");
    expect(ripristino.stato.bri).toBe(200); // esatto come nella foto, non dimezzato
    await app.inject({ method: "PUT", url: "/api/luci/intensita", payload: { valore: 100 } });
  });
  it("una foto rimasta su disco viene ripristinata al riavvio (nuova istanza) e scritta nel diario", async () => {
    await post("/api/luci/esegui", { effetto: "luce1" });
    await luci.attendiCoda();
    expect(bridge.lights()["1"].state.on).toBe(false);
    // "Spegnimento del Mac": una nuova istanza legge luci.json e luci-foto.json.
    const nuova = new Luci({ mdns: false });
    const ok = await nuova.ripristinaFotoAllAvvio();
    await nuova.attendiCoda();
    nuova.chiudi();
    expect(ok).toBe(true);
    expect(bridge.lights()["1"].state).toMatchObject({ on: true, hue: 0, sat: 254 });
    expect(fs.existsSync(path.join(tempDir, "luci-foto.json"))).toBe(false);
    const oggi = (await (await fetch(`http://127.0.0.1:${porta}/api/diario`)).json())[0];
    const { eventi } = await (await fetch(`http://127.0.0.1:${porta}/api/diario/${oggi.data}`)).json();
    expect(eventi.some((e: { tipo: string; origine: string }) => e.tipo === "luce" && e.origine === "avvio")).toBe(true);
    luci.azzera();
    luci["dati"] = JSON.parse(fs.readFileSync(path.join(tempDir, "luci.json"), "utf8")); // (azzera ha svuotato: rimetto la copia salvata dalla nuova istanza)
  });
});

describe("caselle, fasi, STOP TUTTO", () => {
  it("casella con luce → comando alla partenza; luceFine → torna alla fine; fase con luce → comando all'ingresso; STOP TUTTO → torna", async () => {
    // Ricollega la centralina (il test precedente ha azzerato).
    await post("/api/luci/cerca", { ip: bridge.ip });
    bridge.premiPulsante();
    await post("/api/luci/abbina");
    const stato = (await app.inject({ method: "GET", url: "/api/luci/stato" })).json();
    const idSala = Object.values(stato.mappa.gruppi as Record<string, { id: string; nome: string }>).find((g) => g.nome === "Sala")?.id;
    if (!idSala) {
      const g = (await post("/api/luci/gruppi", { nome: "Sala", luci: ["1", "3", "4"] })).json();
      await app.inject({ method: "PUT", url: "/api/luci/effetti", payload: { effetti: { luce1: { voci: { [g.id]: { acceso: false, luminosita: 0, colore: "bianco-caldo", transizione: 0 } } }, luce2: { voci: { [g.id]: { acceso: true, luminosita: 100, colore: "rosso", transizione: 0 } } } } } });
    }
    const format = (await post("/api/formats", { nome: "Con luci" })).json();
    const fase = (await post(`/api/formats/${format.id}/fasi`, { nome: "Buio in sala" })).json();
    await app.inject({ method: "PATCH", url: `/api/fasi/${fase.id}`, payload: { luce: "luce1" } });
    const cue = (await post(`/api/fasi/${fase.id}/cue`, { titolo: "Sparo rosso" })).json();
    const c2 = (await app.inject({ method: "PATCH", url: `/api/cue/${cue.id}`, payload: { luce: "luce2", luceFine: true } })).json();
    expect(c2.luce).toBe("luce2");
    expect(c2.luceFine).toBe(true);
    const sempre = format.fasi.find((f: { sempre?: boolean }) => f.sempre);
    const s2 = (await app.inject({ method: "PATCH", url: `/api/fasi/${sempre.id}`, payload: { luce: "luce1" } })).json();
    expect(s2.luce).toBeUndefined(); // la riga Sempre non ha luci

    // Un motore finto: si presenta come regia e manda gli stati.
    const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws`);
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ ruolo: "regia", sessioneId: "motore-luci", apertaAlle: Date.now() }));
    await attendi(200);
    const stato0 = { tipo: "stato", formatId: format.id, faseId: null, master: 0.8, attivi: [], motoreOnline: true };
    ws.send(JSON.stringify(stato0));
    await attendi(200);
    bridge.azzeraComandi();
    ws.send(JSON.stringify({ ...stato0, faseId: fase.id })); // ingresso nella fase → Buio
    await attendi(400);
    await luci.attendiCoda();
    expect(bridge.comandi.some((c: { stato: { on: boolean } }) => c.stato.on === false)).toBe(true);
    bridge.azzeraComandi();
    const istanza = { istanzaId: "i1", cueId: cue.id, titolo: "Sparo rosso", tipo: "effetto", posizioneSec: 0, durataSec: 3, inPausa: false };
    ws.send(JSON.stringify({ ...stato0, faseId: fase.id, attivi: [istanza] })); // parte la casella → Rosso
    await attendi(400);
    await luci.attendiCoda();
    expect(bridge.comandi.some((c: { stato: { hue?: number } }) => c.stato.hue === 0)).toBe(true);
    bridge.azzeraComandi();
    ws.send(JSON.stringify({ ...stato0, faseId: fase.id, attivi: [] })); // finisce → torna com'era
    await attendi(400);
    await luci.attendiCoda();
    expect(bridge.comandi.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tempDir, "luci-foto.json"))).toBe(false);
    // STOP TUTTO dal telefono → torna (dopo un effetto)
    await post("/api/luci/esegui", { effetto: "luce1" });
    await luci.attendiCoda();
    bridge.azzeraComandi();
    const tel = new WebSocket(`ws://127.0.0.1:${porta}/ws`);
    await new Promise((r) => tel.on("open", r));
    tel.send(JSON.stringify({ ruolo: "telecomando", pin: store.config.impostazioni.pin }));
    await attendi(200);
    tel.send(JSON.stringify({ tipo: "comando", comando: "stopTutto" }));
    await attendi(400);
    await luci.attendiCoda();
    expect(bridge.comandi.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tempDir, "luci-foto.json"))).toBe(false);
    tel.close();
    ws.close();
    await app.inject({ method: "DELETE", url: `/api/formats/${format.id}` });
  });
  it("col lucchetto le Impostazioni luci sono bloccate (423) ma i comandi in Live no", async () => {
    await app.inject({ method: "PATCH", url: "/api/impostazioni", payload: { bloccoModifiche: true } });
    expect((await post("/api/luci/gruppi", { nome: "X" })).statusCode).toBe(423);
    expect((await post("/api/luci/esegui", { effetto: "luce2" })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: "/api/luci/intensita", payload: { valore: 80 } })).statusCode).toBe(200);
    expect((await post("/api/luci/torna")).statusCode).toBe(200);
    await app.inject({ method: "PATCH", url: "/api/impostazioni", payload: { bloccoModifiche: false } });
    await luci.attendiCoda();
  });
  it("centralina spenta: esegui risponde 'non raggiungibile', nessun errore, Live dice che non risponde", async () => {
    await bridge.chiudi();
    const r = (await post("/api/luci/esegui", { effetto: "luce1" })).json();
    expect(r.ok).toBe(false);
    expect(r.errore).toContain("non raggiungibile");
    const live = (await app.inject({ method: "GET", url: "/api/luci/live" })).json();
    expect(live).toMatchObject({ abbinata: true, raggiungibile: false });
    bridge = await avviaBridgeFinto(bridge.porta);
  });
});
