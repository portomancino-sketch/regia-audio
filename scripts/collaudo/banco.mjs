// Banco di prova del collaudo: server Regia su una porta di prova con dati
// temporanei (la Regia vera sulla 4000 e ~/Regia-dati non vengono toccate) e
// Chrome headless guidato da Playwright con clic e tasti VERI (mouse sulle
// coordinate: se qualcosa copre il pulsante, il clic fallisce come per Valerio).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Avvia il server di prova. `server: "dist"` usa il server impacchettato di una cartella pacchetto. */
export async function avviaServer({ porta, nodo, entry } = {}) {
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-collaudo-"));
  const env = { ...process.env, PORT: String(porta), REGIA_DIR: dati, REGIA_HUE_MDNS: "0" };
  const proc = entry
    ? spawn(nodo ?? process.execPath, [entry], { stdio: "ignore", env, cwd: path.resolve(path.dirname(entry), "../../..") })
    : spawn("npx", ["tsx", "server/src/index.ts"], { stdio: "ignore", env });
  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${base}/api/rete`);
      break;
    } catch {
      await attendi(200);
    }
  }
  return {
    base,
    dati,
    proc,
    stop() {
      proc.kill();
      try {
        fs.rmSync(dati, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* resta in tmp */
      }
    },
  };
}

export async function avviaBrowser() {
  return chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
}

/** Un contesto nuovo con viewport e raccolta degli errori di console e delle richieste esterne. */
export async function nuovaPagina(browser, { w = 1440, h = 900, mobile = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: mobile ? 3 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  page.erroriConsole = [];
  page.richiesteEsterne = [];
  page.on("console", (m) => {
    if (m.type() === "error") page.erroriConsole.push(m.text());
  });
  page.on("pageerror", (e) => page.erroriConsole.push(String(e)));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["127.0.0.1", "localhost"].includes(u.hostname) && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) {
      page.richiesteEsterne.push(r.url());
    }
  });
  return page;
}

/** Registro degli esiti (ok / ko) con stampa immediata. */
export function registro() {
  const voci = [];
  return {
    voci,
    ok(nome, dett = "") {
      voci.push({ nome, ok: true, dett });
      console.log(`  ✓ ${nome}${dett ? ` — ${dett}` : ""}`);
    },
    ko(nome, dett = "") {
      voci.push({ nome, ok: false, dett });
      console.log(`  ✗ ${nome}${dett ? ` — ${dett}` : ""}`);
    },
    verifica(cond, nome, dett = "") {
      (cond ? this.ok : this.ko).call(this, nome, dett);
      return cond;
    },
    /** Esegue un passo: un'eccezione (clic coperto, elemento assente) diventa un ✗. */
    async passo(nome, fn) {
      try {
        const r = await fn();
        if (r === false) this.ko(nome);
        else this.ok(nome, typeof r === "string" ? r : "");
      } catch (e) {
        const righe = String(e.message ?? e).split("\n");
        const coperto = righe.find((r) => r.includes("intercepts pointer events"));
        this.ko(nome, (righe[0] + (coperto ? " · " + coperto.replace(/\x1b\[[0-9;]*m/g, "").trim() : "")).slice(0, 400));
      }
    },
    get falliti() {
      return voci.filter((v) => !v.ok);
    },
  };
}

/** L'elemento in cima al punto centrale di `sel` è `sel` stesso (o un suo figlio)? */
export function inCima(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  }, sel);
}

/** Riempie la riga Sempre del format con `n` caselle vere (file presi dalla demo),
 *  le prime 4 in evidenza: il caso reale che faceva crescere il dock. */
export async function preparaSempre(base, formatId, n = 6) {
  const cfg = await (await fetch(`${base}/api/config`)).json();
  const f = cfg.formats.find((x) => x.id === formatId);
  const sempre = f.fasi.find((x) => x.sempre);
  const conFile = f.fasi.flatMap((x) => x.cue).filter((c) => c.file);
  const tipi = ["effetto", "sottofondo", "brano", "promemoria", "effetto", "effetto", "brano", "effetto"];
  for (let i = 0; i < n; i++) {
    const src = conFile[i % conFile.length];
    const tipo = tipi[i % tipi.length];
    const r = await fetch(`${base}/api/fasi/${sempre.id}/cue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titolo: `Sempre ${i + 1} ${["Applauso", "Tuono lungo", "Sigla", "Brindisi", "Porta", "Fischio", "Coro", "Gong"][i % 8]}`,
        nota: i % 2 ? "Quando entra il capotreno" : "",
        tipo,
        ...(tipo === "promemoria" ? {} : { file: src.file, fileOriginale: src.fileOriginale, durataSec: src.durataSec }),
      }),
    });
    const c = await r.json();
    if (i < 4) {
      await fetch(`${base}/api/cue/${c.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenza: true }) });
    }
  }
}
