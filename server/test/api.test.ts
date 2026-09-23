import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import type { AddressInfo } from "node:net";

// Cartella dati usa una directory temporanea, senza demo (test veloci).
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "regia-test-"));
process.env.REGIA_DIR = tempDir;
process.env.REGIA_DEMO = "0";
process.env.REGIA_BATTITO_MS = "1000"; // battiti veloci nei test

const { creaApp } = await import("../src/app");
const { app, store, avviaHub } = creaApp();

let porta = 0;

beforeAll(async () => {
  avviaHub();
  await app.listen({ port: 0, host: "127.0.0.1" });
  porta = (app.server.address() as AddressInfo).port;
});

afterAll(async () => {
  await app.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// Un piccolo WAV valido (0,2 s di silenzio) per gli upload finti.
function wavFinto(): Buffer {
  const n = 8820;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24);
  b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

function multipart(nomeFile: string, contenuto: Buffer): { payload: Buffer; headers: Record<string, string> } {
  const confine = "----confineRegia";
  const testa = Buffer.from(
    `--${confine}\r\nContent-Disposition: form-data; name="file"; filename="${nomeFile}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const coda = Buffer.from(`\r\n--${confine}--\r\n`);
  return {
    payload: Buffer.concat([testa, contenuto, coda]),
    headers: { "content-type": `multipart/form-data; boundary=${confine}` },
  };
}

describe("configurazione", () => {
  it("GET /api/config restituisce la configurazione con PIN a 4 cifre", async () => {
    const r = await app.inject({ method: "GET", url: "/api/config" });
    expect(r.statusCode).toBe(200);
    const c = r.json();
    expect(c.versione).toBe(1);
    expect(c.impostazioni.pin).toMatch(/^\d{4}$/);
  });

  it("CRUD di format, fase e cue", async () => {
    // Crea format
    let r = await app.inject({ method: "POST", url: "/api/formats", payload: { nome: "Serata gialla" } });
    expect(r.statusCode).toBe(200);
    const format = r.json();
    expect(format.nome).toBe("Serata gialla");

    // Rinomina
    r = await app.inject({ method: "PATCH", url: `/api/formats/${format.id}`, payload: { nome: "Serata thriller" } });
    expect(r.json().nome).toBe("Serata thriller");

    // Crea fase
    r = await app.inject({ method: "POST", url: `/api/formats/${format.id}/fasi`, payload: { nome: "Apertura" } });
    const fase = r.json();
    expect(fase.nome).toBe("Apertura");

    // Crea cue
    r = await app.inject({
      method: "POST",
      url: `/api/fasi/${fase.id}/cue`,
      payload: { titolo: "Sigla", tipo: "brano" },
    });
    const cue = r.json();
    expect(cue.tipo).toBe("brano");
    expect(cue.sulSottofondo).toBe("pausa"); // default per i brani

    // Modifica cue
    r = await app.inject({ method: "PATCH", url: `/api/cue/${cue.id}`, payload: { volume: 0.5, nota: "forte" } });
    expect(r.json().volume).toBe(0.5);

    // Persistenza: la config riletta contiene tutto.
    r = await app.inject({ method: "GET", url: "/api/config" });
    const c = r.json();
    const f = c.formats.find((x: { id: string }) => x.id === format.id);
    expect(f.fasi[0].cue[0].nota).toBe("forte");

    // Elimina
    r = await app.inject({ method: "DELETE", url: `/api/cue/${cue.id}` });
    expect(r.json().fatto).toBe(true);
    r = await app.inject({ method: "DELETE", url: `/api/formats/${format.id}` });
    expect(r.json().fatto).toBe(true);
  });

  it("riordino dei format", async () => {
    const a = (await app.inject({ method: "POST", url: "/api/formats", payload: { nome: "A" } })).json();
    const b = (await app.inject({ method: "POST", url: "/api/formats", payload: { nome: "B" } })).json();
    const r = await app.inject({ method: "POST", url: "/api/formats/riordina", payload: { ordine: [b.id, a.id] } });
    const ids = r.json();
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    await app.inject({ method: "DELETE", url: `/api/formats/${a.id}` });
    await app.inject({ method: "DELETE", url: `/api/formats/${b.id}` });
  });
});

describe("upload audio", () => {
  it("carica un wav e legge la durata; il file finisce nella cartella audio", async () => {
    const format = (await app.inject({ method: "POST", url: "/api/formats", payload: {} })).json();
    const fase = (await app.inject({ method: "POST", url: `/api/formats/${format.id}/fasi`, payload: {} })).json();
    const cue = (await app.inject({ method: "POST", url: `/api/fasi/${fase.id}/cue`, payload: {} })).json();

    const { payload, headers } = multipart("sparo di prova.wav", wavFinto());
    const r = await app.inject({ method: "POST", url: `/api/cue/${cue.id}/audio`, payload, headers });
    expect(r.statusCode).toBe(200);
    const aggiornato = r.json();
    expect(aggiornato.file).toBe(`${cue.id}.wav`);
    expect(aggiornato.fileOriginale).toBe("sparo di prova.wav");
    expect(aggiornato.durataSec).toBeCloseTo(0.2, 1);
    expect(fs.existsSync(path.join(tempDir, "audio", aggiornato.file))).toBe(true);

    // Il file si scarica anche a pezzi (Range).
    const range = await app.inject({
      method: "GET",
      url: `/audio/${aggiornato.file}`,
      headers: { range: "bytes=0-99" },
    });
    expect(range.statusCode).toBe(206);
    expect(range.rawPayload.length).toBe(100);

    // Eliminare il cue elimina il file.
    await app.inject({ method: "DELETE", url: `/api/cue/${cue.id}` });
    expect(fs.existsSync(path.join(tempDir, "audio", aggiornato.file))).toBe(false);
    await app.inject({ method: "DELETE", url: `/api/formats/${format.id}` });
  });

  it("rifiuta un formato sconosciuto con un messaggio chiaro", async () => {
    const format = (await app.inject({ method: "POST", url: "/api/formats", payload: {} })).json();
    const fase = (await app.inject({ method: "POST", url: `/api/formats/${format.id}/fasi`, payload: {} })).json();
    const cue = (await app.inject({ method: "POST", url: `/api/fasi/${fase.id}/cue`, payload: {} })).json();

    const { payload, headers } = multipart("documento.pdf", Buffer.from("finto pdf"));
    const r = await app.inject({ method: "POST", url: `/api/cue/${cue.id}/audio`, payload, headers });
    expect(r.statusCode).toBe(400);
    expect(r.json().errore).toBe("Formato non supportato, usa mp3 o wav");
    await app.inject({ method: "DELETE", url: `/api/formats/${format.id}` });
  });

  it("audio-multipli crea un cue per file, tipo effetto", async () => {
    const format = (await app.inject({ method: "POST", url: "/api/formats", payload: {} })).json();
    const fase = (await app.inject({ method: "POST", url: `/api/formats/${format.id}/fasi`, payload: {} })).json();

    const confine = "----confineRegia";
    const parte = (nome: string) =>
      Buffer.concat([
        Buffer.from(
          `--${confine}\r\nContent-Disposition: form-data; name="file"; filename="${nome}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        wavFinto(),
        Buffer.from("\r\n"),
      ]);
    const payload = Buffer.concat([parte("tuono.wav"), parte("pioggia.wav"), Buffer.from(`--${confine}--\r\n`)]);
    const r = await app.inject({
      method: "POST",
      url: `/api/fasi/${fase.id}/audio-multipli`,
      payload,
      headers: { "content-type": `multipart/form-data; boundary=${confine}` },
    });
    expect(r.statusCode).toBe(200);
    const esito = r.json();
    expect(esito.creati).toHaveLength(2);
    expect(esito.creati[0].titolo).toBe("tuono");
    expect(esito.creati[0].tipo).toBe("effetto");
    await app.inject({ method: "DELETE", url: `/api/formats/${format.id}` });
  });
});

describe("duplicazione", () => {
  it("duplicare un format copia anche i file audio", async () => {
    const format = (await app.inject({ method: "POST", url: "/api/formats", payload: { nome: "Orig" } })).json();
    const fase = (await app.inject({ method: "POST", url: `/api/formats/${format.id}/fasi`, payload: {} })).json();
    const cue = (await app.inject({ method: "POST", url: `/api/fasi/${fase.id}/cue`, payload: {} })).json();
    const { payload, headers } = multipart("suono.wav", wavFinto());
    await app.inject({ method: "POST", url: `/api/cue/${cue.id}/audio`, payload, headers });

    const r = await app.inject({ method: "POST", url: `/api/formats/${format.id}/duplica` });
    const copia = r.json();
    expect(copia.nome).toBe("Orig (copia)");
    const cueCopiato = copia.fasi[0].cue[0];
    expect(cueCopiato.id).not.toBe(cue.id);
    expect(cueCopiato.file).not.toBe(`${cue.id}.wav`);
    expect(fs.existsSync(path.join(tempDir, "audio", cueCopiato.file))).toBe(true);

    await app.inject({ method: "DELETE", url: `/api/formats/${format.id}` });
    await app.inject({ method: "DELETE", url: `/api/formats/${copia.id}` });
  });
});

describe("websocket", () => {
  interface Conn {
    ws: WebSocket;
    messaggi: unknown[];
    chiusura: Promise<{ code: number; reason: string }>;
    battito?: NodeJS.Timeout;
    chiudi: () => void;
  }

  function connetti(presentazione: object, conBattito = false): Promise<Conn> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws`);
      const messaggi: unknown[] = [];
      const chiusura = new Promise<{ code: number; reason: string }>((res) => {
        ws.on("close", (code, reason) => res({ code, reason: String(reason) }));
      });
      ws.on("message", (d) => messaggi.push(JSON.parse(String(d))));
      ws.on("open", () => {
        ws.send(JSON.stringify(presentazione));
        const conn: Conn = {
          ws,
          messaggi,
          chiusura,
          chiudi: () => {
            if (conn.battito) clearInterval(conn.battito);
            ws.close();
          },
        };
        if (conBattito) {
          conn.battito = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: "battito" }));
          }, 250);
        }
        setTimeout(() => resolve(conn), 200);
      });
      ws.on("error", reject);
    });
  }

  const tipi = (c: Conn) => c.messaggi.map((m) => (m as { tipo: string }).tipo);
  const ultimoRuolo = (c: Conn) =>
    (c.messaggi.filter((m) => (m as { tipo: string }).tipo === "ruoloAssegnato").at(-1) as
      | { motore: boolean }
      | undefined)?.motore;

  it("telecomando con PIN errato viene chiuso con motivo 'PIN errato'", async () => {
    const { chiusura } = await connetti({ ruolo: "telecomando", pin: "0000x" });
    const esito = await chiusura;
    expect(esito.code).toBe(4001);
    expect(esito.reason).toBe("PIN errato");
  });

  it("la regia diventa motore e lo stato viene reinviato alle connessioni", async () => {
    const regia = await connetti({ ruolo: "regia", sessioneId: "a" }, true);
    expect(ultimoRuolo(regia)).toBe(true);

    regia.ws.send(
      JSON.stringify({ tipo: "stato", formatId: "f1", faseId: "x1", master: 0.7, attivi: [], motoreOnline: true }),
    );
    await new Promise((r) => setTimeout(r, 200));

    const pin = store.config.impostazioni.pin;
    const tel = await connetti({ ruolo: "telecomando", pin });
    const stato = tel.messaggi.find((m) => (m as { tipo: string }).tipo === "stato") as {
      faseId: string;
      motoreOnline: boolean;
    };
    expect(stato.faseId).toBe("x1");
    expect(stato.motoreOnline).toBe(true);

    // Un comando dal telecomando arriva al motore.
    const prima = regia.messaggi.length;
    tel.ws.send(JSON.stringify({ tipo: "comando", comando: "play", cueId: "c9" }));
    await new Promise((r) => setTimeout(r, 200));
    expect(regia.messaggi.slice(prima).filter((m) => (m as { tipo: string }).tipo === "comando")).toHaveLength(1);

    // Il motore si scollega: il telecomando viene avvisato.
    regia.chiudi();
    await new Promise((r) => setTimeout(r, 300));
    const ultimo = tel.messaggi.filter((m) => (m as { tipo: string }).tipo === "stato").at(-1) as {
      motoreOnline: boolean;
    };
    expect(ultimo.motoreOnline).toBe(false);
    tel.chiudi();
  });

  it("l'ultima finestra Regia scalza la precedente; i comandi vanno solo a lei", async () => {
    const prima = await connetti({ ruolo: "regia", sessioneId: "p1" }, true);
    const seconda = await connetti({ ruolo: "regia", sessioneId: "p2" }, true);
    await new Promise((r) => setTimeout(r, 100));

    expect(ultimoRuolo(seconda)).toBe(true);
    expect(tipi(prima)).toContain("motore_sostituito");

    // I comandi arrivano SOLO alla seconda (il motore corrente).
    const pin = store.config.impostazioni.pin;
    const tel = await connetti({ ruolo: "telecomando", pin });
    const nPrima = prima.messaggi.length;
    const nSeconda = seconda.messaggi.length;
    tel.ws.send(JSON.stringify({ tipo: "comando", comando: "stopTutto" }));
    await new Promise((r) => setTimeout(r, 200));
    expect(prima.messaggi.slice(nPrima).filter((m) => (m as { tipo: string }).tipo === "comando")).toHaveLength(0);
    expect(seconda.messaggi.slice(nSeconda).filter((m) => (m as { tipo: string }).tipo === "comando")).toHaveLength(1);

    // "Prendi il controllo": la prima riprende il comando, la seconda è avvisata.
    prima.ws.send(JSON.stringify({ tipo: "prendi_comando" }));
    await new Promise((r) => setTimeout(r, 200));
    expect(ultimoRuolo(prima)).toBe(true);
    expect(tipi(seconda)).toContain("motore_sostituito");

    prima.chiudi();
    seconda.chiudi();
    tel.chiudi();
    await new Promise((r) => setTimeout(r, 200));
  });

  it("senza battito il motore va offline e un'altra Regia viene promossa", async () => {
    // Il motore NON manda battiti (finestra congelata simulata)...
    const congelata = await connetti({ ruolo: "regia", sessioneId: "z1" });
    // ...ma la promozione deve scegliere l'altra finestra sana? No: l'ultima
    // presentata è il motore. Qui la congelata è l'unica: prima verifichiamo
    // il passaggio a offline.
    const pin = store.config.impostazioni.pin;
    const tel = await connetti({ ruolo: "telecomando", pin });
    const offline = await new Promise<boolean>((res) => {
      const inizio = Date.now();
      const t = setInterval(() => {
        const ultimo = tel.messaggi.filter((m) => (m as { tipo: string }).tipo === "stato").at(-1) as
          | { motoreOnline: boolean }
          | undefined;
        if (ultimo && !ultimo.motoreOnline) {
          clearInterval(t);
          res(true);
        } else if (Date.now() - inizio > 4000) {
          clearInterval(t);
          res(false);
        }
      }, 100);
    });
    expect(offline).toBe(true); // entro il timeout del battito (1 s nei test)
    expect(tipi(congelata)).toContain("motore_sostituito");

    // Ora una finestra sana si collega e diventa motore...
    const sana = await connetti({ ruolo: "regia", sessioneId: "z2" }, true);
    expect(ultimoRuolo(sana)).toBe(true);
    // ...poi si congela anche lei (stop battiti): la prima viene promossa.
    if (sana.battito) clearInterval(sana.battito);
    const promossa = await new Promise<boolean>((res) => {
      const inizio = Date.now();
      const t = setInterval(() => {
        if (ultimoRuolo(congelata) === true && tipi(congelata).filter((x) => x === "ruoloAssegnato").length >= 2) {
          clearInterval(t);
          res(true);
        } else if (Date.now() - inizio > 4000) {
          clearInterval(t);
          res(false);
        }
      }, 100);
    });
    expect(promossa).toBe(true);

    congelata.chiudi();
    sana.chiudi();
    tel.chiudi();
    await new Promise((r) => setTimeout(r, 200));
  });

  it("'rilascio' passa subito il comando a un'altra finestra", async () => {
    const a = await connetti({ ruolo: "regia", sessioneId: "r1" }, true);
    const b = await connetti({ ruolo: "regia", sessioneId: "r2" }, true);
    // b è il motore (ultima). b rilascia → a viene promossa.
    b.ws.send(JSON.stringify({ tipo: "rilascio" }));
    await new Promise((r) => setTimeout(r, 200));
    expect(ultimoRuolo(a)).toBe(true);
    a.chiudi();
    b.chiudi();
    await new Promise((r) => setTimeout(r, 200));
  });
});

describe("export e import", () => {
  it("l'export contiene regia.json, l'import lo ripristina", async () => {
    const format = (await app.inject({ method: "POST", url: "/api/formats", payload: { nome: "Da esportare" } })).json();
    const r = await app.inject({ method: "GET", url: "/api/export.zip" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/zip");
    const zipBuf = r.rawPayload;
    expect(zipBuf.length).toBeGreaterThan(100);

    // Cancella il format, poi importa lo zip: il format torna.
    await app.inject({ method: "DELETE", url: `/api/formats/${format.id}` });
    const dopo = (await app.inject({ method: "GET", url: "/api/config" })).json();
    expect(dopo.formats.find((f: { id: string }) => f.id === format.id)).toBeUndefined();

    const { payload, headers } = multipart("regia-export.zip", zipBuf);
    const imp = await app.inject({ method: "POST", url: "/api/import", payload, headers });
    expect(imp.statusCode).toBe(200);
    const ripristinata = (await app.inject({ method: "GET", url: "/api/config" })).json();
    expect(ripristinata.formats.find((f: { id: string }) => f.id === format.id)).toBeDefined();

    await app.inject({ method: "DELETE", url: `/api/formats/${format.id}` });
  });
});

describe("rete", () => {
  it("GET /api/rete dà ip, url del telecomando e PIN", async () => {
    const r = await app.inject({ method: "GET", url: "/api/rete" });
    const rete = r.json();
    expect(rete.urlTelecomando).toContain(":4000/telecomando");
    expect(rete.pin).toBe(store.config.impostazioni.pin);
  });
});
