// Il dock in basso: cosa sta suonando, master, FADE, STOP.
import { Mic, Volume2 } from "lucide-react";
import { Equalizzatore } from "./ui/Equalizzatore";
import type { CueAttivo } from "../../../shared/tipi";
import { tempoRimanente } from "../util";
import { Dock } from "./ui/Dock";
import { Pulsante } from "./ui/Pulsante";
import { Slider } from "./ui/Slider";
import { Pillola } from "./ui/Pillola";

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
}) {
  const { attivi } = props;
  return (
    <Dock fisso={props.telefono} sopra={props.sopra}>
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex items-center gap-2">
          <span className="etichetta">Sta suonando</span>
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
        {props.extra}
        {props.onParla && (
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
        <Pulsante
          variante="pericolo"
          misura="lg"
          disabled={props.disabilitata}
          onClick={props.onStop}
          className={props.telefono ? "min-h-16 flex-1 px-8" : "px-8"}
        >
          STOP TUTTO
        </Pulsante>
      </div>
    </Dock>
  );
}
