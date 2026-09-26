// Il foglio "Prima di iniziare" (Mac e telefono): la riga grande del soundcheck
// di oggi, poi le cose da ricordare scritte nel format, poi "Ok, pronti".
import { ListChecks } from "lucide-react";
import type { Format } from "../../../shared/tipi";
import { rigaSoundcheck, type SoundcheckSerata } from "../../../shared/serata";
import { Pulsante } from "./ui/Pulsante";

const COLORE = {
  nonFatto: "var(--rosso)",
  ok: "var(--brand-chiaro)",
  problemi: "var(--tipo-effetto)",
} as const;

export function FoglioInizio(props: {
  format: Format;
  /** Il soundcheck di questo format nella serata di oggi (null = non fatto). */
  soundcheck: SoundcheckSerata | null | undefined;
  telefono?: boolean;
  /** Solo Mac, e solo dalla finestra che comanda: "Prova tutti i suoni" dentro il foglio. */
  onProva?: () => void;
  /** Solo Mac: con problemi, il link "vedi l'esito". */
  onVediEsito?: () => void;
  onChiudi: () => void;
}) {
  const riga = rigaSoundcheck(props.soundcheck);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-label="Prima di iniziare" className={`vetro w-full vetro-solido p-6 ${props.telefono ? "max-w-sm" : "max-w-md"}`}>
        <div className="etichetta mb-3">Prima di iniziare</div>

        {/* La riga grande: rossa finché il soundcheck non è fatto. */}
        <div
          className="mb-4 rounded-[var(--raggio-campo)] border px-3 py-3"
          style={{
            borderColor: `color-mix(in srgb, ${COLORE[riga.stato]} 55%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${COLORE[riga.stato]} 8%, transparent)`,
          }}
          data-soundcheck-stato={riga.stato}
        >
          <div className="text-[18px] font-semibold leading-tight" style={{ color: COLORE[riga.stato] }}>
            {riga.testo}
          </div>
          {riga.stato === "nonFatto" &&
            (props.onProva ? (
              <Pulsante variante="secondario" misura="md" className="mt-3 w-full" onClick={props.onProva} data-prova-dal-foglio>
                <ListChecks size={16} strokeWidth={1.75} aria-hidden /> Prova tutti i suoni
              </Pulsante>
            ) : (
              <div className="mt-1 text-[14px] text-testo-2">{props.telefono ? "Fallo dal Mac." : "Si fa dalla finestra che comanda."}</div>
            ))}
          {riga.stato === "problemi" && props.onVediEsito && (
            <button type="button" onClick={props.onVediEsito} className="mt-1 text-[14px] text-testo-2 underline underline-offset-2" data-vedi-esito>
              vedi l'esito
            </button>
          )}
        </div>

        {props.format.notaInizio?.trim() && (
          <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-testo">{props.format.notaInizio}</p>
        )}
        <Pulsante variante="primario" misura="lg" className="mt-5 w-full" onClick={props.onChiudi}>
          Ok, pronti
        </Pulsante>
      </div>
    </div>
  );
}
