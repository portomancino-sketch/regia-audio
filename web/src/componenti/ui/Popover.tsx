// Il pannello apribile unico di Regia (tema, menu ⋯, telecomando).
// Sempre in un portal su document.body, livello --z-popover (sopra dock, barra e
// modali): nessun contenitore con overflow, transform o backdrop-filter lo taglia.
// - Telefono (< 640 px): foglio dal basso a tutta larghezza, velo scuro, maniglia,
//   titolo, X; tocco sul velo = chiudi; rispetta la safe-area.
// - Mac: popover sotto (o sopra, se non c'è posto) l'ancora, allineato a destra,
//   posizione calcolata e sempre tenuta dentro la finestra (12 px dai bordi).
// Chiusura: X, ESC (senza arrivare a STOP TUTTO), clic fuori.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const MARGINE = 12;
const DISTANZA = 8;

function useTelefono(): boolean {
  const [telefono, setTelefono] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const aggiorna = () => setTelefono(window.innerWidth < 640);
    window.addEventListener("resize", aggiorna);
    return () => window.removeEventListener("resize", aggiorna);
  }, []);
  return telefono;
}

export function Popover(props: {
  ancora: RefObject<HTMLElement | null>;
  onChiudi: () => void;
  /** Titolo del foglio sul telefono e nome accessibile del pannello. */
  titolo: string;
  /** Larghezza fissa sul Mac (px); senza, quella del contenuto. */
  larghezza?: number;
  /** Mostra il titolo e la X anche sul Mac. */
  intestazione?: boolean;
  className?: string;
  children: ReactNode;
  [dato: `data-${string}`]: string | boolean | undefined;
}) {
  const { ancora, onChiudi, titolo, larghezza, intestazione, className = "", children, ...dati } = props;
  const telefono = useTelefono();
  const pannello = useRef<HTMLDivElement | null>(null);
  const chiudi = useRef(onChiudi);
  chiudi.current = onChiudi;
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);

  // Posizione sul Mac: sotto l'ancora, bordo destro allineato, clamp nella finestra.
  useLayoutEffect(() => {
    if (telefono) return;
    const calcola = () => {
      const a = ancora.current?.getBoundingClientRect();
      const p = pannello.current;
      if (!a || !p) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = p.offsetWidth;
      const h = Math.min(p.scrollHeight, vh - 2 * MARGINE);
      const left = Math.max(MARGINE, Math.min(a.right - w, vw - w - MARGINE));
      let top = a.bottom + DISTANZA;
      if (top + h > vh - MARGINE) {
        const sopra = a.top - DISTANZA - h;
        top = sopra >= MARGINE ? sopra : Math.max(MARGINE, vh - MARGINE - h);
      }
      setPos((prima) =>
        prima && prima.top === top && prima.left === left && prima.maxH === vh - 2 * MARGINE
          ? prima
          : { top, left, maxH: vh - 2 * MARGINE },
      );
    };
    calcola();
    const osserva = new ResizeObserver(calcola);
    if (pannello.current) osserva.observe(pannello.current);
    window.addEventListener("resize", calcola);
    window.addEventListener("scroll", calcola, true);
    return () => {
      osserva.disconnect();
      window.removeEventListener("resize", calcola);
      window.removeEventListener("scroll", calcola, true);
    };
  }, [telefono, ancora]);

  // ESC e clic fuori (l'ancora esclusa: il suo onClick fa già da interruttore).
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      chiudi.current();
    };
    const fuori = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pannello.current?.contains(t) || ancora.current?.contains(t)) return;
      if (telefono) return; // sul telefono chiude il velo
      chiudi.current();
    };
    window.addEventListener("keydown", tasto, { capture: true });
    document.addEventListener("mousedown", fuori);
    document.addEventListener("click", fuori);
    return () => {
      window.removeEventListener("keydown", tasto, { capture: true });
      document.removeEventListener("mousedown", fuori);
      document.removeEventListener("click", fuori);
    };
  }, [telefono, ancora]);

  // Gli eventi React risalgono il portal fino ai genitori (righe trascinabili,
  // card cliccabili): qui si fermano.
  const ferma = (e: { stopPropagation: () => void }) => e.stopPropagation();

  const x = (
    <button
      type="button"
      aria-label="Chiudi"
      title="Chiudi (ESC)"
      data-popover-x
      onClick={() => chiudi.current()}
      className="tocco inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-testo-2 hover:bg-velo hover:text-testo"
    >
      <X size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );

  if (telefono) {
    return createPortal(
      <div
        className="fixed inset-0 flex items-end bg-black/55"
        style={{ zIndex: "var(--z-popover)" }}
        data-velo
        data-popover-velo
        onClick={(e) => {
          ferma(e);
          chiudi.current();
        }}
        onPointerDown={ferma}
        onMouseDown={ferma}
      >
        <div
          ref={pannello}
          role="dialog"
          aria-label={titolo}
          data-popover
          data-popover-foglio
          {...dati}
          onClick={ferma}
          className="vetro vetro-pieno flex max-h-[85dvh] w-full flex-col rounded-b-none rounded-t-[24px] px-4 pt-2"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-testo-3/50" />
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold text-testo">{titolo}</h2>
            {x}
          </div>
          <div className="-mx-4 min-h-0 overflow-y-auto px-4 pb-2">{children}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={pannello}
      role="dialog"
      aria-label={titolo}
      data-popover
      {...dati}
      onClick={ferma}
      onPointerDown={ferma}
      onMouseDown={ferma}
      className={`vetro vetro-pieno fixed overflow-y-auto ${className}`}
      style={{
        zIndex: "var(--z-popover)",
        width: larghezza,
        maxWidth: `calc(100vw - ${2 * MARGINE}px)`,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        maxHeight: pos?.maxH,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {intestazione && (
        <div className="-mr-2 -mt-2 mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-testo">{titolo}</h2>
          {x}
        </div>
      )}
      {children}
    </div>,
    document.body,
  );
}
