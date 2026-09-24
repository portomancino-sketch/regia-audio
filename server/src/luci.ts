// Luci Philips Hue: la centralina sulla rete locale (API v1 su HTTP), abbinamento,
// lampadine e gruppi della Regia, tre effetti, "torna com'era", intensità.
// Mai un errore in sala per una lampadina: senza centralina, o se non risponde,
// tutto si ignora in silenzio. (L'API v2 con certificati è la strada futura.)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { cartellaDati } from "./percorsi";
import { scriviEvento } from "./diario";
import {
  CodaLuci,
  comandiRipristino,
  effettoInComandi,
  fotografaLuce,
  luciCoinvolte,
  mappaVuota,
  INTENSITA_MAX,
  INTENSITA_MIN,
  SOGLIA_GRUPPO_BRIDGE,
  type ComandoLuce,
  type ComandoLuceCue,
  type Effetto,
  type GruppoRegia,
  type MappaLuci,
  type NomeEffetto,
  type StatoHue,
} from "../../shared/luci";

export interface DatiLuci {
  bridge: { id: string; ip: string; nome?: string; chiave?: string } | null;
  ipManuale?: string;
  /** Mappa per centralina (chiave = id): resta sul Mac, non entra nell'export. */
  perBridge: Record<string, MappaLuci>;
}
export interface Foto {
  bridgeId: string;
  quando: string;
  luci: Record<string, StatoHue>;
}
export type StatoCentralina = "nessuna" | "daAbbinare" | "abbinata" | "nonRaggiungibile";
export interface Lampadina {
  id: string;
  nome: string;
  nomeBridge: string;
  accesa: boolean;
  raggiungibile: boolean;
}

const TIMEOUT_MS = 2000;
const RICERCA_OGNI_MS = 60_000;
const PROVA_TORNA_DOPO_MS = 3000;

const fileLuci = () => path.join(cartellaDati(), "luci.json");
const fileFoto = () => path.join(cartellaDati(), "luci-foto.json");

export class Luci {
  private dati: DatiLuci;
  private foto: Foto | null = null;
  private raggiungibile = true;
  private coda = new CodaLuci(10);
  private timerCoda: NodeJS.Timeout | null = null;
  private timerRicerca: NodeJS.Timeout | null = null;
  private timerProva: NodeJS.Timeout | null = null;
  private inviando = false;
  /** Intensità master di serata (10–100 %), condivisa, non salvata nel format. */
  private intensita = INTENSITA_MAX;
  private effettoCorrente: NomeEffetto | null = null;

  constructor(private opzioni: { mdns?: boolean } = {}) {
    this.dati = this.carica();
    this.foto = this.caricaFoto();
    this.timerCoda = setInterval(() => void this.svuotaCoda(), 100);
    this.timerCoda.unref();
  }

  // ---- Persistenza ----
  private carica(): DatiLuci {
    try {
      if (fs.existsSync(fileLuci())) {
        const d = JSON.parse(fs.readFileSync(fileLuci(), "utf8")) as Partial<DatiLuci>;
        return { bridge: d.bridge ?? null, ipManuale: d.ipManuale, perBridge: d.perBridge ?? {} };
      }
    } catch {
      /* file rovinato: si riparte */
    }
    return { bridge: null, perBridge: {} };
  }
  private salva(): void {
    try {
      fs.mkdirSync(cartellaDati(), { recursive: true });
      fs.writeFileSync(fileLuci(), JSON.stringify(this.dati, null, 2));
    } catch {
      /* il disco non deve fermare la serata */
    }
  }
  private caricaFoto(): Foto | null {
    try {
      if (fs.existsSync(fileFoto())) return JSON.parse(fs.readFileSync(fileFoto(), "utf8")) as Foto;
    } catch {
      /* foto rovinata */
    }
    return null;
  }
  private salvaFoto(): void {
    try {
      if (this.foto) fs.writeFileSync(fileFoto(), JSON.stringify(this.foto, null, 2));
      else if (fs.existsSync(fileFoto())) fs.unlinkSync(fileFoto());
    } catch {
      /* pazienza */
    }
  }
  /** La mappa della centralina corrente (creata vuota se manca). */
  get mappa(): MappaLuci {
    const id = this.dati.bridge?.id;
    if (!id) return mappaVuota();
    if (!this.dati.perBridge[id]) this.dati.perBridge[id] = mappaVuota();
    return this.dati.perBridge[id]!;
  }

  // ---- HTTP verso la centralina (solo rete locale) ----
  private async http(metodo: string, percorso: string, corpo?: unknown): Promise<unknown> {
    const ip = this.dati.bridge?.ip;
    if (!ip) throw new Error("nessuna centralina");
    const controllo = new AbortController();
    const t = setTimeout(() => controllo.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`http://${ip}${percorso}`, {
        method: metodo,
        headers: corpo !== undefined ? { "content-type": "application/json" } : undefined,
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: controllo.signal,
      });
      this.raggiungibile = true;
      return (await r.json()) as unknown;
    } catch (e) {
      this.raggiungibile = false;
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
  private get chiave(): string | null {
    return this.dati.bridge?.chiave ?? null;
  }
  get abbinata(): boolean {
    return !!this.dati.bridge?.chiave;
  }

  // ---- Stato ----
  /** Il mondo tecnico (Impostazioni → Luci). */
  stato() {
    const b = this.dati.bridge;
    let stato: StatoCentralina = "nessuna";
    if (b && !b.chiave) stato = "daAbbinare";
    else if (b && b.chiave) stato = this.raggiungibile ? "abbinata" : "nonRaggiungibile";
    return {
      stato,
      bridge: b ? { id: b.id, ip: b.ip, nome: b.nome } : null,
      ipManuale: this.dati.ipManuale,
      mappa: this.mappa,
      foto: this.foto !== null,
      intensita: this.intensita,
      effettoCorrente: this.effettoCorrente,
    };
  }
  /** Il mondo di Valerio: solo nomi, colori, se c'è e se risponde. */
  statoLive() {
    const e = this.mappa.effetti;
    return {
      abbinata: this.abbinata,
      raggiungibile: this.abbinata && this.raggiungibile,
      nomi: { luce1: e.luce1.nome, luce2: e.luce2.nome, luce3: e.luce3.nome },
      colori: { luce1: e.luce1.colore, luce2: e.luce2.colore, luce3: e.luce3.colore },
      intensita: this.intensita,
      effettoCorrente: this.effettoCorrente,
    };
  }

  // ---- Scoperta ----
  async provaIp(ip: string): Promise<{ id: string; nome?: string } | null> {
    const controllo = new AbortController();
    const t = setTimeout(() => controllo.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`http://${ip}/api/config`, { signal: controllo.signal });
      const c = (await r.json()) as { bridgeid?: string; name?: string };
      if (!c.bridgeid) return null;
      const precedente = this.dati.bridge;
      this.dati.bridge = { id: c.bridgeid, ip, nome: c.name, chiave: precedente && precedente.id === c.bridgeid ? precedente.chiave : undefined };
      this.raggiungibile = true;
      this.salva();
      return { id: c.bridgeid, nome: c.name };
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  /** Cerca la centralina: IP a mano se dato, altrimenti mDNS (_hue._tcp) per 3 s, poi gli IP noti. */
  async cerca(ipManuale?: string): Promise<{ trovata: boolean; stato: StatoCentralina }> {
    if (ipManuale?.trim()) {
      this.dati.ipManuale = ipManuale.trim();
      this.salva();
      const r = await this.provaIp(ipManuale.trim());
      return { trovata: !!r, stato: this.stato().stato };
    }
    const ip = await this.cercaMdns();
    if (ip && (await this.provaIp(ip))) return { trovata: true, stato: this.stato().stato };
    for (const tentativo of [this.dati.ipManuale, this.dati.bridge?.ip]) {
      if (tentativo && (await this.provaIp(tentativo))) return { trovata: true, stato: this.stato().stato };
    }
    return { trovata: false, stato: this.stato().stato };
  }

  private async cercaMdns(): Promise<string | null> {
    if (this.opzioni.mdns === false || process.env.REGIA_HUE_MDNS === "0") return null;
    try {
      const { default: mdns } = await import("multicast-dns");
      const m = mdns();
      const ipTrovato = await new Promise<string | null>((risolvi) => {
        const t = setTimeout(() => risolvi(null), 3000);
        m.on("response", (risposta: { answers?: { name: string; type: string; data: unknown }[]; additionals?: { name: string; type: string; data: unknown }[] }) => {
          const record = [...(risposta.answers ?? []), ...(risposta.additionals ?? [])];
          const eHue = record.some((r) => r.type === "PTR" && r.name === "_hue._tcp.local");
          const a = record.find((r) => r.type === "A");
          if (eHue && a && typeof a.data === "string") {
            clearTimeout(t);
            risolvi(a.data);
          }
        });
        m.query({ questions: [{ name: "_hue._tcp.local", type: "PTR" }] });
      });
      m.destroy();
      return ipTrovato;
    } catch {
      return null;
    }
  }

  /** All'avvio: cerca la centralina; se c'è una foto non ripristinata la ripristina e lo scrive nel diario; riprova ogni 60 s se manca. */
  avvia(): void {
    void (async () => {
      if (this.dati.bridge) {
        const ok = await this.provaIp(this.dati.bridge.ip);
        if (!ok) await this.cerca();
      }
      await this.ripristinaFotoAllAvvio();
    })();
    this.timerRicerca = setInterval(() => {
      if (this.dati.bridge && !this.raggiungibile) void this.cerca();
    }, RICERCA_OGNI_MS);
    this.timerRicerca.unref();
  }
  /** Separato per le prove. */
  async ripristinaFotoAllAvvio(): Promise<boolean> {
    if (!this.foto || !this.abbinata) return false;
    const r = await this.esegui("torna", "avvio");
    return r.ok;
  }

  // ---- Abbinamento ----
  async abbina(): Promise<{ abbinata: boolean; errore?: string }> {
    if (!this.dati.bridge) return { abbinata: false, errore: "Centralina non trovata" };
    try {
      const r = (await this.http("POST", "/api", { devicetype: `regia#${(os.hostname().split(".")[0] ?? "mac").slice(0, 19)}` })) as
        | { success?: { username: string }; error?: { type: number; description: string } }[]
        | undefined;
      const successo = r?.find((x) => x.success)?.success;
      if (successo) {
        this.dati.bridge.chiave = successo.username;
        this.salva();
        return { abbinata: true };
      }
      const errore = r?.find((x) => x.error)?.error;
      if (errore?.type === 101) return { abbinata: false, errore: "Premi il pulsante rotondo sulla centralina Philips" };
      return { abbinata: false, errore: errore?.description ?? "La centralina non ha risposto" };
    } catch {
      return { abbinata: false, errore: "Centralina non raggiungibile" };
    }
  }

  // ---- Lampadine ----
  async lampadine(): Promise<Lampadina[]> {
    if (!this.chiave) return [];
    try {
      const lights = (await this.http("GET", `/api/${this.chiave}/lights`)) as Record<string, { name?: string; state?: { on?: boolean; reachable?: boolean } }>;
      return Object.entries(lights).map(([id, l]) => ({
        id,
        nome: this.mappa.lampade[id]?.nome ?? l.name ?? `Lampadina ${id}`,
        nomeBridge: l.name ?? `Lampadina ${id}`,
        accesa: l.state?.on === true,
        raggiungibile: l.state?.reachable !== false,
      }));
    } catch {
      return [];
    }
  }
  rinominaLampada(id: string, nome: string): void {
    const n = nome.trim().slice(0, 30);
    if (n) this.mappa.lampade[id] = { nome: n };
    else delete this.mappa.lampade[id];
    this.salva();
  }
  /** Tre lampeggi (alert "select" ×3); la luce torna com'era da sola. */
  lampeggia(id: string): void {
    if (!this.chiave) return;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        void this.http("PUT", `/api/${this.chiave}/lights/${id}/state`, { alert: "select" }).catch(() => undefined);
      }, i * 900);
    }
  }

  // ---- Gruppi della Regia ----
  async creaGruppo(nome: string, luci: string[] = []): Promise<GruppoRegia> {
    const g: GruppoRegia = { id: randomUUID().slice(0, 8), nome: nome.trim().slice(0, 30) || "Gruppo", luci: [...new Set(luci.map(String))] };
    this.mappa.gruppi[g.id] = g;
    await this.sincronizzaGruppoBridge(g);
    this.salva();
    return g;
  }
  async modificaGruppo(id: string, dati: { nome?: string; luci?: string[] }): Promise<GruppoRegia | null> {
    const g = this.mappa.gruppi[id];
    if (!g) return null;
    if (typeof dati.nome === "string" && dati.nome.trim()) g.nome = dati.nome.trim().slice(0, 30);
    if (Array.isArray(dati.luci)) g.luci = [...new Set(dati.luci.map(String))];
    await this.sincronizzaGruppoBridge(g);
    this.salva();
    return g;
  }
  async eliminaGruppo(id: string): Promise<void> {
    const g = this.mappa.gruppi[id];
    if (!g) return;
    if (g.gruppoBridge && this.chiave) await this.http("DELETE", `/api/${this.chiave}/groups/${g.gruppoBridge}`).catch(() => undefined);
    delete this.mappa.gruppi[id];
    for (const e of Object.values(this.mappa.effetti)) delete e.voci[id];
    this.salva();
  }
  /** Un gruppo grande ha un gemello sulla centralina (un comando solo); uno piccolo no. */
  private async sincronizzaGruppoBridge(g: GruppoRegia): Promise<void> {
    if (!this.chiave) return;
    try {
      if (g.luci.length >= SOGLIA_GRUPPO_BRIDGE) {
        if (g.gruppoBridge) {
          await this.http("PUT", `/api/${this.chiave}/groups/${g.gruppoBridge}`, { name: `Regia · ${g.nome}`, lights: g.luci });
        } else {
          const r = (await this.http("POST", `/api/${this.chiave}/groups`, { name: `Regia · ${g.nome}`, type: "LightGroup", lights: g.luci })) as { success?: { id: string } }[];
          const id = r?.find((x) => x.success)?.success?.id;
          if (id) g.gruppoBridge = String(id);
        }
      } else if (g.gruppoBridge) {
        await this.http("DELETE", `/api/${this.chiave}/groups/${g.gruppoBridge}`).catch(() => undefined);
        delete g.gruppoBridge;
      }
    } catch {
      /* senza gemello si va per lampadina: funziona lo stesso */
    }
  }
  /** Le stanze già presenti sulla centralina come punto di partenza. */
  async importaStanze(): Promise<GruppoRegia[]> {
    if (!this.chiave) return [];
    const creati: GruppoRegia[] = [];
    try {
      const groups = (await this.http("GET", `/api/${this.chiave}/groups`)) as Record<string, { name?: string; type?: string; lights?: string[] }>;
      for (const [, g] of Object.entries(groups)) {
        if (g.type !== "Room" && g.type !== "Zone") continue;
        const nome = g.name ?? "Stanza";
        if (Object.values(this.mappa.gruppi).some((x) => x.nome === nome)) continue;
        creati.push(await this.creaGruppo(nome, g.lights ?? []));
      }
    } catch {
      /* niente stanze: si fanno a mano */
    }
    return creati;
  }

  // ---- Effetti ----
  salvaEffetti(effetti: Partial<Record<NomeEffetto, Partial<Effetto>>>): void {
    const m = this.mappa;
    for (const k of ["luce1", "luce2", "luce3"] as NomeEffetto[]) {
      const e = effetti[k];
      if (!e) continue;
      if (typeof e.nome === "string" && e.nome.trim()) m.effetti[k].nome = e.nome.trim().slice(0, 20);
      if (typeof e.colore === "string" && /^#[0-9a-fA-F]{6}$/.test(e.colore)) m.effetti[k].colore = e.colore;
      if (e.voci && typeof e.voci === "object") {
        const voci: Effetto["voci"] = {};
        for (const [gid, v] of Object.entries(e.voci)) {
          if (!m.gruppi[gid] || !v) continue;
          voci[gid] = {
            acceso: v.acceso !== false,
            luminosita: Math.min(100, Math.max(0, Number(v.luminosita) || 0)),
            colore: v.colore ?? "bianco-caldo",
            transizione: Math.min(10, Math.max(0, Number(v.transizione) || 0)),
            ...(Array.isArray(v.luci) ? { luci: v.luci.map(String) } : {}),
          };
        }
        m.effetti[k].voci = voci;
      }
    }
    this.salva();
  }

  // ---- Esecuzione ----
  setIntensita(valore: number): number {
    this.intensita = Math.round(Math.min(INTENSITA_MAX, Math.max(INTENSITA_MIN, valore)));
    // Riapplica subito l'effetto in corso (senza rifotografare: la foto c'è già).
    if (this.effettoCorrente) void this.esegui(this.effettoCorrente, "intensità");
    return this.intensita;
  }

  /** Esegue un effetto o "torna". Senza centralina / non abbinata: niente, in silenzio. */
  async esegui(comando: ComandoLuceCue, origine: string): Promise<{ ok: boolean; errore?: string }> {
    if (!this.abbinata) return { ok: false, errore: "Centralina non abbinata" };
    const chiave = this.chiave!;
    let comandi: ComandoLuce[] = [];
    try {
      if (comando === "torna") {
        this.effettoCorrente = null;
        if (!this.foto) return { ok: true };
        comandi = comandiRipristino(this.foto.luci, 1); // esatti: l'intensità non conta
        this.foto = null;
        this.salvaFoto();
      } else {
        if (!this.foto) {
          // Prima del PRIMO effetto di una catena: foto delle lampadine coinvolte.
          const lights = (await this.http("GET", `/api/${chiave}/lights`)) as Record<string, { state?: Partial<StatoHue> }>;
          const luci: Record<string, StatoHue> = {};
          for (const id of luciCoinvolte(this.mappa)) if (lights[id]?.state) luci[id] = fotografaLuce(lights[id]!.state!);
          this.foto = { bridgeId: this.dati.bridge!.id, quando: new Date().toISOString(), luci };
          this.salvaFoto();
        }
        this.effettoCorrente = comando;
        comandi = effettoInComandi(this.mappa.effetti[comando], this.mappa, this.intensita);
      }
    } catch {
      return { ok: false, errore: "Centralina non raggiungibile" };
    }
    for (const c of comandi) this.coda.aggiungi(c);
    scriviEvento({
      ora: new Date().toISOString(),
      tipo: "luce",
      origine,
      dettagli: { effetto: comando, nome: comando === "torna" ? "torna com'era" : this.mappa.effetti[comando].nome, intensita: this.intensita },
    });
    return this.raggiungibile ? { ok: true } : { ok: false, errore: "Centralina non raggiungibile" };
  }

  /** "Prova" da Impostazioni: l'effetto, poi torna com'era da solo dopo 3 s. */
  async prova(effetto: ComandoLuceCue): Promise<{ ok: boolean; errore?: string }> {
    if (this.timerProva) clearTimeout(this.timerProva);
    const r = await this.esegui(effetto, "prova");
    if (effetto !== "torna") {
      this.timerProva = setTimeout(() => void this.esegui("torna", "prova"), PROVA_TORNA_DOPO_MS);
      this.timerProva.unref();
    }
    return r;
  }

  private async svuotaCoda(): Promise<void> {
    if (this.inviando || !this.chiave) return;
    const c = this.coda.prossimo(Date.now());
    if (!c) return;
    this.inviando = true;
    try {
      const percorso = c.bersaglio.tipo === "gruppo" ? `/groups/${c.bersaglio.id}/action` : `/lights/${c.bersaglio.id}/state`;
      await this.http("PUT", `/api/${this.chiave}${percorso}`, c.stato);
    } catch {
      /* la centralina non risponde: lo dice lo stato; i comandi si perdono in silenzio */
    } finally {
      this.inviando = false;
    }
  }

  /** Solo per le prove: aspetta che la coda sia vuota. */
  async attendiCoda(ms = 4000): Promise<void> {
    const inizio = Date.now();
    while ((this.coda.lunghezza > 0 || this.inviando) && Date.now() - inizio < ms) await new Promise((r) => setTimeout(r, 50));
  }
  /** Solo per le prove. */
  azzera(): void {
    this.dati = { bridge: null, perBridge: {} };
    this.foto = null;
    this.effettoCorrente = null;
    this.intensita = INTENSITA_MAX;
    this.salva();
    this.salvaFoto();
  }
  chiudi(): void {
    if (this.timerCoda) clearInterval(this.timerCoda);
    if (this.timerRicerca) clearInterval(this.timerRicerca);
    if (this.timerProva) clearTimeout(this.timerProva);
  }
}
