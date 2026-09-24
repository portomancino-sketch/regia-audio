// Il motore audio: esegue le azioni decise dalle regole con Web Audio.
// Esiste SOLO nella pagina Regia; il telefono non suona mai nulla.
import type { Cue, CueAttivo, Format } from "../../../shared/tipi";
import {
  statoIniziale,
  premi,
  stop,
  sfumaCue,
  parla,
  stopTutto,
  fadeOut,
  master,
  finita,
  volumeCue,
  type Azione,
  type StatoRegole,
  type Risultato,
} from "../../../shared/regole";

/** Sotto questa durata il file viene precaricato in memoria (latenza zero). */
const SOGLIA_STREAMING_SEC = 180;
const RAMPA_AVVIO_MS = 15;

interface IstanzaMotore {
  cue: Cue;
  gain: GainNode;
  guadagno: number;
  loop: boolean;
  terminata: boolean;
  inPausa: boolean;
  timerPendente: number | null;
  // Sorgente in memoria (file corti)
  buffer?: AudioBuffer;
  source?: AudioBufferSourceNode;
  avviataA: number;
  offset: number;
  // Sorgente in streaming (file lunghi)
  el?: HTMLAudioElement;
  nodo?: MediaElementAudioSourceNode;
}

export class MotoreAudio {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private stato: StatoRegole;
  private istanze = new Map<string, IstanzaMotore>();
  private cache = new Map<string, AudioBuffer>();
  /** Chiamato a ogni cambiamento che merita un nuovo "stato" in giro. */
  onCambiamento: (() => void) | null = null;
  /** Chiamato quando una casella parte davvero (non nel soundcheck): conta gli usi. */
  onAvvio: ((cue: Cue) => void) | null = null;
  /** Il suono di prova (soundcheck o anteprima "Ascolta"), fuori dalle regole. */
  private prova: {
    cue: Cue;
    gain: GainNode;
    source?: AudioBufferSourceNode;
    el?: HTMLAudioElement;
    avviataA: number;
    anteprima: boolean;
    fine: () => void;
  } | null = null;

  constructor(opzioni: { master: number; livelloAbbassa: number; fadeOutMs: number; livelloParla?: number }) {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1; // il master è già dentro i guadagni delle istanze
    this.masterGain.connect(this.ctx.destination);
    this.stato = statoIniziale(opzioni);
  }

  /** Da chiamare dopo un click dell'utente per sbloccare l'audio. */
  async sblocca(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  get sbloccato(): boolean {
    return this.ctx.state === "running";
  }

  get masterCorrente(): number {
    return this.stato.master;
  }

  aggiornaImpostazioni(o: { livelloAbbassa?: number; fadeOutMs?: number; livelloParla?: number }): void {
    if (o.livelloAbbassa !== undefined) this.stato = { ...this.stato, livelloAbbassa: o.livelloAbbassa };
    if (o.fadeOutMs !== undefined) this.stato = { ...this.stato, fadeOutMs: o.fadeOutMs };
    if (o.livelloParla !== undefined) this.stato = { ...this.stato, livelloParla: o.livelloParla };
  }

  get parlaAttivo(): boolean {
    return this.stato.parla;
  }

  setParla(acceso: boolean): void {
    this.applica(parla(this.stato, acceso));
  }

  /** Precarica in memoria i file corti di un format (latenza zero in serata).
   *  Imposta anche il passaggio morbido tra sottofondi del format (default 2 s). */
  async caricaFormat(format: Format): Promise<void> {
    this.stato = { ...this.stato, crossfadeMs: Math.round((format.crossfade ?? 2) * 1000) };
    const daCaricare: Cue[] = [];
    for (const fase of format.fasi) {
      for (const cue of fase.cue) {
        if (cue.file && (cue.durataSec ?? 0) < SOGLIA_STREAMING_SEC && !this.cache.has(cue.file)) {
          daCaricare.push(cue);
        }
      }
    }
    await Promise.all(
      daCaricare.map(async (cue) => {
        try {
          const r = await fetch(`/audio/${cue.file}`);
          const dati = await r.arrayBuffer();
          const buffer = await this.ctx.decodeAudioData(dati);
          this.cache.set(cue.file!, buffer);
        } catch {
          // Se il precarico fallisce, il file verrà tentato al momento del play.
        }
      }),
    );
  }

  premi(cue: Cue): void {
    // I promemoria non suonano mai, anche se un play arrivasse per sbaglio.
    if (cue.tipo === "promemoria" || !cue.file) return;
    this.ultimoCuePremuto = cue;
    this.applica(premi(this.stato, cue));
  }

  stop(cueId: string): void {
    this.applica(stop(this.stato, cueId));
  }

  sfuma(cueId: string): void {
    this.applica(sfumaCue(this.stato, cueId));
  }

  stopTutto(): void {
    if (this.prova?.anteprima) this.interrompiProva();
    this.applica(stopTutto(this.stato));
  }

  fadeOut(): void {
    if (this.prova?.anteprima) this.interrompiProva();
    this.applica(fadeOut(this.stato));
  }

  /** Anteprima "Ascolta" da Modifica: il file intero, fuori dalle regole, ma tra gli attivi. */
  anteprima(cue: Cue): Promise<void> {
    return this.provaCue(cue, null, true).then(() => undefined);
  }

  /** La casella in anteprima adesso (null se nessuna). */
  get anteprimaInCorso(): string | null {
    return this.prova?.anteprima ? this.prova.cue.id : null;
  }

  setMaster(valore: number): void {
    this.applica(master(this.stato, valore));
  }

  setVolumeCue(cueId: string, volume: number): void {
    this.applica(volumeCue(this.stato, cueId, volume));
  }

  private applica(r: Risultato): void {
    this.stato = r.stato;
    for (const a of r.azioni) this.esegui(a);
    this.onCambiamento?.();
  }

  private esegui(a: Azione): void {
    switch (a.tipo) {
      case "avvia":
        void this.avvia(a);
        break;
      case "ferma":
        this.ferma(a.istanzaId, a.rampMs);
        break;
      case "mettiInPausa":
        this.mettiInPausa(a.istanzaId, a.rampMs);
        break;
      case "riprendi":
        this.riprendi(a.istanzaId, a.guadagno, a.rampMs);
        break;
      case "cambiaGuadagno":
        this.rampa(a.istanzaId, a.guadagno, a.rampMs);
        break;
    }
  }

  private ultimoCuePremuto: Cue | null = null;

  private async avvia(a: Extract<Azione, { tipo: "avvia" }>): Promise<void> {
    const infoRegole = this.stato.attivi.find((i) => i.istanzaId === a.istanzaId);
    const cue = this.ultimoCuePremuto && this.ultimoCuePremuto.id === a.cueId ? this.ultimoCuePremuto : null;
    const file = cue?.file;
    if (!file || !infoRegole) return;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterGain);

    const istanza: IstanzaMotore = {
      cue,
      gain,
      guadagno: a.guadagno,
      loop: a.loop,
      terminata: false,
      inPausa: a.inPausa,
      timerPendente: null,
      avviataA: this.ctx.currentTime,
      offset: 0,
    };
    this.istanze.set(a.istanzaId, istanza);
    this.onAvvio?.(cue);

    const streaming = (cue.durataSec ?? 0) >= SOGLIA_STREAMING_SEC;
    if (streaming) {
      const el = new Audio(`/audio/${file}`);
      el.preload = "auto";
      el.loop = a.loop;
      istanza.el = el;
      istanza.nodo = this.ctx.createMediaElementSource(el);
      istanza.nodo.connect(gain);
      el.addEventListener("ended", () => this.segnalaFinita(a.istanzaId));
      if (!a.inPausa) {
        void el.play().catch(() => this.segnalaFinita(a.istanzaId));
        this.rampaGain(gain, a.guadagno, a.rampMs ?? RAMPA_AVVIO_MS);
      }
    } else {
      let buffer = this.cache.get(file);
      if (!buffer) {
        try {
          const r = await fetch(`/audio/${file}`);
          buffer = await this.ctx.decodeAudioData(await r.arrayBuffer());
          this.cache.set(file, buffer);
        } catch {
          this.segnalaFinita(a.istanzaId);
          return;
        }
        // Mentre scaricavamo, l'istanza potrebbe essere già stata fermata.
        if (!this.istanze.has(a.istanzaId) || istanza.terminata) return;
      }
      istanza.buffer = buffer;
      if (!a.inPausa) {
        this.avviaSorgenteBuffer(a.istanzaId, istanza, 0);
        this.rampaGain(gain, a.guadagno, a.rampMs ?? RAMPA_AVVIO_MS);
      }
    }
    this.onCambiamento?.();
  }

  private avviaSorgenteBuffer(istanzaId: string, istanza: IstanzaMotore, offset: number): void {
    if (!istanza.buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = istanza.buffer;
    source.loop = istanza.loop;
    source.connect(istanza.gain);
    source.onended = () => {
      if (!istanza.terminata && !istanza.inPausa) this.segnalaFinita(istanzaId);
    };
    source.start(0, offset % istanza.buffer.duration);
    istanza.source = source;
    istanza.avviataA = this.ctx.currentTime;
    istanza.offset = offset;
    istanza.inPausa = false;
  }

  /** Il motore va avvisato quando un file finisce da solo. */
  private segnalaFinita(istanzaId: string): void {
    const istanza = this.istanze.get(istanzaId);
    if (!istanza || istanza.terminata) return;
    this.pulisci(istanzaId);
    this.applica(finita(this.stato, istanzaId));
  }

  /** Ferma un'istanza con una rampa. Se stava già sfumando (sottofondo in uscita
   *  durante un passaggio), la rampa nuova sostituisce quella vecchia: così
   *  STOP TUTTO e FADE OUT interrompono anche un passaggio in corso. */
  private ferma(istanzaId: string, rampMs: number): void {
    const istanza = this.istanze.get(istanzaId);
    if (!istanza) return;
    istanza.terminata = true;
    if (istanza.timerPendente) clearTimeout(istanza.timerPendente);
    this.rampaGain(istanza.gain, 0, rampMs);
    istanza.timerPendente = window.setTimeout(() => {
      this.pulisci(istanzaId);
      // Un sottofondo in uscita ha finito: le regole lo tolgono dall'elenco.
      if (this.stato.uscite.some((u) => u.istanzaId === istanzaId)) this.applica(finita(this.stato, istanzaId));
    }, rampMs + 30);
  }

  /** Solo per le prove: il guadagno attuale di ogni nodo vivo (attivi e in uscita). */
  guadagniAttuali(): { istanzaId: string; cueId: string; gain: number; inUscita: boolean }[] {
    const attivi = new Set(this.stato.attivi.map((i) => i.istanzaId));
    return [...this.istanze.entries()].map(([id, m]) => ({
      istanzaId: id,
      cueId: m.cue.id,
      gain: m.gain.gain.value,
      inUscita: !attivi.has(id),
    }));
  }

  private pulisci(istanzaId: string): void {
    const istanza = this.istanze.get(istanzaId);
    if (!istanza) return;
    istanza.terminata = true;
    if (istanza.timerPendente) clearTimeout(istanza.timerPendente);
    try {
      istanza.source?.stop();
    } catch {
      /* già ferma */
    }
    if (istanza.el) {
      istanza.el.pause();
      istanza.el.src = "";
    }
    istanza.gain.disconnect();
    this.istanze.delete(istanzaId);
  }

  private mettiInPausa(istanzaId: string, rampMs: number): void {
    const istanza = this.istanze.get(istanzaId);
    if (!istanza || istanza.inPausa) return;
    istanza.inPausa = true;
    if (istanza.timerPendente) clearTimeout(istanza.timerPendente);
    this.rampaGain(istanza.gain, 0, rampMs);
    istanza.timerPendente = window.setTimeout(() => {
      if (istanza.terminata || !istanza.inPausa) return;
      if (istanza.el) {
        istanza.el.pause();
      } else if (istanza.source && istanza.buffer) {
        // Ricorda la posizione e ferma la sorgente (mantiene il punto).
        const suonata = this.ctx.currentTime - istanza.avviataA;
        istanza.offset = (istanza.offset + suonata) % istanza.buffer.duration;
        istanza.source.onended = null;
        try {
          istanza.source.stop();
        } catch {
          /* già ferma */
        }
        istanza.source = undefined;
      }
    }, rampMs + 10);
  }

  private riprendi(istanzaId: string, guadagno: number, rampMs: number): void {
    const istanza = this.istanze.get(istanzaId);
    if (!istanza || istanza.terminata) return;
    if (istanza.timerPendente) clearTimeout(istanza.timerPendente);
    istanza.guadagno = guadagno;
    if (istanza.el) {
      istanza.inPausa = false;
      void istanza.el.play().catch(() => undefined);
    } else if (istanza.inPausa) {
      if (istanza.source) {
        // La rampa di pausa non era ancora finita: la sorgente suona ancora.
        istanza.inPausa = false;
      } else {
        this.avviaSorgenteBuffer(istanzaId, istanza, istanza.offset);
      }
    }
    this.rampaGain(istanza.gain, guadagno, rampMs);
  }

  private rampa(istanzaId: string, guadagno: number, rampMs: number): void {
    const istanza = this.istanze.get(istanzaId);
    if (!istanza) return;
    istanza.guadagno = guadagno;
    this.rampaGain(istanza.gain, guadagno, rampMs);
  }

  private rampaGain(gain: GainNode, valore: number, rampMs: number): void {
    const ora = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(ora);
    gain.gain.setValueAtTime(gain.gain.value, ora);
    gain.gain.linearRampToValueAtTime(valore, ora + Math.max(0.005, rampMs / 1000));
  }

  // ---- Soundcheck "Prova tutti": suona N secondi di una casella, fuori dalle regole ----

  /** Suona `durataMs` di una casella (null = tutto il file) a master × volume × guadagno dB
   *  e misura il picco. Risolve quando la prova finisce o viene interrotta. */
  async provaCue(
    cue: Cue,
    durataMs: number | null,
    anteprima = false,
  ): Promise<{ esito: "ok" | "mancante" | "nonDecodificabile"; picco: number | null }> {
    if (!cue.file) return { esito: "mancante", picco: null };
    const streaming = (cue.durataSec ?? 0) >= SOGLIA_STREAMING_SEC;
    let buffer: AudioBuffer | undefined = this.cache.get(cue.file);
    if (!buffer && !streaming) {
      let dati: ArrayBuffer;
      try {
        const r = await fetch(`/audio/${cue.file}`);
        if (!r.ok) return { esito: "mancante", picco: null };
        dati = await r.arrayBuffer();
      } catch {
        return { esito: "mancante", picco: null };
      }
      try {
        buffer = await this.ctx.decodeAudioData(dati);
        this.cache.set(cue.file, buffer);
      } catch {
        return { esito: "nonDecodificabile", picco: null };
      }
    }
    if (streaming) {
      // File lungo: non si decodifica tutto in Live. Si verifica solo che esista.
      try {
        const r = await fetch(`/audio/${cue.file}`, { method: "HEAD" });
        if (!r.ok) return { esito: "mancante", picco: null };
      } catch {
        return { esito: "mancante", picco: null };
      }
    }
    const picco = buffer ? piccoBuffer(buffer) : null;

    this.interrompiProva();
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterGain);
    const guadagno = this.stato.master * cue.volume * Math.pow(10, ((cue.guadagnoAuto ?? 0) + (cue.ritocco ?? 0)) / 20);
    await new Promise<void>((risolvi) => {
      let chiusa = false;
      const fine = () => {
        if (chiusa) return;
        chiusa = true;
        clearTimeout(timer);
        this.rampaGain(gain, 0, 30);
        window.setTimeout(() => {
          try {
            prova.source?.stop();
          } catch {
            /* già ferma */
          }
          if (prova.el) {
            prova.el.pause();
            prova.el.src = "";
          }
          gain.disconnect();
        }, 60);
        if (this.prova === prova) this.prova = null;
        this.onCambiamento?.();
        risolvi();
      };
      const prova = { cue, gain, avviataA: this.ctx.currentTime, anteprima, fine } as NonNullable<MotoreAudio["prova"]>;
      this.prova = prova;
      if (buffer) {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.onended = fine;
        source.start(0);
        prova.source = source;
      } else {
        const el = new Audio(`/audio/${cue.file}`);
        el.preload = "auto";
        prova.el = el;
        this.ctx.createMediaElementSource(el).connect(gain);
        el.addEventListener("ended", fine);
        void el.play().catch(fine);
      }
      this.rampaGain(gain, guadagno, RAMPA_AVVIO_MS);
      const timer = durataMs === null ? 0 : window.setTimeout(fine, durataMs);
      this.onCambiamento?.();
    });
    return { esito: "ok", picco };
  }

  /** Ferma subito il suono di prova in corso (ESC o pulsante). */
  interrompiProva(): void {
    this.prova?.fine();
  }

  /** L'elenco di ciò che sta suonando, con le posizioni. */
  attivi(): CueAttivo[] {
    const lista: CueAttivo[] = [];
    if (this.prova) {
      const p = this.prova;
      lista.push({
        istanzaId: p.anteprima ? "anteprima" : "soundcheck",
        cueId: p.cue.id,
        titolo: p.cue.titolo,
        tipo: p.cue.tipo,
        posizioneSec: Math.round((this.ctx.currentTime - p.avviataA) * 10) / 10,
        durataSec: p.anteprima ? p.cue.durataSec : 3,
        inPausa: false,
        ...(p.anteprima ? { anteprima: true } : {}),
      });
    }
    for (const i of this.stato.attivi) {
      const m = this.istanze.get(i.istanzaId);
      let posizione = 0;
      if (m) {
        if (m.el) {
          posizione = m.el.currentTime;
        } else if (m.inPausa || !m.source) {
          posizione = m.offset;
        } else {
          const suonata = this.ctx.currentTime - m.avviataA + m.offset;
          const durata = m.buffer?.duration ?? i.durataSec ?? 0;
          posizione = m.loop && durata > 0 ? suonata % durata : Math.min(suonata, durata || suonata);
        }
      }
      lista.push({
        istanzaId: i.istanzaId,
        cueId: i.cueId,
        titolo: i.titolo,
        tipo: i.tipo,
        posizioneSec: Math.round(posizione * 10) / 10,
        durataSec: i.durataSec,
        inPausa: i.inPausa,
        loop: i.loop,
      });
    }
    return lista;
  }

  spegni(): void {
    this.interrompiProva();
    for (const id of [...this.istanze.keys()]) this.pulisci(id);
    void this.ctx.close();
  }
}

/** Il picco assoluto (0..1) di un buffer decodificato. */
function piccoBuffer(buffer: AudioBuffer): number {
  let picco = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const dati = buffer.getChannelData(c);
    for (let i = 0; i < dati.length; i++) {
      const v = dati[i]! < 0 ? -dati[i]! : dati[i]!;
      if (v > picco) picco = v;
    }
  }
  return picco;
}
