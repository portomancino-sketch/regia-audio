// Il foglio "Prima di iniziare" (Mac e telefono): la riga grande del soundcheck
// di oggi, poi le cose da ricordare scritte nel format, poi il pulsante per partire
// (sempre cliccabile: il soundcheck avvisa, non blocca mai la serata).
import { ListChecks, RotateCcw } from "lucide-react";
import type { Format } from "../../../shared/tipi";
import { pulsanteFoglio, rigaSoundcheck, type SoundcheckSerata } from "../../../shared/serata";
import { Modale } from "./ui/Modale";
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
  /** Con problemi, il link "vedi l'esito". */
  onVediEsito?: () => void;
  onChiudi: () => void;
}) {
  const riga = rigaSoundcheck(props.soundcheck);
  // Il soundcheck non blocca MAI la serata: il pulsante principale è sempre cliccabile.
  // Con problemi dice "Vai lo stesso"; se il soundcheck non è fatto (e dal Mac si può
  // fare) dice "Salta il controllo".
  const testoPrincipale = pulsanteFoglio(riga.stato, !!props.onProva);
  return (
    <Modale etichetta="Prima di iniziare" onChiudi={props.onChiudi} className={`p-6 ${props.telefono ? "max-w-sm" : "max-w-md"}`}>
      <div className="etichetta mb-3 pr-10">Prima di iniziare</div>

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
        {riga.stato === "problemi" && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {props.onVediEsito && (
              <button type="button" onClick={props.onVediEsito} className="tocco min-h-11 text-[14px] text-testo-2 underline underline-offset-2" data-vedi-esito>
                vedi l'esito
              </button>
            )}
            {props.onProva && (
              <Pulsante variante="secondario" misura="sm" className="min-h-11" onClick={props.onProva} data-rifai-controllo>
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden /> Rifai il controllo
              </Pulsante>
            )}
          </div>
        )}
      </div>

      {props.format.notaInizio?.trim() && (
        <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-testo">{props.format.notaInizio}</p>
      )}
      <Pulsante variante="primario" misura="lg" className="mt-5 w-full" onClick={props.onChiudi} data-foglio-ok data-modale-primario>
        {testoPrincipale}
      </Pulsante>
    </Modale>
  );
}
