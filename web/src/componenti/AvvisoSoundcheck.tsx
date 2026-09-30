// "Non hai ancora provato i suoni di oggi.": una finestra, una sola volta per
// serata, al primo suono vero senza soundcheck. Mai bloccante: il suono è già partito.
import { ListChecks } from "lucide-react";
import { Modale } from "./ui/Modale";
import { Pulsante } from "./ui/Pulsante";

export function AvvisoSoundcheck(props: { onProva: () => void; onAvanti: () => void }) {
  return (
    <Modale etichetta="Soundcheck non fatto" onChiudi={props.onAvanti} className="max-w-md p-6">
        <div className="etichetta mb-2 pr-10">Soundcheck</div>
        <p className="text-[20px] font-semibold leading-snug text-testo">Non hai ancora provato i suoni di oggi.</p>
        <p className="mt-1 text-[14px] text-testo-2">Il suono è partito lo stesso. Se vuoi, prova tutte le caselle ora: ci vuole circa un minuto.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Pulsante variante="primario" misura="lg" onClick={props.onProva} className="min-h-16" data-avviso-prova>
            <ListChecks size={18} strokeWidth={1.75} aria-hidden /> Prova tutti (1 min)
          </Pulsante>
          <Pulsante variante="secondario" misura="lg" onClick={props.onAvanti} className="min-h-16" data-avviso-avanti data-modale-primario>
            Vado avanti
          </Pulsante>
        </div>
    </Modale>
  );
}
