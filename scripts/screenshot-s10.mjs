// Screenshot S10: soundcheck in corso ed esito; telefono con STOP TUTTO a metà
// pressione e "Tieni premuto"; Modifica bloccata; card "usato 2/3". Più i
// controlli funzionali S10. Chrome headless + server di prova → docs/screenshots/s10/
// Uso: node scripts/screenshot-s10.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4992;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9340;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s10";
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
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot10-"));
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

fs.rmSync("/tmp/regia-shot10-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot10-chrome",
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



const tasto = (pagina, key, code, keyCode) =>
  pagina.cmd("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode }).then(() =>
    pagina.cmd("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode }));

// ---- Riga Sempre con una casella, per il soundcheck ----
const fd = new FormData();
fd.append("file", new Blob([wavLungo(5)]), "Voce sala.wav");
await fetch(`${BASE}/api/fasi/${faseSempre.id}/audio-multipli`, { method: "POST", body: fd });
await attendi(1200);

// ---- A1: soundcheck "Prova tutti" ----
const provaTutti = await mac.finoA(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Prova tutti'))`, 4000);
console.log(provaTutti ? "  ✓ pulsante 'Prova tutti' in Live" : "  ✗ manca 'Prova tutti'");
if (!provaTutti) problemi++;
await mac.click("Prova tutti");
const contatore = await mac.finoA(`/\\b1 \\/ \\d+/.test(document.body.innerText)`, 4000);
console.log(contatore ? "  ✓ soundcheck partito: contatore 1 / N" : "  ✗ contatore assente");
if (!contatore) problemi++;
await attendi(600);
await mac.scatta("01-mac-soundcheck-in-corso");
const avanza = await mac.finoA(`/\\b2 \\/ \\d+/.test(document.body.innerText)`, 6000);
console.log(avanza ? "  ✓ il contatore avanza (2 / N)" : "  ✗ il contatore non avanza");
if (!avanza) problemi++;
// ESC interrompe → esito
await tasto(mac, "Escape", "Escape", 27);
const esito = await mac.finoA(`document.querySelector('[role="dialog"][aria-label="Esito soundcheck"]') !== null`, 4000);
console.log(esito ? "  ✓ ESC interrompe e mostra l'esito" : "  ✗ esito non mostrato");
if (!esito) problemi++;
await mac.scatta("02-mac-esito-soundcheck");
const testoEsito = await mac.js(`document.querySelector('[role="dialog"]')?.innerText ?? ''`);
console.log(`    esito: ${testoEsito.replace(/\n/g, " | ").slice(0, 160)}`);
await mac.click("Chiudi");
await attendi(300);
// Suggerimento blocco (compare con "Prova tutti", una volta al giorno)
const suggerimento = await mac.js(`document.body.innerText.includes('Vuoi bloccare le modifiche per la serata?')`);
console.log(suggerimento ? "  ✓ suggerimento 'Vuoi bloccare le modifiche?'" : "  ✗ suggerimento assente");
if (!suggerimento) problemi++;
await mac.click("No");
await attendi(300);

// ---- A4: usi previsti 3, due partenze → "usato 2/3" ----
const cfg1 = await (await fetch(`${BASE}/api/config`)).json();
const fase1 = cfg1.formats[0].fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine)[0];
const campanello = fase1.cue.find((c) => c.titolo === "Campanello");
await fetch(`${BASE}/api/cue/${campanello.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ usiPrevisti: 3 }) });
await attendi(1000);
for (let i = 0; i < 2; i++) {
  await mac.clickCue("Campanello");
  await attendi(2600); // il campanello dura 2 s
}
const usato = await mac.finoA(`document.body.innerText.includes('usato 2/3')`, 3000);
console.log(usato ? "  ✓ card 'usato 2/3' dopo due partenze" : "  ✗ contatore usi");
if (!usato) problemi++;
await mac.scatta("03-mac-card-usato-2-3");

// ---- A3: blocco modifiche ----
await mac.js(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Blocca modifiche')?.click()`);
const bloccatoOk = await mac.finoA(`[...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') || '').startsWith('Modifiche bloccate'))`, 4000);
console.log(bloccatoOk ? "  ✓ lucchetto: modifiche bloccate" : "  ✗ blocco non attivo");
if (!bloccatoOk) problemi++;
await mac.click("Modifica");
const banner = await mac.finoA(`document.body.innerText.includes('Serata in corso — modifiche bloccate')`, 3000);
const inputDisabilitati = await mac.js(`[...document.querySelectorAll('fieldset input, fieldset textarea')].length > 0 && [...document.querySelectorAll('fieldset input, fieldset textarea')].every(i => i.matches(':disabled'))`);
console.log(banner && inputDisabilitati ? "  ✓ Modifica in sola lettura (banner + input disabilitati)" : `  ✗ Modifica bloccata (banner=${banner}, input=${inputDisabilitati})`);
if (!banner || !inputDisabilitati) problemi++;
const r423 = await fetch(`${BASE}/api/fasi/${fase1.id}/cue`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
console.log(r423.status === 423 ? "  ✓ il server rifiuta le scritture (423)" : `  ✗ server: ${r423.status}`);
if (r423.status !== 423) problemi++;
await mac.scatta("04-mac-modifica-bloccata");
await mac.click("Sblocca");
await attendi(200);
await mac.click("Sì, sblocca");
const sbloccato = await mac.finoA(`!document.body.innerText.includes('modifiche bloccate')`, 4000);
console.log(sbloccato ? "  ✓ 'Sblocca' con conferma → torna modificabile" : "  ✗ sblocco");
if (!sbloccato) problemi++;
await mac.click("Live");
await attendi(500);

// ---- A2: STOP TUTTO a pressione lunga sul telefono ----
const tel = await nuovaScheda(`${BASE}/telecomando?prova`, true);
await tel.js(`localStorage.removeItem('regia-pin')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando?prova` });
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
await attendi(300);
await tel.clickCue("Treno in corsa");
await tel.finoA(`document.body.innerText.includes('in loop')`, 4000);
// spia dei comandi inviati
await tel.js(`(() => { window.__inviati = []; const o = window.__ws.invia.bind(window.__ws); window.__ws.invia = (m) => { window.__inviati.push(m); o(m); }; })()`);
const pd = (tipo) => tel.js(`(() => { const b = document.querySelector('[data-stop-lungo]'); b.dispatchEvent(new PointerEvent('${tipo}', { bubbles: true, pointerId: 1, isPrimary: true })); return true; })()`);
const contaStop = () => tel.js(`window.__inviati.filter(m => m.comando === 'stopTutto').length`);
// tocco breve (senza screenshot in mezzo: la cattura dura più di 600 ms)
await pd("pointerdown");
await attendi(200);
await pd("pointerup");
await attendi(150);
const tieni = await tel.js(`document.body.innerText.includes('Tieni premuto')`);
const inviatiBreve = await contaStop();
console.log(tieni && inviatiBreve === 0 ? "  ✓ tocco breve: nessun comando, scritta 'Tieni premuto'" : `  ✗ tocco breve (tieni=${tieni}, inviati=${inviatiBreve})`);
if (!tieni || inviatiBreve !== 0) problemi++;
await tel.scatta("06-telefono-tieni-premuto");
await attendi(1600);
// foto a metà pressione (la cattura può far scattare la pressione lunga: non conta)
await pd("pointerdown");
await attendi(250);
await tel.scatta("05-telefono-stop-tutto-meta-pressione");
await pd("pointerup");
await attendi(400);
await tel.js(`window.__inviati = []`);
await tel.clickCue("Treno in corsa");
await tel.finoA(`document.body.innerText.includes('in loop')`, 4000);
await tel.js(`window.__inviati = []`);
// pressione lunga: una sola volta
await pd("pointerdown");
await attendi(750);
await pd("pointerup");
await attendi(300);
const inviatiLungo = await contaStop();
const silenzio = await tel.finoA(`document.body.innerText.includes('Silenzio')`, 4000);
console.log(inviatiLungo === 1 && silenzio ? "  ✓ pressione 600 ms: STOP TUTTO inviato una volta, silenzio" : `  ✗ pressione lunga (inviati=${inviatiLungo}, silenzio=${silenzio})`);
if (inviatiLungo !== 1 || !silenzio) problemi++;

// Telefono durante il soundcheck: pillola e comandi ignorati
await mac.click("Prova tutti");
const pillolaSc = await tel.finoA(`document.body.innerText.includes('Soundcheck in corso')`, 4000);
console.log(pillolaSc ? "  ✓ telefono: pillola 'Soundcheck in corso'" : "  ✗ pillola soundcheck sul telefono");
if (!pillolaSc) problemi++;
await tel.scatta("07-telefono-soundcheck-in-corso");
await tasto(mac, "Escape", "Escape", 27);
await mac.finoA(`document.querySelector('[role="dialog"]') !== null`, 4000);
await mac.click("Chiudi");

await chiudiScheda(tel);
await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
