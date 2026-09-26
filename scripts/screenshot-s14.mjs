// Screenshot S14: foglio "Prima di iniziare" col soundcheck rosso e verde (Mac e
// telefono), finestra "Non hai ancora provato", "Chiudi serata" con conferma e
// riepilogo, Diario con due serate nello stesso giorno.
// Chrome headless → docs/screenshots/s14/
// Uso: node scripts/screenshot-s14.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4984;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9347;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s14";
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
  clickCue(titolo) {
    const t = titolo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const card = [...document.querySelectorAll('[role=button]')].find(el => [...el.querySelectorAll('div')].some(d => d.textContent.trim() === '${t}')); if (card) { card.click(); return true; } return false; })()`,
    );
  }
  clickSel(selettore) {
    return this.js(`(() => { const b = document.querySelector('${selettore}'); if (b) { b.click(); return true; } return false; })()`);
  }
  rileggi() {
    return this.js(`[...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === "Rileggi 'Prima di iniziare'")?.click()`);
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
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-shot14-"));
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

fs.rmSync("/tmp/regia-shot14-chrome", { recursive: true, force: true });
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-shot14-chrome",
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
const fasi = demo.fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine);
const rete = await (await fetch(`${BASE}/api/rete`)).json();

// ---- Mac: Live, foglio rosso ----
const mac = await nuovaScheda(`${BASE}/format/${demo.id}`);
await attendi(1500);
await mac.click("Live");
const foglioRosso = await mac.finoA(`document.querySelector('[role="dialog"][aria-label="Prima di iniziare"] [data-soundcheck-stato]')?.getAttribute('data-soundcheck-stato') === 'nonFatto'`, 5000);
esito(foglioRosso, "Mac: foglio 'Prima di iniziare' con 'Soundcheck di oggi: NON FATTO'");
await attendi(400);
await mac.scatta("01-mac-foglio-soundcheck-non-fatto");
await mac.click("Ok, pronti");
await attendi(300);

// ---- Telefono: PIN, foglio rosso ----
const tel = await nuovaScheda(`${BASE}/telecomando`, true);
await tel.js(`localStorage.removeItem('regia-pin'); localStorage.removeItem('foglio-visto')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando` });
await attendi(1500);
for (const cifra of rete.pin) {
  await tel.js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '${cifra}'); b?.click(); })()`);
  await attendi(80);
}
await tel.click("Entra");
await attendi(1200);
if (await tel.js(`document.body.innerText.includes('Scegli la serata')`)) {
  await tel.click(demo.nome);
  await attendi(250);
  await tel.click("Confermi");
  await attendi(800);
}
await mac.click("Ok, pronti");
const foglioTel = await tel.finoA(`document.querySelector('[role="dialog"][aria-label="Prima di iniziare"] [data-soundcheck-stato]')?.getAttribute('data-soundcheck-stato') === 'nonFatto' && document.body.innerText.includes('Fallo dal Mac')`, 6000);
esito(foglioTel, "Telefono: foglio rosso 'NON FATTO · Fallo dal Mac'");
await attendi(300);
await tel.scatta("02-telefono-foglio-soundcheck-non-fatto");
await tel.click("Ok, pronti");
await attendi(300);
const pallinoTel = await tel.finoA(`!!document.querySelector('[data-pallino-soundcheck]')`, 3000);
esito(pallinoTel, "Telefono: pallino rosso sotto il nome della fase");
await tel.scatta("03-telefono-live-pallino-soundcheck");

// ---- Mac: primo suono senza soundcheck → finestra ----
await mac.clickCue("Treno in corsa");
const avviso = await mac.finoA(`!!document.querySelector('[role="dialog"][aria-label="Soundcheck non fatto"]')`, 4000);
esito(avviso, "Mac: 'Non hai ancora provato i suoni di oggi.' al primo suono");
await attendi(400);
await mac.scatta("04-mac-avviso-non-hai-provato");
await mac.clickSel("[data-avviso-avanti]");
await attendi(300);
await mac.click("STOP TUTTO");
await attendi(300);

// ---- Mac: "Prova tutti" completo → foglio verde (Mac e telefono) ----
await mac.click("Prova tutti");
console.log("  … giro completo del soundcheck (tutte le caselle, 3 s l'una)");
const esitoSc = await mac.finoA(`!!document.querySelector('[role="dialog"][aria-label="Esito soundcheck"]')`, 90000);
esito(esitoSc, "Mac: soundcheck completo, esito");
await mac.js(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'Chiudi')?.click()`);
await attendi(300);
if (await mac.js(`document.body.innerText.includes('Vuoi bloccare le modifiche')`)) await mac.click("No");
await mac.rileggi();
const foglioVerde = await mac.finoA(`document.querySelector('[role="dialog"][aria-label="Prima di iniziare"] [data-soundcheck-stato]')?.getAttribute('data-soundcheck-stato') === 'ok'`, 5000);
esito(foglioVerde, "Mac: foglio verde 'Soundcheck fatto alle … · tutto ok'");
await attendi(300);
await mac.scatta("05-mac-foglio-soundcheck-fatto");
await mac.click("Ok, pronti");
await tel.rileggi();
const foglioVerdeTel = await tel.finoA(`document.querySelector('[role="dialog"][aria-label="Prima di iniziare"] [data-soundcheck-stato]')?.getAttribute('data-soundcheck-stato') === 'ok'`, 6000);
esito(foglioVerdeTel, "Telefono: foglio verde");
await attendi(300);
await tel.scatta("06-telefono-foglio-soundcheck-fatto");
await tel.click("Ok, pronti");
await attendi(300);

// ---- Mac: un po' di serata, poi "Chiudi serata" ----
await mac.clickCue("Treno in corsa");
await attendi(600);
await mac.clickCue("Campanello");
await attendi(2500);
await mac.click(fasi[1].nome);
await attendi(400);
await mac.clickCue("Tensione");
await attendi(1500);
await mac.clickSel("[data-chiudi-serata]");
const conferma = await mac.finoA(`!!document.querySelector('[role="dialog"][aria-label="Chiudere la serata?"]')`, 3000);
esito(conferma, "Mac: 'Chiudere la serata di oggi?'");
await attendi(300);
await mac.scatta("07-mac-chiudi-serata-conferma");
await mac.clickSel("[data-chiusura-conferma]");
const riepilogo = await mac.finoA(`!!document.querySelector('[role="dialog"][aria-label="Riepilogo della serata"]')`, 6000);
esito(riepilogo, "Mac: riepilogo della serata dopo la chiusura");
await attendi(500);
await mac.scatta("08-mac-riepilogo-serata");
await mac.clickSel("[data-riepilogo-chiudi]");
await attendi(400);

// ---- Seconda serata dello stesso giorno, chiusa anche lei ----
await tel.finoA(`!!document.querySelector('[role="dialog"][aria-label="Prima di iniziare"]')`, 8000);
await tel.click("Ok, pronti");
await mac.click(fasi[0].nome);
await attendi(300);
await mac.clickCue("Treno in corsa");
await mac.finoA(`!!document.querySelector('[role="dialog"][aria-label="Soundcheck non fatto"]')`, 4000);
await mac.clickSel("[data-avviso-avanti]");
await attendi(1500);
await mac.clickSel("[data-chiudi-serata]");
await mac.finoA(`!!document.querySelector('[data-chiusura-conferma]')`, 2000);
await mac.clickSel("[data-chiusura-conferma]");
await mac.finoA(`!!document.querySelector('[data-riepilogo-chiudi]')`, 6000);
await mac.clickSel("[data-riepilogo-chiudi]");
await attendi(300);

// ---- Diario: due serate nello stesso giorno ----
await mac.js(`[...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Diario di serata')?.click()`);
const righe = await (await fetch(`${BASE}/api/diario`)).json();
const dueRighe = await mac.finoA(`document.querySelectorAll('[data-serata^="${righe[0].data}#"]').length === 2 && document.body.innerText.includes('2ª serata')`, 5000);
esito(dueRighe, "Diario: due righe per oggi (1ª e 2ª serata)");
await attendi(400);
await mac.scatta("09-mac-diario-due-serate");
await mac.js(`document.querySelector('[data-serata="${righe[0].data}#0"]')?.click()`);
const dettaglio = await mac.finoA(`document.body.innerText.toLowerCase().includes('cronologia') && (document.querySelector('[data-riepilogo-soundcheck]')?.innerText ?? '').includes('fatto alle')`, 5000);
esito(dettaglio, "Diario: la 1ª serata col riepilogo e la riga Soundcheck");
await attendi(400);
await mac.scatta("10-mac-diario-prima-serata");

await chiudiScheda(tel);
await chiudiScheda(mac);
chrome.kill();
server.kill();
console.log(`\n${problemi === 0 ? "Fatto" : `ATTENZIONE: ${problemi} problemi`}: screenshot in ${CARTELLA}`);
process.exit(problemi === 0 ? 0 : 1);
