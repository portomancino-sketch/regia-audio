// Il dock flottante in basso (vetro, raggio 28, 16px dai bordi).
import type { ReactNode } from "react";
import { Vetro } from "./Vetro";

export function Dock(props: { children: ReactNode; fisso?: boolean; sopra?: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4"
      style={{ paddingBottom: props.fisso ? "max(16px, env(safe-area-inset-bottom))" : 16 }}
    >
      {props.sopra}
      <Vetro raggio="dock" className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-5 py-3">
        {props.children}
      </Vetro>
    </div>
  );
}
