// Piccoli mattoni dell'interfaccia.
import { useEffect, useRef, useState } from "react";

/**
 * Bottone che chiede conferma: al primo tocco diventa "Sicuro?",
 * al secondo esegue. Niente finestre di sistema.
 */
export function BottoneConferma(props: {
  testo: React.ReactNode;
  testoConferma?: string;
  onConfermato: () => void;
  className?: string;
}) {
  const [chiede, setChiede] = useState(false);
  useEffect(() => {
    if (!chiede) return;
    const t = setTimeout(() => setChiede(false), 3000);
    return () => clearTimeout(t);
  }, [chiede]);
  return (
    <button
      type="button"
      className={
        props.className ??
        `tocco rounded-[10px] border px-3 py-1.5 text-[13px] ${
          chiede
            ? "border-transparent bg-rosso text-white"
            : "border-vetro-bordo bg-white/5 text-testo-2 hover:text-testo"
        }`
      }
      onClick={(e) => {
        e.stopPropagation();
        if (chiede) {
          setChiede(false);
          props.onConfermato();
        } else {
          setChiede(true);
        }
      }}
    >
      {chiede ? (props.testoConferma ?? "Sicuro?") : props.testo}
    </button>
  );
}

/** Testo modificabile con un click (nomi di format e fasi, titoli dei cue). */
export function InputInline(props: {
  valore: string;
  onCambia: (v: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [testo, setTesto] = useState(props.valore);
  const ultimoValore = useRef(props.valore);
  useEffect(() => {
    if (props.valore !== ultimoValore.current) {
      ultimoValore.current = props.valore;
      setTesto(props.valore);
    }
  }, [props.valore]);
  return (
    <input
      type="text"
      value={testo}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setTesto(e.target.value)}
      onBlur={() => {
        if (testo.trim() && testo !== props.valore) props.onCambia(testo.trim());
        else setTesto(props.valore);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setTesto(props.valore);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={
        props.className ??
        "w-full rounded-[10px] border border-transparent bg-transparent px-1.5 py-0.5 transition-colors hover:border-vetro-bordo focus:border-brand-chiaro focus:bg-white/5 focus:outline-none"
      }
    />
  );
}
