// Screenshot S14-bis: Home con la card Impostazioni; barra Live nuova (Mac largo
// 1440 e stretto 1100); Impostazioni con le 4 sezioni; Luci a vuoto col testo
// nuovo; luci simulate attive (pannello Luci nel dock e pallini); popover
// sole/luna ridotto. Chrome headless → docs/screenshots/s14bis/
// Uso: node scripts/screenshot-s14bis.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4983;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9348;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s14bis";
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
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot14bis-"));
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
fs.rmSync("/tmp/regia-shot14bis-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, "--user-data-dir=/tmp/regia-shot14bis-chrome", "--no-first-run", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--window-size=1440,900", "about:blank"],
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

// ---- Home con la card Impostazioni ----
const mac = await nuovaScheda(`${BASE}/`);
const home = await mac.finoA(`!!document.querySelector('[data-card-impostazioni]')`, 5000);
esito(home, "Home: card Impostazioni in fondo ai format");
await attendi(400);
await mac.scatta("01-mac-home-card-impostazioni");

// ---- Barra Live: larga e stretta ----
await mac.cmd("Page.navigate", { url: `${BASE}/format/${demo.id}` });
await attendi(1500);
await mac.click("Live");
await attendi(500);
await mac.click("Ok, pronti");
const barra = await mac.finoA(`!!document.querySelector('[data-serate]') && !!document.querySelector('[data-blocca]') && !!document.querySelector('[data-diario]') && !!document.querySelector('[data-impostazioni]')`, 4000);
esito(barra, "Live: barra con Serate, Prova tutti, Blocca, Diario, Impostazioni, Telecomando");
await attendi(300);
await mac.scatta("02-mac-live-barra-1440");
await mac.larghezza(1100);
await attendi(500);
const strette = await mac.js(`getComputedStyle(document.querySelector('[data-blocca] span:last-child')).display === 'none'`);
esito(strette, "Live a 1100 px: Prova tutti / Blocca / Diario tornano a icona");
await mac.scatta("03-mac-live-barra-1100");
await mac.larghezza(1440);
await attendi(300);

// ---- Popover sole/luna ridotto ----
await mac.clickSel("[data-tema-pulsante]");
await attendi(300);
const popover = await mac.js(`(() => { const t = document.querySelector('[data-tema-pulsante]')?.parentElement?.innerText ?? ''; const u = t.toLowerCase(); return u.includes('tema') && u.includes('intensità') && !u.includes('parlo') && !u.includes('luci'); })()`);
esito(popover, "Popover sole/luna: solo Tema e Intensità sfondo");
await mac.scatta("04-mac-popover-tema");
await mac.js(`document.body.click()`);
await attendi(200);

// ---- Impostazioni con le 4 sezioni, Luci a vuoto ----
await mac.clickSel("[data-impostazioni]");
const sezioni = await mac.finoA(`location.pathname === '/impostazioni' && document.querySelectorAll('[data-sezione-impostazioni]').length === 4`, 4000);
esito(sezioni, "Impostazioni: Serata, Luci, Aspetto, Dati");
await attendi(400);
await mac.scatta("05-mac-impostazioni");
await mac.js(`document.querySelector('[data-sezione-impostazioni="luci"]')?.scrollIntoView({ block: 'start' })`);
await attendi(300);
const aVuoto = await mac.js(`!!document.querySelector('[data-luci-a-vuoto]')`);
esito(aVuoto, "Luci a vuoto: testo sulla rete WiFi + 'Prova con luci simulate'");
await mac.scatta("06-mac-impostazioni-luci-a-vuoto");

// ---- Luci simulate attive: riquadro giallo, pallini, pannello Luci nel dock ----
await mac.clickSel("[data-luci-simulate]");
const simOn = await mac.finoA(`!!document.querySelector('[data-luci-simulate-attive]') && document.querySelectorAll('[data-pallino-simulato]').length === 6`, 8000);
esito(simOn, "Luci simulate accese: riquadro giallo e 6 pallini");
await mac.clickSel('[data-prova="luce2"]');
await attendi(900);
await mac.js(`document.querySelector('[data-pallini-simulate]')?.scrollIntoView({ block: 'end' })`);
await attendi(300);
await mac.scatta("07-mac-impostazioni-luci-simulate-pallini");
await attendi(3000);
await mac.cmd("Page.navigate", { url: `${BASE}/format/${demo.id}` });
await attendi(1500);
await mac.click("Live");
await attendi(400);
await mac.click("Ok, pronti");
const dock = await mac.finoA(`!!document.querySelector('[data-luci]')`, 20000);
esito(dock, "Live: pannello Luci nel dock con le luci simulate");
await mac.clickSel("[data-luci]");
await mac.finoA(`!!document.querySelector('[role="dialog"][aria-label="Luci"]')`, 3000);
await attendi(300);
await mac.scatta("08-mac-live-luci-simulate-pannello");
await mac.js(`document.querySelector('[role="dialog"] button[aria-label="Chiudi"]')?.click()`);
await fetch(`${BASE}/api/luci/simulate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attive: false }) });

await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
