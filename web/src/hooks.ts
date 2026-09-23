// Piccoli hook condivisi.
import { useEffect, useReducer, useRef, useState } from "react";
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

/** Gli eventi del diario di oggi, riletti ogni 20 s (per l'orologio di scaletta). */
export function useDiarioOggi(attivo: boolean, versione: unknown = 0): { ora: string; tipo: string; fase?: string }[] {
  const [eventi, setEventi] = useState<{ ora: string; tipo: string; fase?: string }[]>([]);
  useEffect(() => {
    if (!attivo) return;
    let vivo = true;
    const leggi = () => {
      const d = new Date();
      const z = (n: number) => String(n).padStart(2, "0");
      const oggi = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
      void fetch(`/api/diario/${oggi}`)
        .then(async (r) => (await r.json()) as { eventi: { ora: string; tipo: string; fase?: string }[] })
        .then((d) => {
          if (vivo) setEventi(d.eventi);
        })
        .catch(() => undefined);
    };
    leggi();
    // Al cambio di fase il diario viene scritto dal server poco dopo: si rilegge tra 1 s.
    const subito = setTimeout(leggi, 1000);
    const t = setInterval(leggi, 20_000);
    return () => {
      vivo = false;
      clearTimeout(subito);
      clearInterval(t);
    };
  }, [attivo, versione]);
  return eventi;
}

/** Un "adesso" che avanza ogni secondo (per i contatori a schermo). */
export function useAdesso(attivo: boolean): number {
  const [adesso, setAdesso] = useState(Date.now());
  useEffect(() => {
    if (!attivo) return;
    const t = setInterval(() => setAdesso(Date.now()), 1000);
    return () => clearInterval(t);
  }, [attivo]);
  return adesso;
}
