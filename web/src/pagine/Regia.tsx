// La pagina Regia (sul Mac): Home, Modifica, Live e il motore audio.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Comando, Config, Cue, CueAttivo, Format, StatoLive } from "../../../shared/tipi";
import { inEvidenza } from "../../../shared/sempre";
import { SOUNDCHECK_DURATA_MS, SOUNDCHECK_PAUSA_MS, sequenzaSoundcheck, piccoInDb, type EsitoCasella } from "../../../shared/soundcheck";
import { azzeraUsi, giornoDi, incrementaUsi, usiDelGiorno, type Usi } from "../../../shared/usi";
import type { SoundcheckSerata } from "../../../shared/serata";
import { api, type RiepilogoWeb, type SerataOggi } from "../api";
import { ClientWs } from "../ws";
import { MotoreAudio } from "../motore/motore";
import { BookOpenText, CalendarClock, ChevronLeft, Lightbulb, ListChecks, Lock, LockOpen, Volume2 } from "lucide-react";
import { EsitoSoundcheck } from "../componenti/EsitoSoundcheck";
import { FoglioInizio } from "../componenti/FoglioInizio";
import { AvvisoSoundcheck } from "../componenti/AvvisoSoundcheck";
import { FinestraRiepilogo } from "../componenti/RiepilogoSerata";
import { Home } from "./Home";
import { Diario } from "./Diario";
import { Luci } from "./Luci";
import { useLuciLive, useSerata } from "../hooks";
import { EFFETTI } from "../../../shared/luci";
import { Modifica } from "./Modifica";
import { Live } from "./Live";
import { PannelloTelecomando } from "./PannelloTelecomando";
import { BarraLive } from "../componenti/BarraLive";
import { RigaSempre } from "../componenti/RigaSempre";
import { InputInline } from "../componenti/comuni";
import { ControlloSegmentato } from "../componenti/ui/ControlloSegmentato";
import { Pulsante } from "../componenti/ui/Pulsante";
import { InterruttoreTema } from "../componenti/ui/InterruttoreTema";
import { useAttiviFluidi } from "../hooks";
import { Slider } from "../componenti/ui/Slider";

type Vista = "modifica" | "live";

export function PaginaRegia() {
  const [config, setConfig] = useState<Config | null>(null);
  const configRef = useRef<Config | null>(null);
  const [percorso, setPercorso] = useState(location.pathname);
  const percorsoRef = useRef(location.pathname);
  // Quante pagine ha aperto QUESTA app (per "Indietro": mai uscire dalla Regia).
  const profonditaRef = useRef(0);
  const [vista, setVista] = useState<Vista>("modifica");
  const [sonoIlMotore, setSonoIlMotore] = useState(false);
  const sonoIlMotoreRef = useRef(false);
  const sessione = useRef({ sessioneId: crypto.randomUUID(), apertaAlle: Date.now() });
  const [audioAttivo, setAudioAttivo] = useState(false);
  const [attivi, setAttivi] = useState<CueAttivo[]>([]);
  const [masterUi, setMasterUi] = useState(0.8);
  const [statoRemoto, setStatoRemoto] = useState<StatoLive | null>(null);
  const [telefoni, setTelefoni] = useState<{ ip: string }[]>([]);
  const [liveIds, setLiveIds] = useState<{ formatId: string | null; faseId: string | null }>({
    formatId: null,
    faseId: null,
  });
  // PARLA (abbassa il sottofondo per la voce).
  const [parlaUi, setParlaUi] = useState(false);
  const parlaUiRef = useRef(false);
  // Promemoria spuntati (condivisi con i telefoni via stato).
  const [fatti, setFatti] = useState<string[]>([]);
  const fattiRef = useRef<string[]>([]);
  // Contatori "già suonato" (condivisi via stato; memoria locale per il giorno).
  const [usi, setUsi] = useState<Usi>(() => leggiUsiSalvati());
  const usiRef = useRef<Usi>(usi);
  // Soundcheck "Prova tutti".
  const [soundcheck, setSoundcheck] = useState<{ indice: number; totale: number } | null>(null);
  const soundcheckRef = useRef<{ indice: number; totale: number; annullato: boolean } | null>(null);
  const [esitoSoundcheck, setEsitoSoundcheck] = useState<EsitoCasella[] | null>(null);
  const [esitoLuci, setEsitoLuci] = useState<string | null>(null);
  const [esitoProvate, setEsitoProvate] = useState<number | undefined>(undefined);
  /** L'ultimo esito completo di questa finestra (per "vedi l'esito" dal foglio). */
  const [ultimoEsito, setUltimoEsito] = useState<{ formatId: string; esiti: EsitoCasella[]; luci: string | null } | null>(null);
  // La serata di oggi: soundcheck fatto/non fatto per format, avviso già mostrato.
  const { serata, ricarica: ricaricaSerata } = useSerata(true);
  const serataRef = useRef<SerataOggi | null>(null);
  const ricaricaSerataRef = useRef(ricaricaSerata);
  ricaricaSerataRef.current = ricaricaSerata;
  // "Non hai ancora provato i suoni di oggi": una volta per serata.
  const [avvisoSoundcheck, setAvvisoSoundcheck] = useState(false);
  const avvisoMostratoRef = useRef(false);
  // "Chiudi serata": conferma, poi il riepilogo.
  const [confermaChiusura, setConfermaChiusura] = useState(false);
  const [riepilogoChiusura, setRiepilogoChiusura] = useState<{ data: string; serata: number; r: RiepilogoWeb } | null>(null);
  /** Per quale serata il foglio "Prima di iniziare" è già stato aperto in questa finestra. */
  const foglioSerataRef = useRef<string | null>(null);
  // Luci, mondo di Valerio: nomi, colori, abbinata, risponde.
  const { luci, ricarica: ricaricaLuci } = useLuciLive(true);
  // Suggerimento "Vuoi bloccare le modifiche per la serata?" (una volta al giorno).
  const [suggerisciBlocco, setSuggerisciBlocco] = useState(false);
  // Anteprima "Ascolta" da Modifica: la casella chiesta quando la finestra non comanda.
  const [anteprimaRichiesta, setAnteprimaRichiesta] = useState<Cue | null>(null);
  // Foglio "Prima di iniziare".
  const [foglioAperto, setFoglioAperto] = useState(false);
  // Indicatore "Salvato" nella barra in alto.
  const [salvataggi, setSalvataggi] = useState(0);
  const [salvatoAlmeno, setSalvatoAlmeno] = useState(false);
  const salvataggiPrima = useRef(0);
  const liveRef = useRef(liveIds);
  const motoreRef = useRef<MotoreAudio | null>(null);
  const wsRef = useRef<ClientWs | null>(null);
  const vistaRef = useRef<Vista>("modifica");
  // Posizioni che scorrono fluide tra un aggiornamento di stato e l'altro.
  const attiviFluidi = useAttiviFluidi(attivi);

  useEffect(() => {
    vistaRef.current = vista;
  }, [vista]);
  useEffect(() => {
    percorsoRef.current = percorso;
  }, [percorso]);

  useEffect(() => {
    parlaUiRef.current = parlaUi;
  }, [parlaUi]);
  useEffect(() => {
    serataRef.current = serata;
    // Serata nuova (o riletta): l'avviso vale quello che dice il diario.
    if (serata) avvisoMostratoRef.current = serata.avvisoMostrato;
  }, [serata]);

  // ---- Stato live in giro per tutti ----
  const inviaStatoRef = useRef<() => void>(() => undefined);
  const inviaStato = useCallback(() => {
    const m = motoreRef.current;
    if (!m || !sonoIlMotoreRef.current) return;
    const s: StatoLive = {
      tipo: "stato",
      formatId: liveRef.current.formatId,
      faseId: liveRef.current.faseId,
      master: m.masterCorrente,
      attivi: m.attivi(),
      motoreOnline: true,
      fatti: fattiRef.current,
      parla: m.parlaAttivo,
      usi: usiRef.current,
      soundcheck: soundcheckRef.current
        ? { indice: soundcheckRef.current.indice, totale: soundcheckRef.current.totale }
        : null,
    };
    wsRef.current?.invia(s);
    setAttivi(s.attivi);
    setMasterUi(s.master);
    setParlaUi(s.parla === true);
  }, []);
  inviaStatoRef.current = inviaStato;

  const impostaLive = useCallback(
    (formatId: string | null, faseId: string | null) => {
      // Aprire un altro format azzera le spunte e spegne PARLA.
      if (formatId !== liveRef.current.formatId) {
        fattiRef.current = [];
        setFatti([]);
        motoreRef.current?.setParla(false);
      }
      liveRef.current = { formatId, faseId };
      setLiveIds({ formatId, faseId });
      inviaStato();
    },
    [inviaStato],
  );

  const spuntaCue = useCallback(
    (cueId: string) => {
      fattiRef.current = fattiRef.current.includes(cueId)
        ? fattiRef.current.filter((id) => id !== cueId)
        : [...fattiRef.current, cueId];
      setFatti(fattiRef.current);
      inviaStato();
    },
    [inviaStato],
  );

  const azzeraSpunteFase = useCallback(
    (faseId: string) => {
      const fase = configRef.current?.formats.flatMap((f) => f.fasi).find((x) => x.id === faseId);
      if (!fase) return;
      const daTogliere = new Set(fase.cue.map((c) => c.id));
      fattiRef.current = fattiRef.current.filter((id) => !daTogliere.has(id));
      setFatti(fattiRef.current);
      inviaStato();
    },
    [inviaStato],
  );

  const aggiornaUsi = useCallback(
    (nuovi: Usi) => {
      usiRef.current = nuovi;
      setUsi(nuovi);
      salvaUsi(nuovi);
      inviaStato();
    },
    [inviaStato],
  );

  /** "Azzera serata" di una fase: spunte E contatori delle sue caselle. */
  const azzeraSerataFase = useCallback(
    (faseId: string) => {
      const fase = configRef.current?.formats.flatMap((f) => f.fasi).find((x) => x.id === faseId);
      if (!fase) return;
      const ids = fase.cue.map((c) => c.id);
      const daTogliere = new Set(ids);
      fattiRef.current = fattiRef.current.filter((id) => !daTogliere.has(id));
      setFatti(fattiRef.current);
      aggiornaUsi(azzeraUsi(usiRef.current, ids));
    },
    [aggiornaUsi],
  );

  /** "Chiudi serata": via tutte le spunte e tutti i contatori "già suonato". */
  const azzeraTutto = useCallback(() => {
    fattiRef.current = [];
    setFatti([]);
    aggiornaUsi({});
  }, [aggiornaUsi]);

  const trovaCue = useCallback((cueId: string): Cue | null => {
    for (const f of configRef.current?.formats ?? []) {
      for (const fase of f.fasi) {
        const c = fase.cue.find((x) => x.id === cueId);
        if (c) return c;
      }
    }
    return null;
  }, []);

  const gestisciComando = useCallback(
    (c: Comando) => {
      const m = motoreRef.current;
      if (!m) return;
      // Durante il soundcheck i comandi dei telefoni vengono ignorati.
      if (soundcheckRef.current) return;
      switch (c.comando) {
        case "play": {
          const cue = trovaCue(c.cueId);
          if (cue) m.premi(cue);
          break;
        }
        case "stop":
          m.stop(c.cueId);
          break;
        case "sfuma":
          m.sfuma(c.cueId);
          break;
        case "spunta":
          spuntaCue(c.cueId);
          break;
        case "azzeraSpunte":
          azzeraSpunteFase(c.faseId);
          break;
        case "azzeraSerata":
          azzeraSerataFase(c.faseId);
          break;
        case "azzeraTutto":
          azzeraTutto();
          break;
        case "parla":
          m.setParla(c.acceso);
          break;
        case "fade":
          m.fadeOut();
          break;
        case "stopTutto":
          m.stopTutto();
          break;
        case "master":
          m.setMaster(c.valore);
          break;
        case "fase":
          impostaLive(liveRef.current.formatId, c.faseId);
          break;
        case "format": {
          const format = configRef.current?.formats.find((f) => f.id === c.formatId);
          if (format && !format.archiviato) {
            const primaFase = [...format.fasi].sort((a, b) => a.ordine - b.ordine)[0];
            apriFoglioSeServe(format);
            impostaLive(format.id, primaFase?.id ?? null);
            void m.caricaFormat(format);
            // La pagina Regia segue: apre quel format in Live.
            history.pushState(null, "", `/format/${format.id}`);
            setPercorso(`/format/${format.id}`);
            setVista("live");
          }
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [impostaLive, trovaCue, spuntaCue, azzeraSpunteFase, azzeraSerataFase, azzeraTutto],
  );

  /** Il foglio "Prima di iniziare" si apre quando si entra in Live con un format
   *  (o un altro format), e di nuovo al prossimo avvio dopo "Chiudi serata". */
  function apriFoglioSeServe(format: Format) {
    const idSerata = serataRef.current?.id ?? null;
    if (liveRef.current.formatId !== format.id || foglioSerataRef.current !== idSerata) {
      foglioSerataRef.current = idSerata;
      setFoglioAperto(true);
    }
  }

  const ricaricaConfig = useCallback(async () => {
    const c = await api.config();
    configRef.current = c;
    setConfig(c);
    // Un format archiviato non si può usare in Live: se era quello aperto, si passa al primo non archiviato.
    const aperto = c.formats.find((f) => f.id === liveRef.current.formatId);
    if (aperto?.archiviato && sonoIlMotoreRef.current) {
      const primo = [...c.formats].filter((f) => !f.archiviato).sort((a, b) => a.ordine - b.ordine)[0];
      const primaFase = primo ? [...primo.fasi].sort((a, b) => a.ordine - b.ordine)[0] : undefined;
      motoreRef.current?.stopTutto();
      liveRef.current = { formatId: primo?.id ?? null, faseId: primaFase?.id ?? null };
      setLiveIds(liveRef.current);
      if (primo) void motoreRef.current?.caricaFormat(primo);
      if (vistaRef.current === "live") setVista("modifica");
      setTimeout(() => inviaStatoRef.current(), 0);
    }
    motoreRef.current?.aggiornaImpostazioni({
      livelloAbbassa: c.impostazioni.livelloAbbassa,
      fadeOutMs: c.impostazioni.fadeOutMs,
      livelloParla: c.impostazioni.livelloParla ?? 0.25,
    });
    return c;
  }, []);

  // ---- Avvio ----
  useEffect(() => {
    void ricaricaConfig().then((c) => setMasterUi(c.impostazioni.volumeMaster));

    const ws = new ClientWs(
      "regia",
      () => null,
      {
      ruoloAssegnato: (motore) => {
        sonoIlMotoreRef.current = motore;
        setSonoIlMotore(motore);
      },
      motoreSostituito: () => {
        // Un'altra finestra ha preso il comando: qui si fa silenzio.
        motoreRef.current?.stopTutto();
        sonoIlMotoreRef.current = false;
        setSonoIlMotore(false);
      },
      comando: (c) => {
        if (sonoIlMotoreRef.current) gestisciComando(c);
      },
      stato: (s) => {
        if (!sonoIlMotoreRef.current) {
          setStatoRemoto(s);
          setAttivi(s.attivi);
          setMasterUi(s.master);
          fattiRef.current = s.fatti ?? [];
          setFatti(s.fatti ?? []);
          usiRef.current = s.usi ?? {};
          setUsi(s.usi ?? {});
          setSoundcheck(s.soundcheck ?? null);
          setParlaUi(s.parla === true);
          liveRef.current = { formatId: s.formatId, faseId: s.faseId };
          setLiveIds({ formatId: s.formatId, faseId: s.faseId });
        }
      },
      telefoni: setTelefoni,
      configCambiata: () => void ricaricaConfig(),
      serataCambiata: () => ricaricaSerataRef.current(),
      },
      () => sessione.current,
    );
    wsRef.current = ws;
    if (new URLSearchParams(location.search).has("prova")) {
      (window as unknown as { __ws?: ClientWs }).__ws = ws;
    }

    // La pagina si sgancia quando si chiude e si ripresenta quando torna visibile.
    const suPagehide = () => ws.invia({ tipo: "rilascio" });
    window.addEventListener("pagehide", suPagehide);
    window.addEventListener("beforeunload", suPagehide);


    const suPopstate = () => {
      profonditaRef.current = Math.max(0, profonditaRef.current - 1);
      setPercorso(location.pathname);
    };
    window.addEventListener("popstate", suPopstate);

    // Lo schermo del Mac resta acceso (localhost è un contesto sicuro).
    let wakeLock: { release: () => Promise<void> } | null = null;
    const prendiWakeLock = async () => {
      try {
        wakeLock = await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<never> } }).wakeLock?.request?.("screen") ?? null;
      } catch {
        /* niente wake lock, pazienza */
      }
    };
    void prendiWakeLock();
    const suVisibilita = () => {
      if (document.visibilityState === "visible") void prendiWakeLock();
    };
    document.addEventListener("visibilitychange", suVisibilita);

    return () => {
      ws.chiudi();
      window.removeEventListener("pagehide", suPagehide);
      window.removeEventListener("beforeunload", suPagehide);
      window.removeEventListener("popstate", suPopstate);
      document.removeEventListener("visibilitychange", suVisibilita);
      void wakeLock?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Il motore nasce quando questa finestra è "quella che suona" ----
  useEffect(() => {
    if (!sonoIlMotore || !config || motoreRef.current) return;
    const m = new MotoreAudio({
      master: config.impostazioni.volumeMaster,
      livelloAbbassa: config.impostazioni.livelloAbbassa,
      fadeOutMs: config.impostazioni.fadeOutMs,
      livelloParla: config.impostazioni.livelloParla ?? 0.25,
    });
    m.onCambiamento = inviaStato;
    // Una partenza vera: conta l'uso (al cambio di giorno si riparte da zero)
    // e, la prima volta in serata con il blocco spento, suggerisce il blocco.
    m.onAvvio = (cue) => {
      const oggi = giornoDi(new Date());
      const base = usiDelGiorno({ giorno: leggiGiornoUsi(), usi: usiRef.current }, oggi);
      if (base.usi !== usiRef.current) salvaGiornoUsi(oggi);
      aggiornaUsi(incrementaUsi(base.usi, cue));
      proponiBlocco();
      avvisaSoundcheckSeServe();
    };
    motoreRef.current = m;
    if (new URLSearchParams(location.search).has("prova")) {
      (window as unknown as { __motore?: MotoreAudio }).__motore = m;
    }
    setAudioAttivo(m.sbloccato);
    inviaStato();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonoIlMotore, config, inviaStato]);

  // ---- Anteprima "Ascolta" (Modifica): passa dal motore, fuori dalle regole ----
  const anteprimaCueId = attivi.find((a) => a.anteprima)?.cueId ?? null;
  function avviaAnteprima(cue: Cue) {
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) {
      setAnteprimaRichiesta(null);
      void m.anteprima(cue);
    } else {
      // La finestra guarda soltanto: prima deve prendere il controllo.
      setAnteprimaRichiesta(cue);
    }
  }
  function fermaAnteprima() {
    motoreRef.current?.interrompiProva();
    setAnteprimaRichiesta(null);
  }
  // Appena questa finestra comanda, l'anteprima chiesta parte da sola.
  useEffect(() => {
    if (sonoIlMotore && anteprimaRichiesta && motoreRef.current) {
      const cue = anteprimaRichiesta;
      setAnteprimaRichiesta(null);
      void motoreRef.current.anteprima(cue);
    }
  }, [sonoIlMotore, anteprimaRichiesta]);
  const anteprima = {
    cueId: anteprimaCueId,
    richiestaCueId: anteprimaRichiesta?.id ?? null,
    serveControllo: !sonoIlMotore,
    avvia: avviaAnteprima,
    ferma: fermaAnteprima,
    prendiControllo: () => wsRef.current?.invia({ tipo: "prendi_comando" }),
  };

  /** Al primo suono vero della serata senza soundcheck: UNA finestra, una sola volta
   *  per serata (qualunque scelta). Il suono è già partito: mai bloccante. */
  function avvisaSoundcheckSeServe() {
    const st = serataRef.current;
    const formatId = liveRef.current.formatId;
    if (!st || !formatId || soundcheckRef.current) return;
    if (avvisoMostratoRef.current || st.avvisoMostrato || st.soundcheck[formatId]) return;
    avvisoMostratoRef.current = true;
    setAvvisoSoundcheck(true);
    void api.serata
      .avviso(formatId, "mostrato")
      .then(() => ricaricaSerataRef.current())
      .catch(() => undefined);
  }

  /** L'esito del soundcheck: quello di questa finestra se c'è, altrimenti i problemi
   *  scritti nel diario (senza i picchi). */
  function mostraEsito(format: Format) {
    if (ultimoEsito && ultimoEsito.formatId === format.id) {
      setEsitoProvate(undefined);
      setEsitoLuci(ultimoEsito.luci);
      setEsitoSoundcheck(ultimoEsito.esiti);
      return;
    }
    const sc: SoundcheckSerata | undefined = serataRef.current?.soundcheck[format.id];
    if (!sc) return;
    const esiti: EsitoCasella[] = Object.entries(sc.mancanti).map(([cueId, esito]) => {
      const trovato = format.fasi.flatMap((f) => f.cue.map((c) => ({ c, fase: f.nome }))).find((x) => x.c.id === cueId);
      return { cueId, titolo: trovato?.c.titolo ?? "?", fase: trovato?.fase ?? "", esito, piccoDb: null };
    });
    setEsitoProvate(sc.caselle);
    setEsitoLuci(null);
    setEsitoSoundcheck(esiti);
  }

  /** "Chiudi serata": STOP TUTTO → luci com'erano → spunte e contatori azzerati →
   *  orologio fermo → lucchetto spento → fine_serata nel diario → riepilogo. */
  async function chiudiSerata() {
    setConfermaChiusura(false);
    faiStopTutto();
    if (sonoIlMotoreRef.current) azzeraTutto();
    else wsRef.current?.invia({ tipo: "comando", comando: "azzeraTutto" });
    // Un attimo: lo "stop tutto" (e le luci) passano dal WebSocket prima della chiusura.
    await new Promise((ok) => setTimeout(ok, 150));
    try {
      const r = await api.serata.chiudi();
      await ricaricaConfig();
      ricaricaSerata();
      foglioSerataRef.current = null;
      setUltimoEsito(null);
      setRiepilogoChiusura({ data: r.data, serata: r.serata, r: r.riepilogo });
    } catch {
      /* il server non ha risposto: la serata resta aperta, si può riprovare */
    }
  }

  /** Suggerisce "Vuoi bloccare le modifiche?" una volta per giornata, se il blocco è spento. */
  function proponiBlocco() {
    if (configRef.current?.impostazioni.bloccoModifiche) return;
    const oggi = giornoDi(new Date());
    if (localStorage.getItem("blocco-suggerito") === oggi) return;
    localStorage.setItem("blocco-suggerito", oggi);
    setSuggerisciBlocco(true);
  }

  async function impostaBlocco(attivo: boolean) {
    await api.impostazioni({ bloccoModifiche: attivo });
    await ricaricaConfig();
  }

  // ---- Soundcheck "Prova tutti" ----
  async function avviaSoundcheck(format: Format) {
    const m = motoreRef.current;
    if (!m || !sonoIlMotoreRef.current || soundcheckRef.current) return;
    proponiBlocco();
    const passi = sequenzaSoundcheck(format);
    if (passi.length === 0) return;
    m.stopTutto();
    const inizio = new Date().toISOString();
    const corso = { indice: 0, totale: passi.length, annullato: false };
    soundcheckRef.current = corso;
    setSoundcheck({ indice: 0, totale: passi.length });
    const esiti: EsitoCasella[] = [];
    for (let i = 0; i < passi.length; i++) {
      if (corso.annullato) break;
      corso.indice = i + 1;
      setSoundcheck({ indice: i + 1, totale: passi.length });
      inviaStato();
      const passo = passi[i]!;
      const r = await m.provaCue(passo.cue, SOUNDCHECK_DURATA_MS);
      esiti.push({
        cueId: passo.cue.id,
        titolo: passo.cue.titolo,
        fase: passo.fase.nome,
        esito: r.esito,
        // Se l'analisi dell'importazione c'è, vale quella; altrimenti la misura al volo.
        piccoDb: passo.cue.analisi ? passo.cue.analisi.picco : r.picco === null ? null : piccoInDb(r.picco),
      });
      if (corso.annullato) break;
      await new Promise((ok) => setTimeout(ok, SOUNDCHECK_PAUSA_MS));
    }
    // In coda ai suoni: i tre effetti luce 2 s l'uno, poi torna com'era (se la centralina è abbinata).
    let esitoLuciTesto: string | null = null;
    if (luci?.abbinata && !corso.annullato) {
      let ok = true;
      for (const e of EFFETTI) {
        if (corso.annullato) break;
        const r = await api.luci.esegui(e, "soundcheck").catch(() => ({ ok: false }));
        if (!r.ok) ok = false;
        await new Promise((fine) => setTimeout(fine, 2000));
      }
      const t = await api.luci.esegui("torna", "soundcheck").catch(() => ({ ok: false }));
      if (!t.ok) ok = false;
      esitoLuciTesto = ok ? "ok" : "nonRaggiungibile";
      ricaricaLuci();
    }
    soundcheckRef.current = null;
    setSoundcheck(null);
    inviaStato();
    // L'esito va nel diario: è il "soundcheck di oggi" (interrotto con ESC non conta come fatto).
    const problemi = esiti.filter((e) => e.esito !== "ok");
    await api.serata
      .soundcheck({
        formatId: format.id,
        inizio,
        caselle: esiti.length,
        problemi: problemi.length,
        mancanti: problemi.map((e) => ({ cueId: e.cueId, titolo: e.titolo, fase: e.fase, esito: e.esito as "mancante" | "nonDecodificabile" })),
        completo: !corso.annullato,
      })
      .catch(() => undefined);
    ricaricaSerata();
    if (!corso.annullato) setUltimoEsito({ formatId: format.id, esiti, luci: esitoLuciTesto });
    setEsitoProvate(undefined);
    setEsitoLuci(esitoLuciTesto);
    setEsitoSoundcheck(esiti);
  }
  function interrompiSoundcheck() {
    const corso = soundcheckRef.current;
    if (!corso) return;
    corso.annullato = true;
    motoreRef.current?.interrompiProva();
  }
  const interrompiSoundcheckRef = useRef(interrompiSoundcheck);
  interrompiSoundcheckRef.current = interrompiSoundcheck;

  // Battito: il motore si fa sentire ogni 5 s (una finestra congelata smette).
  useEffect(() => {
    const t = setInterval(() => {
      if (sonoIlMotoreRef.current) wsRef.current?.invia({ tipo: "battito" });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Tick: aggiorna posizioni e manda lo stato mentre qualcosa suona.
  useEffect(() => {
    const t = setInterval(() => {
      const m = motoreRef.current;
      if (m && sonoIlMotoreRef.current && m.attivi().length > 0) inviaStato();
    }, 400);
    return () => clearInterval(t);
  }, [inviaStato]);

  // ---- Azioni della vista Live (dal Mac) ----
  const premiCue = useCallback(
    (cue: Cue) => {
      const m = motoreRef.current;
      if (m && sonoIlMotoreRef.current) m.premi(cue);
      else wsRef.current?.invia({ tipo: "comando", comando: "play", cueId: cue.id });
    },
    [],
  );
  const fermaCue = useCallback((cue: Cue) => {
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.stop(cue.id);
    else wsRef.current?.invia({ tipo: "comando", comando: "stop", cueId: cue.id });
  }, []);
  const sfumaCueUi = useCallback((cue: Cue) => {
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.sfuma(cue.id);
    else wsRef.current?.invia({ tipo: "comando", comando: "sfuma", cueId: cue.id });
  }, []);
  const spuntaUi = useCallback(
    (cue: Cue) => {
      if (sonoIlMotoreRef.current) spuntaCue(cue.id);
      else wsRef.current?.invia({ tipo: "comando", comando: "spunta", cueId: cue.id });
    },
    [spuntaCue],
  );
  const azzeraSerataUi = useCallback(
    (faseId: string) => {
      if (sonoIlMotoreRef.current) azzeraSerataFase(faseId);
      else wsRef.current?.invia({ tipo: "comando", comando: "azzeraSerata", faseId });
    },
    [azzeraSerataFase],
  );
  const cambiaMaster = useCallback((v: number) => {
    setMasterUi(v);
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.setMaster(v);
    else wsRef.current?.invia({ tipo: "comando", comando: "master", valore: v });
  }, []);
  const faiParla = useCallback((acceso: boolean) => {
    setParlaUi(acceso);
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.setParla(acceso);
    // Il comando viaggia comunque: serve al diario, e per il motore è un'eco innocua.
    wsRef.current?.invia({ tipo: "comando", comando: "parla", acceso });
  }, []);
  const faiFade = useCallback(() => {
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.fadeOut();
    // Il comando viaggia comunque: serve al diario; per il motore è un'eco innocua.
    wsRef.current?.invia({ tipo: "comando", comando: "fade" });
  }, []);
  const faiStopTutto = useCallback(() => {
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.stopTutto();
    wsRef.current?.invia({ tipo: "comando", comando: "stopTutto" });
  }, []);
  const cambiaFase = useCallback(
    (faseId: string) => {
      if (sonoIlMotoreRef.current) impostaLive(liveRef.current.formatId, faseId);
      else wsRef.current?.invia({ tipo: "comando", comando: "fase", faseId });
    },
    [impostaLive],
  );

  // ---- Tastiera (solo in Live) ----
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      // Nel Diario, ESC chiude il diario (in Live resta STOP TUTTO).
      if (percorsoRef.current === "/diario") {
        if (e.key === "Escape") indietroRef.current();
        return;
      }
      if (vistaRef.current !== "live") return;
      const bersaglio = e.target as HTMLElement;
      if (bersaglio.tagName === "INPUT" || bersaglio.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        if (soundcheckRef.current) interrompiSoundcheckRef.current();
        else faiStopTutto();
      } else if (e.key === "f" || e.key === "F") {
        faiFade();
      } else if (e.key === "p" || e.key === "P") {
        faiParla(!parlaUiRef.current);
      } else if (/^[qwert]$/i.test(e.key)) {
        // Q W E R T: le pillole in evidenza della riga Sempre (audio), nell'ordine.
        const format = configRef.current?.formats.find((f) => f.id === liveRef.current.formatId);
        const sempre = format?.fasi.find((f) => f.sempre);
        const audio = sempre ? inEvidenza(sempre.cue).filter((c) => c.tipo !== "promemoria") : [];
        const indice = "qwert".indexOf(e.key.toLowerCase());
        const cue = audio[indice];
        if (cue) premiCue(cue);
      } else if (/^[1-9]$/.test(e.key)) {
        const format = configRef.current?.formats.find((f) => f.id === liveRef.current.formatId);
        const fasi = format ? [...format.fasi].sort((a, b) => a.ordine - b.ordine) : [];
        const fase = fasi.find((f) => f.id === liveRef.current.faseId) ?? fasi[0];
        const soloAudio = fase
          ? [...fase.cue].sort((a, b) => a.ordine - b.ordine).filter((c) => c.tipo !== "promemoria")
          : [];
        const cue = soloAudio[Number(e.key) - 1];
        if (cue) premiCue(cue);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const format = configRef.current?.formats.find((f) => f.id === liveRef.current.formatId);
        if (!format) return;
        const fasi = [...format.fasi].sort((a, b) => a.ordine - b.ordine);
        const indice = fasi.findIndex((f) => f.id === liveRef.current.faseId);
        const nuovo = e.key === "ArrowLeft" ? indice - 1 : indice + 1;
        const fase = fasi[Math.min(fasi.length - 1, Math.max(0, nuovo))];
        if (fase) cambiaFase(fase.id);
      }
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [premiCue, faiFade, faiStopTutto, cambiaFase, faiParla]);

  // ---- Navigazione ----
  function vaiA(percorsoNuovo: string) {
    if (location.pathname === percorsoNuovo) return;
    history.pushState(null, "", percorsoNuovo);
    profonditaRef.current += 1;
    setPercorso(percorsoNuovo);
  }
  function apriFormat(id: string) {
    vaiA(`/format/${id}`);
    setVista("modifica");
  }
  function tornaAllaHome() {
    vaiA("/");
  }
  /** "‹ Indietro": la pagina precedente di questa app; senza storia, la Home. */
  function indietro() {
    if (profonditaRef.current > 0) history.back();
    else tornaAllaHome();
  }
  const indietroRef = useRef(indietro);
  indietroRef.current = indietro;
  function apriOChiudiDiario() {
    if (percorsoRef.current === "/diario") indietro();
    else vaiA("/diario");
  }
  function passaAlive(format: Format) {
    setVista("live");
    apriFoglioSeServe(format);
    if (sonoIlMotoreRef.current) {
      const primaFase = [...format.fasi].sort((a, b) => a.ordine - b.ordine)[0];
      const faseAttuale =
        liveRef.current.formatId === format.id && liveRef.current.faseId
          ? liveRef.current.faseId
          : (primaFase?.id ?? null);
      impostaLive(format.id, faseAttuale);
      void motoreRef.current?.caricaFormat(format);
    }
  }

  if (!config) {
    return <div className="p-8 text-testo-2">Carico…</div>;
  }

  const idFormatAperto = percorso.startsWith("/format/") ? percorso.slice("/format/".length) : null;
  const formatAperto = idFormatAperto ? config.formats.find((f) => f.id === idFormatAperto) : null;
  const cueSempre = formatAperto
    ? [...(formatAperto.fasi.find((f) => f.sempre)?.cue ?? [])].sort((a, b) => a.ordine - b.ordine)
    : [];

  const motoreOnline = sonoIlMotore || (statoRemoto?.motoreOnline ?? false);
  const soundcheckDelFormat = formatAperto ? (serata?.soundcheck[formatAperto.id] ?? null) : null;
  const problemiFile = soundcheckDelFormat?.mancanti;
  const serveSblocco = sonoIlMotore && !audioAttivo && motoreRef.current !== null;
  const bloccato = config.impostazioni.bloccoModifiche === true;

  return (
    <div className="min-h-full">
      {/* Overlay per sbloccare l'audio al primo caricamento. */}
      {serveSblocco && (
        <div className="vetro fixed inset-0 z-50 flex items-center justify-center rounded-none border-0 bg-black/60">
          <Pulsante
            variante="primario"
            misura="lg"
            className="px-10 py-6 text-[22px] shadow-2xl"
            onClick={() => {
              void motoreRef.current?.sblocca().then(() => setAudioAttivo(true));
            }}
          >
            <Volume2 size={24} strokeWidth={1.75} aria-hidden /> Attiva audio
          </Pulsante>
        </div>
      )}

      {/* Foglio "Prima di iniziare": prima riga il soundcheck di oggi, poi la nota del format. */}
      {foglioAperto && formatAperto && vista === "live" && (
        <FoglioInizio
          format={formatAperto}
          soundcheck={soundcheckDelFormat}
          onProva={
            sonoIlMotore
              ? () => {
                  setFoglioAperto(false);
                  void avviaSoundcheck(formatAperto);
                }
              : undefined
          }
          onVediEsito={() => {
            setFoglioAperto(false);
            mostraEsito(formatAperto);
          }}
          onChiudi={() => setFoglioAperto(false)}
        />
      )}

      {esitoSoundcheck && (
        <EsitoSoundcheck esiti={esitoSoundcheck} luci={esitoLuci} provate={esitoProvate} onChiudi={() => setEsitoSoundcheck(null)} />
      )}

      {avvisoSoundcheck && formatAperto && (
        <AvvisoSoundcheck
          onProva={() => {
            setAvvisoSoundcheck(false);
            void avviaSoundcheck(formatAperto);
          }}
          onAvanti={() => setAvvisoSoundcheck(false)}
        />
      )}

      {confermaChiusura && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfermaChiusura(false)}>
          <div role="dialog" aria-label="Chiudere la serata?" onClick={(e) => e.stopPropagation()} className="vetro w-full max-w-sm vetro-solido p-6">
            <p className="text-[20px] font-semibold leading-snug text-testo">Chiudere la serata di oggi?</p>
            <p className="mt-1 text-[14px] text-testo-2">
              Silenzio, luci com'erano, spunte e contatori azzerati, lucchetto spento. Poi il riepilogo.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Pulsante variante="secondario" misura="lg" onClick={() => setConfermaChiusura(false)} data-chiusura-annulla>
                Annulla
              </Pulsante>
              <Pulsante variante="primario" misura="lg" onClick={() => void chiudiSerata()} data-chiusura-conferma>
                Chiudi
              </Pulsante>
            </div>
          </div>
        </div>
      )}

      {riepilogoChiusura && (
        <FinestraRiepilogo
          data={riepilogoChiusura.data}
          serata={riepilogoChiusura.serata}
          r={riepilogoChiusura.r}
          onChiudi={() => setRiepilogoChiusura(null)}
        />
      )}

      {suggerisciBlocco && !bloccato && (
        <div className="fixed inset-x-0 top-16 z-40 flex justify-center px-4">
          <div className="vetro vetro-solido flex flex-wrap items-center gap-3 px-4 py-3" role="status">
            <Lock size={16} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
            <span className="text-[14px] text-testo">Vuoi bloccare le modifiche per la serata?</span>
            <Pulsante
              variante="primario"
              misura="sm"
              onClick={() => {
                setSuggerisciBlocco(false);
                void impostaBlocco(true);
              }}
            >
              Sì
            </Pulsante>
            <Pulsante variante="secondario" misura="sm" onClick={() => setSuggerisciBlocco(false)}>
              No
            </Pulsante>
          </div>
        </div>
      )}

      {/* Barra superiore */}
      <header className="vetro-barra sticky top-0 z-30 border-b border-[var(--hairline-barra)] px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          {/* Il logo è un link alla Home (stesso stile, cursore a manina). */}
          <a
            href="/"
            aria-label="Vai alla Home"
            data-logo
            onClick={(e) => {
              e.preventDefault();
              tornaAllaHome();
            }}
            className="flex shrink-0 cursor-pointer items-baseline gap-2 no-underline"
          >
            <span className="text-[17px] font-semibold tracking-[-0.01em] text-testo">Regia</span>
            <span className="hidden text-[12px] text-testo-3 sm:block">Porto Mancino</span>
          </a>
          {(percorso === "/diario" || percorso === "/luci" || (formatAperto && vista === "modifica")) && (
            <button
              type="button"
              onClick={indietro}
              aria-label="Indietro"
              data-indietro
              className="vetro vetro-campo tocco inline-flex h-11 shrink-0 items-center gap-1 pl-2 pr-3 text-[14px] font-medium text-testo"
            >
              <ChevronLeft size={18} strokeWidth={1.75} aria-hidden /> Indietro
            </button>
          )}
          {formatAperto && (
            <>
              {vista === "live" && (
                <button
                  type="button"
                  onClick={tornaAllaHome}
                  aria-label="Torna ai format"
                  className="tocco rounded-[10px] border border-transparent p-1.5 text-testo-2 hover:bg-velo hover:text-testo"
                >
                  <ChevronLeft size={18} strokeWidth={1.75} />
                </button>
              )}
              <div className="min-w-0 flex-1 text-[17px] font-semibold tracking-[-0.01em]">
                <InputInline
                  valore={formatAperto.nome}
                  onCambia={(v) => void api.rinominaFormat(formatAperto.id, v).then(() => void ricaricaConfig())}
                />
              </div>
            </>
          )}
          {!formatAperto && <div className="flex-1" />}
          <span
            aria-live="polite"
            className={`hidden shrink-0 text-[12px] transition-opacity duration-300 sm:block ${
              salvataggi > 0 ? "text-testo-2" : salvatoAlmeno ? "text-testo-3" : "opacity-0"
            }`}
          >
            {salvataggi > 0 ? "Salvataggio…" : "Salvato"}
          </span>
          {formatAperto && vista === "live" && (
            <button
              type="button"
              title="Rileggi 'Prima di iniziare'"
              aria-label="Rileggi 'Prima di iniziare'"
              onClick={() => setFoglioAperto(true)}
              className="tocco shrink-0 rounded-[10px] border border-transparent p-2 text-testo-2 hover:bg-velo hover:text-testo"
            >
              <BookOpenText size={18} strokeWidth={1.75} />
            </button>
          )}
          {formatAperto && vista === "live" && sonoIlMotore && (
            <Pulsante
              variante={soundcheck ? "primario" : "secondario"}
              misura="sm"
              title={soundcheck ? "Interrompi il soundcheck (ESC)" : "Suona 3 secondi di ogni casella, una alla volta"}
              onClick={() => (soundcheck ? interrompiSoundcheck() : void avviaSoundcheck(formatAperto))}
              className="shrink-0"
            >
              <ListChecks size={15} strokeWidth={1.75} aria-hidden />
              {soundcheck ? `Ferma ${soundcheck.indice} / ${soundcheck.totale}` : "Prova tutti"}
              {!soundcheck && !soundcheckDelFormat && (
                <span aria-label="Soundcheck di oggi non fatto" className="h-2 w-2 rounded-full bg-rosso" data-pallino-soundcheck />
              )}
            </Pulsante>
          )}
          {formatAperto && vista === "live" && (
            <button
              type="button"
              aria-label={bloccato ? "Modifiche bloccate (si sblocca dalla pagina Modifica)" : "Blocca modifiche"}
              aria-pressed={bloccato}
              title={bloccato ? "Modifiche bloccate: si sblocca dal banner in Modifica" : "Blocca modifiche per la serata"}
              onClick={() => {
                if (!bloccato) void impostaBlocco(true);
                else setVista("modifica");
              }}
              className={`tocco shrink-0 rounded-[10px] border p-2 ${
                bloccato ? "border-transparent bg-brand text-white" : "border-transparent text-testo-2 hover:bg-velo hover:text-testo"
              }`}
            >
              {bloccato ? <Lock size={18} strokeWidth={1.75} /> : <LockOpen size={18} strokeWidth={1.75} />}
            </button>
          )}
          {formatAperto && (
            <ControlloSegmentato
              className="w-48 shrink-0"
              segmenti={[
                { id: "modifica", testo: "Modifica" },
                { id: "live", testo: "Live" },
              ]}
              valore={vista}
              onCambia={(v) => (v === "live" ? (formatAperto.archiviato ? undefined : passaAlive(formatAperto)) : setVista("modifica"))}
            />
          )}
          <button
            type="button"
            title={percorso === "/diario" ? "Chiudi il diario" : "Diario"}
            aria-label="Diario di serata"
            aria-pressed={percorso === "/diario"}
            onClick={apriOChiudiDiario}
            className={`tocco rounded-[10px] border border-transparent p-2 hover:bg-velo hover:text-testo ${
              percorso === "/diario" ? "bg-velo text-testo" : "text-testo-2"
            }`}
          >
            <CalendarClock size={18} strokeWidth={1.75} />
          </button>
          <InterruttoreTema
            chiave="tema-regia"
            extra={
              <>
                <div className="etichetta mb-1.5 mt-4">Volume del suono base quando parlo</div>
                <div className="flex items-center gap-2">
                  <Slider
                    valore={(config.impostazioni.livelloParla ?? 0.25) / 0.6}
                    onCambia={(v) => {
                      const livello = Math.round(v * 60) / 100;
                      void api.impostazioni({ livelloParla: livello }).then(() => void ricaricaConfig());
                    }}
                    className="flex-1"
                    aria-label="Volume del suono base quando parlo"
                  />
                  <span className="w-10 text-right text-[13px] tabular-nums text-testo-2">
                    {Math.round((config.impostazioni.livelloParla ?? 0.25) * 100)}%
                  </span>
                </div>
                <div className="etichetta mb-1.5 mt-4">Luci</div>
                <Pulsante variante="secondario" misura="sm" className="w-full" onClick={() => vaiA("/luci")} data-vai-luci>
                  <Lightbulb size={14} strokeWidth={1.75} aria-hidden /> Impostazioni luci…
                </Pulsante>
              </>
            }
          />
          <PannelloTelecomando telefoni={telefoni} />
        </div>
        {!sonoIlMotore && (
          <div className="mx-auto mt-2 flex max-w-6xl items-center gap-2">
            <span className="inline-block rounded-full border border-vetro-bordo bg-velo px-3 py-1 text-[12px] text-testo-2">
              Un'altra finestra Regia sta comandando.
            </span>
            <Pulsante
              variante="primario"
              misura="sm"
              onClick={() => wsRef.current?.invia({ tipo: "prendi_comando" })}
            >
              Prendi il controllo
            </Pulsante>
          </div>
        )}
      </header>

      {percorso === "/diario" ? (
        <Diario />
      ) : percorso === "/luci" ? (
        <Luci bloccato={bloccato} />
      ) : !formatAperto ? (
        <Home
          config={config}
          onConfigCambiata={(c) => {
            configRef.current = c;
            setConfig(c);
          }}
          onApriFormat={apriFormat}
        />
      ) : vista === "modifica" ? (
        <Modifica
          format={formatAperto}
          onRicarica={async () => void (await ricaricaConfig())}
          onSalvataggio={(pendenti) => {
            setSalvataggi(pendenti);
            if (pendenti === 0 && salvataggiPrima.current > 0) setSalvatoAlmeno(true);
            salvataggiPrima.current = pendenti;
          }}
          onAzzeraSerata={azzeraSerataUi}
          bloccato={bloccato}
          onSblocca={() => void impostaBlocco(false)}
          anteprima={anteprima}
          luci={luci}
        />
      ) : (
        <Live
          format={formatAperto}
          faseId={liveIds.formatId === formatAperto.id ? liveIds.faseId : null}
          attivi={attiviFluidi}
          fatti={fatti}
          usi={usi}
          luci={luci}
          problemi={problemiFile}
          serataId={serata?.id}
          onCambiaFase={cambiaFase}
          onPremi={premiCue}
          onFerma={fermaCue}
          onSfuma={sfumaCueUi}
          onSpunta={spuntaUi}
          disabilitato={!motoreOnline}
        />
      )}

      {(vista === "live" || attivi.length > 0) && formatAperto && (
        <BarraLive
          sopra={
            vista === "live" && cueSempre.length > 0 ? (
              <RigaSempre
                cue={cueSempre}
                attivi={attiviFluidi}
                fatti={fatti}
                usi={usi}
                luci={luci}
                problemi={problemiFile}
                onPremi={premiCue}
                onFerma={fermaCue}
                onSfuma={sfumaCueUi}
                onSpunta={spuntaUi}
                disabilitato={!motoreOnline}
              />
            ) : undefined
          }
          attivi={attiviFluidi}
          master={masterUi}
          onMaster={cambiaMaster}
          onFade={faiFade}
          onStop={faiStopTutto}
          parla={parlaUi}
          onParla={faiParla}
          disabilitata={!motoreOnline}
          soundcheck={soundcheck}
          compatta={vista !== "live"}
          luci={luci}
          onLuciCambiate={ricaricaLuci}
          onChiudiSerata={vista === "live" ? () => setConfermaChiusura(true) : undefined}
        />
      )}
    </div>
  );
}

// ---- Memoria locale dei contatori "già suonato" (valgono per il giorno) ----
const CHIAVE_USI = "usi-serata";
function leggiUsiSalvati(): Usi {
  try {
    const m = JSON.parse(localStorage.getItem(CHIAVE_USI) ?? "null") as { giorno: string; usi: Usi } | null;
    if (!m) return {};
    return usiDelGiorno(m, giornoDi(new Date())).usi;
  } catch {
    return {};
  }
}
function leggiGiornoUsi(): string {
  try {
    const m = JSON.parse(localStorage.getItem(CHIAVE_USI) ?? "null") as { giorno: string } | null;
    return m?.giorno ?? giornoDi(new Date());
  } catch {
    return giornoDi(new Date());
  }
}
function salvaGiornoUsi(giorno: string) {
  localStorage.setItem(CHIAVE_USI, JSON.stringify({ giorno, usi: {} }));
}
function salvaUsi(usi: Usi) {
  try {
    localStorage.setItem(CHIAVE_USI, JSON.stringify({ giorno: leggiGiornoUsi(), usi }));
  } catch {
    /* memoria piena o assente: pazienza */
  }
}
