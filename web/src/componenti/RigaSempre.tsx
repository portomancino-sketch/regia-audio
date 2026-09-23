// La riga "Sempre": le caselle visibili in ogni fase, sopra il dock.
import type { Cue, CueAttivo } from "../../../shared/tipi";
import { PulsanteCue } from "./PulsanteCue";

const TASTI_SEMPRE = ["Q", "W", "E", "R", "T"];

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
  // Le scorciatoie Q W E R T valgono per le prime cinque caselle audio.
  let n = 0;
  const scorciatoie = new Map<string, string>();
  for (const c of props.cue) {
    if (c.tipo !== "promemoria" && n < TASTI_SEMPRE.length) scorciatoie.set(c.id, TASTI_SEMPRE[n++]!);
  }
  return (
    <div className="mx-auto mb-3 flex max-w-5xl gap-2 overflow-x-auto pb-1">
      {props.cue.map((c) => (
        <div key={c.id} className={props.telefono ? "w-56 shrink-0" : "w-64 shrink-0"}>
          <PulsanteCue
            cue={c}
            compatto
            attivi={props.attivi}
            fatto={props.fatti?.includes(c.id)}
            disabilitato={props.disabilitato}
            scorciatoia={props.telefono ? undefined : scorciatoie.get(c.id)}
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
