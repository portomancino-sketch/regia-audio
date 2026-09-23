// La pagina Regia (sul Mac): Home, Modifica, Live e il motore audio.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Comando, Config, Cue, CueAttivo, Format, StatoLive } from "../../../shared/tipi";
import { api } from "../api";
import { ClientWs } from "../ws";
import { MotoreAudio } from "../motore/motore";
import { ChevronLeft, Volume2 } from "lucide-react";
import { Home } from "./Home";
import { Modifica } from "./Modifica";
import { Live } from "./Live";
import { PannelloTelecomando } from "./PannelloTelecomando";
import { BarraLive } from "../componenti/BarraLive";
import { InputInline } from "../componenti/comuni";
import { ControlloSegmentato } from "../componenti/ui/ControlloSegmentato";
import { Pulsante } from "../componenti/ui/Pulsante";

type Vista = "modifica" | "live";

export function PaginaRegia() {
  const [config, setConfig] = useState<Config | null>(null);
  const configRef = useRef<Config | null>(null);
  const [percorso, setPercorso] = useState(location.pathname);
  const [vista, setVista] = useState<Vista>("modifica");
  const [sonoIlMotore, setSonoIlMotore] = useState(false);
  const sonoIlMotoreRef = useRef(false);
  const [audioAttivo, setAudioAttivo] = useState(false);
  const [attivi, setAttivi] = useState<CueAttivo[]>([]);
  const [masterUi, setMasterUi] = useState(0.8);
  const [statoRemoto, setStatoRemoto] = useState<StatoLive | null>(null);
  const [telefoni, setTelefoni] = useState<{ ip: string }[]>([]);
  const [liveIds, setLiveIds] = useState<{ formatId: string | null; faseId: string | null }>({
    formatId: null,
    faseId: null,
  });
  // Indicatore "Salvato" nella barra in alto.
  const [salvataggi, setSalvataggi] = useState(0);
  const [salvatoAlmeno, setSalvatoAlmeno] = useState(false);
  const salvataggiPrima = useRef(0);
  const liveRef = useRef(liveIds);
  const motoreRef = useRef<MotoreAudio | null>(null);
  const wsRef = useRef<ClientWs | null>(null);
  const vistaRef = useRef<Vista>("modifica");

  useEffect(() => {
    vistaRef.current = vista;
  }, [vista]);

  // ---- Stato live in giro per tutti ----
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
    };
    wsRef.current?.invia(s);
    setAttivi(s.attivi);
    setMasterUi(s.master);
  }, []);

  const impostaLive = useCallback(
    (formatId: string | null, faseId: string | null) => {
      liveRef.current = { formatId, faseId };
      setLiveIds({ formatId, faseId });
      inviaStato();
    },
    [inviaStato],
  );

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
      switch (c.comando) {
        case "play": {
          const cue = trovaCue(c.cueId);
          if (cue) m.premi(cue);
          break;
        }
        case "stop":
          m.stop(c.cueId);
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
          if (format) {
            const primaFase = [...format.fasi].sort((a, b) => a.ordine - b.ordine)[0];
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
    [impostaLive, trovaCue],
  );

  const ricaricaConfig = useCallback(async () => {
    const c = await api.config();
    configRef.current = c;
    setConfig(c);
    motoreRef.current?.aggiornaImpostazioni({
      livelloAbbassa: c.impostazioni.livelloAbbassa,
      fadeOutMs: c.impostazioni.fadeOutMs,
    });
    return c;
  }, []);

  // ---- Avvio ----
  useEffect(() => {
    void ricaricaConfig().then((c) => setMasterUi(c.impostazioni.volumeMaster));

    const ws = new ClientWs("regia", () => null, {
      ruoloAssegnato: (motore) => {
        sonoIlMotoreRef.current = motore;
        setSonoIlMotore(motore);
      },
      comando: (c) => {
        if (sonoIlMotoreRef.current) gestisciComando(c);
      },
      stato: (s) => {
        if (!sonoIlMotoreRef.current) {
          setStatoRemoto(s);
          setAttivi(s.attivi);
          setMasterUi(s.master);
          liveRef.current = { formatId: s.formatId, faseId: s.faseId };
          setLiveIds({ formatId: s.formatId, faseId: s.faseId });
        }
      },
      telefoni: setTelefoni,
      configCambiata: () => void ricaricaConfig(),
    });
    wsRef.current = ws;

    const suPopstate = () => setPercorso(location.pathname);
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
    });
    m.onCambiamento = inviaStato;
    motoreRef.current = m;
    setAudioAttivo(m.sbloccato);
    inviaStato();
  }, [sonoIlMotore, config, inviaStato]);

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
  const cambiaMaster = useCallback((v: number) => {
    setMasterUi(v);
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.setMaster(v);
    else wsRef.current?.invia({ tipo: "comando", comando: "master", valore: v });
  }, []);
  const faiFade = useCallback(() => {
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.fadeOut();
    else wsRef.current?.invia({ tipo: "comando", comando: "fade" });
  }, []);
  const faiStopTutto = useCallback(() => {
    const m = motoreRef.current;
    if (m && sonoIlMotoreRef.current) m.stopTutto();
    else wsRef.current?.invia({ tipo: "comando", comando: "stopTutto" });
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
      if (vistaRef.current !== "live") return;
      const bersaglio = e.target as HTMLElement;
      if (bersaglio.tagName === "INPUT" || bersaglio.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        faiStopTutto();
      } else if (e.key === "f" || e.key === "F") {
        faiFade();
      } else if (/^[1-9]$/.test(e.key)) {
        const format = configRef.current?.formats.find((f) => f.id === liveRef.current.formatId);
        const fasi = format ? [...format.fasi].sort((a, b) => a.ordine - b.ordine) : [];
        const fase = fasi.find((f) => f.id === liveRef.current.faseId) ?? fasi[0];
        const cue = fase ? [...fase.cue].sort((a, b) => a.ordine - b.ordine)[Number(e.key) - 1] : undefined;
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
  }, [premiCue, faiFade, faiStopTutto, cambiaFase]);

  // ---- Navigazione ----
  function apriFormat(id: string) {
    history.pushState(null, "", `/format/${id}`);
    setPercorso(`/format/${id}`);
    setVista("modifica");
  }
  function tornaAllaHome() {
    history.pushState(null, "", "/");
    setPercorso("/");
  }
  function passaAlive(format: Format) {
    setVista("live");
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

  const motoreOnline = sonoIlMotore || (statoRemoto?.motoreOnline ?? false);
  const serveSblocco = sonoIlMotore && !audioAttivo && motoreRef.current !== null;

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

      {/* Barra superiore */}
      <header className="sticky top-0 z-30 border-b border-vetro-bordo bg-sfondo/80 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex shrink-0 items-baseline gap-2">
            <span className="text-[17px] font-semibold tracking-[-0.01em] text-testo">Regia</span>
            <span className="hidden text-[12px] text-testo-3 sm:block">Porto Mancino</span>
          </div>
          {formatAperto && (
            <>
              <button
                type="button"
                onClick={tornaAllaHome}
                aria-label="Torna ai format"
                className="tocco rounded-[10px] border border-transparent p-1.5 text-testo-2 hover:bg-white/5 hover:text-testo"
              >
                <ChevronLeft size={18} strokeWidth={1.75} />
              </button>
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
          {formatAperto && (
            <ControlloSegmentato
              className="w-48 shrink-0"
              segmenti={[
                { id: "modifica", testo: "Modifica" },
                { id: "live", testo: "Live" },
              ]}
              valore={vista}
              onCambia={(v) => (v === "live" ? passaAlive(formatAperto) : setVista("modifica"))}
            />
          )}
          <PannelloTelecomando telefoni={telefoni} />
        </div>
        {!sonoIlMotore && (
          <div className="mx-auto mt-2 max-w-6xl">
            <span className="inline-block rounded-full border border-vetro-bordo bg-white/5 px-3 py-1 text-[12px] text-testo-2">
              Un'altra finestra Regia è già attiva: qui puoi modificare, ma i suoni escono dall'altra finestra.
            </span>
          </div>
        )}
      </header>

      {!formatAperto ? (
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
        />
      ) : (
        <Live
          format={formatAperto}
          faseId={liveIds.formatId === formatAperto.id ? liveIds.faseId : null}
          attivi={attivi}
          onCambiaFase={cambiaFase}
          onPremi={premiCue}
          disabilitato={!motoreOnline}
        />
      )}

      {(vista === "live" || attivi.length > 0) && formatAperto && (
        <BarraLive
          attivi={attivi}
          master={masterUi}
          onMaster={cambiaMaster}
          onFade={faiFade}
          onStop={faiStopTutto}
          disabilitata={!motoreOnline}
        />
      )}
    </div>
  );
}
