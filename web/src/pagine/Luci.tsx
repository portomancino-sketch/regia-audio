// Impostazioni → Luci: il mondo TECNICO (Jacopo, una volta per locale).
// Centralina, abbinamento, lampadine, gruppi della Regia, i tre effetti.
import { useCallback, useEffect, useRef, useState } from "react";
import { Lightbulb, Plus, Trash2, Zap } from "lucide-react";
import {
  COLORI_LUCE,
  COLORI_ORDINE,
  EFFETTI,
  voceDefault,
  type ColoreLuce,
  type Effetto,
  type GruppoRegia,
  type NomeEffetto,
  type VoceEffetto,
} from "../../../shared/luci";
import { api, type Lampadina, type LuciStato } from "../api";
import { Vetro } from "../componenti/ui/Vetro";
import { Pulsante } from "../componenti/ui/Pulsante";
import { InputInline } from "../componenti/comuni";
import { testoSu } from "../componenti/PannelloLuci";

const TESTO_STATO: Record<LuciStato["stato"], string> = {
  nessuna: "Centralina non trovata",
  daAbbinare: "Trovata, da abbinare",
  abbinata: "Abbinata",
  nonRaggiungibile: "Non raggiungibile",
};

export function Luci(props: { bloccato?: boolean }) {
  const [stato, setStato] = useState<LuciStato | null>(null);
  const [lampadine, setLampadine] = useState<Lampadina[]>([]);
  const [ip, setIp] = useState("");
  const [cercando, setCercando] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [contoAbbina, setContoAbbina] = useState<number | null>(null);
  const timerAbbina = useRef<number | null>(null);
  const [nuovoGruppo, setNuovoGruppo] = useState("");
  const [effettiBozza, setEffettiBozza] = useState<Record<NomeEffetto, Effetto> | null>(null);
  const timerSalva = useRef<number | null>(null);

  const ricarica = useCallback(async () => {
    const s = await api.luci.stato();
    setStato(s);
    setIp((v) => v || s.ipManuale || s.bridge?.ip || "");
    setEffettiBozza(s.mappa.effetti);
    if (s.stato === "abbinata") setLampadine(await api.luci.lampadine());
    else setLampadine([]);
  }, []);
  useEffect(() => {
    void ricarica();
  }, [ricarica]);
  useEffect(
    () => () => {
      if (timerAbbina.current) clearInterval(timerAbbina.current);
      if (timerSalva.current) clearTimeout(timerSalva.current);
    },
    [],
  );

  async function cerca(conIp: boolean) {
    setCercando(true);
    setMessaggio(null);
    try {
      const r = await api.luci.cerca(conIp ? ip : undefined);
      setMessaggio(r.trovata ? "Centralina trovata." : conIp ? "A quell'indirizzo non risponde una centralina Philips." : "Nessuna centralina trovata sulla rete. Prova con l'indirizzo IP.");
    } catch {
      setMessaggio("Ricerca non riuscita.");
    } finally {
      setCercando(false);
      await ricarica();
    }
  }

  function abbina() {
    if (timerAbbina.current) clearInterval(timerAbbina.current);
    let secondi = 30;
    setContoAbbina(secondi);
    setMessaggio(null);
    const tenta = async () => {
      const r = await api.luci.abbina().catch(() => ({ abbinata: false, errore: "Centralina non raggiungibile" }));
      if (r.abbinata) {
        if (timerAbbina.current) clearInterval(timerAbbina.current);
        setContoAbbina(null);
        setMessaggio("Abbinata! Ora puoi dare un nome alle lampadine e fare i gruppi.");
        await ricarica();
        return;
      }
      secondi -= 2;
      setContoAbbina(secondi);
      if (secondi <= 0) {
        if (timerAbbina.current) clearInterval(timerAbbina.current);
        setContoAbbina(null);
        setMessaggio(r.errore ?? "Tempo scaduto: riprova e premi il pulsante rotondo sulla centralina.");
      }
    };
    void tenta();
    timerAbbina.current = window.setInterval(() => void tenta(), 2000);
  }

  function salvaEffettiPresto(nuovi: Record<NomeEffetto, Effetto>) {
    setEffettiBozza(nuovi);
    if (timerSalva.current) clearTimeout(timerSalva.current);
    timerSalva.current = window.setTimeout(() => void api.luci.salvaEffetti(nuovi).then(setStato).catch(() => undefined), 400);
  }
  function aggiornaEffetto(nome: NomeEffetto, cambia: (e: Effetto) => Effetto) {
    if (!effettiBozza) return;
    salvaEffettiPresto({ ...effettiBozza, [nome]: cambia(effettiBozza[nome]) });
  }
  function aggiornaVoce(nome: NomeEffetto, gruppoId: string, cambia: (v: VoceEffetto) => VoceEffetto | null) {
    aggiornaEffetto(nome, (e) => {
      const voci = { ...e.voci };
      const nuova = cambia(voci[gruppoId] ?? voceDefault());
      if (nuova) voci[gruppoId] = nuova;
      else delete voci[gruppoId];
      return { ...e, voci };
    });
  }

  if (!stato) return <div className="p-8 text-testo-2">Carico…</div>;
  const gruppi = Object.values(stato.mappa.gruppi).sort((a, b) => a.nome.localeCompare(b.nome));
  const abbinata = stato.stato === "abbinata" || stato.stato === "nonRaggiungibile";
  const nomeLampada = (id: string) => lampadine.find((l) => l.id === id)?.nome ?? `Lampadina ${id}`;

  return (
    <fieldset disabled={props.bloccato} className="mx-auto m-0 min-w-0 max-w-4xl space-y-4 border-0 p-0 px-4 py-6">
      <h1 className="text-[28px] font-semibold">Luci</h1>
      {props.bloccato && <p className="text-[14px] text-testo-2">Serata in corso: le impostazioni delle luci sono in sola lettura.</p>}

      {/* ---- Centralina ---- */}
      <Vetro className="p-5" data-sezione="centralina">
        <div className="etichetta mb-2">Centralina Philips Hue</div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-full px-3 py-1 text-[13px] font-semibold"
            data-stato-centralina={stato.stato}
            style={{
              backgroundColor: stato.stato === "abbinata" ? "var(--brand)" : stato.stato === "nessuna" ? "var(--velo)" : "var(--tipo-effetto)",
              color: stato.stato === "nessuna" ? "var(--testo-2)" : "#fff",
            }}
          >
            {TESTO_STATO[stato.stato]}
          </span>
          {stato.bridge && (
            <span className="text-[13px] text-testo-2">
              {stato.bridge.nome ?? "Centralina"} · {stato.bridge.ip}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pulsante variante="secondario" disabled={cercando} onClick={() => void cerca(false)}>
            Cerca sulla rete
          </Pulsante>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="oppure l'indirizzo IP, es. 192.168.1.20"
            aria-label="Indirizzo IP della centralina"
            className="vetro vetro-campo w-64 bg-velo px-3 py-2 text-[14px] text-testo placeholder:text-testo-3 focus:border-brand-chiaro focus:outline-none"
          />
          <Pulsante variante="secondario" disabled={cercando || !ip.trim()} onClick={() => void cerca(true)}>
            Prova questo IP
          </Pulsante>
          {stato.stato !== "nessuna" && stato.stato !== "abbinata" && (
            <Pulsante variante="primario" disabled={contoAbbina !== null} onClick={abbina}>
              {contoAbbina !== null ? `Abbina… ${contoAbbina} s` : "Abbina"}
            </Pulsante>
          )}
        </div>
        {contoAbbina !== null && (
          <p className="mt-3 text-[15px] font-semibold text-testo" data-frase-abbina>
            Premi il pulsante rotondo sulla centralina Philips.
          </p>
        )}
        {messaggio && <p className="mt-2 text-[13px] text-testo-2">{messaggio}</p>}
        <p className="mt-3 text-[12px] text-testo-3">
          La Regia parla solo con la centralina sulla rete del locale, mai con internet. Le luci non fermano mai un suono.
        </p>
      </Vetro>

      {abbinata && (
        <>
          {/* ---- Lampadine ---- */}
          <Vetro className="p-5" data-sezione="lampadine">
            <div className="etichetta mb-2">Lampadine</div>
            <p className="mb-3 text-[13px] text-testo-2">"Lampeggia" per capire quale è. Il nome che scrivi qui vale solo nella Regia.</p>
            <div className="space-y-1">
              {lampadine.map((l) => (
                <div key={l.id} className="flex items-center gap-3 border-b border-vetro-bordo py-1.5 last:border-0" data-lampadina={l.id}>
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: !l.raggiungibile ? "var(--rosso)" : l.accesa ? "var(--tipo-effetto)" : "var(--testo-3)" }} title={!l.raggiungibile ? "non raggiungibile" : l.accesa ? "accesa" : "spenta"} />
                  <InputInline
                    valore={l.nome}
                    onCambia={(v) => void api.luci.rinominaLampada(l.id, v).then(() => void ricarica())}
                    className="w-56 rounded-[10px] border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-medium hover:border-vetro-bordo focus:border-brand-chiaro focus:outline-none"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-testo-3">{l.nomeBridge}</span>
                  <span className="text-[12px] text-testo-3">{!l.raggiungibile ? "non raggiungibile" : l.accesa ? "accesa" : "spenta"}</span>
                  <Pulsante misura="sm" variante="secondario" onClick={() => void api.luci.lampeggia(l.id)}>
                    <Zap size={13} strokeWidth={1.75} aria-hidden /> Lampeggia
                  </Pulsante>
                </div>
              ))}
              {lampadine.length === 0 && <p className="text-[14px] text-testo-3">Nessuna lampadina trovata sulla centralina.</p>}
            </div>
          </Vetro>

          {/* ---- Gruppi ---- */}
          <Vetro className="p-5" data-sezione="gruppi">
            <div className="etichetta mb-2">Gruppi</div>
            <p className="mb-3 text-[13px] text-testo-2">Metti insieme le lampadine che vuoi comandare in blocco (per esempio "Sala", "Bar"). Una lampadina può stare in più gruppi.</p>
            <div className="space-y-3">
              {gruppi.map((g) => (
                <div key={g.id} className="rounded-[var(--raggio-campo)] border border-vetro-bordo p-3" data-gruppo={g.id}>
                  <div className="flex items-center gap-2">
                    <InputInline
                      valore={g.nome}
                      onCambia={(v) => void api.luci.modificaGruppo(g.id, { nome: v }).then(() => void ricarica())}
                      className="w-56 rounded-[10px] border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-semibold hover:border-vetro-bordo focus:border-brand-chiaro focus:outline-none"
                    />
                    <span className="flex-1 text-[12px] text-testo-3">{g.luci.length} lampadine</span>
                    <button type="button" aria-label={`Elimina il gruppo ${g.nome}`} onClick={() => void api.luci.eliminaGruppo(g.id).then(() => void ricarica())} className="tocco rounded-[10px] p-1.5 text-testo-3 hover:bg-velo hover:text-rosso">
                      <Trash2 size={15} strokeWidth={1.75} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {lampadine.map((l) => (
                      <label key={l.id} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-testo-2">
                        <input
                          type="checkbox"
                          checked={g.luci.includes(l.id)}
                          onChange={(e) => {
                            const luci = e.target.checked ? [...g.luci, l.id] : g.luci.filter((x) => x !== l.id);
                            void api.luci.modificaGruppo(g.id, { luci }).then(() => void ricarica());
                          }}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        {l.nome}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={nuovoGruppo}
                onChange={(e) => setNuovoGruppo(e.target.value)}
                placeholder="Nome del nuovo gruppo"
                aria-label="Nome del nuovo gruppo"
                className="vetro vetro-campo w-56 bg-velo px-3 py-2 text-[14px] text-testo placeholder:text-testo-3 focus:border-brand-chiaro focus:outline-none"
              />
              <Pulsante
                variante="secondario"
                disabled={!nuovoGruppo.trim()}
                onClick={() => {
                  void api.luci.creaGruppo(nuovoGruppo.trim(), []).then(() => {
                    setNuovoGruppo("");
                    void ricarica();
                  });
                }}
              >
                <Plus size={15} strokeWidth={1.75} aria-hidden /> Crea gruppo
              </Pulsante>
              <Pulsante variante="secondario" onClick={() => void api.luci.importaStanze().then(() => void ricarica())}>
                Importa le stanze della centralina
              </Pulsante>
            </div>
          </Vetro>

          {/* ---- Effetti ---- */}
          {effettiBozza &&
            EFFETTI.map((nome) => {
              const e = effettiBozza[nome];
              return (
                <Vetro key={nome} className="p-5" data-effetto={nome}>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="etichetta">Effetto {nome.slice(-1)}</span>
                    <input
                      value={e.nome}
                      maxLength={20}
                      onChange={(ev) => aggiornaEffetto(nome, (x) => ({ ...x, nome: ev.target.value }))}
                      aria-label={`Nome dell'effetto ${nome.slice(-1)}`}
                      className="vetro vetro-campo w-44 bg-velo px-3 py-1.5 text-[15px] font-semibold text-testo focus:border-brand-chiaro focus:outline-none"
                    />
                    <label className="flex items-center gap-2 text-[13px] text-testo-2">
                      Colore del pulsante
                      <input type="color" value={e.colore} onChange={(ev) => aggiornaEffetto(nome, (x) => ({ ...x, colore: ev.target.value }))} aria-label={`Colore del pulsante ${e.nome}`} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" />
                    </label>
                    <span className="flex min-h-10 items-center rounded-[var(--raggio-campo)] px-4 text-[15px] font-semibold" style={{ backgroundColor: e.colore, color: testoSu(e.colore) }}>
                      {e.nome || "…"}
                    </span>
                    <span className="flex-1" />
                    <Pulsante variante="secondario" misura="sm" onClick={() => void api.luci.prova(nome)} data-prova={nome}>
                      <Lightbulb size={14} strokeWidth={1.75} aria-hidden /> Prova
                    </Pulsante>
                  </div>
                  {gruppi.length === 0 && <p className="text-[13px] text-testo-3">Prima crea almeno un gruppo.</p>}
                  <div className="space-y-2">
                    {gruppi.map((g) => {
                      const voce = e.voci[g.id];
                      return (
                        <div key={g.id} className="rounded-[var(--raggio-campo)] border border-vetro-bordo p-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex cursor-pointer items-center gap-2 text-[15px] font-medium text-testo">
                              <input type="checkbox" checked={!!voce} onChange={(ev) => aggiornaVoce(nome, g.id, () => (ev.target.checked ? voceDefault() : null))} className="h-4 w-4 accent-[var(--brand)]" aria-label={`${e.nome}: usa il gruppo ${g.nome}`} />
                              {g.nome}
                            </label>
                            {voce && (
                              <>
                                <label className="flex items-center gap-1.5 text-[13px] text-testo-2">
                                  <input type="checkbox" checked={voce.acceso} onChange={(ev) => aggiornaVoce(nome, g.id, (v) => ({ ...v, acceso: ev.target.checked }))} className="h-4 w-4 accent-[var(--brand)]" />
                                  {voce.acceso ? "accese" : "spente"}
                                </label>
                                {voce.acceso && (
                                  <>
                                    <label className="flex items-center gap-1.5 text-[13px] text-testo-2">
                                      Luminosità
                                      <input type="range" min={0} max={100} step={5} value={voce.luminosita} onChange={(ev) => aggiornaVoce(nome, g.id, (v) => ({ ...v, luminosita: Number(ev.target.value) }))} className="w-28 accent-[var(--brand)]" aria-label="Luminosità" />
                                      <span className="w-9 tabular-nums">{voce.luminosita}%</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[13px] text-testo-2">
                                      Colore
                                      <select value={voce.colore} onChange={(ev) => aggiornaVoce(nome, g.id, (v) => ({ ...v, colore: ev.target.value as ColoreLuce }))} className="vetro vetro-campo bg-velo px-2 py-1 text-[13px] text-testo" aria-label="Colore della luce">
                                        {COLORI_ORDINE.map((c) => (
                                          <option key={c} value={c}>
                                            {COLORI_LUCE[c].nome}
                                          </option>
                                        ))}
                                      </select>
                                      <span aria-hidden className="h-4 w-4 rounded-full border border-vetro-bordo" style={{ backgroundColor: COLORI_LUCE[voce.colore]?.hex }} />
                                    </label>
                                  </>
                                )}
                                <label className="flex items-center gap-1.5 text-[13px] text-testo-2">
                                  Transizione
                                  <input type="range" min={0} max={10} step={0.5} value={voce.transizione} onChange={(ev) => aggiornaVoce(nome, g.id, (v) => ({ ...v, transizione: Number(ev.target.value) }))} className="w-24 accent-[var(--brand)]" aria-label="Transizione in secondi" />
                                  <span className="w-8 tabular-nums">{voce.transizione} s</span>
                                </label>
                                <label className="flex items-center gap-1.5 text-[13px] text-testo-2">
                                  <input type="checkbox" checked={!!voce.luci} onChange={(ev) => aggiornaVoce(nome, g.id, (v) => (ev.target.checked ? { ...v, luci: [...g.luci] } : { ...v, luci: undefined }))} className="h-4 w-4 accent-[var(--brand)]" />
                                  solo alcune luci
                                </label>
                              </>
                            )}
                          </div>
                          {voce?.luci && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6">
                              {g.luci.map((id) => (
                                <label key={id} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-testo-2">
                                  <input type="checkbox" checked={voce.luci!.includes(id)} onChange={(ev) => aggiornaVoce(nome, g.id, (v) => ({ ...v, luci: ev.target.checked ? [...(v.luci ?? []), id] : (v.luci ?? []).filter((x) => x !== id) }))} className="h-4 w-4 accent-[var(--brand)]" />
                                  {nomeLampada(id)}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Vetro>
              );
            })}
          <p className="text-[12px] text-testo-3">
            In Live, Valerio vede solo i tre nomi e "Torna com'era": prima del primo effetto la Regia fotografa le luci e "Torna com'era" le rimette esattamente così.
          </p>
        </>
      )}
    </fieldset>
  );
}
