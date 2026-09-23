// Lo slider: traccia sottile, pomello bianco, riempimento brand.
import type { InputHTMLAttributes } from "react";

export function Slider(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
    valore: number; // 0..1
    onCambia: (v: number) => void;
  },
) {
  const { valore, onCambia, className = "", style, ...resto } = props;
  const pct = Math.round(Math.min(1, Math.max(0, valore)) * 100);
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={pct}
      onChange={(e) => onCambia(Number(e.target.value) / 100)}
      {...resto}
      className={`slider-liquido ${className}`}
      style={{ ...style, ["--riempimento" as string]: `${pct}%` }}
    />
  );
}
