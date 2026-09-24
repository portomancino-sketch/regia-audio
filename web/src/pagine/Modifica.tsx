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
import { CheckSquare, ChevronDown, Copy, FileAudio, GripVertical, Headphones, Lock, Music, Plus, Square, Star, Trash2, Waves } from "lucide-react";
import { Pulsante } from "../componenti/ui/Pulsante";
import { analizzaDalServer, analizzaFile } from "../motore/analisi";
import { BarraAvanzamento } from "../componenti/ui/BarraAvanzamento";
import type { Cue, Fase, Format, TipoCue } from "../../../shared/tipi";
import { MAX_EVIDENZA, inEvidenza, puoMettereInEvidenza } from "../../../shared/sempre";
import { api } from "../api";
import { AreaInline, InputInline } from "../componenti/comuni";
import { COLORI_TIPO, NOMI_TIPO, SCELTE_COLORE, formattaTempo } from "../util";
import { Vetro } from "../componenti/ui/Vetro";
import { Menu } from "../componenti/ui/Menu";
import { Pillola } from "../componenti/ui/Pillola";
import { Slider } from "../componenti/ui/Slider";
import { ControlloSegmentato } from "../componenti/ui/ControlloSegmentato";

type Salva = (fn: () => Promise<unknown>) => void;

/** L'anteprima "Ascolta", fornita dalla pagina Regia (passa dal motore). */
export interface Anteprima {
  /** La casella in anteprima adesso. */
  cueId: string | null;
  /** La casella per cui è stato chiesto l'ascolto ma la finestra non comanda. */
  richiestaCueId: string | null;
  serveControllo: boolean;
  avvia: (cue: Cue) => void;
  ferma: () => void;
  prendiControllo: () => void;
}
function inAnteprimaRichiesta(a: Anteprima, cueId: string): boolean {
  return a.richiestaCueId === cueId;
}

/** Analizza un file appena importato e salva livello medio, picco e guadagno automatico. */
async function analizzaESalva(cueId: string, file: File): Promise<void> {
  const r = await analizzaFile(file);
  await api.modificaCue(cueId, r);
}

function CasellaCue(props: {
  cue: Cue;
  salva: Salva;
  onEliminata: () => void;
  onDuplicata: () => void;
  /** Solo riga Sempre: tutte le caselle della riga, per la stella "In evidenza". */
  rigaSempre?: Cue[];
  /** Mai partita nelle ultime 10 serate in cui il format è stato usato. */
  maiUsato?: boolean;
  /** Anteprima "Ascolta": passa dal motore della finestra che comanda. */
  anteprima?: Anteprima;
}) {
  const { cue, salva } = props;
  const [avviso, setAvviso] = useState<string | null>(null);
  // Stella: in evidenza in Live (con 4 caselle o meno lo sono tutte da sole).
  const inSempre = props.rigaSempre !== undefined;
  const evidente = inSempre && inEvidenza(props.rigaSempre!).some((c) => c.id === cue.id);
  function alternaEvidenza() {
    if (!props.rigaSempre) return;
    if (!cue.evidenza && !puoMettereInEvidenza(props.rigaSempre, cue.id)) {
      setAvviso(`Massimo ${MAX_EVIDENZA} in evidenza`);
      window.setTimeout(() => setAvviso(null), 2500);
      return;
    }
    salva(() => api.modificaCue(cue.id, { evidenza: !cue.evidenza }));
  }
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
        // Livello automatico: l'analisi si fa qui, all'importazione, mai in Live.
        await analizzaESalva(cue.id, file);
      } catch (e) {
        setErrore(e instanceof Error ? e.message : "Caricamento non riuscito");
        throw e;
      }
    });
  }
  const inAnteprima = props.anteprima?.cueId === cue.id;
  // Chiudere la casella (o smontarla) ferma la sua anteprima.
  useEffect(() => {
    if (!aperta && inAnteprima) props.anteprima?.ferma();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperta]);
  useEffect(
    () => () => {
      if (props.anteprima?.cueId === cue.id) props.anteprima.ferma();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [ritocco, setRitocco] = useState(cue.ritocco ?? 0);
  useEffect(() => setRitocco(cue.ritocco ?? 0), [cue.ritocco]);
  const timerRitocco = useRef<number | null>(null);
  function cambiaRitocco(v: number) {
    setRitocco(v);
    if (timerRitocco.current) clearTimeout(timerRitocco.current);
    timerRitocco.current = window.setTimeout(() => salva(() => api.modificaCue(cue.id, { ritocco: v })), 300);
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ...(inDrop ? { borderColor: "var(--brand)", transform: "scale(1.01)" } : {}),
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
            {inSempre && (
              <button
                type="button"
                aria-label="In evidenza"
                aria-pressed={evidente}
                title={
                  evidente
                    ? cue.evidenza
                      ? "In evidenza in Live: togli"
                      : "In evidenza da sola (4 caselle o meno)"
                    : "Metti in evidenza in Live (massimo 4)"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  alternaEvidenza();
                }}
                className={`tocco shrink-0 rounded-[10px] border border-transparent p-1 hover:bg-velo ${
                  evidente ? "text-[var(--tipo-effetto)]" : "text-testo-3 hover:text-testo"
                }`}
              >
                <Star size={16} strokeWidth={1.75} fill={evidente ? "currentColor" : "none"} />
              </button>
            )}
            <Pillola colore={cue.colore ?? COLORI_TIPO[cue.tipo]}>{NOMI_TIPO[cue.tipo]}</Pillola>
          </div>
          {avviso && <div className="mt-0.5 px-1 text-[13px] font-medium text-rosso">{avviso}</div>}
          <div className="mt-0.5 flex items-center gap-2 px-1 text-[13px] text-testo-2">
            {cue.tipo === "promemoria" ? (
              <span className="inline-flex items-center gap-1 text-testo-3">
                <CheckSquare size={12} strokeWidth={1.75} aria-hidden /> da spuntare in serata
              </span>
            ) : cue.file ? (
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
          {props.maiUsato && (
            <span className="mt-1 inline-block rounded-full border border-vetro-bordo bg-velo px-2 py-0.5 text-[11px] text-testo-3" data-mai-usato>
              mai usato nelle ultime 10 serate
            </span>
          )}
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

          {/* Zona di rilascio / scelta file (non per i promemoria) */}
          {cue.tipo !== "promemoria" && (
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
          {errore && <div className="text-[13px] text-rosso">{errore}</div>}

          {cue.tipo !== "promemoria" && (
            <div className="flex items-center gap-2">
              <span className="etichetta w-20">Livello base</span>
              <Slider valore={volume} onCambia={cambiaVolume} className="flex-1" aria-label="Livello base del suono" />
              <span className="w-8 text-right text-[13px] tabular-nums text-testo-2">{Math.round(volume * 100)}</span>
            </div>
          )}

          {cue.tipo !== "promemoria" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="etichetta w-20">Volume</span>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={ritocco}
                onChange={(e) => cambiaRitocco(Number(e.target.value))}
                aria-label="Volume in dB (ritocco)"
                className="min-w-24 flex-1 accent-[var(--brand)]"
              />
              <span className="w-14 text-right text-[13px] tabular-nums text-testo" data-ritocco>
                {ritocco > 0 ? `+${ritocco}` : ritocco} dB
              </span>
              <span className="text-[12px] tabular-nums text-testo-3" data-auto title="Livello automatico calcolato all'importazione">
                {cue.guadagnoAuto === undefined
                  ? "auto —"
                  : `auto ${cue.guadagnoAuto > 0 ? "+" : ""}${Math.round(cue.guadagnoAuto)} dB`}
              </span>
              {props.anteprima && (
                <button
                  type="button"
                  disabled={!cue.file}
                  data-ascolta
                  aria-pressed={inAnteprima}
                  title={inAnteprima ? "Ferma l'anteprima" : "Suona il file col volume attuale"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (inAnteprima) props.anteprima!.ferma();
                    else if (cue.file) props.anteprima!.avvia({ ...cue, ritocco });
                  }}
                  className={`tocco inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-[13px] font-medium disabled:opacity-40 ${
                    inAnteprima
                      ? "border-transparent bg-brand text-white"
                      : "border-vetro-bordo bg-velo text-testo-2 hover:text-testo"
                  }`}
                >
                  {inAnteprima ? (
                    <>
                      <Square size={12} strokeWidth={2} fill="currentColor" aria-hidden /> Ferma
                    </>
                  ) : (
                    <>
                      <Headphones size={14} strokeWidth={1.75} aria-hidden /> Ascolta
                    </>
                  )}
                </button>
              )}
              {props.anteprima?.serveControllo && inAnteprimaRichiesta(props.anteprima, cue.id) && (
                <span className="flex items-center gap-2 text-[12px] text-testo-2">
                  Per ascoltare, questa finestra deve comandare.
                  <Pulsante misura="sm" variante="primario" onClick={() => props.anteprima!.prendiControllo()}>
                    Prendi il controllo
                  </Pulsante>
                </span>
              )}
            </div>
          )}

          {cue.tipo !== "promemoria" && (
            <label className="flex items-center gap-2 text-[13px] text-testo-2">
              <span className="etichetta">Usi previsti in serata</span>
              <input
                type="number"
                min={1}
                max={99}
                step={1}
                inputMode="numeric"
                placeholder="illimitati"
                aria-label="Usi previsti in serata"
                defaultValue={cue.usiPrevisti ?? ""}
                key={`usi-${cue.usiPrevisti ?? ""}`}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const n = v === "" ? null : Math.max(1, Math.min(99, Math.round(Number(v))));
                  if ((n ?? undefined) !== cue.usiPrevisti) salva(() => api.modificaCue(cue.id, { usiPrevisti: n as number }));
                }}
                className="w-24 rounded-[10px] border border-vetro-bordo bg-velo px-2 py-1 text-[13px] tabular-nums text-testo placeholder:text-testo-3 focus:border-brand-chiaro focus:outline-none"
              />
              <span className="text-testo-3">vuoto = illimitati</span>
            </label>
          )}

          {cue.tipo !== "sottofondo" && cue.tipo !== "promemoria" && (
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

function SezioneFase(props: { fase: Fase; salva: Salva; onAzzeraSerata?: (faseId: string) => void; maiUsati?: Set<string>; anteprima?: Anteprima }) {
  const { fase, salva } = props;
  const sempre = fase.sempre === true;
  const sortFase = useSortable({ id: `fase-${fase.id}`, disabled: sempre });
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
        ...(inDrop ? { borderColor: "var(--brand)", transform: "scale(1.01)" } : {}),
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
          salva(async () => {
            const { creati } = await api.caricaAudioMultipli(fase.id, files);
            for (const c of creati) {
              const f = files.find((x) => x.name === c.fileOriginale);
              if (f) await analizzaESalva(c.id, f).catch(() => undefined);
            }
          });
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
        {!sempre && (
          <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-testo-3" title="Durata prevista della fase, per l'orologio di scaletta">
            <span className="hidden sm:inline">Durata prevista</span>
            <input
              type="number"
              min={1}
              max={600}
              step={1}
              inputMode="numeric"
              placeholder="—"
              aria-label="Durata prevista in minuti"
              defaultValue={fase.durataPrevista ?? ""}
              key={`dp-${fase.durataPrevista ?? ""}`}
              onBlur={(e) => {
                const v = e.target.value.trim();
                const n = v === "" ? null : Math.max(1, Math.min(600, Math.round(Number(v))));
                if ((n ?? undefined) !== fase.durataPrevista) salva(() => api.modificaFase(fase.id, { durataPrevista: n }));
              }}
              className="w-16 rounded-[10px] border border-vetro-bordo bg-velo px-2 py-1 text-[13px] tabular-nums text-testo placeholder:text-testo-3 focus:border-brand-chiaro focus:outline-none"
            />
            <span>min</span>
          </label>
        )}
        {sempre ? (
          props.onAzzeraSerata && fase.cue.length > 0 ? (
            <Menu
              voci={[{
                testo: "Azzera serata",
                icona: <CheckSquare size={15} strokeWidth={1.75} />,
                onScelta: () => props.onAzzeraSerata!(fase.id),
              }]}
            />
          ) : null
        ) : (
        <Menu
          voci={[
            ...(props.onAzzeraSerata && fase.cue.length > 0
              ? [{
                  testo: "Azzera serata",
                  icona: <CheckSquare size={15} strokeWidth={1.75} />,
                  onScelta: () => props.onAzzeraSerata!(fase.id),
                }]
              : []),
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
        )}
      </div>

      <AreaInline
        valore={fase.nota ?? ""}
        righe={2}
        placeholder="Cosa succede in questa fase (guida per chi è in sala)"
        onCambia={(v) => salva(() => api.modificaFase(fase.id, { nota: v }))}
        className="mb-4 w-full resize-y rounded-[var(--raggio-campo)] border border-vetro-bordo bg-velo px-3 py-2 text-[14px] leading-relaxed text-testo-2 placeholder:text-testo-3 focus:border-brand-chiaro focus:outline-none"
      />

      <DndContext collisionDetection={closestCenter} onDragEnd={fineTrascinamentoCue}>
        <SortableContext items={cueOrdinati.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
            {cueOrdinati.map((c) => (
              <CasellaCue
                key={c.id}
                cue={c}
                salva={salva}
                rigaSempre={sempre ? cueOrdinati : undefined}
                maiUsato={props.maiUsati?.has(c.titolo) === true}
                anteprima={props.anteprima}
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
        {sempre && (
          <>
            {" "}
            In Live le caselle con la stella (massimo {MAX_EVIDENZA}) sono sempre visibili, le altre stanno in
            &laquo;Altri&raquo;.
          </>
        )}
      </p>
    </div>
  );
}

export function Modifica(props: {
  format: Format;
  onRicarica: () => Promise<void>;
  onSalvataggio?: (pendenti: number) => void;
  onAzzeraSerata?: (faseId: string) => void;
  /** Modalità serata: tutto in sola lettura. */
  bloccato?: boolean;
  /** Solo sul Mac: "Sblocca" nel banner (con conferma). */
  onSblocca?: () => void;
  /** Anteprima "Ascolta" via motore. */
  anteprima?: Anteprima;
}) {
  const { format } = props;
  const [pendenti, setPendenti] = useState(0);
  const [confermaSblocco, setConfermaSblocco] = useState(false);
  // Le caselle mai partite nelle ultime 10 serate (badge grigio).
  const [maiUsati, setMaiUsati] = useState<Set<string> | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void api
      .maiUsati()
      .then((r) => {
        if (!vivo) return;
        const mio = r.formats.find((f) => f.nome === format.nome);
        setMaiUsati(mio ? new Set(mio.caselle) : undefined);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [format.nome]);
  // "Analizza tutti i suoni": barra di avanzamento, si può interrompere.
  const [analisi, setAnalisi] = useState<{ fatti: number; totale: number } | null>(null);
  const analisiAnnulla = useRef(false);
  async function analizzaTutti() {
    const caselle = format.fasi.flatMap((f) => f.cue).filter((c) => c.file && c.tipo !== "promemoria");
    analisiAnnulla.current = false;
    setAnalisi({ fatti: 0, totale: caselle.length });
    let fatti = 0;
    for (const c of caselle) {
      if (analisiAnnulla.current) break;
      try {
        const r = await analizzaDalServer(c.file!);
        await api.modificaCue(c.id, r);
      } catch {
        /* file rotto o mancante: lo dirà il soundcheck */
      }
      fatti++;
      setAnalisi({ fatti, totale: caselle.length });
    }
    setAnalisi(null);
    await props.onRicarica();
  }
  const notifica = props.onSalvataggio;

  useEffect(() => notifica?.(pendenti), [pendenti, notifica]);

  const salva: Salva = (fn) => {
    if (props.bloccato) return; // sola lettura: niente salvataggi, neanche dal drop
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
  const fasiTrascinabili = fasiOrdinate.filter((f) => !f.sempre);

  function fineTrascinamentoFasi(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = fasiTrascinabili.map((f) => `fase-${f.id}`);
    const nuovo = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    salva(() => api.riordinaFasi(format.id, nuovo.map((s) => s.replace(/^fase-/, ""))));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5" style={{ paddingBottom: "max(128px, calc(var(--altezza-dock, 0px) + 16px))" }}>
      {/* Il banner sta FUORI dal fieldset disabilitato: "Sblocca" deve restare premibile. */}
      {props.bloccato && (
        <div
          role="status"
          className="vetro vetro-solido flex flex-wrap items-center gap-3 px-4 py-3"
          style={{ borderColor: "var(--brand)" }}
        >
          <Lock size={18} strokeWidth={1.75} className="shrink-0 text-brand-chiaro" aria-hidden />
          <span className="flex-1 text-[15px] font-semibold text-testo">Serata in corso — modifiche bloccate</span>
          {props.onSblocca &&
            (confermaSblocco ? (
              <span className="flex items-center gap-2 text-[14px] text-testo-2">
                Sbloccare le modifiche?
                <Pulsante
                  variante="primario"
                  misura="sm"
                  disabled={false}
                  onClick={() => {
                    setConfermaSblocco(false);
                    props.onSblocca!();
                  }}
                >
                  Sì, sblocca
                </Pulsante>
                <Pulsante variante="secondario" misura="sm" disabled={false} onClick={() => setConfermaSblocco(false)}>
                  No
                </Pulsante>
              </span>
            ) : (
              <Pulsante variante="secondario" misura="sm" disabled={false} onClick={() => setConfermaSblocco(true)}>
                Sblocca
              </Pulsante>
            ))}
        </div>
      )}
    <fieldset
      disabled={props.bloccato}
      aria-disabled={props.bloccato}
      className={`m-0 min-w-0 space-y-4 border-0 p-0 md:space-y-5 ${props.bloccato ? "mt-4 opacity-80" : ""}`}
    >
      <div className="vetro p-5">
        <div className="mb-2 flex items-center gap-2">
          <div className="etichetta flex-1">Prima di iniziare</div>
          {analisi ? (
            <div className="flex items-center gap-2" data-analisi>
              <span className="text-[12px] tabular-nums text-testo-2">
                Analizzo {analisi.fatti} / {analisi.totale}
              </span>
              <span className="w-32">
                <BarraAvanzamento frazione={analisi.totale ? analisi.fatti / analisi.totale : 0} colore="var(--brand-chiaro)" spessa />
              </span>
              <Pulsante misura="sm" variante="secondario" onClick={() => (analisiAnnulla.current = true)}>
                Interrompi
              </Pulsante>
            </div>
          ) : (
            <Menu
              etichetta="Menu del format"
              voci={[
                {
                  testo: "Analizza tutti i suoni",
                  icona: <Waves size={15} strokeWidth={1.75} />,
                  onScelta: () => void analizzaTutti(),
                },
              ]}
            />
          )}
        </div>
        <AreaInline
          valore={format.notaInizio ?? ""}
          righe={3}
          placeholder="Le cose da ricordare prima della serata. Compare all'apertura del format in Live."
          onCambia={(v) => salva(() => api.modificaFormat(format.id, { notaInizio: v }))}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="etichetta">Passaggio tra sottofondi</span>
          <input
            type="range"
            min={0}
            max={5}
            step={0.5}
            defaultValue={format.crossfade ?? 2}
            key={`cf-${format.crossfade ?? 2}`}
            aria-label="Passaggio tra sottofondi, in secondi"
            onChange={(e) => {
              const v = Number(e.target.value);
              window.clearTimeout((window as unknown as { __tcf?: number }).__tcf);
              (window as unknown as { __tcf?: number }).__tcf = window.setTimeout(
                () => salva(() => api.modificaFormat(format.id, { crossfade: v })),
                300,
              );
            }}
            className="w-48 accent-[var(--brand)]"
          />
          <span className="text-[13px] tabular-nums text-testo-2" data-crossfade>
            {(format.crossfade ?? 2).toLocaleString("it-IT")} s
          </span>
          <span className="text-[12px] text-testo-3">quando parte un sottofondo mentre un altro suona</span>
        </div>
      </div>
      {fasiOrdinate.length === 0 && (
        <Vetro className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
          <Music size={30} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
          <p className="text-testo-2">Questo format è vuoto: aggiungi la prima fase.</p>
        </Vetro>
      )}
      <DndContext collisionDetection={closestCenter} onDragEnd={fineTrascinamentoFasi}>
        <SortableContext items={fasiTrascinabili.map((f) => `fase-${f.id}`)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4 md:space-y-5">
            {fasiOrdinate.map((f) => (
              <SezioneFase key={f.id} fase={f} salva={salva} onAzzeraSerata={props.onAzzeraSerata} maiUsati={maiUsati} anteprima={props.anteprima} />
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
    </fieldset>
    </div>
  );
}
