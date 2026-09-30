// Il menu "⋯": piccolo elenco di azioni in un pannello di vetro.
import { useCallback, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Popover } from "./Popover";

export interface VoceMenu {
  testo: string;
  icona?: ReactNode;
  pericolosa?: boolean;
  /** Se true, chiede conferma: primo tocco "Sicuro?", secondo esegue. */
  conferma?: boolean;
  onScelta: () => void;
}

export function Menu(props: { voci: VoceMenu[]; etichetta?: string }) {
  const [aperto, setAperto] = useState(false);
  const [daConfermare, setDaConfermare] = useState<number | null>(null);
  const pulsante = useRef<HTMLButtonElement | null>(null);
  const chiudi = useCallback(() => {
    setAperto(false);
    setDaConfermare(null);
  }, []);

  return (
    <div className="relative">
      <button
        ref={pulsante}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aperto}
        aria-label={props.etichetta ?? "Altre azioni"}
        onClick={(e) => {
          e.stopPropagation();
          setAperto(!aperto);
          setDaConfermare(null);
        }}
        className="tocco rounded-[10px] border border-transparent p-1.5 text-testo-3 hover:bg-velo hover:text-testo"
      >
        <MoreHorizontal size={18} strokeWidth={1.75} />
      </button>
      {aperto && (
        <Popover ancora={pulsante} onChiudi={chiudi} titolo={props.etichetta ?? "Altre azioni"} className="min-w-40 py-1" data-menu>
          {props.voci.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (v.conferma && daConfermare !== i) {
                  setDaConfermare(i);
                  return;
                }
                setAperto(false);
                setDaConfermare(null);
                v.onScelta();
              }}
              className={`flex min-h-11 w-full items-center sm:min-h-0 gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] transition-colors ${
                v.pericolosa
                  ? daConfermare === i
                    ? "bg-rosso/20 text-rosso"
                    : "text-rosso/90 hover:bg-velo"
                  : "text-testo hover:bg-velo"
              }`}
            >
              {v.icona}
              {v.conferma && daConfermare === i ? "Sicuro?" : v.testo}
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}
