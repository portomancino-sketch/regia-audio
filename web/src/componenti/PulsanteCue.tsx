// Il pulsante grande di un cue nella vista Live (Mac e telefono).
import { useEffect, useRef, useState } from "react";
import { AudioLines, CircleCheck, Music, Square, Zap } from "lucide-react";
import type { Cue, CueAttivo, TipoCue } from "../../../shared/tipi";
import { coloreCue, formattaTempo, NOMI_TIPO } from "../util";
import { BarraAvanzamento } from "./ui/BarraAvanzamento";
import { Pillola } from "./ui/Pillola";
import { Equalizzatore } from "./ui/Equalizzatore";

const ICONE_TIPO: Record<TipoCue, typeof Music> = {
  sottofondo: AudioLines,
  brano: Music,
  effetto: Zap,
  promemoria: CircleCheck,
};

/** Il cerchietto 36px con la tinta del tipo al 14%. */
function Cerchietto(props: { colore: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: `color-mix(in srgb, ${props.colore} 14%, transparent)` }}
    >
      {props.children}
    </span>
  );
}

export function PulsanteCue(props: {
  cue: Cue;
  attivi: CueAttivo[];
  onPremi: () => void;
  /** Ferma subito questo suono (mostrato solo mentre suona). */
  onFerma?: () => void;
  /** Sfuma dolcemente questo suono (mostrato solo mentre suona). */
  onSfuma?: () => void;
  /** Solo promemoria: è già stato spuntato? */
  fatto?: boolean;
  /** Solo promemoria: tocco = segna fatto / da fare. */
  onSpunta?: () => void;
  disabilitato?: boolean;
  scorciatoia?: string;
  compatto?: boolean;
  /** Ritardo dell'entrata a cascata, in ms. */
  ritardoEntrataMs?: number;
}) {
  const { cue } = props;
  const istanze = props.attivi.filter((a) => a.cueId === cue.id);
  const attiva = istanze[0];
  const colore = coloreCue(cue);
  const Icona = ICONE_TIPO[cue.tipo];

  // "Scatto": la card reagisce anche quando il comando arriva da tastiera o telefono.
  const [scatta, setScatta] = useState(false);
  const istanzePrima = useRef(istanze.length);
  const fattoPrima = useRef(props.fatto);
  useEffect(() => {
    const partita = istanze.length > istanzePrima.current;
    const spuntata = cue.tipo === "promemoria" && props.fatto !== fattoPrima.current;
    istanzePrima.current = istanze.length;
    fattoPrima.current = props.fatto;
    if (partita || spuntata) {
      setScatta(true);
      const t = setTimeout(() => setScatta(false), 260);
      return () => clearTimeout(t);
    }
  }, [istanze.length, props.fatto, cue.tipo]);

  const stile = { animationDelay: `${props.ritardoEntrataMs ?? 0}ms` };

  // ---- Promemoria: spunta da segnare, non suona ----
  if (cue.tipo === "promemoria") {
    const fatto = props.fatto === true;
    return (
      <div
        role="button"
        tabIndex={props.disabilitato ? -1 : 0}
        aria-disabled={props.disabilitato}
        aria-pressed={fatto}
        onClick={() => {
          if (!props.disabilitato) props.onSpunta?.();
        }}
        onKeyDown={(e) => {
          if (!props.disabilitato && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            props.onSpunta?.();
          }
        }}
        style={stile}
        className={`vetro tocco entra relative flex cursor-pointer select-none flex-col text-left ${
          props.compatto ? "min-h-[88px] p-3" : "min-h-[152px] p-4"
        } ${scatta ? "scatto" : ""} ${props.disabilitato ? "cursor-default opacity-40" : ""} ${fatto ? "opacity-75" : ""}`}
      >
        <div className="flex w-full items-start justify-between gap-2">
          <Cerchietto colore={colore}>
            <CircleCheck
              size={20}
              strokeWidth={1.75}
              className={fatto ? "text-brand-chiaro" : "text-testo-3"}
              fill={fatto ? "var(--brand-glow)" : "none"}
            />
          </Cerchietto>
          <Pillola colore={colore}>{fatto ? "fatto" : NOMI_TIPO[cue.tipo]}</Pillola>
        </div>
        <div className="mt-3 min-w-0">
          <div
            className={`line-clamp-2 text-[20px] font-semibold leading-tight ${
              fatto ? "text-testo-3 line-through" : "text-testo"
            }`}
          >
            {cue.titolo}
          </div>
          {cue.nota && (
            <div className={`mt-1 line-clamp-2 text-[14px] ${fatto ? "text-testo-3" : "text-testo-2"}`}>
              {cue.nota}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Cue audio ----
  const spento = props.disabilitato || !cue.file;
  const avanzamento =
    attiva && attiva.durataSec && attiva.durataSec > 0
      ? Math.min(1, attiva.posizioneSec / attiva.durataSec)
      : 0;
  const inPausa = attiva?.inPausa === true;

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
      style={{
        ...stile,
        ...(attiva
          ? inPausa
            ? { borderColor: "var(--testo-3)" }
            : {
                borderColor: "var(--brand)",
                boxShadow:
                  "0 0 0 3px var(--anello-attivo), var(--vetro-ombra), inset 0 1px 0 var(--vetro-luce), inset 0 0 0 1px var(--vetro-hairline)",
              }
          : {}),
      }}
      className={`vetro tocco entra relative flex cursor-pointer select-none flex-col overflow-hidden text-left ${
        props.compatto ? "min-h-[88px] p-3" : "min-h-[152px] p-4"
      } ${scatta ? "scatto" : ""} ${spento ? "cursor-default opacity-40" : ""}`}
    >
      {/* Il glow che respira, solo mentre suona */}
      {attiva && !inPausa && (
        <span
          aria-hidden
          className="respira pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ boxShadow: "inset 0 0 26px var(--brand-glow)" }}
        />
      )}

      <div className="flex w-full items-start justify-between gap-2">
        <Cerchietto colore={colore}>
          {attiva && !inPausa ? (
            <Equalizzatore colore={colore} altezza={16} />
          ) : (
            <Icona size={20} strokeWidth={1.75} style={{ color: colore }} />
          )}
        </Cerchietto>
        <Pillola colore={colore}>{inPausa ? "in pausa" : NOMI_TIPO[cue.tipo]}</Pillola>
      </div>

      <div className="mt-3 min-w-0 flex-1">
        <div className={`line-clamp-2 font-semibold leading-tight text-testo ${props.compatto ? "text-[17px]" : "text-[20px]"}`}>{cue.titolo}</div>
        {cue.nota && <div className="mt-1 line-clamp-2 text-[14px] text-testo-2">{cue.nota}</div>}
        {!cue.file && <div className="mt-1 text-[12px] text-testo-3">manca il file</div>}
      </div>

      <div className="mt-2 flex w-full items-center gap-2">
        {istanze.length > 1 && <span className="text-[12px] text-brand-chiaro">×{istanze.length}</span>}
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
        <span className="flex-1" />
        <span className="text-[12px] tabular-nums text-testo-3">
          {attiva
            ? `${formattaTempo(attiva.posizioneSec)} / ${formattaTempo(attiva.durataSec)}`
            : formattaTempo(cue.durataSec)}
        </span>
        {!attiva && props.scorciatoia && (
          <span className="rounded-full border border-vetro-bordo bg-velo px-1.5 text-[11px] tabular-nums text-testo-3">
            {props.scorciatoia}
          </span>
        )}
      </div>

      {attiva && !inPausa && (
        <div className="absolute inset-x-0 bottom-0">
          <BarraAvanzamento frazione={avanzamento} colore={colore} spessa />
        </div>
      )}
    </div>
  );
}
