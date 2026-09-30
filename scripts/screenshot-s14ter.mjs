// Screenshot S14-ter: la barra di Live a 1280, 1440 e 1680 px col titolo del
// format "Demo — Orient Express" sempre leggibile per intero.
// Chrome headless → docs/screenshots/s14ter/
// Uso: node scripts/screenshot-s14ter.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4980;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9351;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s14ter";
fs.mkdirSync(CARTELLA, { recursive: true });

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
let problemi = 0;
const esito = (ok, testo) => {
  console.log(`  ${ok ? "✓" : "✗"} ${testo}`);
  if (!ok) problemi++;
};

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
    // Il pulsante principale del foglio "Prima di iniziare" cambia nome (Ok, pronti /
    // Salta il controllo / Vai lo stesso): lo si trova dal suo segno.
    if (testo === "Ok, pronti") return this.js(`(() => { const b = document.querySelector('[data-foglio-ok]'); if (b) { b.click(); return true; } return false; })()`);
    const t = testo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const b = [...document.querySelectorAll('button, [role=button]')].find(b => b.textContent.trim().includes('${t}')); if (b) { b.click(); return true; } return false; })()`,
    );
  }
  clickSel(selettore) {
    return this.js(`(() => { const b = document.querySelector('${selettore}'); if (b) { b.click(); return true; } return false; })()`);
  }
  larghezza(w) {
    return this.cmd("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 2, mobile: false });
  }
  async scatta(nome) {
    const r = await this.cmd("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${CARTELLA}/${nome}.png`, Buffer.from(r.result.data, "base64"));
    console.log(`  📸 ${nome}.png`);
  }
}

async function nuovaScheda(url) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const info = await r.json();
  const p = new Pagina(info.webSocketDebuggerUrl, info.id);
  await p.pronta;
  await p.cmd("Runtime.enable");
  await p.cmd("Page.enable");
  await p.larghezza(1440);
  return p;
}
async function chiudiScheda(p) {
  p.ws.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${p.id}`).catch(() => undefined);
}

// ---- Server di prova (dati temporanei con la demo) ----
console.log("Avvio server di prova...");
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot14ter-"));
const server = spawn("npx", ["tsx", "server/src/index.ts"], {
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORTA_TEST), REGIA_DIR: dati, REGIA_HUE_MDNS: "0" },
});
process.on("exit", () => {
  server.kill();
  try {
    fs.rmSync(dati, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    /* la cartella temporanea resta, non importa */
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
fs.rmSync("/tmp/regia-shot14ter-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, "--user-data-dir=/tmp/regia-shot14ter-chrome", "--no-first-run", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--window-size=1440,900", "about:blank"],
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

const mac = await nuovaScheda(`${BASE}/format/${demo.id}`);
await attendi(1500);
await mac.click("Live");
await attendi(500);
await mac.click("Ok, pronti");
await attendi(300);

const MISURA = `(() => { const i = document.querySelector('[data-titolo-format] input'); const et = (s) => { const e = document.querySelector(s + ' span:last-child'); return e && getComputedStyle(e).display !== 'none'; }; return { larghezza: Math.round(i.getBoundingClientRect().width), tagliato: i.scrollWidth > i.clientWidth, valore: i.value, etichette: { prova: et('[data-prova-tutti]'), blocca: et('[data-blocca]'), diario: et('[data-diario]'), impostazioni: et('[data-impostazioni]') } }; })()`;
for (const w of [1280, 1440, 1680]) {
  await mac.larghezza(w);
  await attendi(500);
  const m = await mac.js(MISURA);
  const attese = { 1280: "prova", 1440: "prova+blocca+diario", 1680: "prova+blocca+diario+impostazioni" }[w];
  const accese = Object.entries(m.etichette).filter(([, v]) => v).map(([k]) => k).join("+");
  esito(m.larghezza >= 180 && !m.tagliato && m.valore === demo.nome, `${w} px: titolo "${m.valore}" per intero (${m.larghezza} px)`);
  esito(accese === attese, `${w} px: etichette ${accese || "nessuna"} (attese: ${attese})`);
  await mac.scatta(`0${[1280, 1440, 1680].indexOf(w) + 1}-mac-live-barra-${w}`);
}

await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
