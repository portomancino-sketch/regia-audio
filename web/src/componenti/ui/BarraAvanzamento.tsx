// La barra di avanzamento sottile (2px).
export function BarraAvanzamento(props: { frazione: number; colore?: string; className?: string }) {
  const pct = Math.min(1, Math.max(0, props.frazione)) * 100;
  return (
    <div className={`h-0.5 w-full overflow-hidden rounded-full bg-white/10 ${props.className ?? ""}`}>
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, backgroundColor: props.colore ?? "var(--brand-chiaro)" }}
      />
    </div>
  );
}
