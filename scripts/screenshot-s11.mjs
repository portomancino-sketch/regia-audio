// Screenshot S11: Modifica con cursore Volume in dB e valore automatico;
// "Analizza tutti" in corso; format con passaggio tra sottofondi.
// Chrome headless + server di prova → docs/screenshots/s11/
// Uso: node scripts/screenshot-s11.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4990;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9342;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s11";
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
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot11-"));
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

fs.rmSync("/tmp/regia-shot11-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot11-chrome",
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


/** La striscia Sempre sta dentro il vetro del dock ed è opaca: i punti lungo la
 *  striscia, al tocco, rispondono con elementi del dock, mai con una card. */
const CONTROLLO_STRISCIA = `(async () => {
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 120));
  const striscia = document.querySelector('[aria-label="Sempre"]');
  const vetro = document.querySelector('.vetro-dock');
  if (!striscia || !vetro) return { ok: false, motivo: 'striscia o vetro non trovati' };
  const s = striscia.getBoundingClientRect(), v = vetro.getBoundingClientRect();
  const dentro = s.top >= v.top - 1 && s.bottom <= v.bottom + 1 && s.left >= v.left - 1 && s.right <= v.right + 1;
  const carte = [...document.querySelectorAll('.grid > [role=button]')];
  const sovrapposte = carte.filter(c => { const r = c.getBoundingClientRect(); return r.bottom > s.top && r.top < s.bottom; }).length;
  let bucati = 0;
  for (let i = 0; i < 12; i++) {
    const x = s.left + 4 + ((s.width - 8) * i) / 11, y = (s.top + s.bottom) / 2;
    const el = document.elementFromPoint(x, y);
    if (!el || !vetro.contains(el)) bucati++;
  }
  return { ok: dentro && bucati === 0, dentro, bucati, sovrapposte };
})()`;

async function scattaCimaEFondo(pagina, prefisso) {
  await pagina.js(`window.scrollTo(0, 0)`);
  await attendi(300);
  await pagina.scatta(`${prefisso}-cima`);
  await pagina.js(`window.scrollTo(0, document.body.scrollHeight)`);
  await attendi(300);
  await pagina.scatta(`${prefisso}-fondo`);
}




// Un po' di file in più (silenzio: l'analisi darà +12 dB) e il crossfade a 3 s.
const fase1 = demo.fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine)[0];
const fd = new FormData();
for (const n of ["Pioggia", "Vento", "Mercato"]) fd.append("file", new Blob([wavLungo(20)]), `${n}.wav`);
await fetch(`${BASE}/api/fasi/${fase1.id}/audio-multipli`, { method: "POST", body: fd });
await fetch(`${BASE}/api/formats/${demo.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ crossfade: 3 }) });
await attendi(1200);
await mac.click("Modifica");
await attendi(600);

// "Analizza tutti i suoni" dal menu del format: foto mentre gira
await mac.js(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Menu del format')?.click()`);
await attendi(200);
await mac.click("Analizza tutti i suoni");
const inCorso = await mac.finoA(`!!document.querySelector('[data-analisi]')`, 2000);
console.log(inCorso ? "  ✓ 'Analizza tutti' in corso (barra di avanzamento)" : "  ✗ analisi non partita");
if (!inCorso) problemi++;
await mac.scatta("01-mac-analizza-tutti-in-corso");
const finita = await mac.finoA(`!document.querySelector('[data-analisi]')`, 20000);
await attendi(800);
const cfg3 = await (await fetch(`${BASE}/api/config`)).json();
const conAnalisi = cfg3.formats[0].fasi.flatMap((f) => f.cue).filter((c) => c.analisi);
console.log(finita && conAnalisi.length >= 6 ? `  ✓ analisi salvata su ${conAnalisi.length} caselle` : `  ✗ analisi salvata su ${conAnalisi.length} caselle`);
if (!finita || conAnalisi.length < 6) problemi++;

// Apri la casella "Treno in corsa": cursore Volume in dB, "auto", Ascolta
const treno = cfg3.formats[0].fasi.flatMap((f) => f.cue).find((c) => c.titolo === "Treno in corsa");
await fetch(`${BASE}/api/cue/${treno.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ritocco: -3 }) });
await attendi(1000);
await mac.js(`(() => { const i = [...document.querySelectorAll('input')].find(i => i.value === 'Treno in corsa'); i?.closest('.vetro')?.querySelector('.cursor-pointer')?.click(); })()`);
await attendi(500);
const cursore = await mac.js(`!!document.querySelector('input[aria-label="Volume in dB (ritocco)"]') && document.body.innerText.includes('-3 dB') && /auto [+-]?\\d+ dB/.test(document.body.innerText)`);
console.log(cursore ? "  ✓ cursore Volume (dB), valore auto e Ascolta" : "  ✗ cursore/auto");
if (!cursore) problemi++;
await mac.js(`(() => { const i = [...document.querySelectorAll('input')].find(i => i.value === 'Treno in corsa'); i?.closest('.vetro')?.scrollIntoView({ block: 'center' }); })()`);
await attendi(300);
await mac.scatta("02-mac-modifica-cursore-e-auto");
const cf = await mac.js(`document.querySelector('[data-crossfade]')?.textContent`);
console.log(cf && cf.startsWith("3") ? `  ✓ format: passaggio tra sottofondi ${cf}` : `  ✗ crossfade: ${cf}`);
if (!cf || !cf.startsWith("3")) problemi++;
await mac.tema("scuro");
await attendi(500);
await mac.js(`(() => { const i = [...document.querySelectorAll('input')].find(i => i.value === 'Treno in corsa'); i?.closest('.vetro')?.querySelector('.cursor-pointer')?.click(); })()`);
await attendi(400);
await mac.js(`(() => { const i = [...document.querySelectorAll('input')].find(i => i.value === 'Treno in corsa'); i?.closest('.vetro')?.scrollIntoView({ block: 'center' }); })()`);
await attendi(300);
await mac.scatta("03-mac-modifica-scuro");

await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
