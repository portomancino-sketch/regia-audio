// Il riquadro "Riepilogo della serata" (nel Diario e nella finestra di "Chiudi serata").
import { Download } from "lucide-react";
import { oraBreve } from "../../../shared/serata";
import type { RiepilogoWeb } from "../api";
import { Vetro } from "./ui/Vetro";
import { Pulsante } from "./ui/Pulsante";

export const minuti = (n: number) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`);

export function testoSoundcheckRiepilogo(sc: RiepilogoWeb["soundcheck"]): string {
  if (!sc) return "non fatto";
  const quando = `${sc.completo ? "fatto" : "interrotto"} alle ${oraBreve(sc.ora)}`;
  if (sc.problemi === 0) return `${quando} · tutto ok`;
  return `${quando} · ${sc.problemi} ${sc.problemi === 1 ? "problema" : "problemi"}`;
}

export function RiquadroRiepilogo(props: { r: RiepilogoWeb; className?: string }) {
  const { r } = props;
  return (
    <Vetro className={`p-5 ${props.className ?? ""}`} data-riepilogo>
      <div className="etichetta mb-3">Riepilogo della serata</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[14px] sm:grid-cols-3">
        <div>
          <span className="text-testo-3">Inizio </span>
          <span className="tabular-nums text-testo">{r.inizio ? oraBreve(r.inizio) : "—"}</span>
        </div>
        <div>
          <span className="text-testo-3">Fine </span>
          <span className="tabular-nums text-testo">{r.fine ? oraBreve(r.fine) : "—"}</span>
          {r.chiusa && <span className="ml-1 text-[12px] text-testo-3">(chiusa)</span>}
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
          <span className="tabular-nums text-testo" title="Suoni fermati entro 2 secondi dalla partenza">
            {r.possibiliErrori}
          </span>
        </div>
        <div>
          <span className="text-testo-3">Comandi </span>
          <span className="tabular-nums text-testo">
            {r.comandi.telefono} dal telefono · {r.comandi.mac} dal Mac
          </span>
        </div>
        <div className="col-span-2 sm:col-span-3" data-riepilogo-soundcheck>
          <span className="text-testo-3">Soundcheck </span>
          <span
            className="tabular-nums"
            style={{ color: !r.soundcheck || !r.soundcheck.completo ? "var(--rosso)" : r.soundcheck.problemi > 0 ? "var(--tipo-effetto)" : "var(--brand-chiaro)" }}
          >
            {testoSoundcheckRiepilogo(r.soundcheck)}
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
                      f.scartoMin === null
                        ? "var(--testo-3)"
                        : Math.abs(f.scartoMin) <= 2
                          ? "var(--brand-chiaro)"
                          : Math.abs(f.scartoMin) <= 5
                            ? "var(--tipo-effetto)"
                            : "var(--rosso)",
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

/** La finestra che si apre dopo "Chiudi serata": lo stesso riepilogo del Diario,
 *  con "Esporta CSV" e "Chiudi". */
export function FinestraRiepilogo(props: { data: string; serata: number; r: RiepilogoWeb; onChiudi: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={props.onChiudi}>
      <div
        role="dialog"
        aria-label="Riepilogo della serata"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3"
      >
        <div className="vetro vetro-solido px-5 py-3 text-[15px] text-testo">
          Serata chiusa. Le spunte e i contatori sono azzerati, le luci sono tornate com'erano.
        </div>
        <div className="min-h-0 overflow-y-auto">
          <RiquadroRiepilogo r={props.r} className="vetro-solido" />
        </div>
        <div className="flex gap-3">
          <a href={`/api/diario/${props.data}/csv?serata=${props.serata}`} download className="flex-1">
            <Pulsante variante="secondario" misura="lg" className="w-full">
              <Download size={16} strokeWidth={1.75} aria-hidden /> Esporta CSV
            </Pulsante>
          </a>
          <Pulsante variante="primario" misura="lg" className="flex-1" onClick={props.onChiudi} data-riepilogo-chiudi>
            Chiudi
          </Pulsante>
        </div>
      </div>
    </div>
  );
}
