// Impostazioni (solo Mac): Serata, Luci, Aspetto, Dati. Una pagina sola, sezioni
// in ordine; /luci resta come alias e apre la stessa pagina.
import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Lightbulb, Palette, Settings2, Upload } from "lucide-react";
import type { Config } from "../../../shared/tipi";
import { api } from "../api";
import { Vetro } from "../componenti/ui/Vetro";
import { Pulsante } from "../componenti/ui/Pulsante";
import { Slider } from "../componenti/ui/Slider";
import { ControlloSegmentato } from "../componenti/ui/ControlloSegmentato";
import { useIntensita, useTema } from "../componenti/ui/InterruttoreTema";
import { Luci } from "./Luci";

function Sezione(props: { id: string; titolo: string; icona: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={props.titolo} data-sezione-impostazioni={props.id} className="space-y-3">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold text-testo">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--brand) 14%, transparent)" }}>
          {props.icona}
        </span>
        {props.titolo}
      </h2>
      {props.children}
    </section>
  );
}

export function Impostazioni(props: { config: Config; bloccato: boolean; onRicarica: () => Promise<unknown> }) {
  const imp = props.config.impostazioni;
  const [tema, setTema] = useTema("tema-regia");
  const [intensita, setIntensita] = useIntensita("tema-regia");
  const [pinBozza, setPinBozza] = useState(imp.pin);
  const [info, setInfo] = useState<{ versione: string; cartellaDati: string } | null>(null);
  const [messaggioDati, setMessaggioDati] = useState<string | null>(null);
  const fileImport = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void api.versione().then(setInfo).catch(() => undefined);
  }, []);
  useEffect(() => setPinBozza(imp.pin), [imp.pin]);

  async function salvaPin() {
    if (!/^\d{4}$/.test(pinBozza) || pinBozza === imp.pin) return;
    await api.impostazioni({ pin: pinBozza });
    await props.onRicarica();
  }
  async function importa(file: File) {
    setMessaggioDati("Importo…");
    try {
      await api.importaZip(file);
      await props.onRicarica();
      setMessaggioDati("Importato. Quello che c'era prima è nella cartella backup.");
    } catch (e) {
      setMessaggioDati(e instanceof Error ? e.message : "Import non riuscito");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6">
      <h1 className="text-[28px] font-semibold">Impostazioni</h1>

      {/* ---- Serata ---- */}
      <Sezione id="serata" titolo="Serata" icona={<Settings2 size={16} strokeWidth={1.75} className="text-brand-chiaro" />}>
        <Vetro className="space-y-5 p-5">
          <div>
            <div className="etichetta mb-1.5">Volume del suono base quando parlo</div>
            <div className="flex items-center gap-2">
              <Slider
                valore={(imp.livelloParla ?? 0.25) / 0.6}
                onCambia={(v) => {
                  const livello = Math.round(v * 60) / 100;
                  void api.impostazioni({ livelloParla: livello }).then(() => void props.onRicarica());
                }}
                className="max-w-md flex-1"
                aria-label="Volume del suono base quando parlo"
              />
              <span className="w-10 text-right text-[13px] tabular-nums text-testo-2">{Math.round((imp.livelloParla ?? 0.25) * 100)}%</span>
            </div>
            <p className="mt-1 text-[12px] text-testo-3">Con PARLA acceso il sottofondo scende a questo livello.</p>
          </div>
          <div>
            <div className="etichetta mb-1.5">Passaggio tra sottofondi per i format nuovi</div>
            <div className="flex items-center gap-2">
              <Slider
                valore={(imp.crossfadeDefault ?? 2) / 5}
                onCambia={(v) => {
                  const sec = Math.round(v * 10) / 2;
                  void api.impostazioni({ crossfadeDefault: sec }).then(() => void props.onRicarica());
                }}
                className="max-w-md flex-1"
                aria-label="Passaggio tra sottofondi per i format nuovi"
              />
              <span className="w-10 text-right text-[13px] tabular-nums text-testo-2" data-crossfade-default>
                {(imp.crossfadeDefault ?? 2).toLocaleString("it-IT")} s
              </span>
            </div>
            <p className="mt-1 text-[12px] text-testo-3">Ogni format ha il suo: questo vale solo per quelli che crei da ora in poi.</p>
          </div>
          <div>
            <div className="etichetta mb-1.5">PIN del telecomando</div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={pinBozza}
                disabled={props.bloccato}
                onChange={(e) => setPinBozza(e.target.value.replace(/\D/g, ""))}
                onBlur={() => void salvaPin()}
                aria-label="PIN del telecomando"
                className="vetro vetro-campo w-28 bg-velo px-2 py-1.5 text-center text-[24px] font-semibold tabular-nums tracking-[0.3em] text-testo focus:border-brand-chiaro focus:outline-none"
              />
              <span className="text-[12px] text-testo-3">Quattro cifre. Cambiandolo, i telefoni collegati devono rientrare.</span>
            </div>
          </div>
        </Vetro>
      </Sezione>

      {/* ---- Luci ---- */}
      <Sezione id="luci" titolo="Luci" icona={<Lightbulb size={16} strokeWidth={1.75} className="text-brand-chiaro" />}>
        <Luci bloccato={props.bloccato} incorporata />
      </Sezione>

      {/* ---- Aspetto ---- */}
      <Sezione id="aspetto" titolo="Aspetto" icona={<Palette size={16} strokeWidth={1.75} className="text-brand-chiaro" />}>
        <Vetro className="space-y-4 p-5">
          <div>
            <div className="etichetta mb-2">Tema</div>
            <ControlloSegmentato
              className="max-w-sm"
              segmenti={[
                { id: "chiaro", testo: "Chiaro" },
                { id: "scuro", testo: "Scuro" },
                { id: "auto", testo: "Auto" },
              ]}
              valore={tema}
              onCambia={(v) => setTema(v as "chiaro" | "scuro" | "auto")}
            />
          </div>
          <div>
            <div className="etichetta mb-1.5">Intensità sfondo</div>
            <div className="flex items-center gap-2">
              <Slider valore={intensita / 100} onCambia={(v) => setIntensita(Math.round(v * 100))} className="max-w-md flex-1" aria-label="Intensità dello sfondo" />
              <span className="w-8 text-right text-[13px] tabular-nums text-testo-2">{intensita}</span>
            </div>
            <p className="mt-1 text-[12px] text-testo-3">Valgono per questo Mac; il telefono ha le sue dal sole/luna nel dock.</p>
          </div>
        </Vetro>
      </Sezione>

      {/* ---- Dati ---- */}
      <Sezione id="dati" titolo="Dati" icona={<FolderOpen size={16} strokeWidth={1.75} className="text-brand-chiaro" />}>
        <Vetro className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <a href="/api/export.zip" download>
              <Pulsante variante="secondario">
                <Download size={15} strokeWidth={1.75} aria-hidden /> Esporta tutto (zip)
              </Pulsante>
            </a>
            <Pulsante variante="secondario" disabled={props.bloccato} onClick={() => fileImport.current?.click()}>
              <Upload size={15} strokeWidth={1.75} aria-hidden /> Importa uno zip…
            </Pulsante>
            <input
              ref={fileImport}
              type="file"
              accept=".zip"
              className="hidden"
              aria-label="File zip da importare"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importa(f);
                e.target.value = "";
              }}
            />
            {messaggioDati && <span className="text-[13px] text-testo-2">{messaggioDati}</span>}
          </div>
          <p className="text-[12px] text-testo-3">L'export contiene i format e tutti i file audio: serve per portare la Regia su un altro Mac. Importare sostituisce tutto (con una copia di sicurezza automatica).</p>
          <div className="flex flex-wrap items-center gap-3 border-t border-vetro-bordo pt-4">
            <div className="min-w-0 flex-1">
              <div className="etichetta mb-1">Cartella dei dati</div>
              <div className="truncate font-mono text-[13px] text-testo-2" data-cartella-dati>
                {info?.cartellaDati ?? "…"}
              </div>
            </div>
            <Pulsante variante="secondario" misura="sm" onClick={() => void api.apriDati()}>
              <FolderOpen size={14} strokeWidth={1.75} aria-hidden /> Apri nel Finder
            </Pulsante>
          </div>
          <div className="text-[13px] text-testo-2" data-versione>
            Regia versione <span className="font-semibold text-testo">{info?.versione ?? "…"}</span>
          </div>
        </Vetro>
      </Sezione>
    </div>
  );
}
