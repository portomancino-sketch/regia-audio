// La riga "Sempre": le caselle visibili in ogni fase, sopra il dock.
// Sul Mac sono card compatte; sul telefono diventano pillole da 44px
// (solo icona del tipo + titolo) in una striscia scorrevole senza barra.
import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import type { Cue, CueAttivo } from "../../../shared/tipi";
import { coloreCue } from "../util";
import { ICONE_TIPO, PulsanteCue } from "./PulsanteCue";
import { Equalizzatore } from "./ui/Equalizzatore";

const TASTI_SEMPRE = ["Q", "W", "E", "R", "T"];

/** La pillola di una casella Sempre sul telefono: 44px, icona + titolo.
 *  Tocco = stesso comportamento della card (parte / si ferma / spunta).
 *  Niente nota, niente "finisce tra": per quello c'è il dock. */
function PillolaSempre(props: {
  cue: Cue;
  attivi: CueAttivo[];
  fatto?: boolean;
  disabilitato?: boolean;
  onPremi: () => void;
  onSpunta: () => void;
}) {
  const { cue } = props;
  const promemoria = cue.tipo === "promemoria";
  const istanze = props.attivi.filter((a) => a.cueId === cue.id);
  const attiva = istanze[0];
  const suona = !!attiva && !attiva.inPausa;
  const inPausa = attiva?.inPausa === true;
  const fatto = promemoria && props.fatto === true;
  const spento = props.disabilitato || (!promemoria && !cue.file);
  const colore = coloreCue(cue);
  const Icona = ICONE_TIPO[cue.tipo];

  // "Scatto" anche quando il comando arriva dal Mac o dalla tastiera.
  const [scatta, setScatta] = useState(false);
  const istanzePrima = useRef(istanze.length);
  const fattoPrima = useRef(props.fatto);
  useEffect(() => {
    const partita = istanze.length > istanzePrima.current;
    const spuntata = promemoria && props.fatto !== fattoPrima.current;
    istanzePrima.current = istanze.length;
    fattoPrima.current = props.fatto;
    if (partita || spuntata) {
      setScatta(true);
      const t = setTimeout(() => setScatta(false), 260);
      return () => clearTimeout(t);
    }
  }, [istanze.length, props.fatto, promemoria]);

  const tenue = `color-mix(in srgb, ${colore} 12%, transparent)`;
  const pieno = `color-mix(in srgb, ${colore} 30%, transparent)`;
  const bordo = `color-mix(in srgb, ${colore} 55%, transparent)`;
  const anello = `color-mix(in srgb, ${colore} 28%, transparent)`;

  return (
    <button
      type="button"
      aria-disabled={spento}
      aria-pressed={promemoria ? fatto : !!attiva}
      title={cue.titolo}
      onClick={() => {
        if (spento) return;
        if (promemoria) props.onSpunta();
        else props.onPremi();
      }}
      style={{
        backgroundColor: suona ? pieno : tenue,
        borderColor: suona || inPausa ? colore : bordo,
        boxShadow: suona ? `0 0 0 3px ${anello}` : undefined,
      }}
      className={`tocco relative inline-flex h-11 min-w-11 max-w-[60vw] shrink-0 select-none items-center gap-2 overflow-hidden rounded-full border px-3.5 text-left text-[15px] font-semibold text-testo ${
        scatta ? "scatto" : ""
      } ${spento ? "cursor-default opacity-40" : ""} ${fatto ? "opacity-75" : ""}`}
    >
      {/* Il respiro, solo mentre suona (come le card) */}
      {suona && (
        <span
          aria-hidden
          className="respira pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ boxShadow: `inset 0 0 18px ${colore}` }}
        />
      )}
      <span aria-hidden className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {promemoria ? (
          <CircleCheck
            size={18}
            strokeWidth={1.75}
            className={fatto ? "text-brand-chiaro" : ""}
            style={fatto ? undefined : { color: colore }}
            fill={fatto ? "var(--brand-glow)" : "none"}
          />
        ) : suona ? (
          <Equalizzatore colore={colore} altezza={14} />
        ) : (
          <Icona size={18} strokeWidth={1.75} style={{ color: colore }} />
        )}
      </span>
      <span className={`relative min-w-0 truncate ${fatto ? "text-testo-3 line-through" : ""}`}>{cue.titolo}</span>
      {istanze.length > 1 && <span className="relative text-[12px] text-brand-chiaro">×{istanze.length}</span>}
    </button>
  );
}

export function RigaSempre(props: {
  cue: Cue[];
  attivi: CueAttivo[];
  fatti?: string[];
  onPremi: (cue: Cue) => void;
  onFerma: (cue: Cue) => void;
  onSfuma: (cue: Cue) => void;
  onSpunta: (cue: Cue) => void;
  disabilitato?: boolean;
  telefono?: boolean;
}) {
  if (props.cue.length === 0) return null;

  // ---- Telefono: striscia di pillole ----
  if (props.telefono) {
    return (
      <div
        className="striscia-senza-barra mx-auto mb-2 flex max-w-5xl gap-2 overflow-x-auto py-1"
        aria-label="Sempre"
      >
        {props.cue.map((c) => (
          <PillolaSempre
            key={c.id}
            cue={c}
            attivi={props.attivi}
            fatto={props.fatti?.includes(c.id)}
            disabilitato={props.disabilitato}
            onPremi={() => props.onPremi(c)}
            onSpunta={() => props.onSpunta(c)}
          />
        ))}
      </div>
    );
  }

  // ---- Mac: card compatte. Le scorciatoie Q W E R T valgono per le prime cinque caselle audio.
  let n = 0;
  const scorciatoie = new Map<string, string>();
  for (const c of props.cue) {
    if (c.tipo !== "promemoria" && n < TASTI_SEMPRE.length) scorciatoie.set(c.id, TASTI_SEMPRE[n++]!);
  }
  return (
    <div className="mx-auto mb-3 flex max-w-5xl gap-2 overflow-x-auto pb-1">
      {props.cue.map((c) => (
        <div key={c.id} className="w-64 shrink-0">
          <PulsanteCue
            cue={c}
            compatto
            attivi={props.attivi}
            fatto={props.fatti?.includes(c.id)}
            disabilitato={props.disabilitato}
            scorciatoia={scorciatoie.get(c.id)}
            onPremi={() => props.onPremi(c)}
            onFerma={() => props.onFerma(c)}
            onSfuma={() => props.onSfuma(c)}
            onSpunta={() => props.onSpunta(c)}
          />
        </div>
      ))}
    </div>
  );
}
