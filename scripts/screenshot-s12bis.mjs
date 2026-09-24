// Screenshot S12-bis: Modifica con la mini-barra (suono partito in Live) e
// "Ascolta" → "■ Ferma"; barra in alto con logo-link e "‹ Indietro"; Diario.
// Chrome headless + server di prova → docs/screenshots/s12bis/
// Uso: node scripts/screenshot-s12bis.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4986;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9345;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s12bis";
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
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot12bis-"));
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

fs.rmSync("/tmp/regia-shot12bis-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot12bis-chrome",
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





// Suono partito in Live → Modifica: mini-barra
await mac.clickCue("Treno in corsa");
await attendi(800);
await mac.click("Modifica");
const barra = await mac.finoA(`!!document.querySelector('.vetro-dock') && document.querySelector('.vetro-dock').innerText.includes('Treno in corsa')`, 4000);
console.log(barra ? "  ✓ mini-barra in Modifica con 'Treno in corsa'" : "  ✗ mini-barra");
if (!barra) problemi++;
await mac.scatta("01-mac-modifica-mini-barra");
await mac.click("STOP TUTTO");
await attendi(800);
// Ascolta → ■ Ferma
await mac.js(`(() => { const i = [...document.querySelectorAll('input')].find(i => i.value === 'Campanello'); i?.closest('.vetro')?.querySelector('.cursor-pointer')?.click(); })()`);
await mac.finoA(`!!document.querySelector('[data-ascolta]')`, 3000);
await mac.js(`document.querySelector('[data-ascolta]').click()`);
const ferma = await mac.finoA(`document.querySelector('[data-ascolta]')?.textContent.includes('Ferma') && (document.querySelector('.vetro-dock')?.innerText.includes('Anteprima') ?? false)`, 4000);
console.log(ferma ? "  ✓ Ascolta → '■ Ferma' e 'Anteprima: Campanello' nella barra" : "  ✗ ascolta/ferma");
if (!ferma) problemi++;
await mac.js(`(() => { const i = [...document.querySelectorAll('input')].find(i => i.value === 'Campanello'); i?.closest('.vetro')?.scrollIntoView({ block: 'center' }); })()`);
await attendi(300);
await mac.scatta("02-mac-modifica-ascolta-ferma");
await mac.js(`document.querySelector('[data-ascolta]')?.click()`);
await attendi(500);
// Barra in alto: logo e Indietro; Diario con Indietro
await mac.js(`window.scrollTo(0, 0)`);
await attendi(200);
await mac.scatta("03-mac-modifica-indietro-e-logo");
await mac.js(`[...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Diario di serata')?.click()`);
await mac.finoA(`document.body.innerText.includes('Diario di serata')`, 3000);
await attendi(300);
await mac.scatta("04-mac-diario-indietro");
await mac.js(`document.querySelector('[data-indietro]')?.click()`);
const tornato = await mac.finoA(`location.pathname.startsWith('/format/')`, 3000);
console.log(tornato ? "  ✓ 'Indietro' dal Diario torna al format" : "  ✗ indietro");
if (!tornato) problemi++;
await mac.js(`document.querySelector('[data-logo]')?.click()`);
const home = await mac.finoA(`location.pathname === '/'`, 3000);
console.log(home ? "  ✓ logo → Home" : "  ✗ logo");
if (!home) problemi++;

await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
