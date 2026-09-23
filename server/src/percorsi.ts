// Dove stanno i dati: ~/Regia-dati (o la cartella indicata da REGIA_DIR).
// Mai ~/Regia: sui dischi Mac, che non distinguono le maiuscole, coinciderebbe
// con la cartella del codice ~/regia e i dati finirebbero nel repository.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const radiceProgetto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function cartellaDati(): string {
  return process.env.REGIA_DIR ?? path.join(os.homedir(), "Regia-dati");
}

export function percorsoConfig(): string {
  return path.join(cartellaDati(), "regia.json");
}

export function cartellaAudio(): string {
  return path.join(cartellaDati(), "audio");
}

export function cartellaBackup(): string {
  return path.join(cartellaDati(), "backup");
}

export function cartellaDist(): string {
  return path.join(radiceProgetto, "dist");
}
