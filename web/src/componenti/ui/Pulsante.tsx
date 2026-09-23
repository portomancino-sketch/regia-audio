// Il pulsante: primario (brand), secondario (vetro), pericolo (rosso).
import type { ButtonHTMLAttributes } from "react";

type Variante = "primario" | "secondario" | "pericolo";
type Misura = "sm" | "md" | "lg";

const BASE =
  "tocco inline-flex items-center justify-center gap-2 font-medium select-none disabled:opacity-40 disabled:cursor-default";

const VARIANTI: Record<Variante, string> = {
  primario: "bg-brand text-white border border-transparent hover:bg-brand-chiaro/90",
  secondario: "vetro vetro-campo text-testo",
  pericolo: "bg-rosso text-white border border-transparent font-semibold",
};

const MISURE: Record<Misura, string> = {
  sm: "rounded-[10px] px-3 py-1.5 text-[13px]",
  md: "rounded-[var(--raggio-campo)] px-4 py-2.5 text-[15px]",
  lg: "rounded-[var(--raggio-campo)] px-6 py-3.5 text-[17px] min-h-16",
};

export function Pulsante(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; misura?: Misura },
) {
  const { variante = "secondario", misura = "md", className = "", type = "button", ...resto } = props;
  return (
    <button
      type={type}
      {...resto}
      className={`${BASE} ${VARIANTI[variante]} ${MISURE[misura]} ${className}`}
    />
  );
}
