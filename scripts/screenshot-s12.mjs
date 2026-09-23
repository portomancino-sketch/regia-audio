// Screenshot S12: Live con orologio di scaletta in ritardo; Diario con riepilogo
// e suoni mai usati; Modifica con badge "mai usato"; Home con Archiviati.
// Chrome headless + server di prova → docs/screenshots/s12/
// Uso: node scripts/screenshot-s12.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4989;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9343;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s12";
fs.mkdirSync(CARTELLA, { recursive: true });

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
let problemi = 0;

class Pagina {
  constructor(wsUrl, id) {
    this.id = id;
    this.ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
    this.n = 0;
    this.attese = new Map();
    this.pronta = new Promise((res) => this.ws.on("open", res));
    this.ws.on("message", (d) => {
      const m = JSON.parse(String(d));
      if (m.id && this.attese.has(m.id)) {
        this.attese.get(m.id)(m);
        this.attese.delete(m.id);
      }
    });
  }
  cmd(method, params = {}) {
    const id = ++this.n;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res) => this.attese.set(id, res));
  }
  async js(expression) {
    const r = await this.cmd("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error("JS: " + (r.result.exceptionDetails.exception?.description ?? "errore"));
    return r.result?.result?.value;
  }
  async finoA(expression, ms = 8000) {
    const inizio = Date.now();
    while (Date.now() - inizio < ms) {
      try {
        if (await this.js(expression)) return true;
      } catch {
        /* la pagina può stare navigando */
      }
      await attendi(200);
    }
    return false;
  }
  click(testo) {
    const t = testo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const b = [...document.querySelectorAll('button, [role=button]')].find(b => b.textContent.trim().includes('${t}')); if (b) { b.click(); return true; } return false; })()`,
    );
  }
  clickCue(titolo) {
    const t = titolo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const card = [...document.querySelectorAll('[role=button]')].find(el => [...el.querySelectorAll('div')].some(d => d.textContent.trim() === '${t}')); if (card) { card.click(); return true; } return false; })()`,
    );
  }
  /** Tocca la pillola Sempre col titolo esatto (è un <button>). */
  clickPillola(titolo) {
    const t = titolo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const b = [...document.querySelectorAll('[aria-label="Sempre"] button')].find(b => b.title === '${t}'); if (b) { b.click(); return true; } return false; })()`,
    );
  }
  async tema(nome) {
    await this.js(`localStorage.setItem(location.pathname.startsWith('/telecomando') ? 'tema-telecomando' : 'tema-regia', '${nome}')`);
    await this.cmd("Page.enable");
    await this.cmd("Page.reload");
    await attendi(1500);
  }
  async scatta(nome) {
    const r = await this.cmd("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${CARTELLA}/${nome}.png`, Buffer.from(r.result.data, "base64"));
    console.log(`  📸 ${nome}.png`);
  }
}

/** Un WAV di silenzio della durata voluta. */
function wavLungo(secondi) {
  const n = Math.round(44100 * secondi);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

async function nuovaScheda(url, mobile = false) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const info = await r.json();
  const p = new Pagina(info.webSocketDebuggerUrl, info.id);
  await p.pronta;
  await p.cmd("Runtime.enable");
  await p.cmd("Page.enable");
  await p.cmd(
    "Emulation.setDeviceMetricsOverride",
    mobile
      ? { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }
      : { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
  );
  return p;
}

async function chiudiScheda(p) {
  p.ws.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${p.id}`).catch(() => undefined);
}

/** L'ultima card della fase è tutta sopra il dock (dopo lo scroll in fondo)? */
const CONTROLLO_DOCK = `(async () => {
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise(r => setTimeout(r, 80)); // (niente rAF: non scatta nelle schede in secondo piano)
  const carte = [...document.querySelectorAll('.grid > [role=button]')];
  const ultima = carte.at(-1)?.getBoundingClientRect();
  const dock = document.querySelector('.fixed.bottom-0')?.getBoundingClientRect();
  if (!ultima || !dock) return { ok: false, motivo: 'card o dock non trovati' };
  return { ok: ultima.bottom <= dock.top, ultimaBottom: Math.round(ultima.bottom), dockTop: Math.round(dock.top), pillole: document.querySelectorAll('[aria-label="Sempre"] button').length };
})()`;

// ---- Server di prova (dati temporanei con la demo) ----
console.log("Avvio server di prova...");
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot12-"));
const server = spawn("npx", ["tsx", "server/src/index.ts"], {
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORTA_TEST), REGIA_DIR: dati },
});
process.on("exit", () => {
  server.kill();
  try {
    fs.rmSync(dati, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* il server stava ancora scrivendo: la cartella temporanea resta, non importa */
  }
});
for (let i = 0; i < 60; i++) {
  try {
    await fetch(`${BASE}/api/rete`);
    break;
  } catch {
    await attendi(300);
  }
}

fs.rmSync("/tmp/regia-shot12-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot12-chrome",
    "--no-first-run",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);
process.on("exit", () => chrome.kill());
for (let i = 0; i < 50; i++) {
  try {
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    break;
  } catch {
    await attendi(200);
  }
}

const cfg = await (await fetch(`${BASE}/api/config`)).json();
const demo = cfg.formats[0];
const faseSempre = demo.fasi.find((f) => f.sempre);
const rete = await (await fetch(`${BASE}/api/rete`)).json();

async function caricaSempre(nomi) {
  const fd = new FormData();
  for (const n of nomi) fd.append("file", new Blob([wavLungo(30)]), `${n}.wav`);
  const r = await fetch(`${BASE}/api/fasi/${faseSempre.id}/audio-multipli`, { method: "POST", body: fd });
  if (!r.ok) throw new Error("upload Sempre fallito");
}


// ---- Diario finto: ieri una serata (per "mai usati"), oggi una serata iniziata 23 min fa
//      in Accoglienza (prevista 15 min) da 26 min, passata ad "Atto 1 – Omicidio" 3 min fa:
//      entrata dopo 23 min contro i 15 previsti → +8 min, rosso.
const fasiN = demo.fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine);
await fetch(`${BASE}/api/fasi/${fasiN[0].id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ durataPrevista: 15 }) });
await fetch(`${BASE}/api/fasi/${fasiN[1].id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ durataPrevista: 30 }) });
const giorno = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const adesso = Date.now();
const iso = (msFa) => new Date(adesso - msFa).toISOString();
const riga = (o) => JSON.stringify(o) + "\n";
fs.mkdirSync(path.join(dati, "diario"), { recursive: true });
const ieri = new Date(adesso - 86400000);
fs.writeFileSync(
  path.join(dati, "diario", `${giorno(ieri)}.jsonl`),
  riga({ ora: new Date(ieri.getTime()).toISOString(), tipo: "format aperto", format: demo.nome, origine: "mac·aaaa" }) +
    riga({ ora: new Date(ieri.getTime() + 60000).toISOString(), tipo: "suono partito", cue: "Treno in corsa", fase: "Accoglienza", format: demo.nome, origine: "mac·aaaa" }) +
    riga({ ora: new Date(ieri.getTime() + 120000).toISOString(), tipo: "suono partito", cue: "Tensione", fase: "Atto 1 – Omicidio", format: demo.nome, origine: "telefono·bbbb" }) +
    riga({ ora: new Date(ieri.getTime() + 121000).toISOString(), tipo: "suono fermato", cue: "Tensione", fase: "Atto 1 – Omicidio", format: demo.nome, origine: "telefono·bbbb" }) +
    riga({ ora: new Date(ieri.getTime() + 900000).toISOString(), tipo: "fase cambiata", fase: "Atto 1 – Omicidio", format: demo.nome, origine: "mac·aaaa" }) +
    riga({ ora: new Date(ieri.getTime() + 3000000).toISOString(), tipo: "stop tutto", format: demo.nome, origine: "telefono·bbbb" }),
);
fs.writeFileSync(
  path.join(dati, "diario", `${giorno(new Date(adesso))}.jsonl`),
  riga({ ora: iso(28 * 60000), tipo: "format aperto", format: demo.nome, origine: "mac·aaaa" }) +
    riga({ ora: iso(26 * 60000), tipo: "suono partito", cue: "Treno in corsa", fase: "Accoglienza", format: demo.nome, origine: "mac·aaaa" }) +
    riga({ ora: iso(3 * 60000), tipo: "fase cambiata", fase: fasiN[1].nome, format: demo.nome, origine: "telefono·bbbb" }),
);

// ---- Mac: Live con l'orologio ----
const mac = await nuovaScheda(`${BASE}/`);
await attendi(1500);
await mac.js(`(() => { const c = [...document.querySelectorAll('div.vetro.tocco')].find(d => d.textContent.includes('Orient Express')); c?.click(); })()`);
await attendi(1000);
await mac.click("Live");
await attendi(600);
await mac.click("Ok, pronti");
await mac.click(fasiN[1].nome);
await attendi(1500);
// Il click ha scritto un "fase cambiata" adesso: si rimette il diario finto (fase entrata 3 min fa)
// e si aspetta la rilettura (ogni 20 s).
fs.writeFileSync(
  path.join(dati, "diario", `${giorno(new Date(adesso))}.jsonl`),
  riga({ ora: iso(28 * 60000), tipo: "format aperto", format: demo.nome, origine: "mac·aaaa" }) +
    riga({ ora: iso(26 * 60000), tipo: "suono partito", cue: "Treno in corsa", fase: "Accoglienza", format: demo.nome, origine: "mac·aaaa" }) +
    riga({ ora: iso(3 * 60000), tipo: "fase cambiata", fase: fasiN[1].nome, format: demo.nome, origine: "telefono·bbbb" }),
);
await attendi(21000);
const orologio = await mac.js(`document.querySelector('[data-orologio]')?.innerText.split(String.fromCharCode(10)).join(' ') ?? null`);
console.log(orologio && /Fase 3:[0-5]\d \/ 30:00/.test(orologio) && orologio.includes("in ritardo di 8 min") ? `  ✓ orologio: ${orologio}` : `  ✗ orologio: ${orologio}`);
if (!(orologio && /Fase 3:[0-5]\d \/ 30:00/.test(orologio) && orologio.includes("in ritardo di 8 min"))) problemi++;
await mac.scatta("01-mac-live-orologio-in-ritardo");

// ---- Telefono: riga dello scarto sotto la fase ----
const tel = await nuovaScheda(`${BASE}/telecomando`, true);
await tel.js(`localStorage.removeItem('regia-pin')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando` });
await attendi(1500);
for (const cifra of rete.pin) { await tel.js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '${cifra}'); b?.click(); })()`); await attendi(80); }
await tel.click("Entra"); await attendi(1000);
if (await tel.js(`document.body.innerText.includes('Scegli la serata')`)) { await tel.click(demo.nome); await attendi(250); await tel.click("Confermi"); await attendi(800); }
await tel.click("Ok, pronti"); await mac.click("Ok, pronti"); await attendi(1500);
const scartoTel = await tel.js(`document.querySelector('[data-scarto]')?.textContent ?? null`);
console.log(scartoTel === "in ritardo di 8 min" ? "  ✓ telefono: riga 'in ritardo di 8 min' sotto la fase" : `  ✗ telefono scarto: ${scartoTel}`);
if (scartoTel !== "in ritardo di 8 min") problemi++;
await tel.scatta("02-telefono-scarto-sotto-la-fase");
await chiudiScheda(tel);

// ---- Diario: riepilogo e mai usati ----
await mac.js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Diario di serata'); b?.click(); })()`);
const maiUsatiOk = await mac.finoA(`document.querySelector('[data-mai-usati]')?.innerText.includes('Campanello')`, 4000);
console.log(maiUsatiOk ? "  ✓ Diario: 'Ultime serate: suoni mai usati' (Campanello, Sparo…)" : "  ✗ sezione mai usati");
if (!maiUsatiOk) problemi++;
await mac.scatta("03-mac-diario-mai-usati");
await mac.js(`(() => { const c = [...document.querySelectorAll('button.vetro')].find(x => x.textContent.includes('min')); c?.click(); })()`);
const riepilogoOk = await mac.finoA(`!!document.querySelector('[data-riepilogo]') && document.querySelector('[data-riepilogo]').innerText.includes('STOP TUTTO')`, 4000);
console.log(riepilogoOk ? "  ✓ Diario: riquadro 'Riepilogo della serata' in cima" : "  ✗ riepilogo");
if (!riepilogoOk) problemi++;
await mac.scatta("04-mac-diario-riepilogo");
const csv = await (await fetch(`${BASE}/api/diario/${giorno(ieri)}/csv`)).text();
console.log(csv.startsWith("chiave,valore") && csv.includes("possibili_errori,1") && csv.includes("\nora,tipo,cue") ? "  ✓ CSV con riepilogo in cima" : "  ✗ CSV riepilogo");
if (!(csv.startsWith("chiave,valore") && csv.includes("possibili_errori,1"))) problemi++;

// ---- Modifica: badge "mai usato" ----
await mac.cmd("Page.navigate", { url: `${BASE}/format/${demo.id}` });
await attendi(1500);
const badge = await mac.finoA(`[...document.querySelectorAll('[data-mai-usato]')].length >= 3`, 4000);
console.log(badge ? "  ✓ Modifica: badge 'mai usato nelle ultime 10 serate'" : "  ✗ badge mai usato");
if (!badge) problemi++;
await mac.js(`document.querySelector('[data-mai-usato]')?.scrollIntoView({ block: 'center' })`);
await attendi(300);
await mac.scatta("05-mac-modifica-mai-usato");

// ---- Home: duplica (si apre in Modifica) e archivia ----
await mac.cmd("Page.navigate", { url: `${BASE}/` });
await attendi(1500);
await mac.js(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Altre azioni')?.click()`);
await attendi(200);
await mac.click("Duplica");
const aperta = await mac.finoA(`location.pathname.startsWith('/format/') && [...document.querySelectorAll('input')].some(i => i.value.includes('(copia)'))`, 5000);
console.log(aperta ? "  ✓ Duplica: la copia si apre in Modifica" : "  ✗ duplica");
if (!aperta) problemi++;
await mac.cmd("Page.navigate", { url: `${BASE}/` });
await attendi(1500);
// archivia la copia (seconda card)
await mac.js(`[...document.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') === 'Altre azioni')[1]?.click()`);
await attendi(200);
await mac.click("Archivia");
const archiviato = await mac.finoA(`!!document.querySelector('[data-archiviato]') && document.querySelector('[data-archiviato]').innerText.includes('(copia)')`, 4000);
console.log(archiviato ? "  ✓ Archivia: sotto 'Archiviati' con Ripristina" : "  ✗ archivia");
if (!archiviato) problemi++;
await mac.scatta("06-mac-home-archiviati");
const cfgA = await (await fetch(`${BASE}/api/config`)).json();
const copia = cfgA.formats.find((f) => f.archiviato);
await mac.click("Ripristina");
const ripristinato = await mac.finoA(`!document.querySelector('[data-archiviato]')`, 4000);
console.log(ripristinato ? "  ✓ Ripristina: torna tra le serate" : "  ✗ ripristina");
if (!ripristinato) problemi++;
await fetch(`${BASE}/api/formats/${copia.id}`, { method: "DELETE" });

await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
