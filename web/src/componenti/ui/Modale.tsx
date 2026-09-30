// Il modale unico di Regia: velo scuro a tutto schermo (copre anche dock e barra,
// livello --z-modale), finestra di vetro, X in alto a destra, ESC per chiudere,
// clic sul velo per chiudere (tranne le conferme distruttive: `chiudiSulVelo={false}`).
// Finché è aperto blocca i clic dietro e i tasti di Live (ESC non diventa STOP TUTTO).
// Più modali aperti: risponde solo quello in cima.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const pila: string[] = [];

/** C'è un modale aperto? Le scorciatoie di Live non valgono sotto il velo. */
export function modaleAperto(): boolean {
  return pila.length > 0;
}

export function Modale(props: {
  etichetta: string;
  onChiudi?: () => void;
  /** Clic sul velo = chiudi (default sì; no per le conferme distruttive). */
  chiudiSulVelo?: boolean;
  /** Niente X, niente ESC: solo per "Attiva audio", che si chiude premendolo. */
  bloccante?: boolean;
  /** Classi della finestra (larghezza, padding). */
  className?: string;
  /** "foglio" = attaccato in basso (telefono). */
  posizione?: "centro" | "foglio";
  children: ReactNode;
}) {
  const id = useId();
  const finestra = useRef<HTMLDivElement>(null);
  const chiudi = useRef(props.onChiudi);
  chiudi.current = props.onChiudi;
  const bloccante = props.bloccante === true || !props.onChiudi;

  useEffect(() => {
    pila.push(id);
    const prima = document.activeElement as HTMLElement | null;
    // Il fuoco entra nel modale: i tasti non finiscono ai pulsanti dietro.
    const primo = finestra.current?.querySelector<HTMLElement>("[data-modale-primario]") ?? finestra.current;
    primo?.focus({ preventScroll: true });
    const suTasto = (e: KeyboardEvent) => {
      if (pila[pila.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        if (!bloccante) chiudi.current?.();
        return;
      }
      // Le scorciatoie di Live (1–9, Q W E R T, F, P, frecce) non passano sotto il velo.
      if (!finestra.current?.contains(e.target as Node)) e.stopPropagation();
    };
    window.addEventListener("keydown", suTasto, { capture: true });
    return () => {
      window.removeEventListener("keydown", suTasto, { capture: true });
      const i = pila.lastIndexOf(id);
      if (i >= 0) pila.splice(i, 1);
      if (prima && document.contains(prima)) prima.focus({ preventScroll: true });
    };
  }, [id, bloccante]);

  const foglio = props.posizione === "foglio";
  return createPortal(
    <div
      className={`fixed inset-0 flex bg-black/55 ${foglio ? "items-end" : "items-center justify-center overflow-y-auto p-4"}`}
      style={{ zIndex: "var(--z-modale)" }}
      data-velo
      onClick={() => {
        if (!bloccante && props.chiudiSulVelo !== false) chiudi.current?.();
      }}
    >
      <div
        ref={finestra}
        role="dialog"
        aria-modal="true"
        aria-label={props.etichetta}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative outline-none ${
          foglio
            ? "vetro vetro-solido flex max-h-[90vh] w-full flex-col rounded-b-none rounded-t-[24px] p-4"
            : `vetro vetro-solido my-auto max-h-[calc(100dvh-32px)] w-full overflow-y-auto ${props.className ?? "max-w-md p-6"}`
        }`}
        style={foglio ? { paddingBottom: "max(16px, env(safe-area-inset-bottom))" } : undefined}
      >
        {!bloccante && (
          <button
            type="button"
            aria-label="Chiudi"
            title="Chiudi (ESC)"
            data-modale-x
            onClick={() => chiudi.current?.()}
            className="tocco absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-testo-2 hover:bg-velo hover:text-testo"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
