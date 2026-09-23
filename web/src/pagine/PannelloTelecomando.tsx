// Il pannello apribile con QR, indirizzo, PIN e telefoni collegati.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { InfoRete } from "../../../shared/tipi";
import { api } from "../api";

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
      <button
        type="button"
        onClick={() => setAperto(!aperto)}
        className="rounded-xl bg-neutral-800 px-4 py-2 font-medium text-neutral-200 hover:bg-neutral-700"
      >
        📱 Telecomando {props.telefoni.length > 0 && `(${props.telefoni.length})`}
      </button>
      {aperto && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
          {!rete ? (
            <p className="text-neutral-400">Un attimo…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-300">Inquadra col telefono (stesso WiFi del Mac):</p>
              {qr && <img src={qr} alt="QR del telecomando" className="mx-auto rounded-lg bg-white p-2" />}
              <p className="break-all text-center font-mono text-sm text-blue-300">{rete.urlTelecomando}</p>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-neutral-400">PIN</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinBozza}
                  onChange={(e) => setPinBozza(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => void salvaPin()}
                  className="w-24 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-center font-mono text-xl tracking-widest"
                />
              </label>
              <div className="text-sm text-neutral-400">
                {props.telefoni.length === 0 ? (
                  "Nessun telefono collegato"
                ) : (
                  <>
                    Telefoni collegati:
                    <ul className="mt-1 list-inside list-disc">
                      {props.telefoni.map((t, i) => (
                        <li key={i} className="font-mono">{t.ip.replace(/^::ffff:/, "")}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
