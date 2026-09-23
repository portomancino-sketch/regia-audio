// Il menu "⋯": piccolo elenco di azioni in un pannello di vetro.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Vetro } from "./Vetro";

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
  const contenitore = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (!contenitore.current?.contains(e.target as Node)) {
        setAperto(false);
        setDaConfermare(null);
      }
    };
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, [aperto]);

  return (
    <div ref={contenitore} className="relative">
      <button
        type="button"
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
        <Vetro
          raggio="campo"
          className="absolute right-0 top-9 z-50 min-w-40 overflow-hidden vetro-solido py-1"
        >
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
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] transition-colors ${
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
        </Vetro>
      )}
    </div>
  );
}
