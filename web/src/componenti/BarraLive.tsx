// Il dock in basso: cosa sta suonando, master, FADE, STOP.
import { useEffect, useRef, useState } from "react";
import { Mic, Volume2 } from "lucide-react";
import { Equalizzatore } from "./ui/Equalizzatore";
import type { CueAttivo } from "../../../shared/tipi";
import { tempoRimanente } from "../util";
import { Dock } from "./ui/Dock";
import { Pulsante } from "./ui/Pulsante";
import { Slider } from "./ui/Slider";
import { Pillola } from "./ui/Pillola";
import { PulsanteLuci } from "./PannelloLuci";
import type { LuciLive } from "../api";

export function BarraLive(props: {
  attivi: CueAttivo[];
  master: number;
  onMaster: (v: number) => void;
  onFade: () => void;
  onStop: () => void;
  disabilitata?: boolean;
  telefono?: boolean;
  /** Contenuto extra nel dock (es. l'interruttore del tema sul telefono). */
  extra?: React.ReactNode;
  /** Riga sopra il dock (le caselle "Sempre"). */
  sopra?: React.ReactNode;
  /** PARLA: il sottofondo è abbassato per la voce. */
  parla?: boolean;
  onParla?: (acceso: boolean) => void;
  /** Soundcheck in corso: contatore "12 / 34" nel dock. */
  soundcheck?: { indice: number; totale: number } | null;
  /** Mini-barra in Modifica: senza PARLA e senza extra, solo quando qualcosa suona. */
  compatta?: boolean;
  /** Luci (solo se la centralina è abbinata): il pulsante "Luci" col suo pannello. */
  luci?: LuciLive | null;
  onLuciCambiate?: () => void;
}) {
  const { attivi } = props;
  return (
    <Dock fisso={props.telefono} sopra={props.sopra}>
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex items-center gap-2">
          <span className="etichetta">{props.soundcheck ? "Soundcheck" : "Sta suonando"}</span>
          {props.soundcheck && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-semibold tabular-nums text-white" aria-live="polite">
              {props.soundcheck.indice} / {props.soundcheck.totale}
            </span>
          )}
          {attivi.some((a) => !a.inPausa) && <Equalizzatore altezza={10} colore="var(--brand-chiaro)" />}
        </div>
        {attivi.length === 0 ? (
          <div key="silenzio" className="dissolvi truncate text-[15px] text-testo-3">Silenzio</div>
        ) : (
          <div key={attivi.map((a) => a.istanzaId).join(",")} className="dissolvi truncate">
            {attivi.map((a) => {
              const r = tempoRimanente(a);
              return (
                <span key={a.istanzaId} className="mr-3 whitespace-nowrap text-[15px]">
                  {a.anteprima && <span className="text-testo-3">Anteprima: </span>}
                  <span className="font-medium text-testo">{a.titolo}</span>{" "}
                  {a.inPausa ? (
                    <Pillola className="align-middle">in pausa</Pillola>
                  ) : r.testo ? (
                    <span
                      className={`text-[13px] tabular-nums ${r.ambra ? "font-semibold text-[var(--tipo-effetto)]" : "text-testo-2"}`}
                    >
                      {r.testo}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Volume2 size={18} strokeWidth={1.75} className="shrink-0 text-testo-2" aria-label="Volume" />
        <Slider
          valore={props.master}
          onCambia={props.onMaster}
          disabled={props.disabilitata}
          className="w-28 sm:w-40"
          aria-label="Volume principale"
        />
        <span className="w-8 text-right text-[13px] tabular-nums text-testo-2">
          {Math.round(props.master * 100)}
        </span>
      </div>
      {/* Sul telefono i pulsanti possono andare a capo (STOP TUTTO prende la riga):
          il dock cresce e la pagina lo misura, niente finisce sotto. */}
      <div className={`flex items-center gap-2 ${props.telefono ? "basis-full flex-wrap" : ""}`}>
        {!props.compatta && props.extra}
        {!props.compatta && props.luci?.abbinata && (
          <PulsanteLuci luci={props.luci} telefono={props.telefono} onCambiato={props.onLuciCambiate} />
        )}
        {!props.compatta && props.onParla && (
          <Pulsante
            variante={props.parla ? "primario" : "secondario"}
            misura={props.telefono ? "md" : "lg"}
            disabled={props.disabilitata}
            onClick={() => props.onParla!(!props.parla)}
            aria-pressed={props.parla}
            title="Abbassa il suono base mentre parli (tasto P)"
          >
            <Mic size={18} strokeWidth={1.75} aria-hidden /> PARLA
          </Pulsante>
        )}
        <Pulsante
          variante="secondario"
          misura={props.telefono ? "md" : "lg"}
          disabled={props.disabilitata}
          onClick={props.onFade}
        >
          FADE OUT
        </Pulsante>
        {props.telefono ? (
          <StopTuttoLungo disabilitato={props.disabilitata} onStop={props.onStop} />
        ) : (
          <Pulsante variante="pericolo" misura="lg" disabled={props.disabilitata} onClick={props.onStop} className="px-8">
            STOP TUTTO
          </Pulsante>
        )}
      </div>
    </Dock>
  );
}

const PRESSIONE_LUNGA_MS = 600;

/** STOP TUTTO sul telefono: parte SOLO con pressione lunga (600 ms). Durante la
 *  pressione un riempimento cresce sul pulsante; a 600 ms scatta, con vibrazione.
 *  Un tocco breve non fa nulla e mostra "Tieni premuto" per 1,5 s. */
function StopTuttoLungo(props: { disabilitato?: boolean; onStop: () => void }) {
  const [premuto, setPremuto] = useState(false);
  const [avviso, setAvviso] = useState(false);
  const timer = useRef<number | null>(null);
  const scattato = useRef(false);
  const timerAvviso = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (timerAvviso.current) clearTimeout(timerAvviso.current);
    },
    [],
  );

  function inizia() {
    if (props.disabilitato) return;
    scattato.current = false;
    setPremuto(true);
    timer.current = window.setTimeout(() => {
      scattato.current = true;
      setPremuto(false);
      try {
        navigator.vibrate?.(80);
      } catch {
        /* niente vibrazione */
      }
      props.onStop();
    }, PRESSIONE_LUNGA_MS);
  }
  function lascia() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!premuto) return;
    setPremuto(false);
    if (!scattato.current) {
      setAvviso(true);
      if (timerAvviso.current) clearTimeout(timerAvviso.current);
      timerAvviso.current = window.setTimeout(() => setAvviso(false), 1500);
    }
  }

  return (
    <button
      type="button"
      disabled={props.disabilitato}
      aria-label="STOP TUTTO (tieni premuto)"
      data-stop-lungo
      onPointerDown={(e) => {
        e.preventDefault();
        inizia();
      }}
      onPointerUp={lascia}
      onPointerCancel={lascia}
      onPointerLeave={lascia}
      onContextMenu={(e) => e.preventDefault()}
      className="tocco relative flex min-h-16 flex-1 select-none items-center justify-center overflow-hidden rounded-[var(--raggio-campo)] border border-transparent px-8 text-[17px] font-semibold text-white disabled:cursor-default disabled:opacity-40"
      style={{
        backgroundImage: "var(--rosso-grad)",
        boxShadow: "var(--rosso-ombra), inset 0 1px 0 rgba(255,255,255,0.25)",
        touchAction: "manipulation",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Il riempimento che cresce durante la pressione (600 ms) */}
      <span
        aria-hidden
        data-riempimento
        className="pointer-events-none absolute inset-y-0 left-0 bg-white/30"
        style={{
          width: premuto ? "100%" : "0%",
          transition: premuto ? `width ${PRESSIONE_LUNGA_MS}ms linear` : "width 120ms ease-out",
        }}
      />
      <span className="relative">{avviso ? "Tieni premuto" : "STOP TUTTO"}</span>
    </button>
  );
}
