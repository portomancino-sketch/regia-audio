// L'interruttore del tema: Chiaro → Scuro → Automatico, salvato per dispositivo.
import { useCallback, useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";

type Scelta = "chiaro" | "scuro" | "auto";
const ORDINE: Scelta[] = ["chiaro", "scuro", "auto"];
const NOMI: Record<Scelta, string> = { chiaro: "Chiaro", scuro: "Scuro", auto: "Automatico" };

function risolvi(scelta: Scelta): "chiaro" | "scuro" {
  if (scelta !== "auto") return scelta;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "scuro" : "chiaro";
}

export function useTema(chiave: string): [Scelta, () => void] {
  const [scelta, setScelta] = useState<Scelta>(() => {
    const salvata = localStorage.getItem(chiave);
    return salvata === "scuro" || salvata === "auto" ? salvata : "chiaro";
  });

  useEffect(() => {
    document.documentElement.dataset.tema = risolvi(scelta);
    localStorage.setItem(chiave, scelta);
    if (scelta !== "auto") return;
    // In automatico segue il sistema anche se cambia mentre la pagina è aperta.
    const media = matchMedia("(prefers-color-scheme: dark)");
    const aggiorna = () => {
      document.documentElement.dataset.tema = risolvi("auto");
    };
    media.addEventListener("change", aggiorna);
    return () => media.removeEventListener("change", aggiorna);
  }, [scelta, chiave]);

  const cicla = useCallback(() => {
    setScelta((s) => ORDINE[(ORDINE.indexOf(s) + 1) % ORDINE.length]!);
  }, []);

  return [scelta, cicla];
}

export function InterruttoreTema(props: { chiave: string; className?: string }) {
  const [scelta, cicla] = useTema(props.chiave);
  const Icona = scelta === "chiaro" ? Sun : scelta === "scuro" ? Moon : SunMoon;
  return (
    <button
      type="button"
      onClick={cicla}
      title={`Tema: ${NOMI[scelta]} (tocca per cambiare)`}
      aria-label={`Tema: ${NOMI[scelta]}`}
      className={`tocco rounded-[10px] border border-transparent p-2 text-testo-2 hover:bg-velo hover:text-testo ${props.className ?? ""}`}
    >
      <Icona size={18} strokeWidth={1.75} />
    </button>
  );
}
