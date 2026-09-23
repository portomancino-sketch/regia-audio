// Il dock flottante in basso (vetro, raggio 28, 16px dai bordi). La riga
// "Sempre" (props.sopra) vive dentro il vetro, sopra i comandi.
// Misura la propria altezza reale (riga "Sempre" compresa) e la scrive in
// --altezza-dock sul root: le pagine la usano per lo spazio in fondo, così
// nessun contenuto finisce mai sotto il dock, qualunque cosa contenga.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Vetro } from "./Vetro";

export function Dock(props: { children: ReactNode; fisso?: boolean; sopra?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const scrivi = () => root.style.setProperty("--altezza-dock", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    scrivi();
    const osservatore = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scrivi) : null;
    osservatore?.observe(el);
    return () => {
      osservatore?.disconnect();
      root.style.removeProperty("--altezza-dock");
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4"
      style={{ paddingBottom: props.fisso ? "max(16px, env(safe-area-inset-bottom))" : 16 }}
    >
      <Vetro raggio="dock" className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-5 py-3">
        {/* La riga "Sempre" sta DENTRO il vetro (prima riga a tutta larghezza,
            riga sottile sotto): le card che scorrono sotto non ci passano più attraverso. */}
        {props.sopra && <div className="min-w-0 basis-full border-b border-vetro-bordo pb-3">{props.sopra}</div>}
        {props.children}
      </Vetro>
    </div>
  );
}
