// La vista Live: fasi in alto, pulsanti grandi, dock in basso.
import { Keyboard, Music } from "lucide-react";
import type { Cue, CueAttivo, Format } from "../../../shared/tipi";
import { PulsanteCue } from "../componenti/PulsanteCue";
import { ControlloSegmentato } from "../componenti/ui/ControlloSegmentato";
import { Vetro } from "../componenti/ui/Vetro";

export function Live(props: {
  format: Format;
  faseId: string | null;
  attivi: CueAttivo[];
  onCambiaFase: (faseId: string) => void;
  onPremi: (cue: Cue) => void;
  onFerma: (cue: Cue) => void;
  onSfuma: (cue: Cue) => void;
  disabilitato?: boolean;
}) {
  const fasi = [...props.format.fasi].sort((a, b) => a.ordine - b.ordine);
  const fase = fasi.find((f) => f.id === props.faseId) ?? fasi[0];
  const cue = fase ? [...fase.cue].sort((a, b) => a.ordine - b.ordine) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-36 pt-5">
      {fasi.length > 0 && (
        <div className="mb-5 flex items-center gap-2">
          <ControlloSegmentato
            grande
            className="flex-1"
            segmenti={fasi.map((f) => ({ id: f.id, testo: f.nome }))}
            valore={fase?.id ?? ""}
            onCambia={props.onCambiaFase}
          />
          <span
            title="Scorciatoie: ESC stop tutto · F fade out · 1–9 suoni della fase · ← → cambia fase"
            className="hidden shrink-0 cursor-help rounded-[10px] p-2 text-testo-3 hover:text-testo-2 sm:block"
          >
            <Keyboard size={18} strokeWidth={1.75} aria-label="Scorciatoie da tastiera" />
          </span>
        </div>
      )}
      {!fase ? (
        <Vetro className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
          <Music size={30} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
          <p className="text-testo-2">Questo format non ha ancora fasi: aggiungile in Modifica.</p>
        </Vetro>
      ) : cue.length === 0 ? (
        <Vetro className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
          <Music size={30} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
          <p className="text-testo-2">Nessun suono in questa fase.</p>
        </Vetro>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {cue.map((c, i) => (
            <PulsanteCue
              key={c.id}
              cue={c}
              attivi={props.attivi}
              disabilitato={props.disabilitato}
              scorciatoia={i < 9 ? String(i + 1) : undefined}
              onPremi={() => props.onPremi(c)}
              onFerma={() => props.onFerma(c)}
              onSfuma={() => props.onSfuma(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
