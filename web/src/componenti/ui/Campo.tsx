// Il campo di testo di vetro.
import type { InputHTMLAttributes } from "react";

export function Campo(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...resto } = props;
  return (
    <input
      {...resto}
      className={`vetro vetro-campo bg-white/5 px-3 py-2 text-[15px] text-testo placeholder:text-testo-3 focus:border-brand-chiaro focus:outline-none ${className}`}
    />
  );
}
