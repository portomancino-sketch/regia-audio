// Il pulsante grande di un cue nella vista Live (Mac e telefono).
import type { Cue, CueAttivo } from "../../../shared/tipi";
import { coloreCue, NOMI_TIPO } from "../util";

export function PulsanteCue(props: {
  cue: Cue;
  attivi: CueAttivo[];
  onPremi: () => void;
  disabilitato?: boolean;
  scorciatoia?: string;
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
      className={`relative min-h-16 overflow-hidden rounded-2xl border-2 p-3 text-left transition-transform active:scale-95 disabled:opacity-40 sm:min-h-24 ${
        attiva ? "shadow-lg" : ""
      }`}
      style={{
        borderColor: attiva ? colore : "#333",
        backgroundColor: attiva ? `${colore}33` : "#1a1a1f",
        boxShadow: attiva ? `0 0 16px ${colore}66` : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-tight">{cue.titolo}</div>
          {cue.nota && <div className="mt-0.5 truncate text-sm text-neutral-400">{cue.nota}</div>}
        </div>
        {props.scorciatoia && (
          <span className="rounded bg-neutral-800 px-1.5 text-xs text-neutral-500">{props.scorciatoia}</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: colore }}>
        <span>{NOMI_TIPO[cue.tipo]}</span>
        {!cue.file && <span className="text-neutral-500">— manca il file</span>}
        {attiva?.inPausa && <span className="text-neutral-300">in pausa</span>}
        {istanze.length > 1 && <span>×{istanze.length}</span>}
      </div>
      {attiva && !attiva.inPausa && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-neutral-800">
          <div className="h-full transition-[width]" style={{ width: `${avanzamento * 100}%`, backgroundColor: colore }} />
        </div>
      )}
    </button>
  );
}
