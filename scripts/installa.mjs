// Installazione facile: verifica Node, installa, costruisce, crea "Regia.command".
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function passo(nome, fn) {
  process.stdout.write(`• ${nome}... `);
  fn();
  console.log("ok");
}

// 1. Node abbastanza nuovo?
const versione = Number(process.versions.node.split(".")[0]);
if (versione < 20) {
  console.error(`\nServe Node 20 o più nuovo (questo è ${process.versions.node}).`);
  console.error("Scaricalo da https://nodejs.org e rilancia: npm run installa");
  process.exit(1);
}

passo("Installo le librerie", () => {
  const r = spawnSync("npm", ["install"], { cwd: radice, stdio: "ignore" });
  if (r.status !== 0) throw new Error("npm install non riuscito");
});

passo("Preparo l'interfaccia", () => {
  const r = spawnSync("npm", ["run", "build"], { cwd: radice, stdio: "ignore" });
  if (r.status !== 0) throw new Error("build non riuscita");
});

passo("Creo Regia.command sulla Scrivania", () => {
  const scrivania = path.join(os.homedir(), "Desktop");
  const comando = path.join(scrivania, "Regia.command");
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const script = `#!/bin/bash
# Avvia la Regia e apre la finestra.
cd "${radice}"
( sleep 2
  if [ -x "${chrome}" ]; then
    "${chrome}" --app=http://localhost:4000 >/dev/null 2>&1 &
  else
    open http://localhost:4000
  fi
) &
npm start
`;
  fs.writeFileSync(comando, script);
  fs.chmodSync(comando, 0o755);
});

console.log(`
Tutto pronto! Tre cose da sapere:
1. Doppio click su "Regia.command" sulla Scrivania: parte tutto da solo.
2. Sul telefono (stesso WiFi): apri l'indirizzo mostrato nella finestra nera.
3. Per chiudere la Regia: chiudi la finestra nera (o premi Ctrl+C lì dentro).
`);
