// Il pannello apribile con QR, indirizzo, PIN e telefoni collegati.
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import QRCode from "qrcode";
import type { InfoRete } from "../../../shared/tipi";
import { api } from "../api";
import { Vetro } from "../componenti/ui/Vetro";
import { Pulsante } from "../componenti/ui/Pulsante";

export function PannelloTelecomando(props: { telefoni: { ip: string }[] }) {
  const [aperto, setAperto] = useState(false);
  const [rete, setRete] = useState<InfoRete | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pinBozza, setPinBozza] = useState("");

  useEffect(() => {
    if (!aperto) return;
    void api.rete().then(async (r) => {
      setRete(r);
      setPinBozza(r.pin);
      setQr(await QRCode.toDataURL(r.urlTelecomando, { width: 220, margin: 1 }));
    });
  }, [aperto]);

  async function salvaPin() {
    if (!/^\d{4}$/.test(pinBozza) || !rete) return;
    await api.impostazioni({ pin: pinBozza });
    setRete({ ...rete, pin: pinBozza });
  }

  return (
    <div className="relative">
      <Pulsante variante="secondario" onClick={() => setAperto(!aperto)}>
        <Smartphone size={16} strokeWidth={1.75} aria-hidden />
        Telecomando{props.telefoni.length > 0 && ` (${props.telefoni.length})`}
      </Pulsante>
      {aperto && (
        <Vetro className="absolute right-0 top-14 z-50 w-80 bg-[#14181e]/95 p-5">
          {!rete ? (
            <p className="text-testo-2">Un attimo…</p>
          ) : (
            <div className="space-y-4">
              <p className="text-[13px] text-testo-2">Inquadra col telefono (stesso WiFi del Mac):</p>
              {qr && (
                <div className="mx-auto w-fit rounded-2xl bg-white p-3">
                  <img src={qr} alt="QR del telecomando" className="block h-44 w-44" />
                </div>
              )}
              <p className="break-all text-center font-mono text-[13px] text-brand-chiaro">{rete.urlTelecomando}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="etichetta">PIN</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinBozza}
                  onChange={(e) => setPinBozza(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => void salvaPin()}
                  aria-label="PIN del telecomando"
                  className="vetro vetro-campo w-28 bg-white/5 px-2 py-1.5 text-center text-[24px] font-semibold tabular-nums tracking-[0.3em] text-testo focus:border-brand-chiaro focus:outline-none"
                />
              </div>
              <div className="text-[13px] text-testo-2">
                {props.telefoni.length === 0 ? (
                  <span className="text-testo-3">Nessun telefono collegato</span>
                ) : (
                  <>
                    <div className="etichetta mb-1.5">Telefoni collegati</div>
                    <ul className="space-y-1">
                      {props.telefoni.map((t, i) => (
                        <li key={i} className="flex items-center gap-2 font-mono tabular-nums">
                          <span aria-hidden className="h-2 w-2 rounded-full bg-brand-chiaro" />
                          {t.ip.replace(/^::ffff:/, "")}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </Vetro>
      )}
    </div>
  );
}
