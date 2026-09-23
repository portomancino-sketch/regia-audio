// Il diario di serata: cosa è successo, quando, da dove.
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, Download } from "lucide-react";
import { Vetro } from "../componenti/ui/Vetro";
import { Pulsante } from "../componenti/ui/Pulsante";

interface Riassunto {
  data: string;
  formats: string[];
  primo: string;
  ultimo: string;
  durataMin: number;
  suoni: number;
}
interface Evento {
  ora: string;
  tipo: string;
  cue?: string;
  fase?: string;
  format?: string;
  origine: string;
}
interface Riepilogo {
  inizio: string | null;
  fine: string | null;
  durataMin: number;
  fasi: { nome: string; previstiMin: number | null; realiMin: number; scartoMin: number | null }[];
  stopTutto: number;
  possibiliErrori: number;
  comandi: { telefono: number; mac: number };
}
interface MaiUsati {
  serate: string[];
  formats: { nome: string; caselle: string[] }[];
}

const minuti = (n: number) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`);

function RiquadroRiepilogo(props: { r: Riepilogo }) {
  const { r } = props;
  return (
    <Vetro className="p-5" data-riepilogo>
      <div className="etichetta mb-3">Riepilogo della serata</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[14px] sm:grid-cols-3">
        <div>
          <span className="text-testo-3">Inizio </span>
          <span className="tabular-nums text-testo">{r.inizio ? ora(r.inizio).slice(0, 5) : "—"}</span>
        </div>
        <div>
          <span className="text-testo-3">Fine </span>
          <span className="tabular-nums text-testo">{r.fine ? ora(r.fine).slice(0, 5) : "—"}</span>
        </div>
        <div>
          <span className="text-testo-3">Durata </span>
          <span className="tabular-nums text-testo">{minuti(r.durataMin)}</span>
        </div>
        <div>
          <span className="text-testo-3">STOP TUTTO </span>
          <span className="tabular-nums text-testo">{r.stopTutto}</span>
        </div>
        <div>
          <span className="text-testo-3">Possibili errori </span>
          <span className="tabular-nums text-testo" title="Suoni fermati entro 2 secondi dalla partenza">{r.possibiliErrori}</span>
        </div>
        <div>
          <span className="text-testo-3">Comandi </span>
          <span className="tabular-nums text-testo">
            {r.comandi.telefono} dal telefono · {r.comandi.mac} dal Mac
          </span>
        </div>
      </div>
      {r.fasi.length > 0 && (
        <table className="mt-4 w-full text-[13px]">
          <thead>
            <tr className="text-left text-testo-3">
              <th className="py-1 font-medium">Fase</th>
              <th className="py-1 text-right font-medium">Prevista</th>
              <th className="py-1 text-right font-medium">Reale</th>
              <th className="py-1 text-right font-medium">Scarto</th>
            </tr>
          </thead>
          <tbody>
            {r.fasi.map((f) => (
              <tr key={f.nome} className="border-t border-vetro-bordo">
                <td className="py-1 text-testo">{f.nome}</td>
                <td className="py-1 text-right tabular-nums text-testo-2">{f.previstiMin === null ? "—" : `${f.previstiMin} min`}</td>
                <td className="py-1 text-right tabular-nums text-testo">{f.realiMin} min</td>
                <td
                  className="py-1 text-right tabular-nums"
                  style={{
                    color:
                      f.scartoMin === null ? "var(--testo-3)" : Math.abs(f.scartoMin) <= 2 ? "var(--brand-chiaro)" : Math.abs(f.scartoMin) <= 5 ? "var(--tipo-effetto)" : "var(--rosso)",
                  }}
                >
                  {f.scartoMin === null ? "—" : f.scartoMin > 0 ? `+${f.scartoMin} min` : `${f.scartoMin} min`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Vetro>
  );
}

const ora = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const dataLunga = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function TempoPerFase(props: { eventi: Evento[] }) {
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

export function Diario() {
  const [giorni, setGiorni] = useState<Riassunto[] | null>(null);
  const [aperto, setAperto] = useState<string | null>(null);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null);
  const [maiUsati, setMaiUsati] = useState<MaiUsati | null>(null);

  useEffect(() => {
    void fetch("/api/diario").then(async (r) => setGiorni((await r.json()) as Riassunto[]));
    void fetch("/api/statistiche/mai-usati").then(async (r) => setMaiUsati((await r.json()) as MaiUsati));
  }, []);

  useEffect(() => {
    if (!aperto) return;
    void fetch(`/api/diario/${aperto}`).then(async (r) => {
      const d = (await r.json()) as { eventi: Evento[]; riepilogo: Riepilogo };
      setEventi(d.eventi);
      setRiepilogo(d.riepilogo);
    });
  }, [aperto]);

  if (giorni === null) return <div className="p-8 text-testo-2">Carico…</div>;

  if (aperto) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAperto(null)}
            aria-label="Torna all'elenco"
            className="tocco rounded-[10px] border border-transparent p-1.5 text-testo-2 hover:bg-velo hover:text-testo"
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <h1 className="flex-1 text-[22px] font-semibold capitalize">{dataLunga(aperto)}</h1>
          <a href={`/api/diario/${aperto}/csv`} download>
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
                <span className="w-32 shrink-0 font-medium text-testo">{e.tipo}</span>
                <span className="min-w-0 flex-1 truncate text-testo-2">
                  {[e.cue, e.fase].filter(Boolean).join(" · ")}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-testo-3">{e.origine}</span>
              </div>
            ))}
            {eventi.length === 0 && <p className="text-testo-2">Nessun evento in questa giornata.</p>}
          </div>
        </Vetro>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-5 text-[28px] font-semibold">Diario di serata</h1>
      {giorni.length === 0 ? (
        <Vetro className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center">
          <CalendarClock size={30} strokeWidth={1.75} className="text-brand-chiaro" aria-hidden />
          <p className="text-testo-2">Ancora nessuna serata: il diario si scrive da solo mentre lavori.</p>
        </Vetro>
      ) : (
        <div className="space-y-3">
          {maiUsati && maiUsati.formats.length > 0 && (
            <Vetro className="p-5" data-mai-usati>
              <div className="etichetta mb-1">Ultime {maiUsati.serate.length} serate: suoni mai usati</div>
              <p className="mb-3 text-[13px] text-testo-3">Per ogni format usato, le caselle che non sono mai partite (il soundcheck non conta).</p>
              <div className="space-y-2">
                {maiUsati.formats.map((f) => (
                  <div key={f.nome} className="text-[14px]">
                    <span className="font-semibold text-testo">{f.nome}</span>
                    <span className="text-testo-2">
                      {f.caselle.length === 0 ? " — tutte usate" : `: ${f.caselle.join(", ")}`}
                    </span>
                  </div>
                ))}
              </div>
            </Vetro>
          )}
          {giorni.map((g) => (
            <button
              key={g.data}
              type="button"
              onClick={() => setAperto(g.data)}
              className="vetro tocco flex w-full cursor-pointer items-center gap-4 p-4 text-left"
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--brand) 14%, transparent)" }}
              >
                <CalendarClock size={19} strokeWidth={1.75} className="text-brand-chiaro" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold capitalize text-testo">
                  {dataLunga(g.data)}
                </span>
                <span className="block truncate text-[13px] text-testo-2">
                  {g.formats.join(", ") || "—"}
                </span>
              </span>
              <span className="shrink-0 text-right text-[13px] tabular-nums text-testo-2">
                {ora(g.primo).slice(0, 5)}–{ora(g.ultimo).slice(0, 5)}
                <span className="block text-testo-3">
                  {g.durataMin < 60 ? `${g.durataMin} min` : `${Math.floor(g.durataMin / 60)} h ${g.durataMin % 60} min`} · {g.suoni} suoni
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
