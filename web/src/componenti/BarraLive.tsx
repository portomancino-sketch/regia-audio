// Il dock in basso: cosa sta suonando, master, FADE, STOP.
import { Volume2 } from "lucide-react";
import { Equalizzatore } from "./ui/Equalizzatore";
import type { CueAttivo } from "../../../shared/tipi";
import { formattaTempo } from "../util";
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
            {attivi.map((a) => (
              <span key={a.istanzaId} className="mr-3 whitespace-nowrap text-[15px]">
                <span className="font-medium text-testo">{a.titolo}</span>{" "}
                {a.inPausa ? (
                  <Pillola className="align-middle">in pausa</Pillola>
                ) : (
                  <span className="text-[13px] tabular-nums text-testo-2">
                    {formattaTempo(a.posizioneSec)} / {formattaTempo(a.durataSec)}
                  </span>
                )}
              </span>
            ))}
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
      <div className="flex items-center gap-2">
        {props.extra}
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
