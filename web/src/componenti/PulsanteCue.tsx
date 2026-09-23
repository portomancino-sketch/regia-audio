// Il pulsante grande di un cue nella vista Live (Mac e telefono).
import { AudioLines } from "lucide-react";
import type { Cue, CueAttivo } from "../../../shared/tipi";
import { coloreCue, NOMI_TIPO } from "../util";
import { BarraAvanzamento } from "./ui/BarraAvanzamento";
import { Pillola } from "./ui/Pillola";

export function PulsanteCue(props: {
  cue: Cue;
  attivi: CueAttivo[];
  onPremi: () => void;
  disabilitato?: boolean;
  scorciatoia?: string;
  compatto?: boolean;
}) {
  const { cue } = props;
  const istanze = props.attivi.filter((a) => a.cueId === cue.id);
  const attiva = istanze[0];
  const colore = coloreCue(cue);
  const avanzamento =
    attiva && attiva.durataSec && attiva.durataSec > 0
      ? Math.min(1, attiva.posizioneSec / attiva.durataSec)
      : 0;

  return (
    <button
      type="button"
      disabled={props.disabilitato || !cue.file}
      onClick={props.onPremi}
      className={`vetro tocco relative flex flex-col justify-between overflow-hidden p-4 text-left disabled:opacity-40 ${
        props.compatto ? "min-h-[88px]" : "min-h-[112px]"
      }`}
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
        {props.scorciatoia && (
          <kbd className="rounded-md border border-vetro-bordo bg-white/5 px-1.5 text-[11px] text-testo-3">
            {props.scorciatoia}
          </kbd>
        )}
      </div>
      {attiva && !attiva.inPausa && (
        <div className="absolute inset-x-0 bottom-0">
          <BarraAvanzamento frazione={avanzamento} colore={colore} />
        </div>
      )}
    </button>
  );
}
