// L'equalizzatore a 3 barre animate (sfasate) per "sta suonando".
export function Equalizzatore(props: { colore?: string; altezza?: number; className?: string }) {
  const h = props.altezza ?? 14;
  return (
    <span
      aria-label="sta suonando"
      className={`inline-flex items-end gap-[2px] ${props.className ?? ""}`}
      style={{ height: h }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="eq-barra inline-block w-[3px] rounded-full"
          style={{
            height: h,
            backgroundColor: props.colore ?? "var(--brand-chiaro)",
            animationDelay: `${i * 0.22}s`,
          }}
        />
      ))}
    </span>
  );
}
