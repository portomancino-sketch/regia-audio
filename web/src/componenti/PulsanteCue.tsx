// Il pulsante grande di un cue nella vista Live (Mac e telefono).
import { AudioLines, Square } from "lucide-react";
import type { Cue, CueAttivo } from "../../../shared/tipi";
import { coloreCue, NOMI_TIPO } from "../util";
import { BarraAvanzamento } from "./ui/BarraAvanzamento";
import { Pillola } from "./ui/Pillola";

export function PulsanteCue(props: {
  cue: Cue;
  attivi: CueAttivo[];
  onPremi: () => void;
  /** Ferma subito questo suono (mostrato solo mentre suona). */
  onFerma?: () => void;
  /** Sfuma dolcemente questo suono (mostrato solo mentre suona). */
  onSfuma?: () => void;
  disabilitato?: boolean;
  scorciatoia?: string;
  compatto?: boolean;
}) {
  const { cue } = props;
  const istanze = props.attivi.filter((a) => a.cueId === cue.id);
  const attiva = istanze[0];
  const colore = coloreCue(cue);
  const spento = props.disabilitato || !cue.file;
  const avanzamento =
    attiva && attiva.durataSec && attiva.durataSec > 0
      ? Math.min(1, attiva.posizioneSec / attiva.durataSec)
      : 0;

  return (
    <div
      role="button"
      tabIndex={spento ? -1 : 0}
      aria-disabled={spento}
      onClick={() => {
        if (!spento) props.onPremi();
      }}
      onKeyDown={(e) => {
        if (!spento && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          props.onPremi();
        }
      }}
      className={`vetro tocco relative flex cursor-pointer select-none flex-col justify-between overflow-hidden p-4 text-left ${
        props.compatto ? "min-h-[88px]" : "min-h-[112px]"
      } ${spento ? "cursor-default opacity-40" : ""}`}
      style={
        attiva
          ? {
              borderColor: "var(--brand-chiaro)",
              boxShadow: "0 0 24px var(--brand-glow), inset 0 1px 0 var(--vetro-luce)",
            }
          : undefined
      }
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 text-[20px] font-semibold leading-tight text-testo">
            {cue.titolo}
          </div>
          {cue.nota && (
            <div className={`mt-1 truncate text-testo-2 ${props.compatto ? "text-[14px]" : "text-[13px]"}`}>
              {cue.nota}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {attiva && !attiva.inPausa && (
            <AudioLines
              size={16}
              strokeWidth={1.75}
              className="pulsa-piano text-brand-chiaro"
              aria-label="sta suonando"
            />
          )}
          <Pillola colore={colore}>{NOMI_TIPO[cue.tipo]}</Pillola>
        </div>
      </div>
      <div className="mt-2 flex w-full items-center gap-2">
        {!cue.file && <span className="text-[12px] text-testo-3">manca il file</span>}
        {attiva?.inPausa && <Pillola>in pausa</Pillola>}
        {istanze.length > 1 && <span className="text-[12px] text-brand-chiaro">×{istanze.length}</span>}
        <span className="flex-1" />
        {attiva && props.onSfuma && (
          <button
            type="button"
            title="Sfuma questo suono"
            onClick={(e) => {
              e.stopPropagation();
              props.onSfuma!();
            }}
            className="tocco rounded-[10px] border border-vetro-bordo bg-velo px-2.5 py-1.5 text-[12px] font-medium text-testo-2 hover:text-testo"
          >
            Sfuma
          </button>
        )}
        {attiva && props.onFerma && (
          <button
            type="button"
            title="Ferma subito questo suono"
            aria-label="Ferma subito"
            onClick={(e) => {
              e.stopPropagation();
              props.onFerma!();
            }}
            className="tocco flex items-center justify-center rounded-[10px] border border-vetro-bordo bg-velo px-2.5 py-1.5 text-testo-2 hover:text-testo"
          >
            <Square size={13} strokeWidth={2} fill="currentColor" />
          </button>
        )}
        {!attiva && props.scorciatoia && (
          <kbd className="rounded-md border border-vetro-bordo bg-velo px-1.5 text-[11px] text-testo-3">
            {props.scorciatoia}
          </kbd>
        )}
      </div>
      {attiva && !attiva.inPausa && (
        <div className="absolute inset-x-0 bottom-0">
          <BarraAvanzamento frazione={avanzamento} colore={colore} />
        </div>
      )}
    </div>
  );
}
