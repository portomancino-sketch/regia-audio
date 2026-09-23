// La prima pagina sul Mac: l'elenco dei format.
import { useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clapperboard, Copy, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { Config, Format } from "../../../shared/tipi";
import { api } from "../api";
import { InputInline } from "../componenti/comuni";
import { Menu } from "../componenti/ui/Menu";
import { Pulsante } from "../componenti/ui/Pulsante";

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
  const [rinomina, setRinomina] = useState(false);
  const nCue = props.format.fasi.reduce((n, f) => n + f.cue.length, 0);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      onClick={props.onApri}
      className="vetro tocco flex min-h-[150px] cursor-pointer flex-col p-5"
    >
      <div className="flex items-start justify-between">
        <Clapperboard size={20} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Trascina per riordinare"
            className="cursor-grab rounded-[10px] p-1.5 text-testo-3 hover:bg-velo hover:text-testo"
          >
            <GripVertical size={16} strokeWidth={1.75} />
          </button>
          <Menu
            voci={[
              { testo: "Rinomina", icona: <Pencil size={15} strokeWidth={1.75} />, onScelta: () => setRinomina(true) },
              { testo: "Duplica", icona: <Copy size={15} strokeWidth={1.75} />, onScelta: props.onDuplica },
              {
                testo: "Elimina",
                icona: <Trash2 size={15} strokeWidth={1.75} />,
                pericolosa: true,
                conferma: true,
                onScelta: props.onElimina,
              },
            ]}
          />
        </div>
      </div>
      <div className="mt-auto pt-4">
        {rinomina ? (
          <InputInline
            valore={props.format.nome}
            autoFocus
            onCambia={(nome) => {
              setRinomina(false);
              props.onRinomina(nome);
            }}
            className="w-full rounded-[10px] border border-brand-chiaro bg-velo px-1.5 py-0.5 text-[22px] font-semibold focus:outline-none"
          />
        ) : (
          <div className="line-clamp-2 text-[22px] font-semibold leading-tight text-testo">{props.format.nome}</div>
        )}
        <div className="mt-1 text-[13px] text-testo-2">
          {props.format.fasi.length} fasi · {nCue} suoni
        </div>
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
      <h1 className="mb-6 text-[28px] font-semibold text-testo">Le tue serate</h1>
      {formats.length === 0 ? (
        <div className="vetro mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
          <Clapperboard size={32} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
          <p className="text-testo-2">Nessun format: crea la tua prima serata.</p>
          <Pulsante variante="primario" disabled={occupato} onClick={() => void nuovo()}>
            <Plus size={16} strokeWidth={1.75} /> Nuovo format
          </Pulsante>
        </div>
      ) : (
        <DndContext collisionDetection={closestCenter} onDragEnd={(e) => void fineTrascinamento(e)}>
          <SortableContext items={formats.map((f) => f.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-4">
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
              <button
                type="button"
                disabled={occupato}
                onClick={() => void nuovo()}
                className="tocco flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-[var(--raggio-card)] border border-dashed border-vetro-bordo-chiaro text-testo-3 hover:border-brand-chiaro hover:text-brand-chiaro disabled:opacity-40"
              >
                <Plus size={22} strokeWidth={1.75} />
                <span className="text-[15px] font-medium">Nuovo format</span>
              </button>
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
