// Piccoli mattoni dell'interfaccia.
import { useEffect, useRef, useState } from "react";

/** Chip di scelta (tipo, sul sottofondo, ...). */
export function Chip(props: { attivo: boolean; onClick: () => void; children: React.ReactNode; colore?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        props.attivo ? "text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
      }`}
      style={props.attivo ? { backgroundColor: props.colore ?? "#404040" } : undefined}
    >
      {props.children}
    </button>
  );
}

/**
 * Bottone che chiede conferma: al primo tocco diventa "Sicuro?",
 * al secondo esegue. Niente finestre di sistema.
 */
export function BottoneConferma(props: {
  testo: string;
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
        `rounded-lg px-3 py-1.5 text-sm ${chiede ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`
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
        "w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 hover:border-neutral-700 focus:border-neutral-500 focus:bg-neutral-900 focus:outline-none"
      }
    />
  );
}
