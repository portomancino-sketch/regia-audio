// "Altri (N)": le caselle della riga Sempre non in evidenza, in un elenco.
// Telefono: foglio dal basso. Mac: pannello sopra il dock (ESC o click fuori).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Search, X } from "lucide-react";
import type { Cue, CueAttivo } from "../../../shared/tipi";
import { coloreCue, tempoRimanente } from "../util";
import { ICONE_TIPO } from "./PulsanteCue";
import { Pulsante } from "./ui/Pulsante";

const SOGLIA_CERCA = 8;

export function AltriSempre(props: {
  cue: Cue[];
  attivi: CueAttivo[];
  fatti?: string[];
  disabilitato?: boolean;
  telefono?: boolean;
  /** Tocco su una voce: stesso comportamento della pillola; il pannello si chiude. */
  onScelta: (cue: Cue) => void;
  onChiudi: () => void;
}) {
  const [cerca, setCerca] = useState("");

  // ESC chiude il pannello (in fase di cattura: non deve arrivare a "STOP TUTTO").
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        props.onChiudi();
      }
    };
    window.addEventListener("keydown", suTasto, { capture: true });
    return () => window.removeEventListener("keydown", suTasto, { capture: true });
  }, [props.onChiudi]);

  const filtro = cerca.trim().toLowerCase();
  const voci = useMemo(
    () => (filtro ? props.cue.filter((c) => c.titolo.toLowerCase().includes(filtro)) : props.cue),
    [props.cue, filtro],
  );

  const elenco = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {voci.map((c) => {
        const attiva = props.attivi.find((a) => a.cueId === c.id);
        const suona = !!attiva && !attiva.inPausa;
        const promemoria = c.tipo === "promemoria";
        const fatto = promemoria && (props.fatti?.includes(c.id) ?? false);
        const spento = props.disabilitato || (!promemoria && !c.file);
        const colore = coloreCue(c);
        const Icona = ICONE_TIPO[c.tipo];
        const rimanente = attiva ? tempoRimanente(attiva) : null;
        return (
          <button
            key={c.id}
            type="button"
            aria-disabled={spento}
            aria-pressed={promemoria ? fatto : !!attiva}
            title={c.titolo}
            onClick={() => {
              if (spento) return;
              props.onScelta(c);
              props.onChiudi();
            }}
            className={`tocco flex h-[52px] w-full items-center gap-3 rounded-[var(--raggio-campo)] px-3 text-left hover:bg-velo ${
              spento ? "cursor-default opacity-40" : ""
            }`}
          >
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, ${colore} 14%, transparent)` }}
            >
              {promemoria ? (
                <CircleCheck
                  size={18}
                  strokeWidth={1.75}
                  className={fatto ? "text-brand-chiaro" : ""}
                  style={fatto ? undefined : { color: colore }}
                  fill={fatto ? "var(--brand-glow)" : "none"}
                />
              ) : (
                <Icona size={18} strokeWidth={1.75} style={{ color: colore }} />
              )}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-[16px] font-semibold ${fatto ? "text-testo-3 line-through" : "text-testo"}`}
            >
              {c.titolo}
            </span>
            {suona && (
              <span className="flex shrink-0 items-center gap-2 text-[13px] tabular-nums text-testo-2">
                <span aria-label="suona" className="respira h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colore }} />
                {rimanente?.testo ?? ""}
              </span>
            )}
            {attiva && attiva.inPausa && <span className="shrink-0 text-[13px] text-testo-3">in pausa</span>}
          </button>
        );
      })}
      {voci.length === 0 && <p className="px-3 py-4 text-[14px] text-testo-3">Nessun suono con questo nome.</p>}
    </div>
  );

  const campoCerca =
    props.cue.length > SOGLIA_CERCA ? (
      <label className="mb-2 flex items-center gap-2 rounded-[var(--raggio-campo)] border border-vetro-bordo bg-velo px-3">
        <Search size={16} strokeWidth={1.75} className="shrink-0 text-testo-3" aria-hidden />
        <input
          type="search"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          placeholder="Cerca"
          aria-label="Cerca tra gli altri suoni"
          autoFocus={!props.telefono}
          className="h-10 w-full bg-transparent text-[15px] text-testo placeholder:text-testo-3 focus:outline-none"
        />
      </label>
    ) : null;

  const pannello = props.telefono ? (
    // ---- Telefono: foglio dal basso ----
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={props.onChiudi}>
      <div
        role="dialog"
        aria-label="Altri suoni"
        onClick={(e) => e.stopPropagation()}
        className="vetro vetro-solido flex max-h-[72vh] w-full flex-col rounded-b-none rounded-t-[24px] p-4"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[17px] font-semibold tracking-[-0.01em]">Altri suoni</div>
          <Pulsante variante="secondario" misura="sm" onClick={props.onChiudi}>
            Chiudi
          </Pulsante>
        </div>
        {campoCerca}
        {elenco}
      </div>
    </div>
  ) : (
    // ---- Mac: pannello sopra il dock ----
    <div className="fixed inset-0 z-50" onClick={props.onChiudi}>
      <div
        role="dialog"
        aria-label="Altri suoni"
        onClick={(e) => e.stopPropagation()}
        className="vetro vetro-solido fixed left-1/2 flex w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col p-3"
        style={{ bottom: "calc(var(--altezza-dock, 200px) + 8px)", maxHeight: "60vh" }}
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-[15px] font-semibold">Altri suoni</div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={props.onChiudi}
            className="tocco rounded-[10px] p-1.5 text-testo-3 hover:bg-velo hover:text-testo"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        {campoCerca}
        {elenco}
      </div>
    </div>
  );

  return createPortal(pannello, document.body);
}
