// La pillola: piccola etichetta con puntino colorato (tipo di cue, stati).
import type { ReactNode } from "react";

export function Pillola(props: { colore?: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-vetro-bordo bg-velo px-2 py-0.5 text-[11px] font-medium tracking-[0.03em] text-testo-2 ${props.className ?? ""}`}
    >
      {props.colore && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: props.colore }}
        />
      )}
      {props.children}
    </span>
  );
}
