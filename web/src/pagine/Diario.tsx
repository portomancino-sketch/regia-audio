// Il diario di serata: cosa è successo, quando, da dove. Una riga per serata:
// un giorno chiuso due volte col pulsante "Chiudi serata" ha due righe.
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, Download } from "lucide-react";
import { Vetro } from "../componenti/ui/Vetro";
import { Pulsante } from "../componenti/ui/Pulsante";
import { Pillola } from "../componenti/ui/Pillola";
import { RiquadroRiepilogo, minuti, testoSoundcheckRiepilogo } from "../componenti/RiepilogoSerata";
import type { EventoDiarioWeb, RiepilogoWeb } from "../api";

interface Riassunto {
  data: string;
  serata: number;
  chiusa: boolean;
  formats: string[];
  primo: string;
  ultimo: string;
  durataMin: number;
  suoni: number;
  soundcheck: { ora: string; problemi: number; completo: boolean } | null;
}
interface MaiUsati {
  serate: string[];
  formats: { nome: string; caselle: string[] }[];
  senzaSoundcheck?: number;
}

const ora = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const dataLunga = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function TempoPerFase(props: { eventi: EventoDiarioWeb[] }) {
  // Quanto si è stati in ogni fase, dai cambi di fase (e dal primo/ultimo evento).
  const barre = useMemo(() => {
    const durate = new Map<string, number>();
    let faseCorrente: string | null = null;
    let da = 0;
    for (const e of props.eventi) {
      const t = new Date(e.ora).getTime();
      if (e.tipo === "fase cambiata" || e.tipo === "format aperto") {
        if (faseCorrente) durate.set(faseCorrente, (durate.get(faseCorrente) ?? 0) + (t - da));
        faseCorrente = e.fase ?? null;
        da = t;
      } else if (!faseCorrente && e.fase) {
        faseCorrente = e.fase;
        da = t;
      }
    }
    if (faseCorrente && props.eventi.length > 0) {
      const fine = new Date(props.eventi[props.eventi.length - 1]!.ora).getTime();
      durate.set(faseCorrente, (durate.get(faseCorrente) ?? 0) + (fine - da));
    }
    const massimo = Math.max(1, ...durate.values());
    return [...durate.entries()].map(([nome, ms]) => ({ nome, minuti: Math.round(ms / 60000), frazione: ms / massimo }));
  }, [props.eventi]);

  if (barre.length === 0) return null;
  return (
    <Vetro className="p-5">
      <div className="etichetta mb-3">Tempo per fase</div>
      <div className="space-y-2">
        {barre.map((b) => (
          <div key={b.nome} className="flex items-center gap-3">
            <span className="w-40 truncate text-[13px] text-testo-2">{b.nome}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--barra-fondo)]">
              <div className="h-full rounded-full bg-brand-chiaro" style={{ width: `${b.frazione * 100}%` }} />
            </div>
            <span className="w-14 text-right text-[13px] tabular-nums text-testo-2">
              {b.minuti < 1 ? "<1 min" : `${b.minuti} min`}
            </span>
          </div>
        ))}
      </div>
    </Vetro>
  );
}

/** "1ª serata" / "2ª serata": solo quando un giorno ne ha più d'una. */
const ordinale = (n: number) => `${n + 1}ª serata`;

export function Diario() {
  const [serate, setSerate] = useState<Riassunto[] | null>(null);
  const [aperta, setAperta] = useState<{ data: string; serata: number } | null>(null);
  const [eventi, setEventi] = useState<EventoDiarioWeb[]>([]);
  const [riepilogo, setRiepilogo] = useState<RiepilogoWeb | null>(null);
  const [maiUsati, setMaiUsati] = useState<MaiUsati | null>(null);

  useEffect(() => {
    void fetch("/api/diario").then(async (r) => setSerate((await r.json()) as Riassunto[]));
    void fetch("/api/statistiche/mai-usati").then(async (r) => setMaiUsati((await r.json()) as MaiUsati));
  }, []);

  useEffect(() => {
    if (!aperta) return;
    void fetch(`/api/diario/${aperta.data}?serata=${aperta.serata}`).then(async (r) => {
      const d = (await r.json()) as { eventi: EventoDiarioWeb[]; riepilogo: RiepilogoWeb };
      setEventi(d.eventi);
      setRiepilogo(d.riepilogo);
    });
  }, [aperta]);

  if (serate === null) return <div className="p-8 text-testo-2">Carico…</div>;

  // Quante serate ha ogni giorno (per mostrare "1ª / 2ª serata").
  const perGiorno = new Map<string, number>();
  for (const s of serate) perGiorno.set(s.data, (perGiorno.get(s.data) ?? 0) + 1);

  if (aperta) {
    const piuDiUna = (perGiorno.get(aperta.data) ?? 1) > 1;
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAperta(null)}
            aria-label="Torna all'elenco"
            className="tocco rounded-[10px] border border-transparent p-1.5 text-testo-2 hover:bg-velo hover:text-testo"
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <h1 className="flex-1 text-[22px] font-semibold capitalize">
            {dataLunga(aperta.data)}
            {piuDiUna && <span className="ml-2 text-[15px] font-medium normal-case text-testo-2">· {ordinale(aperta.serata)}</span>}
          </h1>
          <a href={`/api/diario/${aperta.data}/csv?serata=${aperta.serata}`} download>
            <Pulsante variante="secondario">
              <Download size={15} strokeWidth={1.75} aria-hidden /> Esporta CSV
            </Pulsante>
          </a>
        </div>

        {riepilogo && <RiquadroRiepilogo r={riepilogo} />}
        <TempoPerFase eventi={eventi} />

        <Vetro className="p-5">
          <div className="etichetta mb-3">Cronologia</div>
          <div className="space-y-1">
            {eventi.map((e, i) => (
              <div key={i} className="flex items-baseline gap-3 border-b border-vetro-bordo py-1.5 text-[14px] last:border-0">
                <span className="w-16 shrink-0 tabular-nums text-testo-3">{ora(e.ora)}</span>
                <span className="w-32 shrink-0 font-medium text-testo">{e.tipo === "fine_serata" ? "chiudi serata" : e.tipo === "avviso_soundcheck" ? "avviso soundcheck" : e.tipo}</span>
                <span className="min-w-0 flex-1 truncate text-testo-2">
                  {[e.cue, e.fase].filter(Boolean).join(" · ")}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-testo-3">{e.origine}</span>
              </div>
            ))}
            {eventi.length === 0 && <p className="text-testo-2">Nessun evento in questa serata.</p>}
          </div>
        </Vetro>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-5 text-[28px] font-semibold">Diario di serata</h1>
      {serate.length === 0 ? (
        <Vetro className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
          <CalendarClock size={30} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
          <p className="text-testo-2">Ancora nessuna serata: il diario si scrive da solo mentre lavori.</p>
        </Vetro>
      ) : (
        <div className="space-y-3">
          {maiUsati && (maiUsati.formats.length > 0 || (maiUsati.senzaSoundcheck ?? 0) > 0) && (
            <Vetro className="p-5" data-mai-usati>
              <div className="etichetta mb-1">Ultime {maiUsati.serate.length} serate</div>
              <p className="mb-3 text-[13px] text-testo-3">
                Suoni mai usati: per ogni format usato, le caselle che non sono mai partite (il soundcheck non conta).
              </p>
              <div className="space-y-2">
                {maiUsati.formats.map((f) => (
                  <div key={f.nome} className="text-[14px]">
                    <span className="font-semibold text-testo">{f.nome}</span>
                    <span className="text-testo-2">
                      {f.caselle.length === 0 ? " — tutte usate" : `: ${f.caselle.join(", ")}`}
                    </span>
                  </div>
                ))}
                <div className="text-[14px]" data-senza-soundcheck>
                  <span className="font-semibold text-testo">Senza soundcheck</span>
                  <span className="text-testo-2">
                    {(maiUsati.senzaSoundcheck ?? 0) === 0
                      ? " — nessuna: sempre fatto"
                      : `: ${maiUsati.senzaSoundcheck} su ${maiUsati.serate.length}`}
                  </span>
                </div>
              </div>
            </Vetro>
          )}
          {serate.map((g) => (
            <button
              key={`${g.data}#${g.serata}`}
              type="button"
              onClick={() => setAperta({ data: g.data, serata: g.serata })}
              className="vetro tocco flex w-full cursor-pointer items-center gap-4 p-4 text-left"
              data-serata={`${g.data}#${g.serata}`}
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--brand) 14%, transparent)" }}
              >
                <CalendarClock size={19} strokeWidth={1.75} className="text-brand-chiaro" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[16px] font-semibold capitalize text-testo">{dataLunga(g.data)}</span>
                  {(perGiorno.get(g.data) ?? 1) > 1 && <Pillola>{ordinale(g.serata)}</Pillola>}
                </span>
                <span className="block truncate text-[13px] text-testo-2">
                  {g.formats.join(", ") || "—"}
                  <span className="text-testo-3"> · soundcheck {testoSoundcheckRiepilogo(g.soundcheck)}</span>
                </span>
              </span>
              <span className="shrink-0 text-right text-[13px] tabular-nums text-testo-2">
                {ora(g.primo).slice(0, 5)}–{ora(g.ultimo).slice(0, 5)}
                {g.chiusa && <span className="ml-1 text-[11px] text-testo-3">chiusa</span>}
                <span className="block text-testo-3">
                  {minuti(g.durataMin)} · {g.suoni} suoni
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
