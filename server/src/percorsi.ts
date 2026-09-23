// Dove stanno i dati: ~/Regia (o la cartella indicata da REGIA_DIR).
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const radiceProgetto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function stessaCartella(a: string, b: string): boolean {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}

let cache: string | null = null;

export function cartellaDati(): string {
  if (process.env.REGIA_DIR) return process.env.REGIA_DIR;
  if (cache) return cache;
  const standard = path.join(os.homedir(), "Regia");
  // Sui dischi Mac che non distinguono maiuscole/minuscole, ~/Regia può
  // coincidere con la cartella del progetto (~/regia): in quel caso i dati
  // vanno in ~/Regia-dati per non mescolarli col codice.
  cache =
    fs.existsSync(standard) && stessaCartella(standard, radiceProgetto)
      ? path.join(os.homedir(), "Regia-dati")
      : standard;
  return cache;
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
