// Livello automatico: dal livello medio (RMS) e dal picco di un file al
// guadagno da applicare all'ascolto. I file su disco non si toccano mai.

/** Livello medio a cui portare ogni suono, in dBFS. */
export const OBIETTIVO_DB = -18;
/** Il guadagno automatico non supera mai questi limiti. */
export const GUADAGNO_MIN_DB = -12;
export const GUADAGNO_MAX_DB = 12;
/** Il picco, dopo il guadagno, non deve superare questo (niente distorsione). */
export const PICCO_MAX_DB = -1;
/** Sotto questo livello un tratto è "silenzio" e non conta nella media. */
export const SOGLIA_GATE_DB = -50;
/** Lunghezza dei tratti su cui si misura il gate, in secondi. */
const TRATTO_SEC = 0.4;
export const ANALISI_VERSIONE = 1 as const;

export function dbALineare(db: number): number {
  return Math.pow(10, db / 20);
}

export function lineareADb(x: number): number {
  if (x <= 0) return -100;
  return Math.max(-100, 20 * Math.log10(x));
}

/** Il guadagno automatico (dB) per un file con quel livello medio e quel picco. */
export function calcolaGuadagno(rmsDb: number, piccoDb: number): number {
  let g = OBIETTIVO_DB - rmsDb;
  g = Math.min(GUADAGNO_MAX_DB, Math.max(GUADAGNO_MIN_DB, g));
  // Ridotto quanto basta perché il picco non superi -1 dBFS.
  if (piccoDb + g > PICCO_MAX_DB) g = PICCO_MAX_DB - piccoDb;
  g = Math.min(GUADAGNO_MAX_DB, Math.max(GUADAGNO_MIN_DB, g));
  return Math.round(g * 10) / 10;
}

/** Il guadagno complessivo di una casella (auto + ritocco), in dB. */
export function guadagnoCasellaDb(cue: { guadagnoAuto?: number; ritocco?: number }): number {
  return (cue.guadagnoAuto ?? 0) + (cue.ritocco ?? 0);
}

/** Livello medio (RMS con gate a -50 dBFS, su tratti di 0,4 s) e picco, in dBFS.
 *  Riceve i canali già decodificati: pura, testabile senza Web Audio. */
export function analizzaCampioni(canali: readonly Float32Array[], sampleRate: number): { rms: number; picco: number } {
  if (canali.length === 0 || canali[0]!.length === 0) return { rms: -100, picco: -100 };
  const n = canali[0]!.length;
  const passo = Math.max(1, Math.round(sampleRate * TRATTO_SEC));
  let picco = 0;
  let sommaUtile = 0;
  let campioniUtili = 0;
  const sogliaLineare2 = dbALineare(SOGLIA_GATE_DB) ** 2;
  for (let inizio = 0; inizio < n; inizio += passo) {
    const fine = Math.min(n, inizio + passo);
    let somma = 0;
    for (const canale of canali) {
      for (let i = inizio; i < fine; i++) {
        const v = canale[i]!;
        const a = v < 0 ? -v : v;
        if (a > picco) picco = a;
        somma += v * v;
      }
    }
    const conteggio = (fine - inizio) * canali.length;
    const media2 = somma / conteggio;
    if (media2 >= sogliaLineare2) {
      sommaUtile += somma;
      campioniUtili += conteggio;
    }
  }
  const rms = campioniUtili > 0 ? lineareADb(Math.sqrt(sommaUtile / campioniUtili)) : -100;
  return { rms: Math.round(rms * 10) / 10, picco: Math.round(lineareADb(picco) * 10) / 10 };
}
