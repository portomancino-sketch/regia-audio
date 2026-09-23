// La vista Live: fasi in alto, pulsanti grandi, barra fissa in basso.
import type { Cue, CueAttivo, Format } from "../../../shared/tipi";
import { PulsanteCue } from "../componenti/PulsanteCue";

export function Live(props: {
  format: Format;
  faseId: string | null;
  attivi: CueAttivo[];
  onCambiaFase: (faseId: string) => void;
  onPremi: (cue: Cue) => void;
  disabilitato?: boolean;
  colonneStrette?: boolean;
}) {
  const fasi = [...props.format.fasi].sort((a, b) => a.ordine - b.ordine);
  const fase = fasi.find((f) => f.id === props.faseId) ?? fasi[0];
  const cue = fase ? [...fase.cue].sort((a, b) => a.ordine - b.ordine) : [];

  return (
    <div className="mx-auto max-w-5xl px-3 pb-32 pt-3">
      <div className="mb-4 flex flex-wrap gap-2">
        {fasi.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => props.onCambiaFase(f.id)}
            className={`rounded-xl px-4 py-2.5 font-medium ${
              fase?.id === f.id ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {f.nome}
          </button>
        ))}
      </div>
      {!fase ? (
        <p className="text-neutral-400">Questo format non ha ancora fasi: aggiungile in Modifica.</p>
      ) : cue.length === 0 ? (
        <p className="text-neutral-400">Nessun suono in questa fase.</p>
      ) : (
        <div className={`grid gap-3 ${props.colonneStrette ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"}`}>
          {cue.map((c, i) => (
            <PulsanteCue
              key={c.id}
              cue={c}
              attivi={props.attivi}
              disabilitato={props.disabilitato}
              scorciatoia={!props.colonneStrette && i < 9 ? String(i + 1) : undefined}
              onPremi={() => props.onPremi(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
