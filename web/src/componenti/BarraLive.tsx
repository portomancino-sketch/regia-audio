// La barra fissa in basso: cosa sta suonando, master, FADE, STOP.
import type { CueAttivo } from "../../../shared/tipi";
import { formattaTempo } from "../util";

export function BarraLive(props: {
  attivi: CueAttivo[];
  master: number;
  onMaster: (v: number) => void;
  onFade: () => void;
  onStop: () => void;
  disabilitata?: boolean;
}) {
  const { attivi } = props;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-800 bg-neutral-900/95 px-3 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Sta suonando</div>
          {attivi.length === 0 ? (
            <div className="truncate text-neutral-400">Silenzio</div>
          ) : (
            <div className="truncate">
              {attivi.map((a) => (
                <span key={a.istanzaId} className="mr-3 whitespace-nowrap">
                  <span className="font-medium">{a.titolo}</span>{" "}
                  <span className="text-sm text-neutral-400">
                    {a.inPausa ? "in pausa" : `${formattaTempo(a.posizioneSec)} / ${formattaTempo(a.durataSec)}`}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2">
          <span className="text-sm text-neutral-400">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(props.master * 100)}
            disabled={props.disabilitata}
            onChange={(e) => props.onMaster(Number(e.target.value) / 100)}
            className="h-2 w-28 accent-blue-500 sm:w-40"
          />
          <span className="w-8 text-right text-sm tabular-nums text-neutral-400">
            {Math.round(props.master * 100)}
          </span>
        </label>
        <button
          type="button"
          disabled={props.disabilitata}
          onClick={props.onFade}
          className="min-h-16 rounded-xl bg-amber-600 px-5 text-lg font-bold text-white hover:bg-amber-500 disabled:opacity-40"
        >
          FADE OUT
        </button>
        <button
          type="button"
          disabled={props.disabilitata}
          onClick={props.onStop}
          className="min-h-16 rounded-xl bg-red-600 px-5 text-lg font-bold text-white hover:bg-red-500 disabled:opacity-40"
        >
          STOP TUTTO
        </button>
      </div>
    </div>
  );
}
