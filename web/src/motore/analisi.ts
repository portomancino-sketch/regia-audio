// Analisi di un file audio nella pagina (SOLO in Modifica / importazione, mai in Live):
// decodifica con Web Audio, livello medio (RMS con gate) e picco → guadagno automatico.
import { ANALISI_VERSIONE, analizzaCampioni, calcolaGuadagno } from "../../../shared/livello";

export interface Analisi {
  analisi: { rms: number; picco: number; versione: typeof ANALISI_VERSIONE };
  guadagnoAuto: number;
}

let contesto: OfflineAudioContext | null = null;
function ctx(): OfflineAudioContext {
  // Un OfflineAudioContext basta per decodificare: non suona, non usa l'uscita audio.
  if (!contesto) contesto = new OfflineAudioContext(1, 1, 44100);
  return contesto;
}

/** Analizza i byte di un file (File appena trascinato o scaricato dal server). */
export async function analizzaDati(dati: ArrayBuffer): Promise<Analisi> {
  const buffer = await ctx().decodeAudioData(dati.slice(0));
  const canali: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) canali.push(buffer.getChannelData(c));
  const { rms, picco } = analizzaCampioni(canali, buffer.sampleRate);
  return { analisi: { rms, picco, versione: ANALISI_VERSIONE }, guadagnoAuto: calcolaGuadagno(rms, picco) };
}

export async function analizzaFile(file: File): Promise<Analisi> {
  return analizzaDati(await file.arrayBuffer());
}

/** Analizza un file già sul server (per "Analizza tutti i suoni"). */
export async function analizzaDalServer(nomeFile: string): Promise<Analisi> {
  const r = await fetch(`/audio/${nomeFile}`);
  if (!r.ok) throw new Error("File non trovato");
  return analizzaDati(await r.arrayBuffer());
}
