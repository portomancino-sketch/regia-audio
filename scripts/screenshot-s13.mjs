// Screenshot S13: Impostazioni luci (lampadine, gruppi, effetti), casella e fase
// col menu Luci, dock col pannello Luci (Mac e telefono), esito soundcheck con la
// riga Luci. Centralina finta + Chrome headless → docs/screenshots/s13/
// Uso: node scripts/screenshot-s13.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4985;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9346;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s13";
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
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot13-"));
const server = spawn("npx", ["tsx", "server/src/index.ts"], {
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORTA_TEST), REGIA_DIR: dati, REGIA_HUE_MDNS: "0" },
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

fs.rmSync("/tmp/regia-shot13-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot13-chrome",
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


// ---- Centralina finta ----
const { avviaBridgeFinto } = await import("./bridge-finto.mjs");
const bridge = await avviaBridgeFinto();
process.on("exit", () => void bridge.chiudi());
const jsonPost = (url, corpo) => fetch(`${BASE}${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo ?? {}) }).then((r) => r.json());
const jsonPut = (url, corpo) => fetch(`${BASE}${url}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo ?? {}) }).then((r) => r.json());
const jsonPatch = (url, corpo) => fetch(`${BASE}${url}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo ?? {}) }).then((r) => r.json());

const mac = await nuovaScheda(`${BASE}/`);
await attendi(1500);
// Impostazioni → Luci dal sole/luna
await mac.js(`[...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').toLowerCase().includes('tema'))?.click()`);
await attendi(300);
await mac.js(`document.querySelector('[data-vai-luci]')?.click()`);
const paginaLuci = await mac.finoA(`location.pathname === '/luci' && document.body.innerText.includes('Centralina non trovata')`, 4000);
console.log(paginaLuci ? "  ✓ Impostazioni → Luci: 'Centralina non trovata'" : "  ✗ pagina Luci");
if (!paginaLuci) problemi++;
// IP a mano → trovata → Abbina con conto alla rovescia → pulsante premuto
await mac.js(`(() => { const i = document.querySelector('input[aria-label="Indirizzo IP della centralina"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, '${bridge.ip}'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await attendi(200);
await mac.click("Prova questo IP");
const trovata = await mac.finoA(`document.body.innerText.includes('Trovata, da abbinare')`, 4000);
console.log(trovata ? "  ✓ IP a mano: 'Trovata, da abbinare'" : "  ✗ ricerca IP");
if (!trovata) problemi++;
await mac.click("Abbina");
const frase = await mac.finoA(`!!document.querySelector('[data-frase-abbina]') && /Abbina… \\d+ s/.test(document.body.innerText)`, 3000);
console.log(frase ? "  ✓ 'Premi il pulsante rotondo sulla centralina Philips' + conto alla rovescia" : "  ✗ abbinamento");
if (!frase) problemi++;
await mac.scatta("01-mac-luci-abbina-conto-alla-rovescia");
bridge.premiPulsante();
const abbinata = await mac.finoA(`document.querySelector('[data-stato-centralina]')?.getAttribute('data-stato-centralina') === 'abbinata'`, 8000);
console.log(abbinata ? "  ✓ Abbinata dopo il pulsante" : "  ✗ non abbinata");
if (!abbinata) problemi++;
// gruppi (importa stanze) ed effetti via API, poi la pagina si ricarica
await jsonPost("/api/luci/importa-stanze");
const st = await (await fetch(`${BASE}/api/luci/stato`)).json();
const sala = Object.values(st.mappa.gruppi).find((g) => g.nome === "Sala");
const bar = Object.values(st.mappa.gruppi).find((g) => g.nome === "Bar");
await jsonPut("/api/luci/effetti", { effetti: {
  luce1: { voci: { [sala.id]: { acceso: false, luminosita: 0, colore: "bianco-caldo", transizione: 2 }, [bar.id]: { acceso: true, luminosita: 10, colore: "blu", transizione: 1 } } },
  luce2: { voci: { [sala.id]: { acceso: true, luminosita: 80, colore: "rosso", transizione: 0.5 } } },
  luce3: { voci: { [sala.id]: { acceso: true, luminosita: 70, colore: "bianco-caldo", transizione: 3, luci: ["1", "4"] }, [bar.id]: { acceso: true, luminosita: 40, colore: "arancio", transizione: 3 } } },
} });
await mac.cmd("Page.navigate", { url: `${BASE}/luci` });
await mac.finoA(`document.querySelectorAll('[data-lampadina]').length === 5 && document.querySelectorAll('[data-gruppo]').length === 2`, 6000);
await attendi(400);
await mac.scatta("02-mac-luci-lampadine-gruppi");
await mac.js(`document.querySelector('[data-effetto="luce1"]')?.scrollIntoView({ block: 'start' })`);
await attendi(300);
await mac.scatta("03-mac-luci-effetti");
await mac.js(`document.querySelector('[data-prova="luce2"]')?.click()`);
await attendi(600);
const provato = bridge.comandi.some((c) => c.stato.hue === 0);
console.log(provato ? "  ✓ 'Prova' manda l'effetto alla centralina" : "  ✗ prova");
if (!provato) problemi++;
await attendi(3500); // torna com'era da solo

// ---- Modifica: casella con menu Luci, fase con menu ----
await mac.cmd("Page.navigate", { url: `${BASE}/format/${demo.id}` });
await attendi(1500);
const menuFase = await mac.finoA(`document.querySelectorAll('[data-luci-fase]').length >= 3`, 4000);
console.log(menuFase ? "  ✓ Modifica: menu 'Luci all'inizio della fase' sotto 'Cosa succede'" : "  ✗ menu fase");
if (!menuFase) problemi++;
await mac.js(`(() => { const i = [...document.querySelectorAll('input')].find(i => i.value === 'Campanello'); i?.closest('.vetro')?.querySelector('.cursor-pointer')?.click(); })()`);
const menuCasella = await mac.finoA(`[...document.querySelectorAll('[data-menu-luci]')].length >= 4 && !!document.querySelector('[data-luce-fine]')`, 4000);
console.log(menuCasella ? "  ✓ Modifica: menu 'Luci' + 'A fine suono torna com'era' sulla casella" : "  ✗ menu casella");
if (!menuCasella) problemi++;
const cfg2 = await (await fetch(`${BASE}/api/config`)).json();
const fasiN = cfg2.formats[0].fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine);
const campanello = fasiN[0].cue.find((c) => c.titolo === "Campanello");
await jsonPatch(`/api/cue/${campanello.id}`, { luce: "luce2", luceFine: true });
await jsonPatch(`/api/fasi/${fasiN[1].id}`, { luce: "luce1" });
await attendi(1200);
await mac.js(`(() => { const i = [...document.querySelectorAll('input')].find(i => i.value === 'Campanello'); const c = i?.closest('.vetro'); if (c && !c.querySelector('[data-menu-luci]')) c.querySelector('.cursor-pointer')?.click(); c?.scrollIntoView({ block: 'center' }); })()`);
await attendi(400);
await mac.scatta("04-mac-modifica-casella-menu-luci");

// ---- Live: dock con "Luci", pannello, pallino sulla card ----
await mac.click("Live");
await attendi(500);
await mac.click("Ok, pronti");
const pulsanteLuci = await mac.finoA(`!!document.querySelector('[data-luci]') && !!document.querySelector('[data-pallino-luce]')`, 4000);
console.log(pulsanteLuci ? "  ✓ Live: pulsante 'Luci' nel dock e pallino colorato sulla card" : "  ✗ Luci in Live");
if (!pulsanteLuci) problemi++;
await mac.js(`document.querySelector('[data-luci]').click()`);
const pannello = await mac.finoA(`!!document.querySelector('[role="dialog"][aria-label="Luci"]') && document.querySelector('[role="dialog"]').innerText.includes('Buio') && document.querySelector('[role="dialog"]').innerText.includes("Torna com'era") && !!document.querySelector('[data-intensita]')`, 3000);
console.log(pannello ? "  ✓ pannello Luci: tre pulsanti coi nomi, Torna com'era, Intensità" : "  ✗ pannello Luci");
if (!pannello) problemi++;
await mac.scatta("05-mac-live-pannello-luci");
bridge.azzeraComandi();
await mac.js(`document.querySelector('[data-effetto="luce1"]').click()`);
await attendi(600);
console.log(bridge.comandi.some((c) => c.stato.on === false) ? "  ✓ 'Buio' dal dock → comando alla centralina" : "  ✗ comando manuale");
await mac.js(`document.querySelector('[data-effetto="torna"]').click()`);
await attendi(400);
await mac.js(`document.querySelector('[role="dialog"] button[aria-label="Chiudi"]')?.click()`);
await attendi(300);
// casella con luce: parte → Rosso; finisce → torna
bridge.azzeraComandi();
await mac.clickCue("Campanello");
await attendi(800);
const rosso = bridge.comandi.some((c) => c.stato.hue === 0 && c.stato.on === true);
await attendi(2600);
const tornato = bridge.comandi.length > (rosso ? 1 : 0) && bridge.lights()["1"].state.hue === 0 && bridge.lights()["1"].state.bri === 200;
console.log(rosso && tornato ? "  ✓ casella con luci: parte → Rosso, a fine suono → com'era" : `  ✗ casella con luci (rosso=${rosso}, tornato=${tornato})`);
if (!rosso || !tornato) problemi++;

// ---- Telefono: pulsante Luci e pannello ----
const tel = await nuovaScheda(`${BASE}/telecomando`, true);
await tel.js(`localStorage.removeItem('regia-pin')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando` });
await attendi(1500);
for (const cifra of rete.pin) { await tel.js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '${cifra}'); b?.click(); })()`); await attendi(80); }
await tel.click("Entra"); await attendi(1000);
if (await tel.js(`document.body.innerText.includes('Scegli la serata')`)) { await tel.click(demo.nome); await attendi(250); await tel.click("Confermi"); await attendi(800); }
await tel.click("Ok, pronti"); await mac.click("Ok, pronti"); await attendi(800);
const luciTel = await tel.finoA(`!!document.querySelector('[data-luci]')`, 4000);
console.log(luciTel ? "  ✓ telefono: pulsante 'Luci' nel dock" : "  ✗ Luci sul telefono");
if (!luciTel) problemi++;
await tel.js(`document.querySelector('[data-luci]').click()`);
await tel.finoA(`!!document.querySelector('[role="dialog"][aria-label="Luci"]')`, 3000);
await attendi(300);
await tel.scatta("06-telefono-pannello-luci");
bridge.azzeraComandi();
await tel.js(`document.querySelector('[data-effetto="luce3"]').click()`);
await attendi(600);
console.log(bridge.comandi.length > 0 ? "  ✓ 'Caldo' dal telefono → comandi alla centralina" : "  ✗ comando dal telefono");
await tel.js(`document.querySelector('[data-effetto="torna"]').click()`);
await attendi(400);
await tel.click("Chiudi");
await chiudiScheda(tel);

// ---- Soundcheck: esito con la riga Luci ----
await mac.click("Prova tutti");
// Il giro completo: i suoni (6 caselle × 3,3 s), poi i tre effetti luce e torna com'era.
const esito = await mac.finoA(`document.querySelector('[role="dialog"][aria-label="Esito soundcheck"]') !== null`, 60000);
const rigaLuci = esito && (await mac.js(`document.querySelector('[data-esito-luci]')?.textContent`));
console.log(rigaLuci === "Luci: ok" ? "  ✓ esito soundcheck: 'Luci: ok'" : `  ✗ riga Luci nell'esito: ${rigaLuci}`);
if (rigaLuci !== "Luci: ok") problemi++;
await mac.scatta("07-mac-esito-soundcheck-luci");
await mac.click("Chiudi");

// ---- Centralina spenta: la serata va avanti, pallino grigio ----
await bridge.chiudi();
await jsonPost("/api/luci/esegui", { effetto: "luce1" }); // aggiorna "raggiungibile"
await mac.cmd("Page.navigate", { url: `${BASE}/format/${demo.id}` });
await attendi(1500);
await mac.click("Live"); await attendi(400); await mac.click("Ok, pronti");
await mac.clickCue("Treno in corsa");
const suona = await mac.finoA(`document.body.innerText.includes('in loop')`, 4000);
const grigio = await mac.finoA(`!!document.querySelector('[data-pallino-grigio]')`, 4000);
console.log(suona && grigio ? "  ✓ centralina spenta: il suono parte lo stesso, pallino grigio su 'Luci'" : `  ✗ centralina spenta (suona=${suona}, grigio=${grigio})`);
if (!suona || !grigio) problemi++;
await mac.scatta("08-mac-live-luci-non-raggiungibile");
await mac.click("STOP TUTTO");

await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
