// La vista Modifica: fasi e caselle cue, con trascinamenti e caricamenti.
import { useRef, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Cue, Fase, Format, TipoCue } from "../../../shared/tipi";
import { api } from "../api";
import { BottoneConferma, Chip, InputInline } from "../componenti/comuni";
import { COLORI_TIPO, NOMI_TIPO, SCELTE_COLORE, formattaTempo } from "../util";

type Salva = (fn: () => Promise<unknown>) => void;

function CasellaCue(props: { cue: Cue; salva: Salva; onEliminata: () => void }) {
  const { cue, salva } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cue.id });
  const [volume, setVolume] = useState(cue.volume);
  const [inDrop, setInDrop] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const timerVolume = useRef<number | null>(null);
  const inputFile = useRef<HTMLInputElement | null>(null);

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
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
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
      className={`flex flex-col gap-2 rounded-xl border p-3 ${
        inDrop ? "border-blue-400 bg-blue-950/40" : "border-neutral-800 bg-neutral-900"
      }`}
    >
      <div className="flex items-center gap-1">
        <button type="button" {...attributes} {...listeners} className="cursor-grab px-1 text-neutral-600 hover:text-neutral-300">
          ⠿
        </button>
        <InputInline
          valore={cue.titolo}
          placeholder="Titolo"
          onCambia={(v) => salva(() => api.modificaCue(cue.id, { titolo: v }))}
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-semibold hover:border-neutral-700 focus:border-neutral-500 focus:outline-none"
        />
        <BottoneConferma
          testo="✕"
          testoConferma="Elimina?"
          onConfermato={props.onEliminata}
          className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-red-900/40 hover:text-red-300"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(NOMI_TIPO) as TipoCue[]).map((t) => (
          <Chip
            key={t}
            attivo={cue.tipo === t}
            colore={COLORI_TIPO[t]}
            onClick={() => salva(() => api.modificaCue(cue.id, { tipo: t }))}
          >
            {NOMI_TIPO[t]}
          </Chip>
        ))}
      </div>

      <InputInline
        valore={cue.nota}
        placeholder="Nota (facoltativa)"
        onCambia={(v) => salva(() => api.modificaCue(cue.id, { nota: v }))}
        className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-neutral-400 hover:border-neutral-700 focus:border-neutral-500 focus:outline-none"
      />

      {/* File audio */}
      <div className="rounded-lg bg-neutral-950 p-2 text-sm">
        {cue.file ? (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-neutral-300">
              🎵 {cue.fileOriginale ?? cue.file}{" "}
              <span className="text-neutral-500">({formattaTempo(cue.durataSec)})</span>
            </span>
            <button type="button" onClick={() => inputFile.current?.click()} className="shrink-0 text-blue-400 hover:underline">
              Cambia
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => inputFile.current?.click()} className="w-full py-1 text-neutral-400 hover:text-neutral-200">
            Trascina qui un file audio, o clicca per sceglierlo
          </button>
        )}
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
        {errore && <div className="mt-1 text-red-400">{errore}</div>}
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-400">
        Volume
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => cambiaVolume(Number(e.target.value) / 100)}
          className="h-2 flex-1 accent-blue-500"
        />
        <span className="w-8 text-right tabular-nums">{Math.round(volume * 100)}</span>
      </label>

      {cue.tipo !== "sottofondo" && (
        <div className="text-sm">
          <div className="mb-1 text-neutral-500">Quando parte, il suono base…</div>
          <div className="flex gap-1.5">
            <Chip attivo={cue.sulSottofondo === "niente"} onClick={() => salva(() => api.modificaCue(cue.id, { sulSottofondo: "niente" }))}>
              Resta
            </Chip>
            <Chip attivo={cue.sulSottofondo === "abbassa"} onClick={() => salva(() => api.modificaCue(cue.id, { sulSottofondo: "abbassa" }))}>
              Si abbassa
            </Chip>
            <Chip attivo={cue.sulSottofondo === "pausa"} onClick={() => salva(() => api.modificaCue(cue.id, { sulSottofondo: "pausa" }))}>
              Si ferma
            </Chip>
          </div>
        </div>
      )}

      {cue.tipo === "sottofondo" && (
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={cue.loop}
            onChange={(e) => salva(() => api.modificaCue(cue.id, { loop: e.target.checked }))}
            className="h-4 w-4 accent-blue-500"
          />
          Ripeti da capo quando finisce
        </label>
      )}

      <div className="flex items-center gap-1.5">
        {SCELTE_COLORE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => salva(() => api.modificaCue(cue.id, { colore: cue.colore === c ? null : c }))}
            className={`h-6 w-6 rounded-full border-2 ${cue.colore === c ? "border-white" : "border-transparent"}`}
            style={{ backgroundColor: c }}
            title="Colore del pulsante"
          />
        ))}
      </div>
    </div>
  );
}

function SezioneFase(props: {
  fase: Fase;
  salva: Salva;
  onRicarica: () => void;
}) {
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
    <section
      ref={sortFase.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortFase.transform), transition: sortFase.transition, opacity: sortFase.isDragging ? 0.6 : 1 }}
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
      className={`rounded-2xl border p-4 ${inDrop ? "border-blue-400 bg-blue-950/30" : "border-neutral-800 bg-neutral-950"}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          {...sortFase.attributes}
          {...sortFase.listeners}
          className="cursor-grab px-1 text-neutral-600 hover:text-neutral-300"
          title="Trascina per riordinare le fasi"
        >
          ⠿
        </button>
        <InputInline
          valore={fase.nome}
          onCambia={(v) => salva(() => api.rinominaFase(fase.id, v))}
          className="w-full max-w-md rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xl font-semibold hover:border-neutral-700 focus:border-neutral-500 focus:outline-none"
        />
        <span className="text-sm text-neutral-500">{fase.cue.length} suoni</span>
        <BottoneConferma testo="Elimina fase" onConfermato={() => salva(() => api.eliminaFase(fase.id))} />
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={fineTrascinamentoCue}>
        <SortableContext items={cueOrdinati.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cueOrdinati.map((c) => (
              <CasellaCue key={c.id} cue={c} salva={salva} onEliminata={() => salva(() => api.eliminaCue(c.id))} />
            ))}
            <button
              type="button"
              onClick={() => salva(() => api.creaCue(fase.id, {}))}
              className="min-h-32 rounded-xl border-2 border-dashed border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
            >
              + Casella
            </button>
          </div>
        </SortableContext>
      </DndContext>
      <p className="mt-2 text-xs text-neutral-600">
        Puoi trascinare più file audio su questa fase: ogni file diventa una casella.
      </p>
    </section>
  );
}

export function Modifica(props: { format: Format; onRicarica: () => Promise<void> }) {
  const { format } = props;
  const [pendenti, setPendenti] = useState(0);
  const [salvatoAlmeno, setSalvatoAlmeno] = useState(false);

  const salva: Salva = (fn) => {
    setPendenti((p) => p + 1);
    void (async () => {
      try {
        await fn();
        await props.onRicarica();
        setSalvatoAlmeno(true);
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
    <div className="mx-auto max-w-6xl space-y-5 px-4 pb-28 pt-4">
      <div className="flex items-center justify-end text-sm text-neutral-400" aria-live="polite">
        {pendenti > 0 ? "Salvataggio…" : salvatoAlmeno ? "Salvato ✓" : " "}
      </div>
      <DndContext collisionDetection={closestCenter} onDragEnd={fineTrascinamentoFasi}>
        <SortableContext items={fasiOrdinate.map((f) => `fase-${f.id}`)} strategy={verticalListSortingStrategy}>
          <div className="space-y-5">
            {fasiOrdinate.map((f) => (
              <SezioneFase key={f.id} fase={f} salva={salva} onRicarica={() => void props.onRicarica()} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() => salva(() => api.creaFase(format.id, "Nuova fase"))}
        className="w-full rounded-2xl border-2 border-dashed border-neutral-700 py-4 text-lg text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
      >
        + Fase
      </button>
    </div>
  );
}
