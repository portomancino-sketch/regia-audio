// Crea la cartella autosufficiente "Regia/" per il Mac di Valerio:
// zero Terminale, zero installazioni. Uso: npm run pacchetto
import { execSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versione = JSON.parse(fs.readFileSync(path.join(radice, "package.json"), "utf8")).version;
const cartellaPacchetti = path.join(radice, "dist-pacchetti");
const P = path.join(cartellaPacchetti, "Regia");
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

function passo(nome) {
  console.log(`\n— ${nome}`);
}

// ---- 1. Pulizia e build web ----
passo("Interfaccia web (vite build)");
fs.rmSync(P, { recursive: true, force: true });
fs.mkdirSync(P, { recursive: true });
let r = spawnSync("npm", ["run", "build"], { cwd: radice, stdio: "inherit" });
if (r.status !== 0) process.exit(1);

// ---- 2. Server in un solo file (esbuild) ----
passo("Server in un solo file (esbuild)");
const esbuild = await import("esbuild");
const opzioni = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  logLevel: "warning",
};
let bundleOk = true;
try {
  await esbuild.build({
    ...opzioni,
    entryPoints: [path.join(radice, "server/src/index.ts")],
    outfile: path.join(P, "app/server/src/index.mjs"),
  });
  await esbuild.build({
    ...opzioni,
    entryPoints: [path.join(radice, "scripts/genera-demo.ts")],
    outfile: path.join(P, "app/scripts/genera-demo.mjs"),
  });
} catch (e) {
  bundleOk = false;
  console.log("⚠️ L'impacchettamento in un file solo non è riuscito:", e.message);
}

if (!bundleOk) {
  // Ripiego: sorgenti transpilate + node_modules di sola produzione.
  passo("RIPIEGO: transpilazione + node_modules di produzione");
  await esbuild.build({
    ...opzioni,
    bundle: false,
    entryPoints: [
      ...fs.readdirSync(path.join(radice, "server/src")).map((f) => path.join(radice, "server/src", f)),
      path.join(radice, "shared/tipi.ts"),
      path.join(radice, "shared/regole.ts"),
    ],
    outdir: path.join(P, "app/server/src"),
    outExtension: { ".js": ".mjs" },
  });
  fs.cpSync(path.join(radice, "package.json"), path.join(P, "app/package.json"));
  execSync(`npm install --omit=dev --prefix "${path.join(P, "app")}"`, { stdio: "inherit" });
}

// ---- 3. Prova del server impacchettato (con il Node di sviluppo) ----
passo("Prova del server impacchettato");
fs.cpSync(path.join(radice, "dist"), path.join(P, "app/dist"), { recursive: true });
{
  const datiProva = fs.mkdtempSync(path.join(os.tmpdir(), "regia-pacchetto-"));
  const proc = spawn(process.execPath, [path.join(P, "app/server/src/index.mjs")], {
    stdio: "pipe",
    env: { ...process.env, PORT: "4989", REGIA_DIR: datiProva },
  });
  let uscita = "";
  proc.stdout.on("data", (d) => (uscita += d));
  proc.stderr.on("data", (d) => (uscita += d));
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    try {
      const risposta = await fetch("http://127.0.0.1:4989/api/config");
      ok = (await risposta.json()).versione === 1;
    } catch {
      await attendi(300);
    }
  }
  proc.kill();
  await attendi(500); // lascia chiudere i file (autosave) prima di pulire
  try { fs.rmSync(datiProva, { recursive: true, force: true }); } catch { /* temp: la pulisce il sistema */ }
  if (!ok) {
    console.log("Il server impacchettato NON risponde. Output:\n" + uscita.slice(0, 2000));
    process.exit(1);
  }
  console.log("  ✓ risponde e crea la configurazione");
}

// ---- 4. Node ufficiale per macOS (arm64 + x64) ----
passo("Binari di Node LTS (nodejs.org)");
const indice = await (await fetch("https://nodejs.org/dist/index.json")).json();
const lts = indice.find((v) => v.lts);
console.log(`  versione scelta: ${lts.version} (${lts.lts})`);
const cache = path.join(radice, ".cache-node");
fs.mkdirSync(cache, { recursive: true });
for (const arch of ["arm64", "x64"]) {
  const nome = `node-${lts.version}-darwin-${arch}`;
  const tarball = path.join(cache, `${nome}.tar.gz`);
  if (!fs.existsSync(tarball)) {
    console.log(`  scarico ${nome}...`);
    const dati = await (await fetch(`https://nodejs.org/dist/${lts.version}/${nome}.tar.gz`)).arrayBuffer();
    fs.writeFileSync(tarball, Buffer.from(dati));
  } else {
    console.log(`  ${nome} già in cache`);
  }
  const dest = path.join(P, "node", arch);
  fs.mkdirSync(dest, { recursive: true });
  execSync(`tar -xzf "${tarball}" -C "${dest}" --strip-components 2 "${nome}/bin/node"`);
  fs.chmodSync(path.join(dest, "node"), 0o755);
}

// ---- 5. Avvia Regia.command e LEGGIMI ----
passo("Script di avvio e LEGGIMI");
const comando = `#!/bin/bash
# Avvia la Regia. Doppio click e basta: non serve installare nulla.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Toglie l'avviso di sicurezza di macOS dai file di questa cartella.
xattr -dr com.apple.quarantine "$DIR" 2>/dev/null || true

# Sceglie il Node giusto per questo Mac e libera spazio dall'altro.
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  NODO="$DIR/node/arm64/node"; ALTRO="$DIR/node/x64"
else
  NODO="$DIR/node/x64/node"; ALTRO="$DIR/node/arm64"
fi
[ -d "$ALTRO" ] && rm -rf "$ALTRO"
if [ ! -x "$NODO" ]; then
  echo "Manca il programma nella cartella node/. Riscarica il pacchetto."
  read -r -p "Premi Invio per chiudere." _
  exit 1
fi

apri_finestra() {
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [ -x "$CHROME" ]; then
    "$CHROME" --app=http://localhost:4000 >/dev/null 2>&1 &
  elif [ -d "/Applications/Safari.app" ]; then
    open -a Safari "http://localhost:4000"
  else
    open "http://localhost:4000"
  fi
}

# Se la Regia è già accesa, apre solo la finestra.
if curl -s -m 2 "http://localhost:4000/api/rete" >/dev/null 2>&1; then
  echo "La Regia è già accesa: apro solo la finestra."
  apri_finestra
  exit 0
fi

echo ""
echo "  Accendo la Regia... Lascia aperta questa finestra."
echo "  Finché questa finestra è aperta il Mac non va in stop."
echo "  Per spegnere tutto: chiudi questa finestra."
echo ""
( sleep 2; apri_finestra ) &
# caffeinate tiene svegli Mac e schermo finché la Regia è accesa.
exec caffeinate -d -i "$NODO" "$DIR/app/server/src/index.mjs"
`;
fs.writeFileSync(path.join(P, "Avvia Regia.command"), comando);
fs.chmodSync(path.join(P, "Avvia Regia.command"), 0o755);

const leggimi = `REGIA — la regia audio delle serate di Porto Mancino

LA PRIMA VOLTA (una volta sola)
1. Doppio click su "Avvia Regia.command".
2. macOS lo blocca: è normale, non è un errore. Guarda i pulsanti:
   - Un solo pulsante "OK": premilo. Poi tasto destro su "Avvia Regia.command"
     → Apri → Apri.
   - Due pulsanti "Fine" e "Sposta nel Cestino" (macOS 15 o più recente):
     premi "Fine". Poi Impostazioni di Sistema → Privacy e sicurezza → scendi
     fino a "Sicurezza" → "Apri comunque" → di nuovo "Apri comunque" → password
     del Mac. Se la Regia non parte da sola, rifai doppio click.
3. Se il Mac chiede altri permessi (cartella Documenti, rete, "node"): Consenti.

LE VOLTE DOPO
1. Doppio click su "Avvia Regia.command". Si apre una finestra nera (lasciala
   aperta: è il cuore della Regia) e poi la finestra della Regia.
2. Premi "Attiva audio".
3. Telefono: pannello "Telecomando" in alto, inquadra il QR, scrivi il PIN.
4. Per spegnere: chiudi la finestra nera.

IN SERATA
- Mac collegato alla corrente, coperchio aperto. Finché la finestra nera è
  aperta il Mac non va in stop.

SE IL TELEFONO NON VEDE IL MAC
- Telefono e Mac sullo stesso WiFi? Controlla il nome della rete su entrambi.
- Il WiFi del locale può tenere separati i telefoni dal Mac (rete ospiti).
  Piano B: accendi l'hotspot del telefono e collega il Mac a quella rete.
  Non serve internet. Poi riapri il pannello Telecomando: il QR è nuovo.
- Firewall del Mac acceso? Impostazioni → Rete → Firewall → Opzioni → "node"
  → Consenti connessioni in entrata.

I tuoi suoni e le serate restano al sicuro nella cartella "Regia-dati".
Guida completa: "Guida per Valerio.txt" in questa cartella.
`;
fs.writeFileSync(path.join(P, "LEGGIMI.txt"), leggimi);
fs.copyFileSync(path.join(radice, "docs/GUIDA_VALERIO.md"), path.join(P, "Guida per Valerio.txt"));

// ---- 6. Zip con permessi (ditto) ----
passo("Zip finale");
const zipNome = `Regia-v${versione}.zip`;
const zipPercorso = path.join(cartellaPacchetti, zipNome);
fs.rmSync(zipPercorso, { force: true });
execSync(`ditto -c -k --keepParent "${P}" "${zipPercorso}"`);

const dimensione = (p) => (Number(execSync(`du -sk "${p}"`).toString().split("\t")[0]) / 1024).toFixed(0);
console.log(`\nFatto${bundleOk ? "" : " (con RIPIEGO node_modules)"}:`);
console.log(`  cartella: ${P} (${dimensione(P)} MB, con entrambe le architetture)`);
console.log(`  zip:      ${zipPercorso} (${dimensione(zipPercorso)} MB)`);
