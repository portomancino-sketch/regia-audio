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

  /** Precarica in memoria i file corti di un format (latenza zero in serata). */
  async caricaFormat(format: Format): Promise<void> {
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
    this.applica(stopTutto(this.stato));
  }

  fadeOut(): void {
    this.applica(fadeOut(this.stato));
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
        this.rampaGain(gain, a.guadagno, RAMPA_AVVIO_MS);
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
        this.rampaGain(gain, a.guadagno, RAMPA_AVVIO_MS);
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

  private ferma(istanzaId: string, rampMs: number): void {
    const istanza = this.istanze.get(istanzaId);
    if (!istanza) return;
    istanza.terminata = true;
    if (istanza.timerPendente) clearTimeout(istanza.timerPendente);
    this.rampaGain(istanza.gain, 0, rampMs);
    istanza.timerPendente = window.setTimeout(() => this.pulisci(istanzaId), rampMs + 30);
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

  /** L'elenco di ciò che sta suonando, con le posizioni. */
  attivi(): CueAttivo[] {
    const lista: CueAttivo[] = [];
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
    for (const id of [...this.istanze.keys()]) this.pulisci(id);
    void this.ctx.close();
  }
}
