// La pagina per il telefono: solo Live, nessun suono esce da qui.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Config, Cue, StatoLive } from "../../../shared/tipi";
import { api } from "../api";
import { ClientWs } from "../ws";
import { BarraLive } from "../componenti/BarraLive";
import { PulsanteCue } from "../componenti/PulsanteCue";

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

export function PaginaTelecomando() {
  const [pin, setPin] = useState<string | null>(localStorage.getItem(CHIAVE_PIN));
  const [pinBozza, setPinBozza] = useState("");
  const [pinSbagliato, setPinSbagliato] = useState(false);
  const [autenticato, setAutenticato] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [stato, setStato] = useState<StatoLive | null>(null);
  const [scegliFormat, setScegliFormat] = useState(false);
  const [formatDaConfermare, setFormatDaConfermare] = useState<string | null>(null);
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
      <div className="flex min-h-full flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-3xl font-bold">🎭 Telecomando</h1>
        <p className="text-center text-neutral-400">
          Scrivi il PIN che vedi sulla pagina Regia del Mac{pinSbagliato && <span className="block text-red-400">PIN errato, riprova</span>}
        </p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          autoFocus
          value={pinBozza}
          onChange={(e) => setPinBozza(e.target.value.replace(/\D/g, ""))}
          className="w-44 rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-4 text-center font-mono text-4xl tracking-[0.5em]"
        />
        <button
          type="button"
          disabled={pinBozza.length !== 4}
          onClick={() => {
            localStorage.setItem(CHIAVE_PIN, pinBozza);
            setPinSbagliato(false);
            setPin(pinBozza);
          }}
          className="min-h-16 w-44 rounded-2xl bg-blue-600 text-xl font-bold text-white disabled:opacity-40"
        >
          Entra
        </button>
      </div>
    );
  }

  if (!config) return <div className="p-8 text-neutral-400">Carico…</div>;

  const motoreOnline = stato?.motoreOnline ?? false;
  const formats = [...config.formats].sort((a, b) => a.ordine - b.ordine);
  const format = formats.find((f) => f.id === stato?.formatId) ?? null;
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

  // ---- Scelta del format ----
  if (!format || scegliFormat) {
    return (
      <div className="mx-auto max-w-md p-4 pb-8">
        {!motoreOnline && (
          <div className="mb-4 rounded-xl bg-red-700 px-4 py-3 text-center font-semibold text-white">
            Regia non collegata
          </div>
        )}
        <h1 className="mb-4 text-2xl font-bold">Scegli la serata</h1>
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
              className={`min-h-16 w-full rounded-2xl px-4 text-left text-xl font-semibold disabled:opacity-40 ${
                formatDaConfermare === f.id ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-100"
              }`}
            >
              {formatDaConfermare === f.id ? `Confermi "${f.nome}"?` : f.nome}
            </button>
          ))}
          {formats.length === 0 && <p className="text-neutral-400">Nessun format: crealo prima sul Mac.</p>}
        </div>
        {format && (
          <button
            type="button"
            onClick={() => {
              setScegliFormat(false);
              setFormatDaConfermare(null);
            }}
            className="mt-6 w-full rounded-xl bg-neutral-800 py-3 text-neutral-300"
          >
            Annulla
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-3 pb-36 pt-3">
      {!motoreOnline && (
        <div className="mb-3 rounded-xl bg-red-700 px-4 py-3 text-center font-semibold text-white">
          Regia non collegata
        </div>
      )}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setScegliFormat(true)}
          className="truncate rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300"
        >
          {format.nome} ▾
        </button>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          disabled={!motoreOnline || indiceFase <= 0}
          onClick={() => vaiAFase(-1)}
          className="min-h-16 w-16 rounded-2xl bg-neutral-800 text-2xl text-neutral-200 disabled:opacity-30"
        >
          ‹
        </button>
        <div className="min-h-16 flex flex-1 items-center justify-center rounded-2xl bg-neutral-900 px-2 text-center text-lg font-semibold">
          {fase?.nome ?? "—"}
        </div>
        <button
          type="button"
          disabled={!motoreOnline || indiceFase < 0 || indiceFase >= fasi.length - 1}
          onClick={() => vaiAFase(1)}
          className="min-h-16 w-16 rounded-2xl bg-neutral-800 text-2xl text-neutral-200 disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cue.map((c) => (
          <PulsanteCue key={c.id} cue={c} attivi={stato?.attivi ?? []} disabilitato={!motoreOnline} onPremi={() => premi(c)} />
        ))}
        {cue.length === 0 && <p className="text-neutral-400">Nessun suono in questa fase.</p>}
      </div>
      <BarraLive
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
