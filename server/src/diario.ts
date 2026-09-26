// Il diario di serata: un file al giorno in ~/Regia-dati/diario/YYYY-MM-DD.jsonl.
import fs from "node:fs";
import path from "node:path";
import { cartellaDati } from "./percorsi";
import type { Config } from "../../shared/tipi";
import { serataCorrente, soundcheckDellaSerata, spezzaInSerate, statoSerata, type StatoSerata } from "../../shared/serata";

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
    | "blocco_off"
    | "luce"
    | "fine_serata"
    | "avviso_soundcheck";
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

export function nomeGiorno(d: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Aggiunge un evento al file di oggi; alla nascita di un giorno nuovo pulisce i vecchi. */
export function scriviEvento(evento: EventoDiario): void {
  cacheMaiUsati = null; // le statistiche si ricalcolano alla prossima richiesta
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

export interface RiassuntoSerata {
  data: string;
  /** Numero della serata in quel giorno (0 = la prima). */
  serata: number;
  /** Chiusa col pulsante "Chiudi serata" (altrimenti: taglio a mezzanotte). */
  chiusa: boolean;
  formats: string[];
  primo: string;
  ultimo: string;
  durataMin: number;
  suoni: number;
  soundcheck: { ora: string; problemi: number; completo: boolean } | null;
}

/** Le serate, dalla più recente: un giorno chiuso col pulsante due volte dà due righe. */
export function elencoSerate(): RiassuntoSerata[] {
  const cartella = cartellaDiario();
  if (!fs.existsSync(cartella)) return [];
  const serate: RiassuntoSerata[] = [];
  for (const f of fs.readdirSync(cartella).sort().reverse()) {
    if (!f.endsWith(".jsonl")) continue;
    const data = f.replace(".jsonl", "");
    const tratti = spezzaInSerate(leggiGiorno(data));
    for (let i = tratti.length - 1; i >= 0; i--) {
      const eventi = tratti[i]!;
      const formats = [...new Set(eventi.map((e) => e.format).filter((x): x is string => !!x))];
      const primo = eventi[0]!.ora;
      const ultimo = eventi[eventi.length - 1]!.ora;
      serate.push({
        data,
        serata: i,
        chiusa: eventi[eventi.length - 1]!.tipo === "fine_serata",
        formats,
        primo,
        ultimo,
        durataMin: Math.round((new Date(ultimo).getTime() - new Date(primo).getTime()) / 60000),
        suoni: eventi.filter((e) => e.tipo === "suono partito").length,
        soundcheck: soundcheckDellaSerata(eventi),
      });
    }
  }
  return serate;
}

/** Gli eventi di una serata (`serata` = numero nel giorno); senza numero, tutto il giorno. */
export function leggiSerata(data: string, serata: number | null): EventoDiario[] {
  const eventi = leggiGiorno(data);
  if (serata === null) return eventi;
  return spezzaInSerate(eventi)[serata] ?? [];
}

// ---- La serata di oggi (quella aperta) ----

/** Lo stato della serata aperta di oggi: soundcheck per format, avviso, inizio. */
export function serataDiOggi(): { stato: StatoSerata; eventi: EventoDiario[] } {
  const data = nomeGiorno(new Date());
  const { indice, eventi } = serataCorrente(leggiGiorno(data));
  return { stato: statoSerata(data, indice, eventi), eventi };
}

/** "Chiudi serata": scrive fine_serata e dice quale serata si è chiusa. */
export function chiudiSerata(origine: string): { data: string; serata: number } {
  const data = nomeGiorno(new Date());
  const { indice } = serataCorrente(leggiGiorno(data));
  scriviEvento({ ora: new Date().toISOString(), tipo: "fine_serata", origine });
  return { data, serata: indice };
}

export function csvGiorno(data: string, serata: number | null = null): string {
  const campi = ["ora", "tipo", "cue", "fase", "format", "origine"] as const;
  const scappa = (v: string | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const righe = leggiSerata(data, serata).map((e) => campi.map((c) => scappa(e[c])).join(","));
  return [campi.join(","), ...righe].join("\n") + "\n";
}

// ---- Riepilogo di una serata (pura: eventi + config → numeri) ----

export interface RigaFase {
  nome: string;
  previstiMin: number | null;
  realiMin: number;
  scartoMin: number | null;
}

export interface Riepilogo {
  inizio: string | null; // primo suono vero
  fine: string | null; // "Chiudi serata" se c'è, altrimenti l'ultimo evento
  /** Chiusa col pulsante "Chiudi serata". */
  chiusa: boolean;
  /** Il soundcheck della serata (null = non fatto). */
  soundcheck: { ora: string; problemi: number; completo: boolean } | null;
  durataMin: number;
  fasi: RigaFase[];
  stopTutto: number;
  /** Suoni fermati entro 2 s dalla partenza (soundcheck escluso). */
  possibiliErrori: number;
  comandi: { telefono: number; mac: number };
}

const ERRORE_ENTRO_MS = 2000;

/** Le durate previste per nome di fase, prese dal format usato quella sera. */
function previsteDelFormat(config: Config | null, nomeFormat: string | undefined): Map<string, number> {
  const m = new Map<string, number>();
  const format = config?.formats.find((f) => f.nome === nomeFormat);
  for (const fase of format?.fasi ?? []) {
    if (!fase.sempre && typeof fase.durataPrevista === "number" && fase.durataPrevista > 0) m.set(fase.nome, fase.durataPrevista);
  }
  return m;
}

export function riepilogoSerata(eventi: EventoDiario[], config: Config | null): Riepilogo {
  const t = (e: EventoDiario) => new Date(e.ora).getTime();
  const primoSuono = eventi.find((e) => e.tipo === "suono partito") ?? null;
  const ultimo = eventi.length > 0 ? eventi[eventi.length - 1]! : null;
  const chiusura = eventi.find((e) => e.tipo === "fine_serata") ?? null;
  const inizio = primoSuono ? primoSuono.ora : null;
  // Fine esplicita ("Chiudi serata") quando c'è; altrimenti l'ultimo evento.
  const fine = chiusura ? chiusura.ora : ultimo ? ultimo.ora : null;
  const durataMin = inizio && fine ? Math.max(0, Math.round((new Date(fine).getTime() - new Date(inizio).getTime()) / 60000)) : 0;

  // Tempo reale per fase (dal primo suono in poi), nell'ordine in cui si sono viste.
  const reali = new Map<string, number>();
  let faseCorrente: string | null = primoSuono?.fase ?? null;
  let da = primoSuono ? t(primoSuono) : 0;
  const formatUsato = primoSuono?.format ?? eventi.find((e) => e.format)?.format;
  for (const e of eventi) {
    if (!primoSuono || t(e) < t(primoSuono)) continue;
    if ((e.tipo === "fase cambiata" || e.tipo === "format aperto") && e.fase) {
      if (faseCorrente) reali.set(faseCorrente, (reali.get(faseCorrente) ?? 0) + (t(e) - da));
      faseCorrente = e.fase;
      da = t(e);
    }
  }
  if (faseCorrente && ultimo && primoSuono) reali.set(faseCorrente, (reali.get(faseCorrente) ?? 0) + (t(ultimo) - da));
  const previste = previsteDelFormat(config, formatUsato);
  const fasi: RigaFase[] = [...reali.entries()].map(([nome, ms]) => {
    const realiMin = Math.round(ms / 60000);
    const previstiMin = previste.get(nome) ?? null;
    return { nome, previstiMin, realiMin, scartoMin: previstiMin === null ? null : realiMin - previstiMin };
  });

  // Possibili errori: fermato entro 2 s dalla partenza dello stesso suono.
  let possibiliErrori = 0;
  const partenze = new Map<string, number[]>();
  for (const e of eventi) {
    if (e.tipo === "suono partito" && e.cue) partenze.set(e.cue, [...(partenze.get(e.cue) ?? []), t(e)]);
    if (e.tipo === "suono fermato" && e.cue) {
      const lista = partenze.get(e.cue) ?? [];
      const ultimaPartenza = lista.length > 0 ? lista[lista.length - 1]! : null;
      if (ultimaPartenza !== null && t(e) - ultimaPartenza <= ERRORE_ENTRO_MS) {
        possibiliErrori++;
        lista.pop();
      }
    }
  }

  const comandi = { telefono: 0, mac: 0 };
  for (const e of eventi) {
    if (e.tipo === "soundcheck" || e.tipo === "blocco_on" || e.tipo === "blocco_off") continue;
    if (e.tipo === "fine_serata" || e.tipo === "avviso_soundcheck" || e.tipo === "luce") continue;
    if (e.origine.startsWith("telefono")) comandi.telefono++;
    else comandi.mac++;
  }

  return {
    inizio,
    fine,
    chiusa: chiusura !== null,
    soundcheck: soundcheckDellaSerata(eventi),
    durataMin,
    fasi,
    stopTutto: eventi.filter((e) => e.tipo === "stop tutto").length,
    possibiliErrori,
    comandi,
  };
}

/** Il CSV della serata: prima un blocco "chiave,valore" col riepilogo, una riga
 *  vuota, poi la cronologia con la sua intestazione. */
export function csvGiornoConRiepilogo(data: string, config: Config | null, serata: number | null = null): string {
  const eventi = leggiSerata(data, serata);
  const r = riepilogoSerata(eventi, config);
  const scappa = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const righe: string[] = ["chiave,valore"];
  righe.push(`inizio,${scappa(r.inizio)}`, `fine,${scappa(r.fine)}`, `durata_min,${r.durataMin}`, `chiusa,${r.chiusa ? "si" : "no"}`);
  righe.push(`soundcheck,${scappa(r.soundcheck ? `${r.soundcheck.completo ? "fatto" : "interrotto"} alle ${r.soundcheck.ora}, problemi ${r.soundcheck.problemi}` : "non fatto")}`);
  righe.push(`stop_tutto,${r.stopTutto}`, `possibili_errori,${r.possibiliErrori}`);
  righe.push(`comandi_telefono,${r.comandi.telefono}`, `comandi_mac,${r.comandi.mac}`);
  for (const f of r.fasi) righe.push(`fase,${scappa(`${f.nome}: previsti ${f.previstiMin ?? "-"} min, reali ${f.realiMin} min, scarto ${f.scartoMin ?? "-"}`)}`);
  righe.push("");
  return righe.join("\n") + "\n" + csvGiorno(data, serata);
}

// ---- Suoni mai usati nelle ultime N serate ----

export interface MaiUsati {
  serate: string[]; // le date considerate (una data può ripetersi: due serate lo stesso giorno)
  formats: { nome: string; caselle: string[] }[];
  /** Quante di quelle serate sono andate senza un soundcheck completo. */
  senzaSoundcheck: number;
}

const SERATE_DA_GUARDARE = 10;
let cacheMaiUsati: MaiUsati | null = null;

/** Pura: per ogni format usato in quelle serate, le caselle mai partite (soundcheck escluso). */
export function calcolaMaiUsati(config: Config, serate: { data: string; eventi: EventoDiario[] }[]): MaiUsati {
  const partiti = new Map<string, Set<string>>(); // format → titoli partiti
  for (const s of serate) {
    for (const e of s.eventi) {
      if (e.tipo !== "suono partito" || !e.format || !e.cue) continue;
      if (!partiti.has(e.format)) partiti.set(e.format, new Set());
      partiti.get(e.format)!.add(e.cue);
    }
  }
  const formats: MaiUsati["formats"] = [];
  for (const [nomeFormat, usati] of partiti) {
    const format = config.formats.find((f) => f.nome === nomeFormat);
    if (!format) continue;
    const caselle = format.fasi
      .flatMap((f) => f.cue)
      .filter((c) => c.tipo !== "promemoria" && !usati.has(c.titolo))
      .map((c) => c.titolo);
    formats.push({ nome: nomeFormat, caselle });
  }
  const senzaSoundcheck = serate.filter((s) => !(soundcheckDellaSerata(s.eventi)?.completo ?? false)).length;
  return { serate: serate.map((s) => s.data), formats, senzaSoundcheck };
}

export function maiUsati(config: Config): MaiUsati {
  if (cacheMaiUsati) return cacheMaiUsati;
  const serate = elencoSerate()
    .slice(0, SERATE_DA_GUARDARE)
    .map((g) => ({ data: g.data, eventi: leggiSerata(g.data, g.serata) }));
  cacheMaiUsati = calcolaMaiUsati(config, serate);
  return cacheMaiUsati;
}

/** Da chiamare quando la config cambia (titoli nuovi, format nuovi). */
export function invalidaMaiUsati(): void {
  cacheMaiUsati = null;
}
