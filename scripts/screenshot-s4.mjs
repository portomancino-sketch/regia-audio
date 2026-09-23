// Screenshot delle schermate S4 (tema chiaro/scuro, note guida, presa del comando)
// con Chrome headless e un server di prova → docs/screenshots/s4/
// Uso: node scripts/screenshot-s4.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4996;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9336;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s4";
fs.mkdirSync(CARTELLA, { recursive: true });

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

class Pagina {
  constructor(wsUrl, id) {
    this.id = id;
    this.ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
    this.n = 0;
    this.attese = new Map();
    this.richieste = [];
    this.pronta = new Promise((res) => this.ws.on("open", res));
    this.ws.on("message", (d) => {
      const m = JSON.parse(String(d));
      if (m.id && this.attese.has(m.id)) {
        this.attese.get(m.id)(m);
        this.attese.delete(m.id);
      }
      if (m.method === "Network.requestWillBeSent") this.richieste.push(m.params.request.url);
    });
  }
  cmd(method, params = {}) {
    const id = ++this.n;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res) => this.attese.set(id, res));
  }
  async js(expression) {
    const r = await this.cmd("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
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

async function nuovaScheda(url, mobile = false) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const info = await r.json();
  const p = new Pagina(info.webSocketDebuggerUrl, info.id);
  await p.pronta;
  await p.cmd("Runtime.enable");
  await p.cmd("Page.enable");
  await p.cmd("Network.enable");
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

// ---- Server di prova (dati temporanei con la demo) ----
console.log("Avvio server di prova...");
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot4-"));
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

fs.rmSync("/tmp/regia-shot4-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot4-chrome",
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
const rete = await (await fetch(`${BASE}/api/rete`)).json();

// ---- Mac: Home (chiaro e scuro) ----
const mac = await nuovaScheda(`${BASE}/`);
await attendi(2000);
await mac.scatta("01-home-chiaro");
await mac.tema("scuro");
await mac.scatta("02-home-scuro");
await mac.tema("chiaro");

// ---- Modifica (nota format in cima, una casella aperta) ----
await mac.js(
  `(() => { const c = [...document.querySelectorAll('div.vetro.tocco')].find(d => d.textContent.includes('Orient Express')); c?.click(); })()`,
);
await attendi(1200);
await mac.js(`(() => { const righe = [...document.querySelectorAll('.vetro > .cursor-pointer')]; righe[0]?.click(); })()`);
await attendi(500);
await mac.scatta("03-modifica-chiaro");
await mac.tema("scuro");
await attendi(500);
await mac.scatta("04-modifica-scuro");
await mac.tema("chiaro");

// ---- Live: foglio "Prima di iniziare", poi suono attivo + promemoria spuntato ----
await mac.click("Live");
await attendi(800);
await mac.scatta("05-foglio-prima-di-iniziare");
await mac.click("Ok, pronti");
await attendi(400);
await mac.clickCue("Treno in corsa");
await attendi(600);
await mac.clickCue("Chiudere le porte");
await attendi(800);
await mac.scatta("06-live-chiaro");
await mac.tema("scuro");
await attendi(600);
// dopo il reload la pagina è di nuovo il motore ma in silenzio: rimetti in moto
await mac.click("Live");
await attendi(400);
await mac.click("Ok, pronti");
await attendi(300);
await mac.clickCue("Treno in corsa");
await attendi(1000);
await mac.scatta("07-live-scuro");
await mac.click("STOP TUTTO");
await mac.tema("chiaro");
await mac.click("Live");
await attendi(300);
await mac.click("Ok, pronti");
await attendi(300);

// ---- Banner "presa del comando": una seconda finestra scalza la prima ----
const mac2 = await nuovaScheda(`${BASE}/`);
await attendi(1000);
await mac2.click("Prendi il controllo");
await attendi(500);
const banner = await mac.js(`document.body.innerText.includes('sta comandando')`);
console.log(banner ? "  ✓ Banner presa del comando visibile" : "  ⚠️ Banner non visibile");
await mac.scatta("08-banner-presa-comando");
await mac.click("Prendi il controllo");
await attendi(500);
await chiudiScheda(mac2);

// ---- Telecomando 390×844 (chiaro e scuro) ----
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
// chiudi i fogli (telefono e Mac)
await tel.click("Ok, pronti");
await mac.click("Ok, pronti");
await attendi(300);
await tel.clickCue("Treno in corsa");
await attendi(1000);
await tel.scatta("09-telecomando-live-chiaro");
await tel.tema("scuro");
await attendi(800);
await tel.click("Ok, pronti"); // il foglio ricompare dopo il ricaricamento
await attendi(300);
await tel.scatta("10-telecomando-live-scuro");
await tel.click("STOP TUTTO");
await attendi(300);

// ---- Controllo rete ----
const tutte = [...mac.richieste, ...tel.richieste];
const esterne = tutte.filter(
  (u) => !u.startsWith(BASE) && !u.startsWith(BASE.replace("http:", "ws:")) && !u.startsWith("data:"),
);
if (esterne.length > 0) {
  console.log("⚠️ RICHIESTE ESTERNE TROVATE:");
  for (const u of [...new Set(esterne)]) console.log("  ", u);
} else {
  console.log(`  ✓ Nessuna richiesta verso internet (${tutte.length} richieste, tutte locali)`);
}

await chiudiScheda(tel);
await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log("\nFatto: screenshot in " + CARTELLA);
process.exit(0);
