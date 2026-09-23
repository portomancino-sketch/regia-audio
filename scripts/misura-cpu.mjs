// Misura la CPU del renderer di Chrome con la Live aperta e ferma.
// Uso: node scripts/misura-cpu.mjs   (avvia da solo server di prova e Chrome headless)
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA = 4995;
const CDP = 9337;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const dati = fs.mkdtempSync(path.join(os.tmpdir(), "regia-cpu-"));
const server = spawn("npx", ["tsx", "server/src/index.ts"], {
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORTA), REGIA_DIR: dati },
});
const pulizia = () => {
  try { server.kill(); } catch {}
  try { chrome.kill(); } catch {}
  try { fs.rmSync(dati, { recursive: true, force: true }); } catch {}
  try { fs.rmSync("/tmp/regia-cpu-chrome", { recursive: true, force: true }); } catch {}
};
process.on("exit", pulizia);

for (let i = 0; i < 60; i++) {
  try { await fetch(`http://127.0.0.1:${PORTA}/api/rete`); break; } catch { await attendi(300); }
}

fs.rmSync("/tmp/regia-cpu-chrome", { recursive: true, force: true });
// In headless le animazioni non producono frame (misura falsata a 0):
// serve una finestra vera. Con VISIBILE=0 resta headless.
const visibile = process.env.VISIBILE !== "0";
const chrome = spawn(CHROME, [
  ...(visibile ? ["--window-position=80,80"] : ["--headless=new"]),
  ...(process.env.FERMO === "1" ? ["--force-prefers-reduced-motion"] : []),
  `--remote-debugging-port=${CDP}`,
  "--user-data-dir=/tmp/regia-cpu-chrome", "--no-first-run", "--mute-audio",
  "--window-size=1440,900", `http://127.0.0.1:${PORTA}/`,
], { stdio: "ignore" });
for (let i = 0; i < 50; i++) {
  try { await fetch(`http://127.0.0.1:${CDP}/json/version`); break; } catch { await attendi(200); }
}
await attendi(2500);

// Vai in Live e chiudi il foglio.
const lista = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
const pagina = lista.find((t) => t.url.includes(String(PORTA)));
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((r) => ws.on("open", r));
let n = 0;
const attese = new Map();
ws.on("message", (d) => { const m = JSON.parse(d); if (m.id && attese.has(m.id)) { attese.get(m.id)(m); attese.delete(m.id); } });
const cmd = (method, params = {}) => { const id = ++n; ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => attese.set(id, r)); };
await cmd("Runtime.enable");
const js = async (e) => (await cmd("Runtime.evaluate", { expression: e, returnByValue: true })).result?.result?.value;
await js(`(()=>{const c=[...document.querySelectorAll('div.vetro.tocco')].find(d=>d.textContent.includes('Orient Express'));c?.click()})()`);
await attendi(800);
await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Live');b?.click()})()`);
await attendi(500);
await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Ok, pronti'));b?.click()})()`);
console.log("Live aperta, ferma. Misuro per ~12 s...");
await attendi(3000);

// I renderer sono discendenti del NOSTRO processo Chrome (non toccare quello dell'utente).
function processiNostri() {
  const righe = execSync("ps -ax -o pid,ppid,pcpu,command").toString().trim().split("\n").slice(1);
  const info = righe.map((r) => {
    const m = r.trim().match(/^(\d+)\s+(\d+)\s+([\d.,]+)\s+(.*)$/);
    return m ? { pid: +m[1], ppid: +m[2], cmd: m[4] } : null;
  }).filter(Boolean);
  const discendenti = new Set([chrome.pid]);
  let cresce = true;
  while (cresce) {
    cresce = false;
    for (const pr of info) {
      if (discendenti.has(pr.ppid) && !discendenti.has(pr.pid)) {
        discendenti.add(pr.pid);
        cresce = true;
      }
    }
  }
  return info.filter((pr) => discendenti.has(pr.pid));
}

// Lascia stabilizzare la pagina dopo l'avvio, poi misura il DELTA di tempo
// CPU dei renderer su 10 s: (cpu usata / tempo trascorso) = percentuale vera.
console.log("Attendo che si stabilizzi (12 s)...");
await attendi(12000);
function cputimeRenderer() {
  const nostri = new Set(processiNostri().filter((pr) => pr.cmd.includes("--type=renderer")).map((pr) => pr.pid));
  const righe = execSync("ps -ax -o pid,cputime").toString().trim().split("\n").slice(1);
  const mappa = new Map();
  for (const r of righe) {
    const m = r.trim().match(/^(\d+)\s+(\d+):(\d+)[.,](\d+)/);
    if (!m || !nostri.has(+m[1])) continue;
    mappa.set(+m[1], +m[2] * 60 + +m[3] + +m[4] / 100);
  }
  return mappa;
}
const prima = cputimeRenderer();
const t0 = Date.now();
await attendi(10000);
const dopo = cputimeRenderer();
const secondi = (Date.now() - t0) / 1000;
// Solo i renderer vivi in ENTRAMBE le letture (altrimenti il delta mente).
let delta = 0;
let comuni = 0;
for (const [pid, val] of dopo) {
  if (prima.has(pid)) {
    delta += val - prima.get(pid);
    comuni++;
  }
}
const percento = (delta / secondi) * 100;
console.log("Renderer misurati (stabili):", comuni);
const campioni = [percento];
ws.close();
console.log("Esito: CPU renderer", campioni[0].toFixed(1) + "% (soglia: 5%)");
process.exit(0);
