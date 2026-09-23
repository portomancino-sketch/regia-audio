// Verifica MISURATA dello sfondo S4-bis: screenshot chiaro/scuro, campionamento
// dei colori in 5 punti (4 angoli + centro) e contrasto del testo sulle card.
// Uso: node scripts/verifica-sfondo.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4994;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
const CDP_PORT = 9338;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARTELLA = "docs/screenshots/s4quater";
fs.mkdirSync(CARTELLA, { recursive: true });
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

let esitoFinale = 0;
const ok = (n, d = "") => console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
const ko = (n, d = "") => {
  console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
  esitoFinale = 1;
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
    return r.result?.result?.value;
  }
  click(testo) {
    const t = testo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const b = [...document.querySelectorAll('button, [role=button]')].find(b => b.textContent.trim().includes('${t}')); if (b) { b.click(); return true; } return false; })()`,
    );
  }
  async tema(nome, intensita) {
    await this.js(`localStorage.setItem('tema-regia', '${nome}'); localStorage.setItem('tema-regia-intensita', '${intensita}')`);
    await this.cmd("Page.enable");
    await this.cmd("Page.reload");
    await attendi(1500);
  }
  async scatta(nome) {
    const r = await this.cmd("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${CARTELLA}/${nome}.png`, Buffer.from(r.result.data, "base64"));
    console.log(`  📸 ${nome}.png`);
    return r.result.data; // base64
  }
  /** Campiona i pixel dello screenshot (base64) alle coordinate CSS date. */
  async campiona(base64, punti) {
    return await this.js(`
      (async () => {
        const img = new Image();
        img.src = "data:image/png;base64,${base64}";
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const scala = img.width / innerWidth; // screenshot retina
        return ${JSON.stringify(punti)}.map(([x, y]) => {
          const d = g.getImageData(Math.round(x * scala), Math.round(y * scala), 1, 1).data;
          return [d[0], d[1], d[2]];
        });
      })()
    `);
  }
}

async function nuovaScheda(url) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const info = await r.json();
  const p = new Pagina(info.webSocketDebuggerUrl, info.id);
  await p.pronta;
  await p.cmd("Runtime.enable");
  await p.cmd("Page.enable");
  await p.cmd("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  return p;
}

function lum([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrasto(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ---- Server di prova + Chrome ----
console.log("Avvio server di prova...");
const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-sfondo-"));
const server = spawn("npx", ["tsx", "server/src/index.ts"], {
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORTA_TEST), REGIA_DIR: dati },
});
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-sfondo-chrome",
    "--no-first-run",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);
process.on("exit", () => {
  try { server.kill(); } catch {}
  try { chrome.kill(); } catch {}
  try { fs.rmSync(dati, { recursive: true, force: true }); } catch {}
  try { fs.rmSync("/tmp/regia-sfondo-chrome", { recursive: true, force: true }); } catch {}
});
for (let i = 0; i < 60; i++) {
  try { await fetch(`${BASE}/api/rete`); break; } catch { await attendi(300); }
}
for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); break; } catch { await attendi(200); }
}

const pagina = await nuovaScheda(`${BASE}/`);
await attendi(2000);

// 5 punti in coordinate CSS (1440×900): 4 angoli (dentro 40px) + centro.
const PUNTI = [
  [40, 40],
  [1400, 40],
  [40, 860],
  [1400, 860],
  [720, 450],
];

for (const tema of ["chiaro", "scuro"]) {
  for (const intensita of [55, 100]) {
    await pagina.tema(tema, intensita);
    const b64 = await pagina.scatta(`home-${tema}-${intensita}`);
    const pixel = await pagina.campiona(b64, PUNTI);
    console.log(
      `  colori (${tema}, intensità ${intensita}):`,
      pixel.map((p) => `rgb(${p.join(",")})`).join("  "),
    );
    // Contrasto del testo sulle card (criterio: ≥ 4.5).
    const card = await pagina.js(`
      (() => { const c = document.querySelector('div.vetro.tocco'); if (!c) return null;
        const r = c.getBoundingClientRect(); return [r.x + r.width * 0.6, r.y + r.height * 0.75]; })()
    `);
    if (card) {
      const [px] = await pagina.campiona(b64, [card]);
      const testo = tema === "chiaro" ? [17, 20, 24] : [242, 242, 243];
      const c = contrasto(testo, px);
      c >= 4.5
        ? ok(`contrasto testo su card (${tema}, ${intensita})`, c.toFixed(2))
        : ko(`contrasto testo su card (${tema}, ${intensita})`, c.toFixed(2));
    }
  }
}

console.log(esitoFinale === 0 ? "\nSfondo verificato." : "\nSFONDO NON CONFORME.");
process.exit(esitoFinale);
