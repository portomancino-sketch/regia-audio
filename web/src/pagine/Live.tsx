// La vista Live: fasi in alto, nota guida, pulsanti grandi, dock in basso.
import { useState } from "react";
import { Info, Keyboard, Music } from "lucide-react";
import type { Cue, CueAttivo, Format } from "../../../shared/tipi";
import { PulsanteCue } from "../componenti/PulsanteCue";
import { ControlloSegmentato } from "../componenti/ui/ControlloSegmentato";
import { Vetro } from "../componenti/ui/Vetro";

export function Live(props: {
  format: Format;
  faseId: string | null;
  attivi: CueAttivo[];
  fatti?: string[];
  /** Contatori "già suonato" della serata (cueId → partenze). */
  usi?: Record<string, number>;
  onCambiaFase: (faseId: string) => void;
  onPremi: (cue: Cue) => void;
  onFerma: (cue: Cue) => void;
  onSfuma: (cue: Cue) => void;
  onSpunta: (cue: Cue) => void;
  disabilitato?: boolean;
}) {
  const fasi = [...props.format.fasi].filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine);
  const fase = fasi.find((f) => f.id === props.faseId) ?? fasi[0];
  const cue = fase ? [...fase.cue].sort((a, b) => a.ordine - b.ordine) : [];
  // Nota della fase: aperta di default, richiudibile con un tocco.
  const [noteChiuse, setNoteChiuse] = useState<Record<string, boolean>>({});
  const notaChiusa = fase ? (noteChiuse[fase.id] ?? false) : true;

  // Le scorciatoie 1–9 contano solo i suoni veri, saltando i promemoria.
  let numero = 0;
  const scorciatoie = new Map<string, string>();
  for (const c of cue) {
    if (c.tipo !== "promemoria" && numero < 9) scorciatoie.set(c.id, String(++numero));
  }

  return (
    <div
      className="mx-auto max-w-5xl px-4 pt-5"
      // Spazio in fondo misurato dal dock (riga Sempre compresa), non indovinato.
      style={{ paddingBottom: "calc(var(--altezza-dock, 200px) + 16px)" }}
    >
      {fasi.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <ControlloSegmentato
            grande
            className="flex-1"
            segmenti={fasi.map((f) => ({ id: f.id, testo: f.nome }))}
            valore={fase?.id ?? ""}
            onCambia={props.onCambiaFase}
          />
          {fase?.nota && notaChiusa && (
            <button
              type="button"
              title="Mostra la nota della fase"
              aria-label="Mostra la nota della fase"
              onClick={() => setNoteChiuse((n) => ({ ...n, [fase.id]: false }))}
              className="tocco shrink-0 rounded-[10px] border border-transparent p-2 text-testo-3 hover:bg-velo hover:text-testo"
            >
              <Info size={18} strokeWidth={1.75} />
            </button>
          )}
          <span
            title="Scorciatoie: ESC stop tutto · F fade out · P parla · 1–9 suoni della fase · Q W E R T riga Sempre · ← → cambia fase"
            className="hidden shrink-0 cursor-help rounded-[10px] p-2 text-testo-3 hover:text-testo-2 sm:block"
          >
            <Keyboard size={18} strokeWidth={1.75} aria-label="Scorciatoie da tastiera" />
          </span>
        </div>
      )}

      {fase?.nota && !notaChiusa && (
        <button
          type="button"
          title="Tocca per nascondere"
          onClick={() => setNoteChiuse((n) => ({ ...n, [fase.id]: true }))}
          className="tocco mb-4 flex w-full items-start gap-2 rounded-[var(--raggio-campo)] border border-vetro-bordo bg-velo px-3 py-2.5 text-left text-[14px] leading-relaxed text-testo-2"
        >
          <Info size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand-chiaro" aria-hidden />
          <span className="whitespace-pre-wrap">{fase.nota}</span>
        </button>
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
        <div
          key={fase.id /* rimonta la griglia al cambio fase: entrata a cascata */}
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-4"
        >
          {cue.map((c, i) => (
            <PulsanteCue
              key={c.id}
              cue={c}
              attivi={props.attivi}
              fatto={props.fatti?.includes(c.id)}
              usi={props.usi?.[c.id]}
              disabilitato={props.disabilitato}
              scorciatoia={scorciatoie.get(c.id)}
              ritardoEntrataMs={Math.min(i, 9) * 35}
              onPremi={() => props.onPremi(c)}
              onFerma={() => props.onFerma(c)}
              onSfuma={() => props.onSfuma(c)}
              onSpunta={() => props.onSpunta(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
