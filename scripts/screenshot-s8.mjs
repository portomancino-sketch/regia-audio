// Screenshot S8: telefono 390×844 con la riga Sempre a pillole (1 e 5),
// tema chiaro e scuro, più il controllo che l'ultima card della fase resti
// sopra il dock. Chrome headless + server di prova → docs/screenshots/s8/
// Uso: node scripts/screenshot-s8.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4995;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9337;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s8";
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
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot8-"));
const server = spawn("npx", ["tsx", "server/src/index.ts"], {
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORTA_TEST), REGIA_DIR: dati },
});
process.on("exit", () => {
  server.kill();
  fs.rmSync(dati, { recursive: true, force: true });
});
for (let i = 0; i < 60; i++) {
  try {
    await fetch(`${BASE}/api/rete`);
    break;
  } catch {
    await attendi(300);
  }
}

fs.rmSync("/tmp/regia-shot8-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot8-chrome",
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

// ---- Mac: è il motore. Apre il format in Live ----
const mac = await nuovaScheda(`${BASE}/`);
await attendi(1500);
await mac.js(
  `(() => { const c = [...document.querySelectorAll('div.vetro.tocco')].find(d => d.textContent.includes('Orient Express')); c?.click(); })()`,
);
await attendi(1000);
await mac.click("Live");
await attendi(600);
await mac.click("Ok, pronti");
await attendi(300);

// ---- Una casella Sempre ----
await caricaSempre(["Voce sala"]);
await attendi(1200);

// ---- Telefono 390×844 ----
const tel = await nuovaScheda(`${BASE}/telecomando`, true);
await tel.js(`localStorage.removeItem('regia-pin')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando` });
await attendi(1500);
for (const cifra of rete.pin) {
  await tel.js(
    `(() => { const b = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '${cifra}'); b?.click(); })()`,
  );
  await attendi(80);
}
await tel.click("Entra");
await attendi(1000);
if (await tel.js(`document.body.innerText.includes('Scegli la serata')`)) {
  await tel.click(demo.nome);
  await attendi(250);
  await tel.click("Confermi");
  await attendi(800);
}
await tel.click("Ok, pronti");
await mac.click("Ok, pronti");
await attendi(300);
const unaPillola = await tel.finoA(`document.querySelectorAll('[aria-label="Sempre"] button').length === 1`);
console.log(unaPillola ? "  ✓ 1 pillola Sempre sul telefono" : "  ✗ pillola Sempre assente");
if (!unaPillola) problemi++;

// La pillola che suona: tocco → parte sul Mac
await tel.clickPillola("Voce sala");
const suona = await tel.finoA(`document.body.innerText.includes('Voce sala') && document.querySelector('[aria-label="Sempre"] button[aria-pressed="true"]') !== null`);
console.log(suona ? "  ✓ tocco sulla pillola → suona (stato evidente)" : "  ✗ la pillola non suona");
if (!suona) problemi++;
await attendi(600);
await tel.scatta("01-telefono-sempre-1-chiaro");
await tel.tema("scuro");
await tel.click("Ok, pronti");
await attendi(400);
await tel.scatta("02-telefono-sempre-1-scuro");

// ---- Cinque caselle Sempre (4 suoni + 1 promemoria) ----
await caricaSempre(["Jingle", "Applausi", "Gong"]);
await fetch(`${BASE}/api/fasi/${faseSempre.id}/cue`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ titolo: "Luci giù", tipo: "promemoria" }),
});
await attendi(1200);
const cinque = await tel.finoA(`document.querySelectorAll('[aria-label="Sempre"] button').length === 5`);
console.log(cinque ? "  ✓ 5 pillole Sempre sul telefono" : "  ✗ non vedo 5 pillole");
if (!cinque) problemi++;
await tel.clickPillola("Luci giù"); // promemoria: spunta
await attendi(500);
const spuntata = await tel.js(`document.querySelector('[aria-label="Sempre"] button[title="Luci giù"]')?.getAttribute('aria-pressed') === 'true'`);
console.log(spuntata ? "  ✓ promemoria spuntato dalla pillola" : "  ✗ spunta promemoria");
if (!spuntata) problemi++;
// misure: altezza 44, tocco ≥ 44, larghezza ≤ 60% dello schermo, striscia senza barra
const misure = await tel.js(`(() => {
  const ps = [...document.querySelectorAll('[aria-label="Sempre"] button')].map(b => b.getBoundingClientRect());
  const striscia = document.querySelector('[aria-label="Sempre"]');
  return { h: ps.map(p => Math.round(p.height)), wMax: Math.round(Math.max(...ps.map(p => p.width))), wMin: Math.round(Math.min(...ps.map(p => p.width))), scrollbar: getComputedStyle(striscia).scrollbarWidth, scorre: striscia.scrollWidth > striscia.clientWidth };
})()`);
const misureOk = misure.h.every((h) => h === 44) && misure.wMin >= 44 && misure.wMax <= 390 * 0.6;
console.log(`${misureOk ? "  ✓" : "  ✗"} pillole: altezze ${misure.h.join("/")}, larghezza ${misure.wMin}–${misure.wMax}px, scrollbar-width=${misure.scrollbar}, scorre=${misure.scorre}`);
if (!misureOk) problemi++;
await tel.scatta("03-telefono-sempre-5-scuro");
await tel.tema("chiaro");
await tel.click("Ok, pronti");
await attendi(400);
await tel.scatta("04-telefono-sempre-5-chiaro");

// ---- L'ultima card della fase sta sopra il dock? (con 5 caselle Sempre) ----
const c5 = await tel.js(CONTROLLO_DOCK);
console.log(`${c5.ok ? "  ✓" : "  ✗"} ultima card sopra il dock con ${c5.pillole} pillole: card finisce a ${c5.ultimaBottom}px, dock inizia a ${c5.dockTop}px`);
if (!c5.ok) problemi++;
await attendi(300);
await tel.scatta("05-telefono-scrollato-in-fondo-chiaro");

// ---- Mac: resta tutto com'era (card compatte nella riga Sempre) ----
await mac.js(`window.scrollTo(0, 0)`);
await attendi(300);
await mac.scatta("06-mac-live-sempre-5-chiaro");
const cMac = await mac.js(CONTROLLO_DOCK);
console.log(`${cMac.ok ? "  ✓" : "  ✗"} Mac: ultima card sopra il dock: card finisce a ${cMac.ultimaBottom}px, dock inizia a ${cMac.dockTop}px`);
if (!cMac.ok) problemi++;

await tel.click("STOP TUTTO");
await attendi(300);
await chiudiScheda(tel);
await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
