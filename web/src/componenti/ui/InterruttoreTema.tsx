// Il pannello "Aspetto" (il sole): Chiaro / Scuro / Automatico + intensità dello sfondo.
// Scelte salvate per dispositivo (localStorage), separate tra Regia e telecomando.
import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { Popover } from "./Popover";
import { ControlloSegmentato } from "./ControlloSegmentato";
import { Slider } from "./Slider";

type Scelta = "chiaro" | "scuro" | "auto";
const NOMI: Record<Scelta, string> = { chiaro: "Chiaro", scuro: "Scuro", auto: "Automatico" };

function risolvi(scelta: Scelta): "chiaro" | "scuro" {
  if (scelta !== "auto") return scelta;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "scuro" : "chiaro";
}

export function useTema(chiave: string): [Scelta, (s: Scelta) => void] {
  const [scelta, setScelta] = useState<Scelta>(() => {
    const salvata = localStorage.getItem(chiave);
    return salvata === "scuro" || salvata === "auto" ? salvata : "chiaro";
  });

  useEffect(() => {
    document.documentElement.dataset.tema = risolvi(scelta);
    localStorage.setItem(chiave, scelta);
    if (scelta !== "auto") return;
    // In automatico segue il sistema anche se cambia mentre la pagina è aperta.
    const media = matchMedia("(prefers-color-scheme: dark)");
    const aggiorna = () => {
      document.documentElement.dataset.tema = risolvi("auto");
    };
    media.addEventListener("change", aggiorna);
    return () => media.removeEventListener("change", aggiorna);
  }, [scelta, chiave]);

  return [scelta, setScelta];
}

/** Intensità dello sfondo 0–100, scrive --sfondo-intensita (default 55). */
export function useIntensita(chiave: string): [number, (v: number) => void] {
  const chiaveIntensita = `${chiave}-intensita`;
  const [valore, setValore] = useState<number>(() => {
    const salvata = Number(localStorage.getItem(chiaveIntensita));
    return Number.isFinite(salvata) && localStorage.getItem(chiaveIntensita) !== null ? salvata : 55;
  });
  useEffect(() => {
    document.documentElement.style.setProperty("--sfondo-intensita", String(valore / 100));
    localStorage.setItem(chiaveIntensita, String(valore));
  }, [valore, chiaveIntensita]);
  return [valore, setValore];
}

export function InterruttoreTema(props: { chiave: string; className?: string }) {
  const [scelta, imposta] = useTema(props.chiave);
  const [intensita, setIntensita] = useIntensita(props.chiave);
  const [aperto, setAperto] = useState(false);
  const pulsante = useRef<HTMLButtonElement | null>(null);

  const Icona = scelta === "chiaro" ? Sun : scelta === "scuro" ? Moon : SunMoon;
  const cambia = useCallback((id: string) => imposta(id as Scelta), [imposta]);
  const chiudi = useCallback(() => setAperto(false), []);

  return (
    <div className={`relative ${props.className ?? ""}`}>
      <button
        ref={pulsante}
        type="button"
        onClick={() => setAperto(!aperto)}
        title={`Aspetto: tema ${NOMI[scelta]}`}
        aria-label={`Aspetto: tema ${NOMI[scelta]}`}
        aria-expanded={aperto}
        aria-haspopup="dialog"
        className="tocco min-h-11 min-w-11 rounded-[10px] border border-transparent p-2 text-testo-2 hover:bg-velo hover:text-testo"
        data-tema-pulsante
      >
        <Icona size={18} strokeWidth={1.75} />
      </button>
      {aperto && (
        <Popover ancora={pulsante} onChiudi={chiudi} titolo="Aspetto" larghezza={320} intestazione className="p-4" data-pannello-tema>
          <div className="etichetta mb-2">Tema</div>
          <ControlloSegmentato
            segmenti={[
              { id: "chiaro", testo: "Chiaro" },
              { id: "scuro", testo: "Scuro" },
              { id: "auto", testo: "Auto" },
            ]}
            valore={scelta}
            onCambia={cambia}
          />
          <div className="etichetta mb-1.5 mt-4">Intensità sfondo</div>
          <div className="flex items-center gap-2 pb-1">
            <Slider
              valore={intensita / 100}
              onCambia={(v) => setIntensita(Math.round(v * 100))}
              className="flex-1"
              aria-label="Intensità dello sfondo"
            />
            <span className="w-8 text-right text-[13px] tabular-nums text-testo-2" data-intensita-valore>
              {intensita}
            </span>
          </div>
        </Popover>
      )}
    </div>
  );
}
