// Piccoli hook condivisi.
import { useEffect, useReducer, useRef, useState } from "react";
import type { CueAttivo } from "../../shared/tipi";
import { api, type LuciLive, type SerataOggi } from "./api";

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

/** Gli eventi della serata aperta (dopo l'ultimo "Chiudi serata"), riletti ogni 20 s:
 *  è ciò che guarda l'orologio di scaletta, che dopo la chiusura si ferma. */
export function useDiarioOggi(attivo: boolean, versione: unknown = 0): { ora: string; tipo: string; fase?: string }[] {
  const [eventi, setEventi] = useState<{ ora: string; tipo: string; fase?: string }[]>([]);
  useEffect(() => {
    if (!attivo) return;
    let vivo = true;
    const leggi = () => {
      void api.serata
        .oggi()
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

/** Il mondo di Valerio per le luci: nomi, colori, se la centralina c'è e risponde.
 *  Riletto ogni 15 s; `ricarica()` subito dopo un comando. */
export function useLuciLive(attivo = true): { luci: LuciLive | null; ricarica: () => void } {
  const [luci, setLuci] = useState<LuciLive | null>(null);
  const [versione, setVersione] = useState(0);
  useEffect(() => {
    if (!attivo) return;
    let vivo = true;
    const leggi = () =>
      void api.luci
        .live()
        .then((l) => {
          if (vivo) setLuci(l);
        })
        .catch(() => undefined);
    leggi();
    const t = setInterval(leggi, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [attivo, versione]);
  return { luci, ricarica: () => setVersione((v) => v + 1) };
}

/** La serata di oggi (soundcheck fatto/non fatto per format, avviso, eventi).
 *  Riletta ogni 15 s; `ricarica()` subito dopo un cambiamento (o al messaggio "serataCambiata"). */
export function useSerata(attivo = true): { serata: SerataOggi | null; ricarica: () => void } {
  const [serata, setSerata] = useState<SerataOggi | null>(null);
  const [versione, setVersione] = useState(0);
  useEffect(() => {
    if (!attivo) return;
    let vivo = true;
    const leggi = () =>
      void api.serata
        .oggi()
        .then((s) => {
          if (vivo) setSerata(s);
        })
        .catch(() => undefined);
    leggi();
    const t = setInterval(leggi, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [attivo, versione]);
  return { serata, ricarica: () => setVersione((v) => v + 1) };
}
