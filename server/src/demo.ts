// Sintetizza i suoni di prova e il format "Demo — Orient Express".
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Config, Cue, Format, TipoCue, SulSottofondo } from "../../shared/tipi";

const FREQ_CAMPIONAMENTO = 44100;

function scriviWav(percorso: string, campioni: Float32Array): void {
  const n = campioni.length;
  const dati = Buffer.alloc(44 + n * 2);
  dati.write("RIFF", 0);
  dati.writeUInt32LE(36 + n * 2, 4);
  dati.write("WAVE", 8);
  dati.write("fmt ", 12);
  dati.writeUInt32LE(16, 16);
  dati.writeUInt16LE(1, 20); // PCM
  dati.writeUInt16LE(1, 22); // mono
  dati.writeUInt32LE(FREQ_CAMPIONAMENTO, 24);
  dati.writeUInt32LE(FREQ_CAMPIONAMENTO * 2, 28);
  dati.writeUInt16LE(2, 32);
  dati.writeUInt16LE(16, 34);
  dati.write("data", 36);
  dati.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, campioni[i]!));
    dati.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(percorso, dati);
}

function secondi(s: number): Float32Array {
  return new Float32Array(Math.round(s * FREQ_CAMPIONAMENTO));
}

/** Rumore pseudo-casuale deterministico (niente Math.random, così i file sono riproducibili). */
function creaRumore(seme: number): () => number {
  let x = seme;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 0xffffffff - 0.5;
  };
}

function trenoAtmosfera(): Float32Array {
  const c = secondi(20);
  const rumore = creaRumore(7);
  let filtro = 0;
  for (let i = 0; i < c.length; i++) {
    const t = i / FREQ_CAMPIONAMENTO;
    // Rimbombo basso: rumore filtrato.
    filtro += 0.02 * (rumore() - filtro);
    let v = filtro * 2.2;
    // Il "ta-dum ta-dum" delle rotaie ogni 1,6 s.
    const ciclo = t % 1.6;
    for (const colpo of [0, 0.18]) {
      const d = ciclo - colpo;
      if (d >= 0 && d < 0.1) v += Math.exp(-d * 60) * 0.5 * Math.sin(2 * Math.PI * 70 * d);
    }
    // Fischio lontano una volta per giro (al secondo 9).
    if (t > 9 && t < 10.5) {
      const inv = Math.sin(Math.PI * (t - 9) / 1.5);
      v += 0.06 * inv * Math.sin(2 * Math.PI * 622 * t) + 0.04 * inv * Math.sin(2 * Math.PI * 740 * t);
    }
    c[i] = v * 0.5;
  }
  return c;
}

function tensione(): Float32Array {
  const c = secondi(8);
  for (let i = 0; i < c.length; i++) {
    const t = i / FREQ_CAMPIONAMENTO;
    const cresce = Math.min(1, t / 6);
    const tremolo = 0.6 + 0.4 * Math.sin(2 * Math.PI * (2 + cresce * 6) * t);
    const nota = 110 * Math.pow(2, cresce * 0.5);
    let v = Math.sin(2 * Math.PI * nota * t) * 0.4 + Math.sin(2 * Math.PI * nota * 1.5 * t) * 0.2;
    v *= tremolo * (0.3 + cresce * 0.7);
    if (t > 7.5) v *= (8 - t) * 2; // chiusura morbida
    c[i] = v * 0.5;
  }
  return c;
}

function sparo(): Float32Array {
  const c = secondi(1);
  const rumore = creaRumore(42);
  let filtro = 0;
  for (let i = 0; i < c.length; i++) {
    const t = i / FREQ_CAMPIONAMENTO;
    filtro += 0.4 * (rumore() - filtro);
    const botto = Math.exp(-t * 18) * filtro * 4;
    const eco = t > 0.12 ? Math.exp(-(t - 0.12) * 8) * filtro * 1.2 : 0;
    c[i] = (botto + eco) * 0.9;
  }
  return c;
}

function campanello(): Float32Array {
  const c = secondi(2);
  for (let i = 0; i < c.length; i++) {
    const t = i / FREQ_CAMPIONAMENTO;
    const dec = Math.exp(-t * 3);
    c[i] =
      (Math.sin(2 * Math.PI * 880 * t) * 0.5 +
        Math.sin(2 * Math.PI * 1320 * t) * 0.25 +
        Math.sin(2 * Math.PI * 1760 * t) * 0.12) *
      dec *
      0.6;
  }
  return c;
}

function rivelazione(): Float32Array {
  const c = secondi(6);
  const note = [261.63, 329.63, 392.0, 523.25]; // do-mi-sol-do
  for (let i = 0; i < c.length; i++) {
    const t = i / FREQ_CAMPIONAMENTO;
    let v = 0;
    note.forEach((f, k) => {
      const inizio = k * 0.4;
      if (t >= inizio) {
        const tt = t - inizio;
        v += Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 0.8) * 0.3;
      }
    });
    if (t > 5.2) v *= (6 - t) / 0.8;
    c[i] = v * 0.7;
  }
  return c;
}

function chiusura(): Float32Array {
  const c = secondi(10);
  const note = [196.0, 246.94, 293.66, 392.0]; // accordo caldo di sol
  for (let i = 0; i < c.length; i++) {
    const t = i / FREQ_CAMPIONAMENTO;
    const inviluppo = Math.min(1, t / 1.5) * (t > 7 ? Math.max(0, (10 - t) / 3) : 1);
    let v = 0;
    for (const f of note) v += Math.sin(2 * Math.PI * f * t + Math.sin(2 * Math.PI * 0.3 * t)) * 0.18;
    c[i] = v * inviluppo * 0.7;
  }
  return c;
}

interface DemoCue {
  titolo: string;
  nota: string;
  tipo: TipoCue;
  sulSottofondo: SulSottofondo;
  genera: () => Float32Array;
  durataSec: number;
  loop: boolean;
  volume: number;
}

/** Crea i 6 WAV nella cartella audio e restituisce il format demo. */
export function creaFormatDemo(cartellaAudio: string): Format {
  fs.mkdirSync(cartellaAudio, { recursive: true });

  const suoni: Record<string, DemoCue> = {
    treno: {
      titolo: "Treno in corsa", nota: "Suono base, gira da solo", tipo: "sottofondo",
      sulSottofondo: "niente", genera: trenoAtmosfera, durataSec: 20, loop: true, volume: 0.8,
    },
    tensione: {
      titolo: "Tensione", nota: "Prima del colpo di scena", tipo: "brano",
      sulSottofondo: "pausa", genera: tensione, durataSec: 8, loop: false, volume: 0.9,
    },
    sparo: {
      titolo: "Sparo", nota: "Il colpo!", tipo: "effetto",
      sulSottofondo: "abbassa", genera: sparo, durataSec: 1, loop: false, volume: 1,
    },
    campanello: {
      titolo: "Campanello", nota: "Arriva il capotreno", tipo: "effetto",
      sulSottofondo: "abbassa", genera: campanello, durataSec: 2, loop: false, volume: 0.9,
    },
    rivelazione: {
      titolo: "Rivelazione", nota: "Il colpevole è svelato", tipo: "brano",
      sulSottofondo: "pausa", genera: rivelazione, durataSec: 6, loop: false, volume: 0.9,
    },
    chiusura: {
      titolo: "Chiusura", nota: "Applausi e saluti", tipo: "brano",
      sulSottofondo: "pausa", genera: chiusura, durataSec: 10, loop: false, volume: 0.9,
    },
  };

  // Ogni cue ha il SUO file (eliminare un cue elimina il file:
  // due cue non devono mai condividerne uno).
  const creaCue = (chiave: string, ordine: number): Cue => {
    const d = suoni[chiave]!;
    const id = randomUUID();
    const file = `${id}.wav`;
    scriviWav(path.join(cartellaAudio, file), d.genera());
    return {
      id, titolo: d.titolo, nota: d.nota, tipo: d.tipo, file,
      fileOriginale: `${chiave}.wav`, durataSec: d.durataSec, volume: d.volume,
      loop: d.loop, sulSottofondo: d.sulSottofondo, colore: null, ordine,
    };
  };

  const fase = (nome: string, ordine: number, chiavi: string[]): Format["fasi"][number] => ({
    id: randomUUID(), nome, ordine,
    cue: chiavi.map((chiave, i) => creaCue(chiave, i)),
  });

  return {
    id: randomUUID(),
    nome: "Demo — Orient Express",
    ordine: 0,
    fasi: [
      fase("Accoglienza", 0, ["treno", "campanello"]),
      fase("Atto 1 – Omicidio", 1, ["tensione", "sparo"]),
      fase("Atto 2 – Indagini", 2, ["rivelazione", "campanello"]),
      fase("Finale", 3, ["chiusura"]),
    ],
  };
}

export function creaConfigIniziale(cartellaAudio: string, conDemo: boolean): Config {
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  return {
    versione: 1,
    impostazioni: { pin, volumeMaster: 0.8, fadeOutMs: 1500, livelloAbbassa: 0.2 },
    formats: conDemo ? [creaFormatDemo(cartellaAudio)] : [],
  };
}
