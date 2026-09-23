// Chiamate al server.
import type { Config, Cue, Fase, Format, Impostazioni, InfoRete } from "../../shared/tipi";

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
  impostazioni: (dati: Partial<Impostazioni>) => chiama<Impostazioni>("PATCH", "/api/impostazioni", dati),

  creaFormat: (nome: string) => chiama<Format>("POST", "/api/formats", { nome }),
  rinominaFormat: (id: string, nome: string) => chiama<Format>("PATCH", `/api/formats/${id}`, { nome }),
  riordinaFormats: (ordine: string[]) => chiama<string[]>("POST", "/api/formats/riordina", { ordine }),
  duplicaFormat: (id: string) => chiama<Format>("POST", `/api/formats/${id}/duplica`),
  eliminaFormat: (id: string) => chiama<{ fatto: boolean }>("DELETE", `/api/formats/${id}`),

  creaFase: (formatId: string, nome: string) => chiama<Fase>("POST", `/api/formats/${formatId}/fasi`, { nome }),
  rinominaFase: (id: string, nome: string) => chiama<Fase>("PATCH", `/api/fasi/${id}`, { nome }),
  riordinaFasi: (formatId: string, ordine: string[]) =>
    chiama<string[]>("POST", `/api/formats/${formatId}/fasi/riordina`, { ordine }),
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
