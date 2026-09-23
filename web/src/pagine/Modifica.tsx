// La vista Modifica: fasi e caselle cue, con trascinamenti e caricamenti.
import { useEffect, useRef, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Copy, FileAudio, GripVertical, Music, Plus, Trash2 } from "lucide-react";
import type { Cue, Fase, Format, TipoCue } from "../../../shared/tipi";
import { api } from "../api";
import { InputInline } from "../componenti/comuni";
import { COLORI_TIPO, NOMI_TIPO, SCELTE_COLORE, formattaTempo } from "../util";
import { Vetro } from "../componenti/ui/Vetro";
import { Menu } from "../componenti/ui/Menu";
import { Pillola } from "../componenti/ui/Pillola";
import { Slider } from "../componenti/ui/Slider";
import { ControlloSegmentato } from "../componenti/ui/ControlloSegmentato";

type Salva = (fn: () => Promise<unknown>) => void;

function CasellaCue(props: { cue: Cue; salva: Salva; onEliminata: () => void; onDuplicata: () => void }) {
  const { cue, salva } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cue.id });
  const [aperta, setAperta] = useState(false);
  const [volume, setVolume] = useState(cue.volume);
  const [inDrop, setInDrop] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const timerVolume = useRef<number | null>(null);
  const inputFile = useRef<HTMLInputElement | null>(null);

  useEffect(() => setVolume(cue.volume), [cue.volume]);

  function cambiaVolume(v: number) {
    setVolume(v);
    if (timerVolume.current) clearTimeout(timerVolume.current);
    timerVolume.current = window.setTimeout(() => salva(() => api.modificaCue(cue.id, { volume: v })), 300);
  }

  function caricaFile(file: File) {
    setErrore(null);
    salva(async () => {
      try {
        await api.caricaAudio(cue.id, file);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Caricamento non riuscito");
        throw e;
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ...(inDrop ? { borderColor: "var(--brand-chiaro)" } : {}),
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
          setInDrop(true);
        }
      }}
      onDragLeave={() => setInDrop(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setInDrop(false);
          caricaFile(e.dataTransfer.files[0]!);
        }
      }}
      className="vetro flex flex-col"
    >
      {/* Riga compatta: titolo, pillola tipo, nota */}
      <div
        className="flex cursor-pointer items-center gap-2 p-3"
        onClick={() => setAperta(!aperta)}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Trascina per riordinare"
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab rounded-[10px] p-1 text-testo-3 hover:text-testo"
        >
          <GripVertical size={16} strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <InputInline
              valore={cue.titolo}
              placeholder="Titolo"
              onCambia={(v) => salva(() => api.modificaCue(cue.id, { titolo: v }))}
              className="w-full rounded-[10px] border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-semibold transition-colors hover:border-vetro-bordo focus:border-brand-chiaro focus:outline-none"
            />
            <Pillola colore={cue.colore ?? COLORI_TIPO[cue.tipo]}>{NOMI_TIPO[cue.tipo]}</Pillola>
          </div>
          <div className="mt-0.5 flex items-center gap-2 px-1 text-[13px] text-testo-2">
            {cue.file ? (
              <span className="inline-flex items-center gap-1 truncate">
                <Music size={12} strokeWidth={1.75} aria-hidden />
                <span className="truncate">{cue.fileOriginale ?? cue.file}</span>
                <span className="tabular-nums text-testo-3">({formattaTempo(cue.durataSec)})</span>
              </span>
            ) : (
              <span className="text-testo-3">nessun file</span>
            )}
            {cue.nota && <span className="truncate">· {cue.nota}</span>}
          </div>
        </div>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={`shrink-0 text-testo-3 transition-transform duration-[var(--durata)] ${aperta ? "rotate-180" : ""}`}
          aria-hidden
        />
      </div>

      {/* Riga dei controlli */}
      {aperta && (
        <div className="space-y-3 border-t border-vetro-bordo p-3">
          <div>
            <div className="etichetta mb-1.5">Tipo</div>
            <ControlloSegmentato
              segmenti={(Object.keys(NOMI_TIPO) as TipoCue[]).map((t) => ({ id: t, testo: NOMI_TIPO[t] }))}
              valore={cue.tipo}
              onCambia={(t) => salva(() => api.modificaCue(cue.id, { tipo: t as TipoCue }))}
            />
          </div>

          <InputInline
            valore={cue.nota}
            placeholder="Nota (facoltativa)"
            onCambia={(v) => salva(() => api.modificaCue(cue.id, { nota: v }))}
            className="w-full rounded-[10px] border border-vetro-bordo bg-velo px-2 py-1.5 text-[13px] text-testo-2 focus:border-brand-chiaro focus:outline-none"
          />

          {/* Zona di rilascio / scelta file */}
          <button
            type="button"
            onClick={() => inputFile.current?.click()}
            className={`tocco flex w-full items-center justify-center gap-2 rounded-[var(--raggio-campo)] border border-dashed px-3 py-2.5 text-[13px] ${
              inDrop ? "border-brand-chiaro text-brand-chiaro" : "border-vetro-bordo-chiaro text-testo-2 hover:text-testo"
            }`}
          >
            <FileAudio size={15} strokeWidth={1.75} aria-hidden />
            {cue.file ? "Cambia il file audio" : "Trascina qui un file audio, o clicca per sceglierlo"}
          </button>
          <input
            ref={inputFile}
            type="file"
            accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) caricaFile(f);
              e.target.value = "";
            }}
          />
          {errore && <div className="text-[13px] text-rosso">{errore}</div>}

          <div className="flex items-center gap-2">
            <span className="etichetta w-14">Volume</span>
            <Slider valore={volume} onCambia={cambiaVolume} className="flex-1" aria-label="Volume del suono" />
            <span className="w-8 text-right text-[13px] tabular-nums text-testo-2">{Math.round(volume * 100)}</span>
          </div>

          {cue.tipo !== "sottofondo" && (
            <div>
              <div className="etichetta mb-1.5">Quando parte, il suono base…</div>
              <ControlloSegmentato
                segmenti={[
                  { id: "niente", testo: "Resta" },
                  { id: "abbassa", testo: "Si abbassa" },
                  { id: "pausa", testo: "Si ferma" },
                ]}
                valore={cue.sulSottofondo}
                onCambia={(v) =>
                  salva(() => api.modificaCue(cue.id, { sulSottofondo: v as Cue["sulSottofondo"] }))
                }
              />
            </div>
          )}

          {cue.tipo === "sottofondo" && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-testo-2">
              <input
                type="checkbox"
                checked={cue.loop}
                onChange={(e) => salva(() => api.modificaCue(cue.id, { loop: e.target.checked }))}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Ripeti da capo quando finisce
            </label>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {SCELTE_COLORE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => salva(() => api.modificaCue(cue.id, { colore: cue.colore === c ? null : c }))}
                  className={`tocco h-5 w-5 rounded-full border-2 ${cue.colore === c ? "border-white" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label="Colore del pulsante"
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={props.onDuplicata}
                aria-label="Duplica casella"
                className="tocco rounded-[10px] border border-transparent p-1.5 text-testo-3 hover:bg-velo hover:text-testo"
              >
                <Copy size={15} strokeWidth={1.75} />
              </button>
              <Menu
                voci={[
                  {
                    testo: "Elimina casella",
                    icona: <Trash2 size={15} strokeWidth={1.75} />,
                    pericolosa: true,
                    conferma: true,
                    onScelta: props.onEliminata,
                  },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SezioneFase(props: { fase: Fase; salva: Salva }) {
  const { fase, salva } = props;
  const sortFase = useSortable({ id: `fase-${fase.id}` });
  const [inDrop, setInDrop] = useState(false);
  const cueOrdinati = [...fase.cue].sort((a, b) => a.ordine - b.ordine);

  function fineTrascinamentoCue(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = cueOrdinati.map((c) => c.id);
    const nuovo = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    salva(() => api.riordinaCue(fase.id, nuovo));
  }

  return (
    <div
      ref={sortFase.setNodeRef}
      className="vetro p-5"
      style={{
        transform: CSS.Transform.toString(sortFase.transform),
        transition: sortFase.transition,
        opacity: sortFase.isDragging ? 0.6 : 1,
        ...(inDrop ? { borderColor: "var(--brand-chiaro)" } : {}),
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setInDrop(true);
        }
      }}
      onDragLeave={() => setInDrop(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length > 0) {
          e.preventDefault();
          setInDrop(false);
          const files = [...e.dataTransfer.files];
          salva(() => api.caricaAudioMultipli(fase.id, files));
        }
      }}
    >
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          {...sortFase.attributes}
          {...sortFase.listeners}
          aria-label="Trascina per riordinare le fasi"
          className="cursor-grab rounded-[10px] p-1 text-testo-3 hover:text-testo"
        >
          <GripVertical size={17} strokeWidth={1.75} />
        </button>
        <InputInline
          valore={fase.nome}
          onCambia={(v) => salva(() => api.rinominaFase(fase.id, v))}
          className="w-full max-w-md rounded-[10px] border border-transparent bg-transparent px-1.5 py-0.5 text-[17px] font-semibold tracking-[-0.01em] transition-colors hover:border-vetro-bordo focus:border-brand-chiaro focus:outline-none"
        />
        <span className="shrink-0 text-[13px] text-testo-3">{fase.cue.length} suoni</span>
        <Menu
          voci={[
            {
              testo: "Duplica fase",
              icona: <Copy size={15} strokeWidth={1.75} />,
              onScelta: () => salva(() => api.duplicaFase(fase.id)),
            },
            {
              testo: "Elimina fase",
              icona: <Trash2 size={15} strokeWidth={1.75} />,
              pericolosa: true,
              conferma: true,
              onScelta: () => salva(() => api.eliminaFase(fase.id)),
            },
          ]}
        />
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={fineTrascinamentoCue}>
        <SortableContext items={cueOrdinati.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
            {cueOrdinati.map((c) => (
              <CasellaCue
                key={c.id}
                cue={c}
                salva={salva}
                onEliminata={() => salva(() => api.eliminaCue(c.id))}
                onDuplicata={() => salva(() => api.duplicaCue(c.id))}
              />
            ))}
            <button
              type="button"
              onClick={() => salva(() => api.creaCue(fase.id, {}))}
              className="tocco flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-[var(--raggio-card)] border border-dashed border-vetro-bordo-chiaro text-testo-3 hover:border-brand-chiaro hover:text-brand-chiaro"
            >
              <Plus size={18} strokeWidth={1.75} />
              <span className="text-[13px] font-medium">Casella</span>
            </button>
          </div>
        </SortableContext>
      </DndContext>
      <p className="mt-3 text-[12px] text-testo-3">
        Puoi trascinare più file audio su questa fase: ogni file diventa una casella.
      </p>
    </div>
  );
}

export function Modifica(props: {
  format: Format;
  onRicarica: () => Promise<void>;
  onSalvataggio?: (pendenti: number) => void;
}) {
  const { format } = props;
  const [pendenti, setPendenti] = useState(0);
  const notifica = props.onSalvataggio;

  useEffect(() => notifica?.(pendenti), [pendenti, notifica]);

  const salva: Salva = (fn) => {
    setPendenti((p) => p + 1);
    void (async () => {
      try {
        await fn();
        await props.onRicarica();
      } catch {
        /* l'errore è mostrato dal componente che ha chiamato */
      } finally {
        setPendenti((p) => p - 1);
      }
    })();
  };

  const fasiOrdinate = [...format.fasi].sort((a, b) => a.ordine - b.ordine);

  function fineTrascinamentoFasi(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = fasiOrdinate.map((f) => `fase-${f.id}`);
    const nuovo = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    salva(() => api.riordinaFasi(format.id, nuovo.map((s) => s.replace(/^fase-/, ""))));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 pb-32 pt-5 md:space-y-5">
      {fasiOrdinate.length === 0 && (
        <Vetro className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
          <Music size={30} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
          <p className="text-testo-2">Questo format è vuoto: aggiungi la prima fase.</p>
        </Vetro>
      )}
      <DndContext collisionDetection={closestCenter} onDragEnd={fineTrascinamentoFasi}>
        <SortableContext items={fasiOrdinate.map((f) => `fase-${f.id}`)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4 md:space-y-5">
            {fasiOrdinate.map((f) => (
              <SezioneFase key={f.id} fase={f} salva={salva} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() => salva(() => api.creaFase(format.id, "Nuova fase"))}
        className="tocco flex w-full items-center justify-center gap-2 rounded-[var(--raggio-card)] border border-dashed border-vetro-bordo-chiaro py-4 text-[15px] font-medium text-testo-3 hover:border-brand-chiaro hover:text-brand-chiaro"
      >
        <Plus size={17} strokeWidth={1.75} /> Fase
      </button>
    </div>
  );
}
