// Il controllo segmentato stile Apple: fondo vetro, selezione che scorre.
import type { ReactNode } from "react";

export interface Segmento {
  id: string;
  testo: ReactNode;
}

export function ControlloSegmentato(props: {
  segmenti: Segmento[];
  valore: string;
  onCambia: (id: string) => void;
  grande?: boolean;
  className?: string;
}) {
  const { segmenti, valore } = props;
  const indice = Math.max(
    0,
    segmenti.findIndex((s) => s.id === valore),
  );
  const n = segmenti.length || 1;
  return (
    <div
      className={`vetro vetro-campo relative flex p-1 ${props.className ?? ""}`}
      role="tablist"
    >
      {/* La selezione che scorre */}
      <div
        aria-hidden
        className="absolute bottom-1 top-1 rounded-[10px] bg-[var(--seg-selezione)] shadow-[var(--seg-ombra)] transition-transform duration-[var(--durata)]"
        style={{
          width: `calc((100% - 8px) / ${n})`,
          transform: `translateX(${indice * 100}%)`,
          left: 4,
        }}
      />
      {segmenti.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={s.id === valore}
          onClick={() => props.onCambia(s.id)}
          className={`relative z-10 flex-1 truncate rounded-[10px] text-center font-medium transition-colors duration-[var(--durata)] ${
            props.grande ? "px-4 py-2.5 text-[15px]" : "px-3 py-1.5 text-[13px]"
          } ${s.id === valore ? "text-testo" : "text-testo-2 hover:text-testo"}`}
        >
          {s.testo}
        </button>
      ))}
    </div>
  );
}
