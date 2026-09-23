// Verifica end-to-end: avvia un SUO server su una porta di prova (dati
// temporanei, la Regia vera sulla 4000 non viene toccata), guida un Chrome
// headless sulla pagina Regia e osserva lo stato dal WebSocket come farebbe
// un telecomando vero.
// Uso: node scripts/verifica-e2e.mjs   (serve la build in dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORTA_TEST = 4999;
const BASE = `http://127.0.0.1:${PORTA_TEST}`;
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
function log(m) {
  console.log("  … " + m);
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
  /** Clicca la card di un cue cercando il titolo esatto (evita le note di fase). */
  clickCue(titolo) {
    const t = titolo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const card = [...document.querySelectorAll('[role=button]')].find(el => [...el.querySelectorAll('div')].some(d => d.textContent.trim() === '${t}')); if (card) { card.click(); return true; } return false; })()`,
    );
  }
  /** Clicca il primo bottone il cui testo contiene `testo`. */
  click(testo) {
    const t = testo.replace(/'/g, "\\'");
    return this.js(
      `(() => { const b = [...document.querySelectorAll('button, [role=button]')].find(b => b.textContent.trim().includes('${t}')); if (b) { b.click(); return true; } return false; })()`,
    );
  }
  async scatta(nome) {
    fs.mkdirSync("docs/screenshots/s6", { recursive: true });
    const r = await this.cmd("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`docs/screenshots/s6/${nome}.png`, Buffer.from(r.result.data, "base64"));
    console.log(`  📸 ${nome}.png`);
  }
  tasto(key, code, keyCode) {
    return this.cmd("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode }).then(() =>
      this.cmd("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode }),
    );
  }
  chiudi() {
    this.ws.close();
  }
}

/** Un WAV di prova della durata voluta (silenzio). */
function wavLungo(secondi) {
  const n = Math.round(44100 * secondi);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
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
    this.ws = new WebSocket(`ws://127.0.0.1:${PORTA_TEST}/ws`);
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
console.log(`Avvio un server di prova sulla porta ${PORTA_TEST} (dati temporanei)...`);
const datiTemp = fs.mkdtempSync(path.join(os.tmpdir(), "regia-e2e-"));
const server = spawn("npx", ["tsx", "server/src/index.ts"], {
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORTA_TEST), REGIA_DIR: datiTemp },
});
process.on("exit", () => {
  server.kill();
  fs.rmSync(datiTemp, { recursive: true, force: true });
});
{
  let pronto = false;
  for (let i = 0; i < 60 && !pronto; i++) {
    try {
      await fetch(`${BASE}/api/rete`);
      pronto = true;
    } catch {
      await attendi(300);
    }
  }
  if (!pronto) {
    console.log("Il server di prova non è partito.");
    process.exit(1);
  }
}

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
const homeOk = await regia.finoA(`document.body.innerText.includes('Demo — Orient Express')`);
homeOk ? ok("Home con il format demo") : ko("Home con il format demo");

// --- 2. Apri il format: vista Modifica con fasi e caselle ---
await regia.js(`(() => { const card = [...document.querySelectorAll('div.vetro.tocco')].find(d => d.textContent.includes('Demo — Orient Express')); if (card) { card.click(); return true; } return false; })()`);
const modificaOk = await regia.finoA(`${INPUT_CON("Accoglienza")} && ${INPUT_CON("Treno in corsa")}`);
modificaOk ? ok("Modifica: fasi e caselle della demo") : ko("Modifica: fasi e caselle");

// --- 3. Crea una casella, cambia titolo/tipo, verifica la persistenza ---
const cfgPrima = await (await fetch(`${BASE}/api/config`)).json();
const demo = cfgPrima.formats.find((f) => f.nome.includes("Orient Express"));
const fasiNormali = demo.fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine);
const fase1 = fasiNormali[0];
const nCasellePrima = fase1.cue.length;
await regia.js(
  `[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Casella')[1].click() /* [0] è la riga Sempre */`,
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

// --- 4b. Foglio "Prima di iniziare" e nota della fase ---
const foglioMac = await regia.finoA(`document.body.innerText.toLowerCase().includes('prima di iniziare')`);
foglioMac ? ok("Foglio 'Prima di iniziare' all'apertura del format") : ko("Foglio 'Prima di iniziare'");
await regia.click("Ok, pronti");
const foglioChiuso = await regia.finoA(`!document.body.innerText.toLowerCase().includes('ok, pronti')`);
foglioChiuso ? ok("'Ok, pronti' chiude il foglio") : ko("Chiusura foglio");
// icona per riaprirlo
await regia.js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === "Rileggi 'Prima di iniziare'"); if (b) b.click(); })()`);
const foglioRiaperto = await regia.finoA(`document.body.innerText.toLowerCase().includes('ok, pronti')`);
foglioRiaperto ? ok("Il foglio si riapre dall'icona") : ko("Riapertura foglio");
await regia.click("Ok, pronti");
await attendi(300);
// nota della fase: visibile, si chiude con un tocco, si riapre dall'icona
const notaVisibile = await regia.finoA(`document.body.innerText.includes('Gli ospiti si siedono')`);
notaVisibile ? ok("Nota della fase visibile in Live") : ko("Nota della fase");
await regia.click("Gli ospiti si siedono");
const notaChiusa = await regia.finoA(`!document.body.innerText.includes('Gli ospiti si siedono')`);
notaChiusa ? ok("La nota si chiude con un tocco") : ko("Chiusura nota fase");
await regia.js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Mostra la nota della fase'); if (b) b.click(); })()`);
const notaRiaperta = await regia.finoA(`document.body.innerText.includes('Gli ospiti si siedono')`);
notaRiaperta ? ok("...e si riapre dall'icona") : ko("Riapertura nota fase");
await regia.click("Gli ospiti si siedono");
await attendi(300);

// Sottofondo
const idTreno = fase1.cue.find((c) => c.titolo === "Treno in corsa").id;
await regia.clickCue("Treno in corsa");
let s = await osservatore.finoA((x) => x.attivi.some((a) => a.cueId === idTreno && !a.inPausa));
s ? ok("Il sottofondo suona (visto dal telecomando)") : ko("Play sottofondo");
await attendi(900);
s = osservatore.ultimo;
const posTreno1 = s?.attivi.find((a) => a.cueId === idTreno)?.posizioneSec ?? -1;
posTreno1 > 0 ? ok("La posizione avanza", `${posTreno1}s`) : ko("Posizione", `pos=${posTreno1}`);

// Effetto "abbassa": il sottofondo resta attivo, l'effetto si somma
await regia.clickCue("Campanello");
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
const fase2 = fasiNormali[1];
await regia.click(fase2.nome); // tab della fase 2
await attendi(300);
await regia.clickCue("Tensione");
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

// --- 5b. Sfuma/Ferma del singolo cue ---
osservatore.comando({ comando: "sfuma", cueId: idTreno });
s = await osservatore.finoA((x) => x.attivi.length === 0, 5000);
s ? ok("Comando 'sfuma' del singolo cue dal telecomando") : ko("Comando 'sfuma'");
await regia.clickCue("Treno in corsa");
await osservatore.finoA((x) => x.attivi.length > 0, 5000);
await regia.click("Sfuma");
s = await osservatore.finoA((x) => x.attivi.length === 0, 5000);
s ? ok("Bottone 'Sfuma' sulla card attiva") : ko("Bottone 'Sfuma'");
await regia.clickCue("Treno in corsa");
await osservatore.finoA((x) => x.attivi.length > 0, 5000);
await regia.js(`(() => { const b = [...document.querySelectorAll('button[aria-label="Ferma subito"]')][0]; if (b) { b.click(); return true; } return false; })()`);
s = await osservatore.finoA((x) => x.attivi.length === 0, 5000);
s ? ok("Bottone '■ Ferma subito' sulla card attiva") : ko("Bottone 'Ferma subito'");
await regia.clickCue("Treno in corsa");
await osservatore.finoA((x) => x.attivi.some((a) => a.cueId === idTreno), 5000);

// --- 6. STOP TUTTO e FADE OUT ---
await regia.click("STOP TUTTO");
s = await osservatore.finoA((x) => x.attivi.length === 0, 4000);
s ? ok("STOP TUTTO fa silenzio") : ko("STOP TUTTO");
await regia.click(fase1.nome);
await attendi(300);
await regia.clickCue("Treno in corsa");
await osservatore.finoA((x) => x.attivi.length > 0, 5000);
await regia.click("FADE OUT");
s = await osservatore.finoA((x) => x.attivi.length === 0, 5000);
s ? ok("FADE OUT sfuma e ferma tutto") : ko("FADE OUT");

// --- 7. Cambio fase condiviso ---
osservatore.comando({ comando: "fase", faseId: fase2.id });
s = await osservatore.finoA((x) => x.faseId === fase2.id, 4000);
s ? ok("La fase cambiata dal telefono cambia per tutti") : ko("Fase condivisa");

// --- 8. Seconda finestra Regia: si apre in sola lettura; "Prendi il controllo" scalza ---
const regia2 = await nuovaScheda(`${BASE}/format/${demo.id}`);
await attendi(800);
const bannerSeconda = await regia2.finoA(
  `document.body.innerText.includes("Un'altra finestra Regia sta comandando")`,
);
bannerSeconda ? ok("La finestra nuova si apre in sola lettura (banner)") : ko("Sola lettura sulla nuova");
const primaSenzaBanner = await regia.js(
  `!document.body.innerText.includes("Un'altra finestra Regia sta comandando")`,
);
primaSenzaBanner ? ok("...e la prima continua a comandare") : ko("La prima ha perso il comando!");
// La seconda scalza con "Prendi il controllo".
await regia2.click("Prendi il controllo");
const bannerPrima = await regia.finoA(
  `document.body.innerText.includes("Un'altra finestra Regia sta comandando")`,
);
bannerPrima ? ok("'Prendi il controllo' scalza la vecchia (banner sulla prima)") : ko("Scalzamento");
// La prima riprende.
await regia.click("Prendi il controllo");
const ripresa = await regia.finoA(
  `!document.body.innerText.includes("Un'altra finestra Regia sta comandando")`,
);
ripresa ? ok("...e può riprendere il comando allo stesso modo") : ko("Ripresa del comando");
await chiudiScheda(regia2);
await attendi(400);

// --- 9. Chiudi la Regia: il telecomando vede 'motore offline'; riaprila: torna online ---
await chiudiScheda(regia);
s = await osservatore.finoA((x) => x.motoreOnline === false, 5000);
s ? ok("Regia chiusa → telecomando avvisato (motoreOnline=false)") : ko("Avviso regia chiusa");
const regia3 = await nuovaScheda(`${BASE}/`);
s = await osservatore.finoA((x) => x.motoreOnline === true, 8000);
s ? ok("Regia riaperta → tutto torna online da solo") : ko("Ritorno online");

// --- 10. PIN sbagliato rifiutato ---
const rifiuto = await new Promise((res) => {
  const w = new WebSocket(`ws://127.0.0.1:${PORTA_TEST}/ws`);
  w.on("open", () => w.send(JSON.stringify({ ruolo: "telecomando", pin: "9999x" })));
  w.on("close", (code, reason) => res({ code, reason: String(reason) }));
  setTimeout(() => res(null), 3000);
});
rifiuto && rifiuto.code === 4001 && rifiuto.reason === "PIN errato"
  ? ok("PIN sbagliato → scollegato con 'PIN errato'")
  : ko("Rifiuto PIN", JSON.stringify(rifiuto));

// --- 11. Pagina telecomando nel browser: PIN e pulsanti ---
const tel = await nuovaScheda(`${BASE}/telecomando?prova`);
// Parte sempre dalla schermata PIN, anche se un giro precedente l'ha salvato.
await tel.finoA(`document.readyState === 'complete'`);
await tel.cmd("Page.enable");
await tel.js(`localStorage.removeItem('regia-pin')`);
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando?prova` });
await tel.finoA(`[...document.querySelectorAll('button')].some(b => b.getAttribute('aria-label') === '1')`);
for (const cifra of rete.pin) {
  await tel.js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '${cifra}'); if (b) b.click(); })()`);
  await attendi(80);
}
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
// il foglio "Prima di iniziare" compare anche sul telefono: chiudilo
const foglioTel = await tel.finoA(`document.body.innerText.toLowerCase().includes('prima di iniziare')`);
foglioTel ? ok("Foglio 'Prima di iniziare' anche sul telefono") : ko("Foglio sul telefono");
await tel.click("Ok, pronti");
await attendi(300);
// anche il Mac (regia3) ha aperto il format: chiudi il suo foglio
await regia3.click("Ok, pronti");
await attendi(300);

// --- Promemoria: spuntato dal telefono, visibile sul Mac ---
await tel.clickCue("Chiudere le porte");
s = await osservatore.finoA((x) => (x.fatti ?? []).length === 1, 5000);
s ? ok("Promemoria spuntato dal telefono (condiviso nello stato)") : ko("Spunta promemoria");
const spuntaSulMac = await regia3.finoA(
  `[...document.querySelectorAll('span')].some(el => el.textContent.trim() === 'fatto')`,
);
spuntaSulMac ? ok("...e la spunta si vede sul Mac") : ko("Spunta sul Mac");
// mai tra gli attivi
(osservatore.ultimo?.attivi ?? []).length === 0
  ? ok("Il promemoria non suona (nessun attivo)")
  : ko("Promemoria tra gli attivi!");

// premi un pulsante dal telefono → il motore (regia3) suona
await tel.clickCue("Treno in corsa");
s = await osservatore.finoA((x) => x.attivi.some((a) => a.titolo === "Treno in corsa"), 5000);
s ? ok("Pulsante premuto sul telefono → suona sul Mac") : ko("Play dal telefono");
await tel.click("STOP TUTTO");
await osservatore.finoA((x) => x.attivi.length === 0, 4000);

// --- S5-bis: blocco schermo simulato sul telefono ---
// 1) La connessione cade: compare "Ricollego…" e un tocco va in coda.
await tel.js(`window.__ws.simulaCaduta()`);
const ricollego = await tel.finoA(`document.body.innerText.includes('Ricollego')`, 3000);
ricollego ? ok("Connessione caduta → pillola 'Ricollego…'") : ko("Pillola Ricollego");
await tel.clickCue("Treno in corsa"); // tocco durante la riconnessione: in coda
s = await osservatore.finoA((x) => x.attivi.some((a) => a.titolo === "Treno in corsa"), 6000);
s ? ok("Tocco in coda spedito da solo appena ricollegati") : ko("Coda comandi");
const viaRicollego = await tel.finoA(`!document.body.innerText.includes('Ricollego')`, 5000);
viaRicollego ? ok("Ricollegato: pillola sparita, stato aggiornato") : ko("Fine ricollegamento");
await tel.clickCue("Treno in corsa"); // toggle: silenzio
await osservatore.finoA((x) => x.attivi.length === 0, 4000);

// 2) Ricarica completa (come dopo un blocco schermo lungo): il PIN resta,
//    il foglio "Prima di iniziare" NON ricompare (memoria con data).
await tel.cmd("Page.navigate", { url: `${BASE}/telecomando?prova` });
await attendi(1800);
const dentroSubito = await tel.finoA(`document.body.innerText.toLowerCase().includes('sta suonando')`, 6000);
dentroSubito ? ok("Dopo la ricarica il PIN resta: dentro senza richieste") : ko("PIN dopo ricarica");
const foglioNo = await tel.js(`!document.body.innerText.toLowerCase().includes('ok, pronti')`);
foglioNo ? ok("Il foglio non ricompare a ogni ricaricamento") : ko("Foglio ricomparso");
await tel.js(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === "Rileggi 'Prima di iniziare'"); if (b) b.click(); })()`);
const foglioRiaperto2 = await tel.finoA(`document.body.innerText.toLowerCase().includes('ok, pronti')`, 3000);
foglioRiaperto2 ? ok("...ma l'icona libro lo riapre") : ko("Riapertura dal libro");
await tel.click("Ok, pronti");
await attendi(300);

// ================= S6 =================
// --- Riga Sempre: assente da vuota, poi appare con una casella ---
await regia3.cmd("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
const senzaSempre = await regia3.js(`!document.body.innerText.includes('voce-sala')`);
senzaSempre ? ok("Riga Sempre vuota: non si vede") : ko("Riga Sempre fantasma");
await regia3.scatta("01-live-senza-sempre");
{
  const faseSempre = demo.fasi.find((f) => f.sempre) ??
    (await (await fetch(`${BASE}/api/config`)).json()).formats.find((f) => f.id === demo.id).fasi.find((f) => f.sempre);
  const fd = new FormData();
  fd.append("file", new Blob([wavLungo(30)]), "voce-sala.wav");
  const rr = await fetch(`${BASE}/api/fasi/${faseSempre.id}/audio-multipli`, { method: "POST", body: fd });
  rr.ok ? ok("Casella aggiunta alla riga Sempre (upload)") : ko("Upload nella riga Sempre");
}
await attendi(1200); // configCambiata → le pagine ricaricano
const conSempre = await regia3.finoA(`document.body.innerText.includes('voce-sala')`, 5000);
conSempre ? ok("Riga Sempre visibile in Live (Mac)") : ko("Riga Sempre non appare");
const sempreTel = await tel.finoA(`document.body.innerText.includes('voce-sala')`, 5000);
sempreTel ? ok("Striscia Sempre anche sul telefono") : ko("Sempre sul telefono");

// --- Tasto Q: parte la prima casella di Sempre ---
await regia3.tasto("q", "KeyQ", 81);
s = await osservatore.finoA((x) => x.attivi.some((a) => a.titolo === "voce-sala"), 5000);
s ? ok("Tasto Q → parte la prima casella di Sempre") : ko("Tasto Q");
await regia3.scatta("02-live-riga-sempre");
await tel.cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await attendi(400);
await tel.scatta("03-telecomando-riga-sempre");

// --- S8: sul telefono (390×844) con 3 caselle Sempre, scrollato in fondo,
//     l'ultima card della fase resta tutta sopra il dock (nessuna sovrapposizione).
{
  const faseSempre = (await (await fetch(`${BASE}/api/config`)).json()).formats.find((f) => f.id === demo.id).fasi.find((f) => f.sempre);
  const fd = new FormData();
  fd.append("file", new Blob([wavLungo(30)]), "sempre-2.wav");
  fd.append("file", new Blob([wavLungo(30)]), "sempre-3.wav");
  await fetch(`${BASE}/api/fasi/${faseSempre.id}/audio-multipli`, { method: "POST", body: fd });
  await attendi(1200);
  const trePillole = await tel.finoA(`document.querySelectorAll('[aria-label="Sempre"] button').length === 3`, 5000);
  trePillole ? ok("Telefono: 3 pillole nella riga Sempre") : ko("Pillole Sempre sul telefono");
  const c = await tel.js(`(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 120));
    const carte = [...document.querySelectorAll('.grid > [role=button]')];
    const ultima = carte.at(-1)?.getBoundingClientRect();
    const dock = document.querySelector('.fixed.bottom-0')?.getBoundingClientRect();
    if (!ultima || !dock) return null;
    return { ok: ultima.bottom <= dock.top, ultima: Math.round(ultima.bottom), dock: Math.round(dock.top) };
  })()`);
  c && c.ok
    ? ok("Telefono: l'ultima card della fase è tutta sopra il dock", `card finisce a ${c.ultima}px, dock inizia a ${c.dock}px`)
    : ko("Telefono: card sotto il dock", JSON.stringify(c));
  const pillole = await tel.js(`[...document.querySelectorAll('[aria-label="Sempre"] button')].map(b => Math.round(b.getBoundingClientRect().height))`);
  pillole.every((h) => h === 44) ? ok("Pillole Sempre alte 44px (tocco minimo)") : ko("Altezza pillole", pillole.join("/"));

  // S9 (c): card a riposo compatte (≤ 96 px) e nessuno spazio sprecato: sopra il
  // dock ne stanno tante quante la geometria permette (390×844, 1 riga Sempre).
  const compatte = await tel.js(`(async () => {
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 120));
    const dock = document.querySelector('.fixed.bottom-0').getBoundingClientRect();
    const cs = [...document.querySelectorAll('.grid > [role=button]')].map(c => c.getBoundingClientRect());
    const gap = cs.length > 1 ? Math.round(cs[1].top - cs[0].bottom) : 12;
    const massimo = Math.min(cs.length, Math.floor((dock.top - cs[0].top + gap) / (96 + gap)));
    return { altezze: cs.map(c => Math.round(c.height)), visibili: cs.filter(c => c.bottom <= dock.top).length, massimo, dock: Math.round(844 - dock.top) };
  })()`);
  compatte.altezze.every((h) => h <= 96)
    ? ok("Telefono: card a riposo alte ≤ 96px", compatte.altezze.join("/"))
    : ko("Telefono: card troppo alte", compatte.altezze.join("/"));
  compatte.visibili >= compatte.massimo
    ? ok("Telefono: sopra il dock stanno tutte le card che la geometria permette", `${compatte.visibili} (dock ${compatte.dock}px)`)
    : ko("Telefono: card visibili", `${compatte.visibili} < ${compatte.massimo}`);

  // S8-bis: pagina NON scrollata, la striscia Sempre sta dentro il vetro del dock
  // (quindi opaca): nessuna card "buca" la striscia. Al tocco, ogni punto lungo la
  // striscia risponde con un elemento del dock, mai con una card sotto.
  const st = await tel.js(`(async () => {
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 120));
    const striscia = document.querySelector('[aria-label="Sempre"]');
    const vetro = document.querySelector('.vetro-dock');
    if (!striscia || !vetro) return null;
    const s = striscia.getBoundingClientRect(), v = vetro.getBoundingClientRect();
    const dentro = s.top >= v.top - 1 && s.bottom <= v.bottom + 1 && s.left >= v.left - 1 && s.right <= v.right + 1;
    const carte = [...document.querySelectorAll('.grid > [role=button]')];
    let bucate = 0;
    for (const c of carte) {
      const r = c.getBoundingClientRect();
      if (r.bottom <= s.top || r.top >= s.bottom) continue;
      for (let i = 0; i < 12; i++) {
        const x = s.left + 4 + ((s.width - 8) * i) / 11, y = (s.top + s.bottom) / 2;
        const el = document.elementFromPoint(x, y);
        if (el && c.contains(el)) { bucate++; break; }
      }
    }
    return { dentro, bucate, carte: carte.length };
  })()`);
  st && st.dentro && st.bucate === 0
    ? ok("Telefono: striscia Sempre dentro il vetro del dock, nessuna card la buca", `${st.carte} card`)
    : ko("Telefono: striscia Sempre fuori dal vetro o bucata", JSON.stringify(st));
}

// --- Tempo rimanente: "finisce tra" che scorre ---
const t1 = await regia3.js(`(document.body.innerText.match(/finisce tra (\\d+:\\d+)/) || [])[1] ?? null`);
t1 ? ok("'finisce tra' visibile", t1) : ko("'finisce tra' assente");
await attendi(1500);
const t2 = await regia3.js(`(document.body.innerText.match(/finisce tra (\\d+:\\d+)/) || [])[1] ?? null`);
t2 && t1 !== t2 ? ok("Il conteggio scorre", `${t1} → ${t2}`) : ko("Conteggio fermo", `${t1} → ${t2}`);
// S9 (a): ripremere un effetto che suona lo FERMA, non lo raddoppia (tastiera e telefono).
await regia3.tasto("q", "KeyQ", 81);
s = await osservatore.finoA((x) => x.attivi.length === 0, 4000);
s ? ok("Tasto Q di nuovo → l'effetto si ferma, nessuna istanza") : ko("Effetto raddoppiato con Q", `attivi=${osservatore.ultimo?.attivi.length}`);
{
  const cfg2 = await (await fetch(`${BASE}/api/config`)).json();
  const vs = cfg2.formats.find((f) => f.id === demo.id).fasi.find((f) => f.sempre).cue.find((c) => c.titolo === "voce-sala");
  osservatore.comando({ comando: "play", cueId: vs.id });
  s = await osservatore.finoA((x) => x.attivi.some((a) => a.cueId === vs.id), 4000);
  osservatore.comando({ comando: "play", cueId: vs.id });
  s = await osservatore.finoA((x) => x.attivi.length === 0, 4000);
  s ? ok("Premi-premi dal telefono su un effetto → 0 istanze") : ko("Premi-premi effetto dal telefono", `attivi=${osservatore.ultimo?.attivi.length}`);
  const nonDoppio = !osservatore.stati.some((x) => x.attivi.filter((a) => a.cueId === vs.id).length > 1);
  nonDoppio ? ok("Mai due istanze dello stesso effetto nello stato") : ko("Viste due istanze dello stesso effetto");
}

// S9 (b): riga Sempre con 7 caselle di cui 3 in evidenza → 3 pillole + "Altri (4)";
//         il foglio si apre, un tocco su una voce la fa partire e chiude il foglio.
{
  const cfg3 = await (await fetch(`${BASE}/api/config`)).json();
  const faseSempre = cfg3.formats.find((f) => f.id === demo.id).fasi.find((f) => f.sempre);
  const fd = new FormData();
  for (const n of ["sempre-4", "sempre-5", "sempre-6", "sempre-7"]) fd.append("file", new Blob([wavLungo(30)]), `${n}.wav`);
  await fetch(`${BASE}/api/fasi/${faseSempre.id}/audio-multipli`, { method: "POST", body: fd });
  const cfg4 = await (await fetch(`${BASE}/api/config`)).json();
  const tutte = [...cfg4.formats.find((f) => f.id === demo.id).fasi.find((f) => f.sempre).cue].sort((a, b) => a.ordine - b.ordine);
  for (const c of tutte.slice(0, 3)) {
    await fetch(`${BASE}/api/cue/${c.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenza: true }) });
  }
  // Una quarta è ammessa, la quinta no; poi si torna a 3 in evidenza.
  const patch = (id, evidenza) =>
    fetch(`${BASE}/api/cue/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenza }) });
  const quarta = await patch(tutte[3].id, true);
  const quinta = await patch(tutte[6].id, true);
  await patch(tutte[3].id, false);
  await attendi(1500); // configCambiata → le pagine ricaricano
  const riga = await tel.finoA(
    `[...document.querySelectorAll('[aria-label="Sempre"] button:not([data-altri])')].length === 3 && (document.querySelector('[aria-label="Sempre"] button[data-altri]')?.textContent.trim() ?? '') === 'Altri (4)'`,
    5000,
  );
  riga ? ok("Telefono: 7 caselle Sempre, 3 in evidenza → 3 pillole + 'Altri (4)'") : ko("Riga Sempre con Altri", await tel.js(`document.querySelector('[aria-label="Sempre"]')?.innerText`));
  const rigaMac = await regia3.js(`(document.querySelector('[aria-label="Sempre"] button[data-altri]')?.textContent.trim() ?? '') === 'Altri (4)'`);
  rigaMac ? ok("Mac: stessa riga con 'Altri (4)'") : ko("Mac: Altri (4)");
  await tel.js(`document.querySelector('[aria-label="Sempre"] button[data-altri]').click()`);
  const foglio = await tel.finoA(`document.querySelector('[role="dialog"][aria-label="Altri suoni"]') !== null`, 3000);
  foglio ? ok("Telefono: il foglio 'Altri suoni' si apre") : ko("Foglio Altri");
  await tel.js(`[...document.querySelectorAll('[role="dialog"] button[title]')].find(b => b.title === 'sempre-5')?.click()`);
  s = await osservatore.finoA((x) => x.attivi.some((a) => a.titolo === "sempre-5"), 4000);
  const foglioChiuso = await tel.finoA(`document.querySelector('[role="dialog"]') === null`, 3000);
  s && foglioChiuso ? ok("Tocco su una voce di 'Altri': parte e il foglio si chiude") : ko("Voce di Altri", `suona=${!!s} chiuso=${foglioChiuso}`);
  const pallino = await tel.finoA(`document.querySelector('[aria-label="Sempre"] button[data-altri] span[aria-label]') !== null`, 3000);
  pallino ? ok("La pillola 'Altri' mostra il pallino mentre uno degli altri suona") : ko("Pallino su Altri");
  osservatore.comando({ comando: "stop", cueId: tutte[4].id });
  await osservatore.finoA((x) => x.attivi.length === 0, 4000);
  // dal lato API: la quinta in evidenza è rifiutata
  quarta.status === 200 && quinta.status === 400
    ? ok("API: la quarta 'in evidenza' passa, la quinta è rifiutata (Massimo 4)")
    : ko("API: limite in evidenza", `quarta=${quarta.status} quinta=${quinta.status}`);
}

// --- Ultimi 10 secondi: numero e barra in ambra (Tensione dura 8 s) ---
await regia3.click("Atto 1 – Omicidio");
await attendi(400);
await regia3.clickCue("Tensione");
const ambra = await regia3.finoA(
  `[...document.querySelectorAll('span')].some(el => el.className.includes('tipo-effetto') && el.textContent.includes('finisce tra'))`,
  4000,
);
ambra ? ok("Sotto i 10 secondi il conteggio diventa ambra") : ko("Niente ambra");
await regia3.scatta("04-finisce-tra-ambra");
await regia3.clickCue("Tensione"); // toggle: silenzio
await osservatore.finoA((x) => x.attivi.length === 0, 4000);

// --- PARLA ---
await regia3.click("PARLA");
s = await osservatore.finoA((x) => x.parla === true, 4000);
s ? ok("PARLA acceso dal Mac (condiviso nello stato)") : ko("PARLA on");
await regia3.scatta("05-parla-acceso");
await regia3.tasto("p", "KeyP", 80);
s = await osservatore.finoA((x) => x.parla !== true, 4000);
s ? ok("Tasto P lo spegne") : ko("PARLA off con P");
await tel.click("PARLA");
s = await osservatore.finoA((x) => x.parla === true, 4000);
s ? ok("PARLA acceso dal telefono") : ko("PARLA dal telefono");
await tel.click("PARLA");
await osservatore.finoA((x) => x.parla !== true, 4000);

// --- Diario di serata ---
{
  const giorni = await (await fetch(`${BASE}/api/diario`)).json();
  const oggi = giorni[0];
  oggi && oggi.suoni > 0 ? ok("Diario: la serata di oggi è registrata", `${oggi.suoni} suoni`) : ko("Diario vuoto");
  if (oggi) {
    const { eventi } = await (await fetch(`${BASE}/api/diario/${oggi.data}`)).json();
    const tipi2 = new Set(eventi.map((e) => e.tipo));
    ["suono partito", "suono fermato", "fase cambiata", "parla acceso", "promemoria fatto", "stop tutto"].every((t) => tipi2.has(t))
      ? ok("Diario: tutti i tipi di evento attesi", [...tipi2].join(", "))
      : ko("Diario: mancano eventi", [...tipi2].join(", "));
    const daTelefono = eventi.some((e) => e.origine.startsWith("telefono"));
    daTelefono ? ok("Diario: origine 'telefono' riconosciuta") : ko("Origine telefono assente");
    const csv = await (await fetch(`${BASE}/api/diario/${oggi.data}/csv`)).text();
    csv.startsWith("ora,tipo,cue,fase,format,origine") && csv.split("\n").length > 3
      ? ok("CSV della serata scaricato")
      : ko("CSV rotto");
  }
}
// la pagina /diario sul Mac
await regia3.js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Diario di serata'); b?.click(); })()`);
const diarioAperto = await regia3.finoA(`document.body.innerText.includes('Diario di serata')`, 4000);
diarioAperto ? ok("Pagina Diario raggiungibile dalla barra") : ko("Pagina Diario");
await regia3.js(`(() => { const c = [...document.querySelectorAll('button.vetro')].find(x => x.textContent.toLowerCase().includes('min')); c?.click(); })()`);
const cronologia = await regia3.finoA(`document.body.innerText.toLowerCase().includes('cronologia')`, 4000);
cronologia ? ok("Serata aperta: cronologia e tempo per fase") : ko("Dettaglio serata");
await regia3.scatta("06-diario");
// torna alla live per il freeze test
await regia3.cmd("Page.navigate", { url: `${BASE}/format/${demo.id}` });
await attendi(1500);
await regia3.click("Ok, pronti");
await attendi(300);

// --- Tab congelata: senza battito il comando passa all'altra finestra ---
await tel.click("STOP TUTTO");
await attendi(300);
const regia4 = await nuovaScheda(`${BASE}/?prova`);
await attendi(800); // regia4 nasce in sola lettura: scalza col pulsante
await regia4.click("Prendi il controllo");
const banner3 = await regia3.finoA(`document.body.innerText.includes('sta comandando')`);
banner3 ? ok("Il pulsante scalza (banner sull'altra finestra)") : ko("Banner pre-congelamento");
// Congelamento simulato: la pagina resta viva ma smette di parlare col server
// (come una tab congelata dal browser: socket aperto, battiti fermi).
await regia4.js(`window.__ws.invia = () => {}`);
log("Finestra ammutolita: aspetto il timeout del battito (~12 s)...");
const promossa = await regia3.finoA(`!document.body.innerText.includes('sta comandando')`, 25000);
promossa ? ok("Finestra congelata → l'altra viene promossa da sola") : ko("Promozione dopo congelamento");
if (!promossa) {
  console.log("  [debug] regia3:", (await regia3.js(`document.body.innerText.slice(0, 260)`)).replace(/\n/g, " | "));
  console.log("  [debug] osservatore ultimo:", JSON.stringify(osservatore.ultimo)?.slice(0, 200));
}
s = await osservatore.finoA((x) => x.motoreOnline === true, 5000);
s ? ok("...e il telecomando resta operativo") : ko("Telecomando dopo promozione");
await chiudiScheda(regia4);
await attendi(400);

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
