// La prima pagina sul Mac: l'elenco dei format.
import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Config, Format } from "../../../shared/tipi";
import { api } from "../api";
import { BottoneConferma, InputInline } from "../componenti/comuni";

function CardFormat(props: {
  format: Format;
  onApri: () => void;
  onRinomina: (nome: string) => void;
  onDuplica: () => void;
  onElimina: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.format.id,
  });
  const nCue = props.format.fasi.reduce((n, f) => n + f.cue.length, 0);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-600"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="self-start cursor-grab rounded px-1 text-neutral-600 hover:text-neutral-300"
        title="Trascina per riordinare"
      >
        ⠿
      </button>
      <div className="cursor-pointer" onClick={props.onApri}>
        <div className="text-xl font-semibold" onClick={(e) => e.stopPropagation()}>
          <InputInline valore={props.format.nome} onCambia={props.onRinomina} />
        </div>
        <div className="mt-1 text-sm text-neutral-400">
          {props.format.fasi.length} fasi · {nCue} suoni
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onApri}
          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500"
        >
          Apri
        </button>
        <button
          type="button"
          onClick={props.onDuplica}
          className="rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
        >
          Duplica
        </button>
        <BottoneConferma testo="Elimina" onConfermato={props.onElimina} />
      </div>
    </div>
  );
}

export function Home(props: {
  config: Config;
  onConfigCambiata: (c: Config) => void;
  onApriFormat: (id: string) => void;
}) {
  const [occupato, setOccupato] = useState(false);
  const formats = [...props.config.formats].sort((a, b) => a.ordine - b.ordine);

  async function ricarica() {
    props.onConfigCambiata(await api.config());
  }

  async function nuovo() {
    setOccupato(true);
    try {
      const f = await api.creaFormat("Nuova serata");
      await ricarica();
      props.onApriFormat(f.id);
    } finally {
      setOccupato(false);
    }
  }

  async function fineTrascinamento(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = formats.map((f) => f.id);
    const nuovoOrdine = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    // Aggiorna subito a schermo, poi salva.
    props.onConfigCambiata({
      ...props.config,
      formats: props.config.formats.map((f) => ({ ...f, ordine: nuovoOrdine.indexOf(f.id) })),
    });
    await api.riordinaFormats(nuovoOrdine);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">🎭 Regia</h1>
        <button
          type="button"
          disabled={occupato}
          onClick={() => void nuovo()}
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          + Nuovo format
        </button>
      </div>
      {formats.length === 0 ? (
        <p className="text-neutral-400">Nessun format. Premi "+ Nuovo format" per iniziare.</p>
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={(e) => void fineTrascinamento(e)}>
          <SortableContext items={formats.map((f) => f.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {formats.map((f) => (
                <CardFormat
                  key={f.id}
                  format={f}
                  onApri={() => props.onApriFormat(f.id)}
                  onRinomina={(nome) => {
                    void api.rinominaFormat(f.id, nome).then(ricarica);
                  }}
                  onDuplica={() => {
                    void api.duplicaFormat(f.id).then(ricarica);
                  }}
                  onElimina={() => {
                    void api.eliminaFormat(f.id).then(ricarica);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
