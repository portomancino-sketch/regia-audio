// Screenshot S9: telefono con card compatte (chiaro/scuro), foglio "Altri",
// Modifica con le stelle, Mac con il pannello "Altri"; più i controlli S9
// (premi-premi effetto, Altri (N), card visibili). Chrome headless + server di
// prova → docs/screenshots/s9/
// Uso: node scripts/screenshot-s9.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4993;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9339;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s9";
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
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot9-"));
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

fs.rmSync("/tmp/regia-shot9-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot9-chrome",
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


const stato = async () => (await (await fetch(`${BASE}/api/config`)).json());
async function caricaIn(faseId, nomi) {
  const fd = new FormData();
  for (const n of nomi) fd.append("file", new Blob([wavLungo(30)]), `${n}.wav`);
  const r = await fetch(`${BASE}/api/fasi/${faseId}/audio-multipli`, { method: "POST", body: fd });
  if (!r.ok) throw new Error("upload fallito");
  return (await r.json()).creati;
}
const PILLOLE = `[...document.querySelectorAll('[aria-label="Sempre"] button:not([data-altri])')]`;
const ALTRI = `document.querySelector('[aria-label="Sempre"] button[data-altri]')`;

// ---- Riga Sempre: 7 caselle, 3 in evidenza ----
const sempre = await caricaIn(faseSempre.id, ["Voce sala", "Jingle", "Applausi", "Gong", "Sigla", "Risata", "Tamburo"]);
for (const c of sempre.slice(0, 3)) {
  await fetch(`${BASE}/api/cue/${c.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenza: true }) });
}
// La fase 1 ha 8 card: per contare quante ne stanno sopra il dock.
const fase1 = demo.fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine)[0];
await caricaIn(fase1.id, ["Fischio", "Porta", "Vento", "Pioggia", "Tuono"]);
await attendi(1500);

// ---- Telefono 390×844 ----
const tel = await nuovaScheda(`${BASE}/telecomando`, true);
await tel.js(`localStorage.removeItem('regia-pin')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando` });
await attendi(1500);
for (const cifra of rete.pin) {
  await tel.js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '${cifra}'); b?.click(); })()`);
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
await attendi(400);

// (b) 3 pillole + "Altri (4)"
const pill = await tel.js(`${PILLOLE}.map(b => b.title)`);
const altriTesto = await tel.js(`${ALTRI}?.textContent.trim() ?? null`);
const bOk = pill.length === 3 && altriTesto === "Altri (4)";
console.log(`${bOk ? "  ✓" : "  ✗"} riga Sempre: pillole [${pill.join(", ")}] + "${altriTesto}"`);
if (!bOk) problemi++;

// (c) card compatte: altezza ≤ 96 a riposo, quante interamente visibili sopra il dock
const carte = await tel.js(`(async () => {
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 120));
  const dock = document.querySelector('.fixed.bottom-0').getBoundingClientRect();
  const cs = [...document.querySelectorAll('.grid > [role=button]')].map(c => c.getBoundingClientRect());
  const primaTop = Math.round(cs[0]?.top ?? 0);
  return { n: cs.length, altezze: cs.map(c => Math.round(c.height)), visibili: cs.filter(c => c.top >= 0 && c.bottom <= dock.top).length, primaTop, dockTop: Math.round(dock.top), dockAltezza: Math.round(844 - dock.top) };
})()`);
const cOk = carte.altezze.every((h) => h <= 96);
console.log(`${cOk ? "  ✓" : "  ✗"} card a riposo alte ${[...new Set(carte.altezze)].join("/")}px (≤96)`);
if (!cOk) problemi++;
console.log(`  ${carte.visibili >= 5 ? "✓" : "⚠"} card interamente visibili sopra il dock: ${carte.visibili} su ${carte.n} (prima card a ${carte.primaTop}px, dock da ${carte.dockTop}px = ${carte.dockAltezza}px alto)`);
await tel.scatta("01-telefono-lista-compatta-chiaro");
await tel.tema("scuro");
await tel.click("Ok, pronti");
await attendi(400);
await tel.scatta("02-telefono-lista-compatta-scuro");

// (b) foglio "Altri": si apre, tocco su una voce la fa partire e chiude
await tel.js(`${ALTRI}.click()`);
const foglio = await tel.finoA(`document.querySelector('[role="dialog"][aria-label="Altri suoni"]') !== null`, 3000);
console.log(foglio ? "  ✓ foglio Altri aperto" : "  ✗ foglio Altri non si apre");
if (!foglio) problemi++;
const vociFoglio = await tel.js(`[...document.querySelectorAll('[role="dialog"] button[title]')].map(b => b.title)`);
console.log(`    voci: ${vociFoglio.join(", ")}`);
await tel.scatta("03-telefono-foglio-altri-scuro");
await tel.js(`[...document.querySelectorAll('[role="dialog"] button[title]')].find(b => b.title === 'Sigla')?.click()`);
const chiuso = await tel.finoA(`document.querySelector('[role="dialog"][aria-label="Altri suoni"]') === null`, 3000);
const siglaSuona = await tel.finoA(`document.body.innerText.includes('Sigla') && ${ALTRI}.querySelector('span[aria-label]') !== null`, 4000);
console.log(`${chiuso && siglaSuona ? "  ✓" : "  ✗"} tocco su "Sigla": parte (pallino su Altri) e il foglio si chiude (chiuso=${chiuso}, suona=${siglaSuona})`);
if (!chiuso || !siglaSuona) problemi++;
await attendi(300);
await tel.scatta("04-telefono-altri-suona-scuro");

// (a) premi-premi su un effetto → 0 istanze (dal telefono, pillola in evidenza)
await tel.click("STOP TUTTO");
await attendi(400);
await tel.js(`${PILLOLE}.find(b => b.title === 'Voce sala').click()`);
const partito = await tel.finoA(`${PILLOLE}.find(b => b.title === 'Voce sala').getAttribute('aria-pressed') === 'true'`, 4000);
await tel.js(`${PILLOLE}.find(b => b.title === 'Voce sala').click()`);
const fermato = await tel.finoA(`${PILLOLE}.find(b => b.title === 'Voce sala').getAttribute('aria-pressed') === 'false' && document.body.innerText.includes('Silenzio')`, 4000);
console.log(`${partito && fermato ? "  ✓" : "  ✗"} premi-premi su un effetto: parte poi si ferma, nessuna istanza (partito=${partito}, fermato=${fermato})`);
if (!partito || !fermato) problemi++;

// card che suona (compatta + Sfuma/Stop grandi)
await tel.tema("chiaro");
await tel.click("Ok, pronti");
await attendi(400);
await tel.clickCue("Treno in corsa");
await tel.finoA(`[...document.querySelectorAll('.grid > [role=button] button')].some(b => b.textContent.trim() === 'Sfuma')`);
await attendi(400);
await tel.scatta("05-telefono-card-suona-chiaro");
await tel.click("STOP TUTTO");
await attendi(300);

// ---- Mac: pannello "Altri" sopra il dock; ESC chiude e NON fa STOP TUTTO ----
await mac.js(`window.scrollTo(0, 0)`);
await mac.clickCue("Treno in corsa");
await attendi(500);
await mac.js(`${ALTRI}.click()`);
const pannello = await mac.finoA(`document.querySelector('[role="dialog"][aria-label="Altri suoni"]') !== null`, 3000);
console.log(pannello ? "  ✓ Mac: pannello Altri aperto sopra il dock" : "  ✗ Mac: pannello Altri");
if (!pannello) problemi++;
await mac.scatta("06-mac-popover-altri-chiaro");
await mac.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await mac.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
const pannelloChiuso = await mac.finoA(`document.querySelector('[role="dialog"]') === null`, 2000);
const ancoraSuona = await mac.js(`document.body.innerText.includes('Treno in corsa') && !document.body.innerText.includes('Silenzio')`);
console.log(`${pannelloChiuso && ancoraSuona ? "  ✓" : "  ✗"} ESC chiude il pannello senza fare STOP TUTTO (chiuso=${pannelloChiuso}, suonaAncora=${ancoraSuona})`);
if (!pannelloChiuso || !ancoraSuona) problemi++;
// Q W E R: le pillole in evidenza, nell'ordine
await mac.js(`window.__ws = window.__ws`); // no-op
await mac.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "w", code: "KeyW", windowsVirtualKeyCode: 87 });
await mac.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "w", code: "KeyW", windowsVirtualKeyCode: 87 });
const wOk = await mac.finoA(`document.body.innerText.includes('Jingle') && [...document.querySelectorAll('span')].some(s => s.textContent.trim() === 'Jingle')`, 3000);
console.log(wOk ? "  ✓ tasto W → seconda pillola in evidenza (Jingle)" : "  ✗ tasto W");
if (!wOk) problemi++;
await mac.click("STOP TUTTO");
await attendi(300);

// ---- Modifica: stelle, quinta stella → avviso ----
await mac.click("Modifica");
await attendi(800);
const stelle = await mac.js(`[...document.querySelectorAll('button[aria-label="In evidenza"]')].map(b => b.getAttribute('aria-pressed') === 'true')`);
console.log(`${stelle.length === 7 && stelle.filter(Boolean).length === 3 ? "  ✓" : "  ✗"} Modifica: ${stelle.length} stelle, ${stelle.filter(Boolean).length} accese`);
if (!(stelle.length === 7 && stelle.filter(Boolean).length === 3)) problemi++;
await mac.js(`[...document.querySelectorAll('button[aria-label="In evidenza"]')][3].click()`); // quarta: ok
await attendi(600);
await mac.js(`[...document.querySelectorAll('button[aria-label="In evidenza"]')][4].click()`); // quinta: avviso
const avviso = await mac.finoA(`document.body.innerText.includes('Massimo 4 in evidenza')`, 2000);
const acceseDopo = await mac.js(`[...document.querySelectorAll('button[aria-label="In evidenza"]')].filter(b => b.getAttribute('aria-pressed') === 'true').length`);
console.log(`${avviso && acceseDopo === 4 ? "  ✓" : "  ✗"} quinta stella: avviso "Massimo 4 in evidenza", restano ${acceseDopo} accese`);
if (!avviso || acceseDopo !== 4) problemi++;
await mac.scatta("07-mac-modifica-stelle-chiaro");

await chiudiScheda(tel);
await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
