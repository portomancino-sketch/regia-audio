// Verifica end-to-end: guida un Chrome headless sulla pagina Regia e
// osserva lo stato dal WebSocket come farebbe un telecomando vero.
// Uso: node scripts/verifica-e2e.mjs   (con il server già acceso sulla 4000)
import { spawn } from "node:child_process";
import WebSocket from "ws";

const BASE = "http://127.0.0.1:4000";
const CDP_PORT = 9333;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const esiti = [];
function ok(nome, dettaglio = "") {
  esiti.push({ nome, ok: true, dettaglio });
  console.log(`  ✓ ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
}
function ko(nome, dettaglio = "") {
  esiti.push({ nome, ok: false, dettaglio });
  console.log(`  ✗ ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
}
function attendi(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Piccolo client CDP ----
class Pagina {
  constructor(wsUrl, id) {
    this.id = id;
    this.ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
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
    const r = await this.cmd("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error("JS: " + (r.result.exceptionDetails.exception?.description ?? "errore"));
    }
    return r.result?.result?.value;
  }
  /** Aspetta finché l'espressione non diventa vera (max 10 s). */
  async finoA(expression, ms = 10000) {
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
  /** Clicca il primo bottone il cui testo contiene `testo`. */
  click(testo) {
    const t = testo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('${t}')); if (b) { b.click(); return true; } return false; })()`,
    );
  }
  chiudi() {
    this.ws.close();
  }
}

// Un input della pagina contiene questo valore? (i nomi stanno negli input)
const INPUT_CON = (testo) =>
  `[...document.querySelectorAll('input')].some(i => (i.value ?? '').includes('${testo.replace(/'/g, "\\'")}'))`;

async function nuovaScheda(url) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const info = await r.json();
  const p = new Pagina(info.webSocketDebuggerUrl, info.id);
  await p.pronta;
  await p.cmd("Runtime.enable");
  return p;
}

async function chiudiScheda(p) {
  p.chiudi();
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${p.id}`).catch(() => undefined);
}

// ---- Osservatore: si collega al WS come un telecomando ----
class Osservatore {
  constructor(pin) {
    this.stati = [];
    this.ws = new WebSocket("ws://127.0.0.1:4000/ws");
    this.ws.on("open", () => this.ws.send(JSON.stringify({ ruolo: "telecomando", pin })));
    this.ws.on("message", (d) => {
      const m = JSON.parse(String(d));
      if (m.tipo === "stato") this.stati.push(m);
    });
  }
  get ultimo() {
    return this.stati.at(-1) ?? null;
  }
  async finoA(pred, ms = 10000) {
    const inizio = Date.now();
    while (Date.now() - inizio < ms) {
      if (this.ultimo && pred(this.ultimo)) return this.ultimo;
      await attendi(150);
    }
    return null;
  }
  comando(c) {
    this.ws.send(JSON.stringify({ tipo: "comando", ...c }));
  }
  chiudi() {
    this.ws.close();
  }
}

// ================= LA VERIFICA =================
console.log("Avvio Chrome headless...");
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--user-data-dir=/tmp/regia-verifica-chrome",
    "--no-first-run",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
    "about:blank",
  ],
  { stdio: "ignore" },
);
process.on("exit", () => chrome.kill());

// Aspetta che il CDP risponda.
for (let i = 0; i < 50; i++) {
  try {
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    break;
  } catch {
    await attendi(200);
  }
}

const rete = await (await fetch(`${BASE}/api/rete`)).json();
console.log(`Server ok, PIN ${rete.pin}. Comincio.\n`);

// --- 1. La pagina Regia si apre e mostra il format demo ---
const regia = await nuovaScheda(`${BASE}/`);
const homeOk = await regia.finoA(INPUT_CON("Demo — Orient Express"));
homeOk ? ok("Home con il format demo") : ko("Home con il format demo");

// --- 2. Apri il format: vista Modifica con fasi e caselle ---
await regia.click("Apri");
const modificaOk = await regia.finoA(`${INPUT_CON("Accoglienza")} && ${INPUT_CON("Treno in corsa")}`);
modificaOk ? ok("Modifica: fasi e caselle della demo") : ko("Modifica: fasi e caselle");

// --- 3. Crea una casella, cambia titolo/tipo, verifica la persistenza ---
const cfgPrima = await (await fetch(`${BASE}/api/config`)).json();
const demo = cfgPrima.formats.find((f) => f.nome.includes("Orient Express"));
const fase1 = demo.fasi[0];
const nCasellePrima = fase1.cue.length;
await regia.js(
  `[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='+ Casella')[0].click()`,
);
const creata = await regia.finoA(INPUT_CON("Nuovo suono"));
creata ? ok("+ Casella crea un cue") : ko("+ Casella");
const cfgDopo = await (await fetch(`${BASE}/api/config`)).json();
const fase1Dopo = cfgDopo.formats.find((f) => f.id === demo.id).fasi.find((x) => x.id === fase1.id);
fase1Dopo.cue.length === nCasellePrima + 1
  ? ok("Il cue nuovo è salvato sul server")
  : ko("Salvataggio cue", `attese ${nCasellePrima + 1} caselle, trovate ${fase1Dopo.cue.length}`);
const cueNuovo = fase1Dopo.cue.at(-1);
await fetch(`${BASE}/api/cue/${cueNuovo.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ titolo: "Prova persistenza", tipo: "brano", volume: 0.4, sulSottofondo: "abbassa" }),
});
// Ricarica la pagina: deve esserci ancora tutto.
await regia.cmd("Page.enable");
await regia.cmd("Page.navigate", { url: `${BASE}/format/${demo.id}` });
const persiste = await regia.finoA(INPUT_CON("Prova persistenza"));
persiste ? ok("Dopo la ricarica tutto persiste") : ko("Persistenza dopo ricarica");
await fetch(`${BASE}/api/cue/${cueNuovo.id}`, { method: "DELETE" });

// --- 4. Live: parte il motore, l'osservatore WS vede lo stato ---
const osservatore = new Osservatore(rete.pin);
await attendi(500);
osservatore.ultimo
  ? ok("Il telecomando riceve subito lo stato", `motoreOnline=${osservatore.ultimo.motoreOnline}`)
  : ko("Stato iniziale al telecomando");

await regia.click("Live");
await attendi(400);

// Sottofondo
const idTreno = fase1.cue.find((c) => c.titolo === "Treno in corsa").id;
await regia.click("Treno in corsa");
let s = await osservatore.finoA((x) => x.attivi.some((a) => a.cueId === idTreno && !a.inPausa));
s ? ok("Il sottofondo suona (visto dal telecomando)") : ko("Play sottofondo");
await attendi(900);
s = osservatore.ultimo;
const posTreno1 = s?.attivi.find((a) => a.cueId === idTreno)?.posizioneSec ?? -1;
posTreno1 > 0 ? ok("La posizione avanza", `${posTreno1}s`) : ko("Posizione", `pos=${posTreno1}`);

// Effetto "abbassa": il sottofondo resta attivo, l'effetto si somma
await regia.click("Campanello");
s = await osservatore.finoA((x) => x.attivi.length === 2);
s ? ok("Effetto sovrapposto al sottofondo") : ko("Effetto sovrapposto");
s && !s.attivi.find((a) => a.cueId === idTreno)?.inPausa
  ? ok("Con 'abbassa' il sottofondo NON va in pausa")
  : ko("'abbassa' non deve mettere in pausa");
// aspetta la fine naturale del campanello (2 s)
s = await osservatore.finoA((x) => x.attivi.length === 1, 6000);
s ? ok("L'effetto finisce da solo e sparisce") : ko("Fine naturale effetto");

// Brano "pausa": il sottofondo va in pausa e poi riprende dalla posizione
const posPrimaDelBrano = osservatore.ultimo.attivi.find((a) => a.cueId === idTreno)?.posizioneSec ?? -1;
const fase2 = demo.fasi[1];
await regia.click(fase2.nome); // tab della fase 2
await attendi(300);
await regia.click("Tensione");
s = await osservatore.finoA((x) => x.attivi.find((a) => a.cueId === idTreno)?.inPausa === true);
s ? ok("Brano 'si ferma': il sottofondo è in pausa") : ko("Sottofondo in pausa col brano");
// il brano Tensione dura 8 s: aspetta che finisca e che il treno riprenda
s = await osservatore.finoA(
  (x) => x.attivi.length === 1 && x.attivi[0].cueId === idTreno && !x.attivi[0].inPausa,
  15000,
);
if (s) {
  const posRipresa = s.attivi[0].posizioneSec;
  ok("Il sottofondo riprende da solo dopo il brano");
  Math.abs(posRipresa - posPrimaDelBrano) < 2.5
    ? ok("...dalla stessa posizione", `${posPrimaDelBrano}s → ${posRipresa}s`)
    : ko("Posizione di ripresa", `${posPrimaDelBrano}s → ${posRipresa}s`);
} else {
  ko("Ripresa del sottofondo dopo il brano");
}

// --- 5. Comando dal telecomando: play di un cue via WS ---
osservatore.comando({ comando: "play", cueId: idTreno }); // toggle: lo ferma
s = await osservatore.finoA((x) => x.attivi.length === 0, 5000);
s ? ok("Comando dal telecomando eseguito dal motore (toggle stop)") : ko("Comando play dal telecomando");
osservatore.comando({ comando: "play", cueId: idTreno });
s = await osservatore.finoA((x) => x.attivi.some((a) => a.cueId === idTreno), 5000);
s ? ok("Play dal telecomando: il Mac suona") : ko("Play dal telecomando");

// --- 6. STOP TUTTO e FADE OUT ---
await regia.click("STOP TUTTO");
s = await osservatore.finoA((x) => x.attivi.length === 0, 4000);
s ? ok("STOP TUTTO fa silenzio") : ko("STOP TUTTO");
await regia.click(fase1.nome);
await attendi(300);
await regia.click("Treno in corsa");
await osservatore.finoA((x) => x.attivi.length > 0, 5000);
await regia.click("FADE OUT");
s = await osservatore.finoA((x) => x.attivi.length === 0, 5000);
s ? ok("FADE OUT sfuma e ferma tutto") : ko("FADE OUT");

// --- 7. Cambio fase condiviso ---
osservatore.comando({ comando: "fase", faseId: fase2.id });
s = await osservatore.finoA((x) => x.faseId === fase2.id, 4000);
s ? ok("La fase cambiata dal telefono cambia per tutti") : ko("Fase condivisa");

// --- 8. Seconda finestra Regia: banner e nessun doppio motore ---
const regia2 = await nuovaScheda(`${BASE}/format/${demo.id}`);
const banner = await regia2.finoA(
  `document.body.innerText.includes("Un'altra finestra Regia è già attiva")`,
);
banner ? ok("Seconda finestra Regia: banner 'già attiva'") : ko("Banner seconda finestra");
await chiudiScheda(regia2);

// --- 9. Chiudi la Regia: il telecomando vede 'motore offline'; riaprila: torna online ---
await chiudiScheda(regia);
s = await osservatore.finoA((x) => x.motoreOnline === false, 5000);
s ? ok("Regia chiusa → telecomando avvisato (motoreOnline=false)") : ko("Avviso regia chiusa");
const regia3 = await nuovaScheda(`${BASE}/`);
s = await osservatore.finoA((x) => x.motoreOnline === true, 8000);
s ? ok("Regia riaperta → tutto torna online da solo") : ko("Ritorno online");

// --- 10. PIN sbagliato rifiutato ---
const rifiuto = await new Promise((res) => {
  const w = new WebSocket("ws://127.0.0.1:4000/ws");
  w.on("open", () => w.send(JSON.stringify({ ruolo: "telecomando", pin: "9999x" })));
  w.on("close", (code, reason) => res({ code, reason: String(reason) }));
  setTimeout(() => res(null), 3000);
});
rifiuto && rifiuto.code === 4001 && rifiuto.reason === "PIN errato"
  ? ok("PIN sbagliato → scollegato con 'PIN errato'")
  : ko("Rifiuto PIN", JSON.stringify(rifiuto));

// --- 11. Pagina telecomando nel browser: PIN e pulsanti ---
const tel = await nuovaScheda(`${BASE}/telecomando`);
// Parte sempre dalla schermata PIN, anche se un giro precedente l'ha salvato.
await tel.finoA(`document.readyState === 'complete'`);
await tel.cmd("Page.enable");
await tel.js(`localStorage.removeItem('regia-pin')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando` });
await tel.finoA(`document.querySelector('input[type="text"]') !== null`);
await tel.js(`
  (() => {
    const el = document.querySelector('input[type="text"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '${rete.pin}');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()
`);
await attendi(200);
await tel.click("Entra");
const telePronto = await tel.finoA(
  `document.body.innerText.includes('Scegli la serata') || document.body.innerText.toLowerCase().includes('sta suonando')`,
);
telePronto ? ok("Telecomando: PIN accettato, pagina Live") : ko("Telecomando: accesso");
// scegli il format (doppio tocco = conferma)
await tel.click("Demo — Orient Express");
await attendi(200);
await tel.click("Confermi");
const teleFormat = await tel.finoA(`document.body.innerText.toLowerCase().includes('sta suonando')`);
teleFormat ? ok("Telecomando: format scelto con conferma") : ko("Telecomando: scelta format");
// premi un pulsante dal telefono → il motore (regia3) suona
await tel.click("Treno in corsa");
s = await osservatore.finoA((x) => x.attivi.some((a) => a.titolo === "Treno in corsa"), 5000);
s ? ok("Pulsante premuto sul telefono → suona sul Mac") : ko("Play dal telefono");
await tel.click("STOP TUTTO");
await osservatore.finoA((x) => x.attivi.length === 0, 4000);

// --- Fine ---
await chiudiScheda(tel);
await chiudiScheda(regia3);
osservatore.chiudi();
chrome.kill();

const falliti = esiti.filter((e) => !e.ok);
console.log(`\n${esiti.length - falliti.length}/${esiti.length} verifiche passate.`);
if (falliti.length > 0) {
  console.log("FALLITE:");
  for (const f of falliti) console.log(`  - ${f.nome} ${f.dettaglio}`);
  process.exit(1);
}
process.exit(0);
