// La barra di avanzamento sottile (2px).
export function BarraAvanzamento(props: {
  frazione: number;
  colore?: string;
  className?: string;
  /** 3px invece di 2px (per le card Live). */
  spessa?: boolean;
}) {
  const pct = Math.min(1, Math.max(0, props.frazione)) * 100;
  return (
    <div
      className={`${props.spessa ? "h-[3px]" : "h-0.5"} w-full overflow-hidden rounded-full bg-[var(--barra-fondo)] ${props.className ?? ""}`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, backgroundColor: props.colore ?? "var(--brand-chiaro)" }}
      />
    </div>
  );
}
