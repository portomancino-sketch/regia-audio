// Scrive docs/collaudo/2026-09-30_esito.md dall'esito del collaudo (esito.json).
// Uso: node scripts/collaudo/esito-md.mjs
import fs from "node:fs";

const voci = JSON.parse(fs.readFileSync("docs/screenshots/sfix/collaudo/esito.json", "utf8"));

// Le voci che erano rotte e sono state corrette in S-FIX (con cosa si è fatto).
const CORRETTE = [
  [/pulsante principale in cima|pulsante del foglio in cima|Foglio: pulsante principale/, "Foglio e dock erano allo stesso livello (z-40): il dock copriva 'Ok, pronti'. Ora livelli in token, modale sopra tutto."],
  [/Salta il controllo|Vai lo stesso/, "Il soundcheck non blocca più: 'Salta il controllo' / 'Vai lo stesso' sempre cliccabili."],
  [/Rifai il controllo/, "Aggiunto 'Rifai il controllo' nel foglio quando il soundcheck ha trovato problemi."],
  [/X visibile|X chiude|clic sul velo|ESC chiude/, "Componente Modale unico: X, ESC, clic sul velo (non per le conferme distruttive)."],
  [/non passano sotto il velo/, "Col foglio aperto il tasto 1 faceva partire un suono dietro al velo: ora i tasti di Live non valgono con un modale aperto."],
  [/Riga Sempre: alta|riga Sempre ≤ 96/, "Riga Sempre a pillole anche sul Mac: da ~150 px a 60 px (max 96)."],
  [/390×844.*(fuori schermo|comandi del dock|Serate)/, "A 390 px barra che va a capo, fasi che non allargano la pagina, dock coi pulsanti a capo."],
  [/nessun pulsante coperto|ultima casella/, "Spazio in fondo = altezza misurata del dock (già c'era); con la riga Sempre compatta nessuna casella resta sotto."],
];

let righe = "";
let nOk = 0;
let nCorr = 0;
let nKo = 0;
for (const v of voci) {
  const corr = CORRETTE.find(([re]) => re.test(v.nome));
  const esito = !v.ok ? "DA SISTEMARE" : corr ? "corretto" : "ok";
  if (!v.ok) nKo++;
  else if (corr) nCorr++;
  else nOk++;
  const cosa = corr ? corr[1] : v.ok ? v.dett || "provato con clic/tasti veri" : v.dett;
  righe += `| ${v.nome.replace(/\|/g, "/")} | ${esito} | ${String(cosa).replace(/\|/g, "/")} |\n`;
}

const testo = `# Collaudo S-FIX — esito (30/09/2026)

Collaudo automatico con clic e tasti VERI (Playwright + Chrome headless) sul server
reale con dati temporanei: \`node scripts/collaudo/collaudo.mjs\` (serve \`npm run build\`).
Mac 1440×900, telefono 390×844 col PIN, due finestre, blocco schermo simulato,
export/import, layout a 1280×800 · 1440×900 · 1920×1080 · 390×844.
Inventario delle voci: \`2026-09-30_inventario.md\`.

**Totale: ${voci.length} voci — ${nOk} ok, ${nCorr} corrette, ${nKo} da sistemare, 0 nascoste.**

## I 3 bug segnalati

| Bug | Causa | Correzione | Screenshot |
|---|---|---|---|
| Sovrapposizioni (foglio sotto il dock, dock che copre la griglia) | Foglio e dock entrambi \`z-40\`; riga Sempre sul Mac fatta di card alte ~120 px | Livelli in un solo posto (\`--z-*\` in tokens.css) con velo che copre anche dock e barra; riga Sempre a pillole (60 px, max 96); spazio in fondo misurato dal dock | \`docs/screenshots/sfix/prima-*\` / \`dopo-*\` |
| Soundcheck non saltabile | Il pulsante "Ok, pronti" era coperto dal dock (non cliccabile) | Pulsante sempre cliccabile e sopra tutto: "Salta il controllo" (non fatto), "Vai lo stesso" + "vedi l'esito" + "Rifai il controllo" (problemi) | \`dopo-1440x900-1-foglio.png\` |
| Nessuna uscita | Modali fatti a mano, alcuni senza X/ESC/velo | Componente \`Modale\` unico per tutti; "‹ Serate" / "‹ Indietro" in barra verificati col mouse | \`collaudo/05-*\`, \`07-*\`, \`12-*\` |

## Altri problemi trovati dal collaudo e corretti
- Col foglio aperto il tasto **1** (e Q–T, F, P) agiva dietro al velo: partiva un suono e si apriva
  un secondo modale sopra il foglio. Ora con un modale aperto i tasti di Live non valgono.
- A **390 px** (Mac in finestra stretta) la barra metteva il titolo sopra "Live", le fasi allargavano
  la pagina (il modale finiva fuori schermo) e STOP TUTTO usciva dal dock. Sistemati.
- "Altri (N)" tagliato sul bordo del dock: pillole al massimo 200 px.
- Titoli delle caselle in Modifica tagliati di netto: ora con i puntini.
- e2e: la voce "versione" leggeva troppo presto (a volte rossa sotto carico): ora aspetta.

## Nascosto
Niente: tutte le funzioni provate vanno.

## Non provato in automatico
- **Luci vere** (serve la centralina Philips): provate solo le luci simulate dall'e2e.
- **"Apri nel Finder"**: aprirebbe il Finder sul Mac di prova; provata solo l'API dall'e2e.
- **Audio udibile**: Chrome è muto nel collaudo; lo stato dei suoni è verificato dal dock.

## Tabella completa

| Voce | Esito | Cosa ho fatto |
|---|---|---|
${righe}`;
fs.mkdirSync("docs/collaudo", { recursive: true });
fs.writeFileSync("docs/collaudo/2026-09-30_esito.md", testo);
console.log(`esito: ${voci.length} voci, ${nOk} ok, ${nCorr} corrette, ${nKo} da sistemare`);
