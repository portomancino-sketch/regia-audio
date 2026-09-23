// La pagina per il telefono: solo Live, nessun suono esce da qui.
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenText, ChevronDown, ChevronLeft, ChevronRight, Delete, Info, Smartphone } from "lucide-react";
import type { Config, Cue, StatoLive } from "../../../shared/tipi";
import { api } from "../api";
import { ClientWs } from "../ws";
import { BarraLive } from "../componenti/BarraLive";
import { PulsanteCue } from "../componenti/PulsanteCue";
import { Vetro } from "../componenti/ui/Vetro";
import { Pulsante } from "../componenti/ui/Pulsante";
import { InterruttoreTema } from "../componenti/ui/InterruttoreTema";

const CHIAVE_PIN = "regia-pin";

/** Tiene lo schermo del telefono acceso. Su http:// il Wake Lock non c'è:
 *  si ripiega su un video muto in loop generato al volo. */
function useSchermoAcceso(attivo: boolean) {
  useEffect(() => {
    if (!attivo) return;
    let wakeLock: { release: () => Promise<void> } | null = null;
    let video: HTMLVideoElement | null = null;
    let annullato = false;

    async function prendi() {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<never> } };
      if (nav.wakeLock) {
        try {
          wakeLock = await nav.wakeLock.request("screen");
          return;
        } catch {
          /* si passa al piano B */
        }
      }
      // Piano B: un video minuscolo, muto, in loop (come NoSleep).
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const disegno = canvas.getContext("2d")!;
        const flusso = canvas.captureStream(1);
        const registratore = new MediaRecorder(flusso);
        const pezzi: Blob[] = [];
        registratore.ondataavailable = (e) => pezzi.push(e.data);
        const finito = new Promise<void>((r) => (registratore.onstop = () => r()));
        registratore.start();
        let n = 0;
        const timer = setInterval(() => {
          disegno.fillStyle = n++ % 2 ? "#000" : "#111";
          disegno.fillRect(0, 0, 64, 64);
        }, 300);
        await new Promise((r) => setTimeout(r, 1200));
        clearInterval(timer);
        registratore.stop();
        await finito;
        if (annullato) return;
        video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.style.cssText = "position:fixed;bottom:0;right:0;width:2px;height:2px;opacity:0.01;pointer-events:none";
        video.src = URL.createObjectURL(new Blob(pezzi, { type: registratore.mimeType || "video/webm" }));
        document.body.appendChild(video);
        await video.play().catch(() => undefined);
      } catch {
        // Niente da fare: la guida consiglia di mettere il blocco schermo su "Mai".
      }
    }

    void prendi();
    const suVisibilita = () => {
      if (document.visibilityState === "visible") void prendi();
    };
    document.addEventListener("visibilitychange", suVisibilita);
    return () => {
      annullato = true;
      document.removeEventListener("visibilitychange", suVisibilita);
      void wakeLock?.release();
      if (video) {
        video.pause();
        video.remove();
      }
    };
  }, [attivo]);
}

/** Schermata PIN: card vetro con tastierino numerico grande. */
function SchermataPin(props: { errore: boolean; onEntra: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const tasti = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  function premi(t: string) {
    if (t === "⌫") setPin((p) => p.slice(0, -1));
    else if (t && pin.length < 4) setPin((p) => p + t);
  }
  return (
    <div
      className="flex min-h-full flex-col items-center justify-center p-6"
      style={{ paddingTop: "max(24px, env(safe-area-inset-top))", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
    >
      <Vetro className="w-full max-w-xs p-6">
        <div className="mb-1 flex items-center justify-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
          <Smartphone size={18} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
          Telecomando
        </div>
        <p className="text-center text-[13px] text-testo-2">
          Scrivi il PIN che vedi sulla pagina Regia del Mac
        </p>
        {props.errore && <p className="mt-1 text-center text-[13px] text-rosso">PIN errato, riprova</p>}

        {/* Le 4 cifre */}
        <div className="my-5 flex justify-center gap-2" aria-label="PIN inserito">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="vetro vetro-campo flex h-14 w-12 items-center justify-center text-[28px] font-semibold tabular-nums"
              style={pin[i] ? { borderColor: "var(--brand-chiaro)" } : undefined}
            >
              {pin[i] ?? ""}
            </div>
          ))}
        </div>

        {/* Tastierino */}
        <div className="grid grid-cols-3 gap-2">
          {tasti.map((t, i) =>
            t === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => premi(t)}
                aria-label={t === "⌫" ? "Cancella" : t}
                className="vetro vetro-campo tocco flex min-h-16 items-center justify-center text-[24px] font-medium tabular-nums text-testo"
              >
                {t === "⌫" ? <Delete size={22} strokeWidth={1.75} /> : t}
              </button>
            ),
          )}
        </div>

        <Pulsante
          variante="primario"
          misura="lg"
          disabled={pin.length !== 4}
          onClick={() => props.onEntra(pin)}
          className="mt-4 w-full"
        >
          Entra
        </Pulsante>
      </Vetro>
    </div>
  );
}

export function PaginaTelecomando() {
  const [pin, setPin] = useState<string | null>(localStorage.getItem(CHIAVE_PIN));
  const [pinSbagliato, setPinSbagliato] = useState(false);
  const [autenticato, setAutenticato] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [stato, setStato] = useState<StatoLive | null>(null);
  const [scegliFormat, setScegliFormat] = useState(false);
  const [formatDaConfermare, setFormatDaConfermare] = useState<string | null>(null);
  const [foglioAperto, setFoglioAperto] = useState(false);
  const foglioVistoPer = useRef<string | null>(null);
  const [noteChiuse, setNoteChiuse] = useState<Record<string, boolean>>({});
  const wsRef = useRef<ClientWs | null>(null);
  const pinRef = useRef(pin);

  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  useSchermoAcceso(autenticato);

  useEffect(() => {
    void api.config().then(setConfig);
  }, []);

  useEffect(() => {
    if (!pin) return;
    const ws = new ClientWs("telecomando", () => pinRef.current, {
      stato: (s) => {
        setStato(s);
        setAutenticato(true);
      },
      connesso: (ok) => {
        if (!ok) setStato((s) => (s ? { ...s, motoreOnline: false } : s));
      },
      pinRifiutato: () => {
        localStorage.removeItem(CHIAVE_PIN);
        setPin(null);
        setAutenticato(false);
        setPinSbagliato(true);
      },
      configCambiata: () => void api.config().then(setConfig),
    });
    wsRef.current = ws;
    return () => {
      ws.chiudi();
      wsRef.current = null;
    };
  }, [pin]);

  const invia = useCallback((c: object) => wsRef.current?.invia(c as never), []);

  // ---- Schermata PIN ----
  if (!pin) {
    return (
      <SchermataPin
        errore={pinSbagliato}
        onEntra={(p) => {
          localStorage.setItem(CHIAVE_PIN, p);
          setPinSbagliato(false);
          setPin(p);
        }}
      />
    );
  }

  if (!config) return <div className="p-8 text-testo-2">Carico…</div>;

  const motoreOnline = stato?.motoreOnline ?? false;
  const formats = [...config.formats].sort((a, b) => a.ordine - b.ordine);
  const format = formats.find((f) => f.id === stato?.formatId) ?? null;
  // Il foglio "Prima di iniziare" compare una volta per apertura del format.
  if (format && foglioVistoPer.current !== format.id) {
    foglioVistoPer.current = format.id;
    if (format.notaInizio?.trim()) setFoglioAperto(true);
  }
  const fasi = format ? [...format.fasi].sort((a, b) => a.ordine - b.ordine) : [];
  const fase = fasi.find((f) => f.id === stato?.faseId) ?? fasi[0] ?? null;
  const indiceFase = fase ? fasi.findIndex((f) => f.id === fase.id) : -1;
  const cue = fase ? [...fase.cue].sort((a, b) => a.ordine - b.ordine) : [];

  function vaiAFase(scarto: number) {
    const nuova = fasi[indiceFase + scarto];
    if (nuova) invia({ tipo: "comando", comando: "fase", faseId: nuova.id });
  }

  function premi(c: Cue) {
    invia({ tipo: "comando", comando: "play", cueId: c.id });
  }

  const pillolaOffline = !motoreOnline && (
    <div className="mb-3 flex justify-center">
      <span className="inline-flex items-center gap-2 rounded-full bg-rosso px-4 py-1.5 text-[13px] font-semibold text-white">
        Regia non collegata
      </span>
    </div>
  );

  // ---- Scelta del format ----
  if (!format || scegliFormat) {
    return (
      <div
        className="mx-auto max-w-md p-4 pb-8"
        style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}
      >
        {pillolaOffline}
        <h1 className="mb-4 text-[28px] font-semibold">Scegli la serata</h1>
        <div className="space-y-3">
          {formats.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={!motoreOnline}
              onClick={() => {
                if (formatDaConfermare === f.id) {
                  invia({ tipo: "comando", comando: "format", formatId: f.id });
                  setFormatDaConfermare(null);
                  setScegliFormat(false);
                } else {
                  setFormatDaConfermare(f.id);
                }
              }}
              className={`tocco min-h-16 w-full rounded-[var(--raggio-card)] border px-4 text-left text-[20px] font-semibold disabled:opacity-40 ${
                formatDaConfermare === f.id
                  ? "border-transparent bg-brand text-white"
                  : "vetro text-testo"
              }`}
            >
              {formatDaConfermare === f.id ? `Confermi "${f.nome}"?` : f.nome}
            </button>
          ))}
          {formats.length === 0 && <p className="text-testo-2">Nessun format: crealo prima sul Mac.</p>}
        </div>
        {format && (
          <Pulsante
            variante="secondario"
            className="mt-6 w-full"
            onClick={() => {
              setScegliFormat(false);
              setFormatDaConfermare(null);
            }}
          >
            Annulla
          </Pulsante>
        )}
      </div>
    );
  }

  return (
    <div
      className="pagina-telefono mx-auto max-w-md px-3 pb-44"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
    >
      {pillolaOffline}
      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setScegliFormat(true)}
          className="tocco inline-flex min-w-0 items-center gap-1.5 rounded-[10px] border border-transparent px-2 py-1 text-[13px] text-testo-2 hover:bg-velo hover:text-testo"
        >
          <span className="truncate">{format.nome}</span>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        </button>
        {format.notaInizio?.trim() && (
          <button
            type="button"
            title="Rileggi 'Prima di iniziare'"
            aria-label="Rileggi 'Prima di iniziare'"
            onClick={() => setFoglioAperto(true)}
            className="tocco shrink-0 rounded-[10px] border border-transparent p-1.5 text-testo-3 hover:bg-velo hover:text-testo"
          >
            <BookOpenText size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          disabled={!motoreOnline || indiceFase <= 0}
          onClick={() => vaiAFase(-1)}
          aria-label="Fase precedente"
          className="vetro tocco flex min-h-16 w-16 items-center justify-center text-testo disabled:opacity-30"
        >
          <ChevronLeft size={24} strokeWidth={1.75} />
        </button>
        <div className="vetro flex min-h-16 flex-1 items-center justify-center px-2 text-center text-[17px] font-semibold tracking-[-0.01em]">
          {fase?.nome ?? "—"}
        </div>
        <button
          type="button"
          disabled={!motoreOnline || indiceFase < 0 || indiceFase >= fasi.length - 1}
          onClick={() => vaiAFase(1)}
          aria-label="Fase successiva"
          className="vetro tocco flex min-h-16 w-16 items-center justify-center text-testo disabled:opacity-30"
        >
          <ChevronRight size={24} strokeWidth={1.75} />
        </button>
      </div>
      {fase?.nota && !(noteChiuse[fase.id] ?? false) && (
        <button
          type="button"
          title="Tocca per nascondere"
          onClick={() => setNoteChiuse((n) => ({ ...n, [fase.id]: true }))}
          className="tocco mb-3 flex w-full items-start gap-2 rounded-[var(--raggio-campo)] border border-vetro-bordo bg-velo px-3 py-2.5 text-left text-[14px] leading-relaxed text-testo-2"
        >
          <Info size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand-chiaro" aria-hidden />
          <span className="whitespace-pre-wrap">{fase.nota}</span>
        </button>
      )}
      {fase?.nota && (noteChiuse[fase.id] ?? false) && (
        <button
          type="button"
          aria-label="Mostra la nota della fase"
          onClick={() => setNoteChiuse((n) => ({ ...n, [fase.id]: false }))}
          className="tocco mb-3 inline-flex items-center gap-1.5 rounded-full border border-vetro-bordo bg-velo px-3 py-1 text-[12px] text-testo-3"
        >
          <Info size={14} strokeWidth={1.75} aria-hidden /> nota della fase
        </button>
      )}
      <div key={fase?.id ?? "x"} className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-2">
        {cue.map((c, i) => (
          <PulsanteCue
            key={c.id}
            cue={c}
            compatto
            ritardoEntrataMs={Math.min(i, 9) * 25}
            attivi={stato?.attivi ?? []}
            disabilitato={!motoreOnline}
            onPremi={() => premi(c)}
            onFerma={() => invia({ tipo: "comando", comando: "stop", cueId: c.id })}
            onSfuma={() => invia({ tipo: "comando", comando: "sfuma", cueId: c.id })}
            fatto={stato?.fatti?.includes(c.id)}
            onSpunta={() => invia({ tipo: "comando", comando: "spunta", cueId: c.id })}
          />
        ))}
        {cue.length === 0 && <p className="text-testo-2">Nessun suono in questa fase.</p>}
      </div>
      {foglioAperto && format.notaInizio?.trim() && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="vetro w-full max-w-sm vetro-solido p-6">
            <div className="etichetta mb-2">Prima di iniziare</div>
            <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-testo">{format.notaInizio}</p>
            <Pulsante variante="primario" misura="lg" className="mt-5 w-full" onClick={() => setFoglioAperto(false)}>
              Ok, pronti
            </Pulsante>
          </div>
        </div>
      )}
      <BarraLive
        telefono
        extra={<InterruttoreTema chiave="tema-telecomando" sopra />}
        attivi={stato?.attivi ?? []}
        master={stato?.master ?? 0.8}
        onMaster={(v) => invia({ tipo: "comando", comando: "master", valore: v })}
        onFade={() => invia({ tipo: "comando", comando: "fade" })}
        onStop={() => invia({ tipo: "comando", comando: "stopTutto" })}
        disabilitata={!motoreOnline}
      />
    </div>
  );
}
