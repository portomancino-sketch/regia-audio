// Il pulsante "Luci" nel dock e il suo pannello: tre pulsanti grandi coi nomi e
// i colori degli effetti, "Torna com'era" e il cursore Intensità. Mondo di Valerio:
// niente tecnica. Compare SOLO se la centralina è abbinata.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, X } from "lucide-react";
import { EFFETTI, INTENSITA_MAX, INTENSITA_MIN, type ComandoLuceCue } from "../../../shared/luci";
import { api, type LuciLive } from "../api";
import { Pulsante } from "./ui/Pulsante";

/** Testo bianco o scuro secondo il colore di fondo (contrasto). */
export function testoSu(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#fff";
  const [r, g, b] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111" : "#fff";
}

export function PulsanteLuci(props: { luci: LuciLive; telefono?: boolean; disabilitato?: boolean; onCambiato?: () => void }) {
  const [aperto, setAperto] = useState(false);
  const [intensita, setIntensita] = useState(props.luci.intensita);
  const [corrente, setCorrente] = useState<ComandoLuceCue | null>(props.luci.effettoCorrente);
  useEffect(() => setIntensita(props.luci.intensita), [props.luci.intensita]);
  useEffect(() => setCorrente(props.luci.effettoCorrente), [props.luci.effettoCorrente]);

  useEffect(() => {
    if (!aperto) return;
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setAperto(false);
      }
    };
    window.addEventListener("keydown", suTasto, { capture: true });
    return () => window.removeEventListener("keydown", suTasto, { capture: true });
  }, [aperto]);

  function esegui(effetto: ComandoLuceCue) {
    setCorrente(effetto === "torna" ? null : effetto);
    void api.luci.esegui(effetto, "manuale").catch(() => undefined).then(() => props.onCambiato?.());
  }
  let timer: number | undefined;
  function cambiaIntensita(v: number) {
    setIntensita(v);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void api.luci.intensita(v).catch(() => undefined), 250);
  }

  const pannello = (
    <div className={`fixed inset-0 z-50 ${props.telefono ? "flex items-end bg-black/45" : ""}`} onClick={() => setAperto(false)}>
      <div
        role="dialog"
        aria-label="Luci"
        onClick={(e) => e.stopPropagation()}
        className={
          props.telefono
            ? "vetro vetro-solido flex w-full flex-col rounded-b-none rounded-t-[24px] p-4"
            : "vetro vetro-solido fixed left-1/2 flex w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col p-4"
        }
        style={props.telefono ? { paddingBottom: "max(16px, env(safe-area-inset-bottom))" } : { bottom: "calc(var(--altezza-dock, 200px) + 8px)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">Luci</div>
          {props.telefono ? (
            <Pulsante variante="secondario" misura="sm" onClick={() => setAperto(false)}>
              Chiudi
            </Pulsante>
          ) : (
            <button type="button" aria-label="Chiudi" onClick={() => setAperto(false)} className="tocco rounded-[10px] p-1.5 text-testo-3 hover:bg-velo hover:text-testo">
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {!props.luci.raggiungibile && (
          <p className="mb-3 text-[13px] text-testo-2">La centralina delle luci non risponde. I suoni vanno avanti lo stesso.</p>
        )}
        <div className="grid grid-cols-2 gap-[10px]">
          {EFFETTI.map((e) => (
            <button
              key={e}
              type="button"
              data-effetto={e}
              aria-pressed={corrente === e}
              onClick={() => esegui(e)}
              className={`tocco flex min-h-16 items-center justify-center rounded-[var(--raggio-campo)] px-3 text-[17px] font-semibold ${
                corrente === e ? "ring-4 ring-[var(--anello-attivo)]" : ""
              }`}
              style={{ backgroundColor: props.luci.colori[e], color: testoSu(props.luci.colori[e]), border: corrente === e ? "2px solid var(--brand)" : "2px solid transparent" }}
            >
              {props.luci.nomi[e]}
            </button>
          ))}
          <button
            type="button"
            data-effetto="torna"
            onClick={() => esegui("torna")}
            className="vetro vetro-campo tocco flex min-h-16 items-center justify-center px-3 text-[17px] font-semibold text-testo"
          >
            Torna com'era
          </button>
        </div>
        <label className="mt-4 flex items-center gap-3 text-[13px] text-testo-2">
          <span className="etichetta w-20">Intensità</span>
          <input
            type="range"
            min={INTENSITA_MIN}
            max={INTENSITA_MAX}
            step={5}
            value={intensita}
            onChange={(e) => cambiaIntensita(Number(e.target.value))}
            aria-label="Intensità delle luci"
            className="flex-1 accent-[var(--brand)]"
          />
          <span className="w-12 text-right tabular-nums text-testo" data-intensita>
            {intensita}%
          </span>
        </label>
      </div>
    </div>
  );

  return (
    <>
      <Pulsante
        variante="secondario"
        misura={props.telefono ? "md" : "lg"}
        disabled={props.disabilitato}
        onClick={() => setAperto(true)}
        aria-haspopup="dialog"
        aria-expanded={aperto}
        data-luci
        title={props.luci.raggiungibile ? "Luci: i tre effetti e Torna com'era" : "Luci: la centralina non risponde"}
      >
        <Lightbulb size={18} strokeWidth={1.75} aria-hidden /> Luci
        {!props.luci.raggiungibile && <span aria-label="centralina non raggiungibile" className="h-2 w-2 rounded-full bg-testo-3" data-pallino-grigio />}
      </Pulsante>
      {aperto && createPortal(pannello, document.body)}
    </>
  );
}
