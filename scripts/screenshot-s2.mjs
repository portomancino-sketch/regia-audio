// Screenshot delle schermate S2 con Chrome headless → docs/screenshots/s2/
// Uso: node scripts/screenshot-s2.mjs   (con il server acceso sulla 4000)
import { spawn } from "node:child_process";
import fs from "node:fs";
import WebSocket from "ws";

const BASE = "http://127.0.0.1:4000";
const CDP_PORT = 9334;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s2";
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
      `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('${t}')); if (b) { b.click(); return true; } return false; })()`,
    );
  }
  async scatta(nome) {
    const r = await this.cmd("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${CARTELLA}/${nome}.png`, Buffer.from(r.result.data, "base64"));
    console.log(`  📸 ${nome}.png`);
  }
}

function lancia(flags = []) {
  return spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--user-data-dir=/tmp/regia-shot-chrome",
      "--no-first-run",
      "--mute-audio",
      "--window-size=1440,900",
      ...flags,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
}

async function aspettaCdp() {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return;
    } catch {
      await attendi(200);
    }
  }
  throw new Error("CDP non risponde");
}

async function nuovaScheda(url) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const info = await r.json();
  const p = new Pagina(info.webSocketDebuggerUrl, info.id);
  await p.pronta;
  await p.cmd("Runtime.enable");
  await p.cmd("Page.enable");
  await p.cmd("Network.enable");
  await p.cmd("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  return p;
}

async function chiudiScheda(p) {
  p.ws.close();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${p.id}`).catch(() => undefined);
}

const cfg = await (await fetch(`${BASE}/api/config`)).json();
const demo = cfg.formats.find((f) => f.nome.includes("Orient Express")) ?? cfg.formats[0];
const rete = await (await fetch(`${BASE}/api/rete`)).json();

// ---- Giro 1: audio consentito (per Live con suono attivo) ----
fs.rmSync("/tmp/regia-shot-chrome", { recursive: true, force: true });
let chrome = lancia(["--autoplay-policy=no-user-gesture-required"]);
await aspettaCdp();

// Home
const mac = await nuovaScheda(`${BASE}/`);
await attendi(2000);
await mac.scatta("01-home");

// Modifica (con una casella aperta per mostrare i controlli)
await mac.js(
  `(() => { const c = [...document.querySelectorAll('div.vetro.tocco')].find(d => d.textContent.includes('${demo.nome.replace(/'/g, "\\'")}')); c?.click(); })()`,
);
await attendi(1200);
await mac.js(
  `(() => { const casella = [...document.querySelectorAll('.vetro')].find(v => v.textContent.includes('Treno in corsa') && v.querySelector('input')); casella?.querySelector('.cursor-pointer')?.click?.(); })()`,
);
// apre la prima casella cliccando la riga compatta
await mac.js(
  `(() => { const righe = [...document.querySelectorAll('.vetro > .cursor-pointer')]; righe[0]?.click(); })()`,
);
await attendi(600);
await mac.scatta("02-modifica");

// Live con un suono attivo
await mac.click("Live");
await attendi(600);
await mac.click("Treno in corsa");
await attendi(1500);
await mac.scatta("03-live-attivo");

// Pannello Telecomando
await mac.click("Telecomando");
await attendi(1200);
await mac.scatta("04-pannello-telecomando");
await mac.click("Telecomando"); // richiudi
await mac.click("STOP TUTTO");
await attendi(400);

// ---- Telecomando (viewport 390×844) ----
const tel = await nuovaScheda(`${BASE}/telecomando`);
await tel.cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await tel.js(`localStorage.removeItem('regia-pin')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando` });
await attendi(1500);
await tel.scatta("05-telecomando-pin");
for (const cifra of rete.pin) {
  await tel.js(
    `(() => { const b = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '${cifra}'); b?.click(); })()`,
  );
  await attendi(80);
}
await tel.click("Entra");
await attendi(1000);
// se chiede il format, sceglilo (doppio tocco = conferma)
if (await tel.js(`document.body.innerText.includes('Scegli la serata')`)) {
  await tel.click(demo.nome);
  await attendi(250);
  await tel.click("Confermi");
  await attendi(800);
}
// fai suonare qualcosa per mostrare lo stato attivo
await tel.click("Treno in corsa");
await attendi(1200);
await tel.scatta("06-telecomando-live");
await tel.click("STOP TUTTO");
await attendi(400);

// ---- Controllo rete: nessuna richiesta verso internet ----
const tutte = [...mac.richieste, ...tel.richieste];
const esterne = tutte.filter((u) => !u.startsWith("http://127.0.0.1:4000") && !u.startsWith("ws://127.0.0.1:4000") && !u.startsWith("data:"));
if (esterne.length > 0) {
  console.log("⚠️ RICHIESTE ESTERNE TROVATE:");
  for (const u of [...new Set(esterne)]) console.log("  ", u);
} else {
  console.log(`  ✓ Nessuna richiesta verso internet (${tutte.length} richieste, tutte locali)`);
}

await chiudiScheda(tel);
await chiudiScheda(mac);
chrome.kill();
await attendi(600);

// ---- Giro 2: senza autoplay → overlay "Attiva audio" ----
fs.rmSync("/tmp/regia-shot-chrome", { recursive: true, force: true });
chrome = lancia(["--autoplay-policy=user-gesture-required"]);
await aspettaCdp();
// In headless l'audio è sempre "sbloccato" e un'altra finestra Regia aperta
// terrebbe il ruolo di motore: per fotografare l'overlay si ricreano le
// condizioni vere del primo avvio su un Mac (contesto audio sospeso, questa
// finestra è il motore). Solo per lo screenshot, la UI è quella reale.
const overlay = await nuovaScheda("about:blank");
await overlay.cmd("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    Object.defineProperty(BaseAudioContext.prototype, "state", { get: () => "suspended" });
    const od = Object.getOwnPropertyDescriptor(WebSocket.prototype, "onmessage");
    Object.defineProperty(WebSocket.prototype, "onmessage", {
      get() { return od.get.call(this); },
      set(fn) {
        od.set.call(this, (ev) => {
          try {
            const m = JSON.parse(ev.data);
            if (m.tipo === "ruoloAssegnato") {
              return fn(new MessageEvent("message", { data: JSON.stringify({ ...m, motore: true }) }));
            }
          } catch {}
          fn(ev);
        });
      },
    });
  `,
});
await overlay.cmd("Page.navigate", { url: `${BASE}/` });
let cOverlay = false;
for (let i = 0; i < 30 && !cOverlay; i++) {
  cOverlay = await overlay.js(`document.body.innerText.includes('Attiva audio')`);
  if (!cOverlay) await attendi(300);
}
console.log(cOverlay ? "  ✓ Overlay 'Attiva audio' presente" : "  ⚠️ Overlay non visibile");
await overlay.scatta("07-attiva-audio");
await chiudiScheda(overlay);
chrome.kill();

console.log("\nFatto: screenshot in " + CARTELLA);
process.exit(0);
