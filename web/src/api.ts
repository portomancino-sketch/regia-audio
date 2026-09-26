// Chiamate al server.
import type { Config, Cue, Fase, Format, Impostazioni, InfoRete } from "../../shared/tipi";
import type { Effetto, GruppoRegia, MappaLuci, NomeEffetto, ComandoLuceCue } from "../../shared/luci";
import type { StatoSerata } from "../../shared/serata";

/** Un evento del diario come lo vede l'interfaccia. */
export interface EventoDiarioWeb {
  ora: string;
  tipo: string;
  cue?: string;
  fase?: string;
  format?: string;
  origine: string;
  dettagli?: Record<string, unknown>;
}
/** Il riepilogo di una serata (server/src/diario.ts → Riepilogo). */
export interface RiepilogoWeb {
  inizio: string | null;
  fine: string | null;
  chiusa: boolean;
  soundcheck: { ora: string; problemi: number; completo: boolean } | null;
  durataMin: number;
  fasi: { nome: string; previstiMin: number | null; realiMin: number; scartoMin: number | null }[];
  stopTutto: number;
  possibiliErrori: number;
  comandi: { telefono: number; mac: number };
}
/** Lo stato della serata di oggi più i suoi eventi (GET /api/serata). */
export type SerataOggi = StatoSerata & { eventi: EventoDiarioWeb[] };

export interface LuciLive {
  abbinata: boolean;
  raggiungibile: boolean;
  nomi: Record<NomeEffetto, string>;
  colori: Record<NomeEffetto, string>;
  intensita: number;
  effettoCorrente: NomeEffetto | null;
}
export interface LuciStato {
  stato: "nessuna" | "daAbbinare" | "abbinata" | "nonRaggiungibile";
  bridge: { id: string; ip: string; nome?: string } | null;
  ipManuale?: string;
  mappa: MappaLuci;
  foto: boolean;
  intensita: number;
  effettoCorrente: NomeEffetto | null;
}
export interface Lampadina {
  id: string;
  nome: string;
  nomeBridge: string;
  accesa: boolean;
  raggiungibile: boolean;
}

async function chiama<T>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: metodo,
    headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) {
    let messaggio = "Qualcosa è andato storto";
    try {
      const dati = (await r.json()) as { errore?: string };
      if (dati.errore) messaggio = dati.errore;
    } catch {
      /* corpo non json */
    }
    throw new Error(messaggio);
  }
  return (await r.json()) as T;
}

export const api = {
  config: () => chiama<Config>("GET", "/api/config"),
  rete: () => chiama<InfoRete>("GET", "/api/rete"),
  maiUsati: () => chiama<{ serate: string[]; formats: { nome: string; caselle: string[] }[] }>("GET", "/api/statistiche/mai-usati"),
  impostazioni: (dati: Partial<Impostazioni>) => chiama<Impostazioni>("PATCH", "/api/impostazioni", dati),

  serata: {
    oggi: () => chiama<SerataOggi>("GET", "/api/serata"),
    /** L'esito di "Prova tutti", a fine giro (anche interrotto: completo=false). */
    soundcheck: (dati: {
      formatId: string;
      inizio: string;
      caselle: number;
      problemi: number;
      mancanti: { cueId: string; titolo: string; fase: string; esito: "mancante" | "nonDecodificabile" }[];
      completo: boolean;
    }) => chiama<StatoSerata>("POST", "/api/serata/soundcheck", dati),
    /** La finestra "Non hai ancora provato i suoni" è comparsa. */
    avviso: (formatId: string, scelta: string) => chiama<StatoSerata>("POST", "/api/serata/avviso", { formatId, scelta }),
    chiudi: () => chiama<{ data: string; serata: number; riepilogo: RiepilogoWeb; eventi: EventoDiarioWeb[] }>("POST", "/api/serata/chiudi", {}),
  },

  creaFormat: (nome: string) => chiama<Format>("POST", "/api/formats", { nome }),
  rinominaFormat: (id: string, nome: string) => chiama<Format>("PATCH", `/api/formats/${id}`, { nome }),
  modificaFormat: (id: string, dati: { nome?: string; notaInizio?: string; crossfade?: number; archiviato?: boolean }) =>
    chiama<Format>("PATCH", `/api/formats/${id}`, dati),
  riordinaFormats: (ordine: string[]) => chiama<string[]>("POST", "/api/formats/riordina", { ordine }),
  duplicaFormat: (id: string) => chiama<Format>("POST", `/api/formats/${id}/duplica`),
  eliminaFormat: (id: string) => chiama<{ fatto: boolean }>("DELETE", `/api/formats/${id}`),

  creaFase: (formatId: string, nome: string) => chiama<Fase>("POST", `/api/formats/${formatId}/fasi`, { nome }),
  rinominaFase: (id: string, nome: string) => chiama<Fase>("PATCH", `/api/fasi/${id}`, { nome }),
  modificaFase: (id: string, dati: { nome?: string; nota?: string; durataPrevista?: number | null; luce?: ComandoLuceCue | null }) =>
    chiama<Fase>("PATCH", `/api/fasi/${id}`, dati),
  riordinaFasi: (formatId: string, ordine: string[]) =>
    chiama<string[]>("POST", `/api/formats/${formatId}/fasi/riordina`, { ordine }),
  duplicaFase: (id: string) => chiama<Fase>("POST", `/api/fasi/${id}/duplica`),
  eliminaFase: (id: string) => chiama<{ fatto: boolean }>("DELETE", `/api/fasi/${id}`),

  creaCue: (faseId: string, dati: Partial<Cue>) => chiama<Cue>("POST", `/api/fasi/${faseId}/cue`, dati),
  modificaCue: (id: string, dati: Partial<Cue>) => chiama<Cue>("PATCH", `/api/cue/${id}`, dati),
  riordinaCue: (faseId: string, ordine: string[]) =>
    chiama<string[]>("POST", `/api/fasi/${faseId}/cue/riordina`, { ordine }),
  duplicaCue: (id: string) => chiama<Cue>("POST", `/api/cue/${id}/duplica`),
  eliminaCue: (id: string) => chiama<{ fatto: boolean }>("DELETE", `/api/cue/${id}`),

  async caricaAudio(cueId: string, file: File): Promise<Cue> {
    const corpo = new FormData();
    corpo.append("file", file);
    const r = await fetch(`/api/cue/${cueId}/audio`, { method: "POST", body: corpo });
    const dati = (await r.json()) as Cue & { errore?: string };
    if (!r.ok) throw new Error(dati.errore ?? "Caricamento non riuscito");
    return dati;
  },

  async caricaAudioMultipli(faseId: string, files: File[]): Promise<{ creati: Cue[]; scartati: string[] }> {
    const corpo = new FormData();
    for (const f of files) corpo.append("file", f);
    const r = await fetch(`/api/fasi/${faseId}/audio-multipli`, { method: "POST", body: corpo });
    const dati = (await r.json()) as { creati: Cue[]; scartati: string[]; errore?: string };
    if (!r.ok) throw new Error(dati.errore ?? "Caricamento non riuscito");
    return dati;
  },

  luci: {
    live: () => chiama<LuciLive>("GET", "/api/luci/live"),
    stato: () => chiama<LuciStato>("GET", "/api/luci/stato"),
    cerca: (ip?: string) => chiama<{ trovata: boolean; stato: LuciStato["stato"] }>("POST", "/api/luci/cerca", { ip }),
    abbina: () => chiama<{ abbinata: boolean; errore?: string }>("POST", "/api/luci/abbina", {}),
    lampadine: () => chiama<Lampadina[]>("GET", "/api/luci/lampadine"),
    lampeggia: (id: string) => chiama<{ fatto: boolean }>("POST", `/api/luci/lampadine/${id}/lampeggia`, {}),
    rinominaLampada: (id: string, nome: string) => chiama<LuciStato>("PATCH", `/api/luci/lampadine/${id}`, { nome }),
    creaGruppo: (nome: string, luci: string[]) => chiama<GruppoRegia>("POST", "/api/luci/gruppi", { nome, luci }),
    modificaGruppo: (id: string, dati: { nome?: string; luci?: string[] }) => chiama<GruppoRegia>("PATCH", `/api/luci/gruppi/${id}`, dati),
    eliminaGruppo: (id: string) => chiama<{ fatto: boolean }>("DELETE", `/api/luci/gruppi/${id}`),
    importaStanze: () => chiama<GruppoRegia[]>("POST", "/api/luci/importa-stanze", {}),
    salvaEffetti: (effetti: Partial<Record<NomeEffetto, Partial<Effetto>>>) => chiama<LuciStato>("PUT", "/api/luci/effetti", { effetti }),
    prova: (effetto: ComandoLuceCue) => chiama<{ ok: boolean; errore?: string }>("POST", "/api/luci/prova", { effetto }),
    esegui: (effetto: ComandoLuceCue, origine = "manuale") => chiama<{ ok: boolean; errore?: string }>("POST", "/api/luci/esegui", { effetto, origine }),
    intensita: (valore: number) => chiama<{ intensita: number }>("PUT", "/api/luci/intensita", { valore }),
  },

  async importaZip(file: File): Promise<void> {
    const corpo = new FormData();
    corpo.append("file", file);
    const r = await fetch("/api/import", { method: "POST", body: corpo });
    if (!r.ok) {
      const dati = (await r.json().catch(() => ({}))) as { errore?: string };
      throw new Error(dati.errore ?? "Import non riuscito");
    }
  },
};
