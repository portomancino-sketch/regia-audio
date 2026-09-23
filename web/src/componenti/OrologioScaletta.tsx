// L'orologio di scaletta: "Fase 12:40 / 15:00" e "in ritardo di 8 min".
import { formattaDurata, scarto, testoScarto, type VoceScaletta } from "../../../shared/scaletta";
import type { Format } from "../../../shared/tipi";
import { useAdesso, useDiarioOggi } from "../hooks";

export function scalettaDi(format: Format): VoceScaletta[] {
  return [...format.fasi]
    .filter((f) => !f.sempre)
    .sort((a, b) => a.ordine - b.ordine)
    .map((f) => ({ nome: f.nome, durataPrevista: f.durataPrevista }));
}

const COLORI = {
  verde: "var(--brand-chiaro)",
  ambra: "var(--tipo-effetto)",
  rosso: "var(--rosso)",
} as const;

/** `soloScarto`: sul telefono, una riga piccola con il solo testo dello scarto. */
export function OrologioScaletta(props: { format: Format; faseId: string | null; soloScarto?: boolean; className?: string }) {
  const eventi = useDiarioOggi(true, props.faseId);
  const adesso = useAdesso(true);
  const s = scarto(scalettaDi(props.format), eventi, adesso);
  if (!s.fase) return null;
  const testo = testoScarto(s.scartoMs);
  if (props.soloScarto) {
    if (!testo) return null;
    return (
      <div className={`text-[12px] font-medium ${props.className ?? ""}`} style={{ color: s.colore ? COLORI[s.colore] : undefined }} data-scarto>
        {testo}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 text-[13px] tabular-nums ${props.className ?? ""}`} data-orologio>
      <span className="text-testo-2">
        Fase <span className="font-semibold text-testo">{formattaDurata(s.trascorsoMs)}</span>
        {s.previstoMs !== null && <span className="text-testo-3"> / {formattaDurata(s.previstoMs)}</span>}
      </span>
      {testo && (
        <span
          className="rounded-full px-2 py-0.5 text-[12px] font-semibold text-white"
          style={{ backgroundColor: s.colore ? COLORI[s.colore] : "var(--testo-3)" }}
          data-scarto
        >
          {testo}
        </span>
      )}
    </div>
  );
}
