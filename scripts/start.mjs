// Avvio: se manca la build della parte web, la crea; poi avvia il server.
import { existsSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(radice, "dist", "index.html");

if (!existsSync(dist)) {
  console.log("Preparo l'interfaccia (solo la prima volta)...");
  const esito = spawnSync("npm", ["run", "build"], { cwd: radice, stdio: "inherit" });
  if (esito.status !== 0) {
    console.error("La preparazione non è riuscita.");
    process.exit(1);
  }
}

const server = spawn("npx", ["tsx", "server/src/index.ts"], {
  cwd: radice,
  stdio: "inherit",
});
server.on("exit", (codice) => process.exit(codice ?? 0));
