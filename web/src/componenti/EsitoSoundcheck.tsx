// Il riquadro "Esito soundcheck": file mancanti, file rotti, picchi in dB.
import { ordinaEsito, type EsitoCasella } from "../../../shared/soundcheck";
import { Pulsante } from "./ui/Pulsante";

export function EsitoSoundcheck(props: { esiti: EsitoCasella[]; luci?: string | null; onChiudi: () => void }) {
  const { mancanti, nonDecodificabili, picchi } = ordinaEsito(props.esiti);
  const problemi = mancanti.length + nonDecodificabili.length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={props.onChiudi}>
      <div
        role="dialog"
        aria-label="Esito soundcheck"
        onClick={(e) => e.stopPropagation()}
        className="vetro vetro-solido flex max-h-[85vh] w-full max-w-lg flex-col p-6"
      >
        <div className="etichetta mb-1">Esito soundcheck</div>
        <p className="mb-4 text-[15px] text-testo-2">
          {props.esiti.length} caselle provate
          {problemi === 0 ? ", nessun problema." : `, ${problemi} con problemi.`}
          {props.luci && (
            <span className={`block ${props.luci === "ok" ? "text-testo-2" : "text-rosso"}`} data-esito-luci>
              Luci: {props.luci === "ok" ? "ok" : "centralina non raggiungibile"}
            </span>
          )}
        </p>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {mancanti.length > 0 && (
            <div>
              <div className="mb-1 text-[13px] font-semibold text-rosso">File mancanti</div>
              <ul className="space-y-0.5 text-[14px] text-testo">
                {mancanti.map((e) => (
                  <li key={e.cueId}>
                    {e.titolo} <span className="text-testo-3">· {e.fase}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {nonDecodificabili.length > 0 && (
            <div>
              <div className="mb-1 text-[13px] font-semibold text-rosso">File che non si leggono</div>
              <ul className="space-y-0.5 text-[14px] text-testo">
                {nonDecodificabili.map((e) => (
                  <li key={e.cueId}>
                    {e.titolo} <span className="text-testo-3">· {e.fase}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {picchi.length > 0 && (
            <div>
              <div className="mb-1 text-[13px] font-semibold text-testo-2">Picco misurato (dal più basso)</div>
              <table className="w-full text-[13px]">
                <tbody>
                  {picchi.map((e) => (
                    <tr key={e.cueId} className="border-b border-vetro-bordo last:border-0">
                      <td className="w-1/2 py-1 pr-2 text-testo">{e.titolo}</td>
                      <td className="py-1 pr-2 text-testo-3">{e.fase}</td>
                      <td className="w-20 py-1 text-right tabular-nums text-testo">
                        {e.piccoDb === null ? "—" : `${e.piccoDb.toFixed(1)} dB`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pulsante variante="primario" misura="lg" className="mt-5 w-full" onClick={props.onChiudi}>
          Chiudi
        </Pulsante>
      </div>
    </div>
  );
}
