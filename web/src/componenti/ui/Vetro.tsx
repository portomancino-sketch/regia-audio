// Il contenitore di vetro: card, pannelli, dock.
import type { HTMLAttributes } from "react";

export function Vetro(
  props: HTMLAttributes<HTMLDivElement> & { raggio?: "card" | "campo" | "dock" },
) {
  const { raggio = "card", className = "", ...resto } = props;
  const r = raggio === "campo" ? "vetro-campo" : raggio === "dock" ? "vetro-dock" : "";
  return <div {...resto} className={`vetro ${r} ${className}`} />;
}
