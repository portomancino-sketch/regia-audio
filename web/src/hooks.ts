// Piccoli hook condivisi.
import { useEffect, useReducer, useRef } from "react";
import type { CueAttivo } from "../../shared/tipi";

/**
 * Fa scorrere le posizioni tra un aggiornamento di stato e l'altro:
 * interpola dal momento in cui la lista è arrivata, e si riallinea
 * da sola a ogni stato nuovo.
 */
export function useAttiviFluidi(attivi: CueAttivo[]): CueAttivo[] {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const base = useRef<{ attivi: CueAttivo[]; arrivo: number }>({ attivi, arrivo: Date.now() });
  if (base.current.attivi !== attivi) base.current = { attivi, arrivo: Date.now() };

  const attivo = attivi.length > 0;
  useEffect(() => {
    if (!attivo) return;
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [attivo]);

  const trascorso = (Date.now() - base.current.arrivo) / 1000;
  return attivi.map((a) => (a.inPausa ? a : { ...a, posizioneSec: a.posizioneSec + trascorso }));
}
