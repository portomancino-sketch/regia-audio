// La riga "Sempre": le caselle visibili in ogni fase, sopra il dock.
// Mac e telefono: pillole da 44px (icona del tipo + titolo; sul Mac anche il tasto)
// in una striscia scorrevole senza barra: la riga non supera mai i 96 px.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleCheck } from "lucide-react";
import type { Cue, CueAttivo } from "../../../shared/tipi";
import { altriSempre, inEvidenza } from "../../../shared/sempre";
import { coloreCue, coloreLuceDi } from "../util";
import type { LuciLive } from "../api";
import { AltriSempre } from "./AltriSempre";
import { ICONE_TIPO } from "./PulsanteCue";
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
  /** Solo Mac: il tasto (Q W E R T) e i segnali che sulla card grande erano scritti. */
  scorciatoia?: string;
  problemaFile?: "mancante" | "nonDecodificabile";
  coloreLuce?: string;
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
      className={`tocco relative inline-flex h-11 min-w-11 max-w-[60vw] min-[700px]:max-w-[200px] shrink-0 select-none items-center gap-2 overflow-hidden rounded-full border px-3.5 text-left text-[15px] font-semibold text-testo ${
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
      {props.problemaFile && (
        <span
          className="relative h-2.5 w-2.5 shrink-0 rounded-full bg-rosso"
          aria-label={props.problemaFile === "mancante" ? "file mancante" : "file non leggibile"}
          title={props.problemaFile === "mancante" ? "file mancante" : "file non leggibile"}
          data-file-mancante={props.problemaFile}
        />
      )}
      {props.coloreLuce && (
        <span aria-label="con luci" className="relative h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[var(--vetro-bordo)]" style={{ backgroundColor: props.coloreLuce }} data-pallino-luce />
      )}
      {props.scorciatoia && (
        <span className="relative shrink-0 rounded-full border border-vetro-bordo bg-velo px-1.5 text-[11px] font-normal tabular-nums text-testo-3">
          {props.scorciatoia}
        </span>
      )}
    </button>
  );
}

export function RigaSempre(props: {
  cue: Cue[];
  attivi: CueAttivo[];
  fatti?: string[];
  usi?: Record<string, number>;
  luci?: LuciLive | null;
  /** I file che il soundcheck di oggi ha trovato mancanti o rotti (cueId → esito). */
  problemi?: Record<string, "mancante" | "nonDecodificabile">;
  onPremi: (cue: Cue) => void;
  onFerma: (cue: Cue) => void;
  onSfuma: (cue: Cue) => void;
  onSpunta: (cue: Cue) => void;
  disabilitato?: boolean;
  telefono?: boolean;
}) {
  // Chiamato PRIMA di ogni return (regola degli hook).
  const [altriAperti, setAltriAperti] = useState(false);
  if (props.cue.length === 0) return null;

  // In evidenza (max 4, nell'ordine di Modifica) + "Altri (N)".
  const evidenza = inEvidenza(props.cue);
  const altri = altriSempre(props.cue);
  const altroCheSuona = altri.find((c) => props.attivi.some((a) => a.cueId === c.id && !a.inPausa));

  // Le scorciatoie Q W E R T seguono le pillole in evidenza, nell'ordine (solo Mac).
  let n = 0;
  const scorciatoie = new Map<string, string>();
  for (const c of evidenza) {
    if (c.tipo !== "promemoria" && n < TASTI_SEMPRE.length) scorciatoie.set(c.id, TASTI_SEMPRE[n++]!);
  }

  function scegli(c: Cue) {
    if (c.tipo === "promemoria") props.onSpunta(c);
    else props.onPremi(c);
  }

  // Un solo layout: striscia scorrevole senza barra, dentro il vetro del dock.
  // Il padding interno pari a quello del vetro (px-5) con margine negativo fa
  // scorrere le caselle fino al bordo del vetro senza tagliarle a metà.
  return (
    <div className="striscia-senza-barra -mx-5 flex min-w-0 items-center gap-2 overflow-x-auto px-5 py-1" aria-label="Sempre">
      {/* Mac e telefono: pillole da 44 px (la riga resta compatta, sotto i 96 px).
          Sul Mac la pillola porta anche il tasto Q W E R T e i pallini file/luci. */}
      {evidenza.map((c) => (
        <PillolaSempre
          key={c.id}
          cue={c}
          attivi={props.attivi}
          fatto={props.fatti?.includes(c.id)}
          disabilitato={props.disabilitato}
          scorciatoia={props.telefono ? undefined : scorciatoie.get(c.id)}
          problemaFile={props.problemi?.[c.id]}
          coloreLuce={coloreLuceDi(c.luce, props.luci)}
          onPremi={() => props.onPremi(c)}
          onSpunta={() => props.onSpunta(c)}
        />
      ))}
      {altri.length > 0 && (
        <button
          type="button"
          data-altri
          aria-haspopup="dialog"
          aria-expanded={altriAperti}
          title="Le altre caselle della riga Sempre"
          onClick={() => setAltriAperti(true)}
          className="tocco inline-flex h-11 shrink-0 select-none items-center gap-1.5 self-center rounded-full border border-vetro-bordo bg-velo px-3.5 text-[15px] font-semibold text-testo"
        >
          {altroCheSuona && (
            <span
              aria-label="uno degli altri suona"
              className="respira h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: coloreCue(altroCheSuona) }}
            />
          )}
          Altri ({altri.length})
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="text-testo-3" />
        </button>
      )}
      {altriAperti && (
        <AltriSempre
          cue={altri}
          attivi={props.attivi}
          fatti={props.fatti}
          disabilitato={props.disabilitato}
          telefono={props.telefono}
          onScelta={scegli}
          onChiudi={() => setAltriAperti(false)}
        />
      )}
    </div>
  );
}
