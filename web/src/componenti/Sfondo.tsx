// Lo sfondo vivo: tre macchie di colore sfumate + un velo di grana.
// La deriva è guidata a ~7 aggiornamenti al secondo: a queste velocità lo
// spostamento per passo è sotto il pixel (fluido all'occhio), ma il compositing
// costa un ottavo rispetto a un'animazione CSS a 60 fps.
// Sul telefono le macchie sono ferme (batteria); idem con "riduci movimento".
import { useEffect, useRef } from "react";

export function Sfondo(props: { animato?: boolean }) {
  const macchie = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.animato) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = macchie.current;
    if (!el) return;
    const inizio = Date.now();
    const timer = setInterval(() => {
      const t = (Date.now() - inizio) / 1000;
      // Traiettoria morbida e non ripetitiva (periodi 57–95 s).
      const x = 4 * Math.sin((2 * Math.PI * t) / 80) - 1.5 * Math.sin((2 * Math.PI * t) / 57);
      const y = -2.5 * Math.sin((2 * Math.PI * t) / 95) + 2 * Math.cos((2 * Math.PI * t) / 63) - 2;
      const scala = 1 + 0.05 * Math.sin((2 * Math.PI * t) / 70);
      el.style.transform = `translate(${x.toFixed(3)}vw, ${y.toFixed(3)}vw) scale(${scala.toFixed(4)})`;
    }, 150);
    return () => clearInterval(timer);
  }, [props.animato]);

  return (
    <div aria-hidden className="sfondo-mesh">
      <div ref={macchie} className="macchie">
        <div className="macchia macchia-1" />
        <div className="macchia macchia-2" />
        <div className="macchia macchia-3" />
      </div>
      <div className="grana" />
    </div>
  );
}
