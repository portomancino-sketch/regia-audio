// Il diario di serata: un file al giorno in ~/Regia-dati/diario/YYYY-MM-DD.jsonl.
import fs from "node:fs";
import path from "node:path";
import { cartellaDati } from "./percorsi";

const GIORNI_DA_TENERE = 365;

export interface EventoDiario {
  ora: string; // ISO
  tipo:
    | "suono partito"
    | "suono fermato"
    | "fade"
    | "stop tutto"
    | "fase cambiata"
    | "format aperto"
    | "promemoria fatto"
    | "parla acceso"
    | "parla spento"
    | "soundcheck"
    | "blocco_on"
    | "blocco_off";
  cue?: string;
  fase?: string;
  format?: string;
  origine: string; // "mac·ab12" | "telefono·cd34"
  /** Dati in più (es. soundcheck: inizio, fine, caselle provate). */
  dettagli?: Record<string, unknown>;
}

function cartellaDiario(): string {
  return path.join(cartellaDati(), "diario");
}

function nomeGiorno(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Aggiunge un evento al file di oggi; alla nascita di un giorno nuovo pulisce i vecchi. */
export function scriviEvento(evento: EventoDiario): void {
  try {
    const cartella = cartellaDiario();
    fs.mkdirSync(cartella, { recursive: true });
    const file = path.join(cartella, `${nomeGiorno(new Date())}.jsonl`);
    const nuovo = !fs.existsSync(file);
    fs.appendFileSync(file, JSON.stringify(evento) + "\n");
    if (nuovo) pulisciVecchi();
  } catch {
    // Il diario non deve mai fermare la serata.
  }
}

function pulisciVecchi(): void {
  const limite = new Date();
  limite.setDate(limite.getDate() - GIORNI_DA_TENERE);
  const nomeLimite = `${nomeGiorno(limite)}.jsonl`;
  for (const f of fs.readdirSync(cartellaDiario())) {
    if (f.endsWith(".jsonl") && f < nomeLimite) fs.unlinkSync(path.join(cartellaDiario(), f));
  }
}

export function leggiGiorno(data: string): EventoDiario[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return [];
  const file = path.join(cartellaDiario(), `${data}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((riga) => {
      try {
        return JSON.parse(riga) as EventoDiario;
      } catch {
        return null;
      }
    })
    .filter((e): e is EventoDiario => e !== null);
}

export interface RiassuntoGiorno {
  data: string;
  formats: string[];
  primo: string;
  ultimo: string;
  durataMin: number;
  suoni: number;
}

export function elencoGiorni(): RiassuntoGiorno[] {
  const cartella = cartellaDiario();
  if (!fs.existsSync(cartella)) return [];
  const giorni: RiassuntoGiorno[] = [];
  for (const f of fs.readdirSync(cartella).sort().reverse()) {
    if (!f.endsWith(".jsonl")) continue;
    const data = f.replace(".jsonl", "");
    const eventi = leggiGiorno(data);
    if (eventi.length === 0) continue;
    const formats = [...new Set(eventi.map((e) => e.format).filter((x): x is string => !!x))];
    const primo = eventi[0]!.ora;
    const ultimo = eventi[eventi.length - 1]!.ora;
    giorni.push({
      data,
      formats,
      primo,
      ultimo,
      durataMin: Math.round((new Date(ultimo).getTime() - new Date(primo).getTime()) / 60000),
      suoni: eventi.filter((e) => e.tipo === "suono partito").length,
    });
  }
  return giorni;
}

export function csvGiorno(data: string): string {
  const campi = ["ora", "tipo", "cue", "fase", "format", "origine"] as const;
  const scappa = (v: string | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const righe = leggiGiorno(data).map((e) => campi.map((c) => scappa(e[c])).join(","));
  return [campi.join(","), ...righe].join("\n") + "\n";
}
