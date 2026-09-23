// Le rotte REST: configurazione, format, fasi, cue, audio, export/import.
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import AdmZip from "adm-zip";
import { parseFile } from "music-metadata";
import type { Config, Cue, Fase, Format } from "../../shared/tipi";
import { puoMettereInEvidenza } from "../../shared/sempre";
import type { Store } from "./store";
import type { Hub } from "./ws";
import { cartellaAudio, cartellaBackup, percorsoConfig } from "./percorsi";
import { indirizzoLan } from "./rete";
import { csvGiorno, elencoGiorni, leggiGiorno } from "./diario";
import { PORTA } from "./porta";

const ESTENSIONI_AUDIO = new Set(["mp3", "wav", "m4a", "aac", "ogg"]);
const ERRORE_FORMATO = "Formato non supportato, usa mp3 o wav";

function estensione(nomeFile: string): string {
  return path.extname(nomeFile).slice(1).toLowerCase();
}

function trovaFormat(config: Config, id: string): Format | undefined {
  return config.formats.find((f) => f.id === id);
}

function trovaFase(config: Config, id: string): { format: Format; fase: Fase } | undefined {
  for (const format of config.formats) {
    const fase = format.fasi.find((f) => f.id === id);
    if (fase) return { format, fase };
  }
  return undefined;
}

function trovaCue(config: Config, id: string): { format: Format; fase: Fase; cue: Cue } | undefined {
  for (const format of config.formats) {
    for (const fase of format.fasi) {
      const cue = fase.cue.find((c) => c.id === id);
      if (cue) return { format, fase, cue };
    }
  }
  return undefined;
}

function cancellaFileCue(cue: Cue): void {
  if (!cue.file) return;
  const percorso = path.join(cartellaAudio(), cue.file);
  if (fs.existsSync(percorso)) fs.unlinkSync(percorso);
}

function copiaFileCue(cue: Cue, nuovoId: string): string | null {
  if (!cue.file) return null;
  const vecchio = path.join(cartellaAudio(), cue.file);
  if (!fs.existsSync(vecchio)) return null;
  const nuovoNome = `${nuovoId}${path.extname(cue.file)}`;
  fs.copyFileSync(vecchio, path.join(cartellaAudio(), nuovoNome));
  return nuovoNome;
}

function duplicaCue(cue: Cue, ordine: number): Cue {
  const id = randomUUID();
  return { ...cue, id, file: copiaFileCue(cue, id), ordine };
}

function riordina<T extends { id: string; ordine: number }>(lista: T[], ordineIds: string[]): void {
  const posizioni = new Map(ordineIds.map((id, i) => [id, i]));
  for (const voce of lista) {
    const p = posizioni.get(voce.id);
    if (p !== undefined) voce.ordine = p;
  }
  lista.sort((a, b) => a.ordine - b.ordine);
  lista.forEach((voce, i) => (voce.ordine = i));
}

function cueNuovo(ordine: number, parziale?: Partial<Cue>): Cue {
  const tipo = parziale?.tipo ?? "effetto";
  return {
    id: randomUUID(),
    titolo: parziale?.titolo ?? "Nuovo suono",
    nota: "",
    tipo,
    file: null,
    fileOriginale: null,
    durataSec: null,
    volume: 1,
    loop: tipo === "sottofondo",
    sulSottofondo: tipo === "brano" ? "pausa" : tipo === "effetto" ? "abbassa" : "niente",
    colore: null,
    ordine,
    evidenza: false,
    ...parziale,
    ...(parziale?.id ? {} : {}),
  };
}

export function registraApi(app: FastifyInstance, store: Store, hub: () => Hub | null): void {
  const cambiata = () => {
    store.salva();
    hub()?.configCambiata();
  };

  // ---- Configurazione ----

  app.get("/api/config", async () => store.config);

  app.put("/api/config", async (req, reply) => {
    const corpo = req.body as Config;
    if (!corpo || corpo.versione !== 1 || !Array.isArray(corpo.formats)) {
      return reply.status(400).send({ errore: "Configurazione non valida" });
    }
    store.sostituisci(corpo);
    hub()?.configCambiata();
    return store.config;
  });

  app.patch("/api/impostazioni", async (req) => {
    const corpo = req.body as Partial<Config["impostazioni"]>;
    const imp = store.config.impostazioni;
    const pinPrima = imp.pin;
    if (typeof corpo.pin === "string" && /^\d{4}$/.test(corpo.pin)) imp.pin = corpo.pin;
    if (typeof corpo.volumeMaster === "number") imp.volumeMaster = Math.min(1, Math.max(0, corpo.volumeMaster));
    if (typeof corpo.fadeOutMs === "number") imp.fadeOutMs = Math.max(100, corpo.fadeOutMs);
    if (typeof corpo.livelloAbbassa === "number") imp.livelloAbbassa = Math.min(1, Math.max(0, corpo.livelloAbbassa));
    if (typeof corpo.livelloParla === "number") imp.livelloParla = Math.min(0.6, Math.max(0, corpo.livelloParla));
    store.salva();
    if (imp.pin !== pinPrima) hub()?.pinCambiato();
    return imp;
  });

  // ---- Format ----

  app.post("/api/formats", async (req) => {
    const { nome } = (req.body ?? {}) as { nome?: string };
    const format: Format = {
      id: randomUUID(),
      nome: nome?.trim() || "Nuovo format",
      ordine: store.config.formats.length,
      fasi: [{ id: randomUUID(), nome: "Sempre", ordine: -1, sempre: true, cue: [] }],
    };
    store.config.formats.push(format);
    cambiata();
    return format;
  });

  app.patch("/api/formats/:id", async (req, reply) => {
    const format = trovaFormat(store.config, (req.params as { id: string }).id);
    if (!format) return reply.status(404).send({ errore: "Format non trovato" });
    const { nome, notaInizio } = (req.body ?? {}) as { nome?: string; notaInizio?: string };
    if (typeof nome === "string" && nome.trim()) format.nome = nome.trim();
    if (typeof notaInizio === "string") format.notaInizio = notaInizio;
    cambiata();
    return format;
  });

  app.post("/api/formats/riordina", async (req) => {
    const { ordine } = (req.body ?? {}) as { ordine?: string[] };
    if (Array.isArray(ordine)) riordina(store.config.formats, ordine);
    cambiata();
    return store.config.formats.map((f) => f.id);
  });

  app.post("/api/formats/:id/duplica", async (req, reply) => {
    const format = trovaFormat(store.config, (req.params as { id: string }).id);
    if (!format) return reply.status(404).send({ errore: "Format non trovato" });
    const copia: Format = {
      id: randomUUID(),
      nome: `${format.nome} (copia)`,
      ordine: store.config.formats.length,
      fasi: format.fasi.map((fase) => ({
        id: randomUUID(),
        nome: fase.nome,
        ordine: fase.ordine,
        sempre: fase.sempre,
        nota: fase.nota,
        cue: fase.cue.map((c, j) => duplicaCue(c, j)),
      })),
    };
    store.config.formats.push(copia);
    cambiata();
    return copia;
  });

  app.delete("/api/formats/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const format = trovaFormat(store.config, id);
    if (!format) return reply.status(404).send({ errore: "Format non trovato" });
    for (const fase of format.fasi) for (const cue of fase.cue) cancellaFileCue(cue);
    store.config.formats = store.config.formats.filter((f) => f.id !== id);
    store.config.formats.forEach((f, i) => (f.ordine = i));
    cambiata();
    return { fatto: true };
  });

  // ---- Fasi ----

  app.post("/api/formats/:id/fasi", async (req, reply) => {
    const format = trovaFormat(store.config, (req.params as { id: string }).id);
    if (!format) return reply.status(404).send({ errore: "Format non trovato" });
    const { nome } = (req.body ?? {}) as { nome?: string };
    const fase: Fase = {
      id: randomUUID(),
      nome: nome?.trim() || "Nuova fase",
      ordine: format.fasi.length,
      cue: [],
    };
    format.fasi.push(fase);
    cambiata();
    return fase;
  });

  app.patch("/api/fasi/:id", async (req, reply) => {
    const trovata = trovaFase(store.config, (req.params as { id: string }).id);
    if (!trovata) return reply.status(404).send({ errore: "Fase non trovata" });
    const { nome, nota } = (req.body ?? {}) as { nome?: string; nota?: string };
    if (typeof nome === "string" && nome.trim() && !trovata.fase.sempre) trovata.fase.nome = nome.trim();
    if (typeof nota === "string") trovata.fase.nota = nota;
    cambiata();
    return trovata.fase;
  });

  app.post("/api/formats/:id/fasi/riordina", async (req, reply) => {
    const format = trovaFormat(store.config, (req.params as { id: string }).id);
    if (!format) return reply.status(404).send({ errore: "Format non trovato" });
    const { ordine } = (req.body ?? {}) as { ordine?: string[] };
    if (Array.isArray(ordine)) {
      const normali = format.fasi.filter((f) => !f.sempre);
      riordina(normali, ordine.filter((id2) => normali.some((f) => f.id === id2)));
    }
    cambiata();
    return format.fasi.map((f) => f.id);
  });

  app.post("/api/fasi/:id/duplica", async (req, reply) => {
    const trovata = trovaFase(store.config, (req.params as { id: string }).id);
    if (!trovata) return reply.status(404).send({ errore: "Fase non trovata" });
    const copia: Fase = {
      id: randomUUID(),
      nome: `${trovata.fase.nome} (copia)`,
      ordine: trovata.format.fasi.length,
      cue: trovata.fase.cue.map((c, j) => duplicaCue(c, j)),
    };
    // La copia della riga Sempre è una fase normale (di Sempre ce n'è una sola).
    trovata.format.fasi.push(copia);
    cambiata();
    return copia;
  });

  app.delete("/api/fasi/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const trovata = trovaFase(store.config, id);
    if (!trovata) return reply.status(404).send({ errore: "Fase non trovata" });
    if (trovata.fase.sempre) return reply.status(400).send({ errore: "La riga Sempre non si può eliminare" });
    for (const cue of trovata.fase.cue) cancellaFileCue(cue);
    trovata.format.fasi = trovata.format.fasi.filter((f) => f.id !== id);
    trovata.format.fasi.forEach((f, i) => (f.ordine = i));
    cambiata();
    return { fatto: true };
  });

  // ---- Cue ----

  app.post("/api/fasi/:id/cue", async (req, reply) => {
    const trovata = trovaFase(store.config, (req.params as { id: string }).id);
    if (!trovata) return reply.status(404).send({ errore: "Fase non trovata" });
    const corpo = (req.body ?? {}) as Partial<Cue>;
    const cue = cueNuovo(trovata.fase.cue.length, corpo);
    trovata.fase.cue.push(cue);
    cambiata();
    return cue;
  });

  app.patch("/api/cue/:id", async (req, reply) => {
    const trovato = trovaCue(store.config, (req.params as { id: string }).id);
    if (!trovato) return reply.status(404).send({ errore: "Casella non trovata" });
    const c = trovato.cue;
    const corpo = (req.body ?? {}) as Partial<Cue>;
    if (typeof corpo.titolo === "string") c.titolo = corpo.titolo;
    if (typeof corpo.nota === "string") c.nota = corpo.nota;
    if (
      corpo.tipo === "sottofondo" ||
      corpo.tipo === "brano" ||
      corpo.tipo === "effetto" ||
      corpo.tipo === "promemoria"
    ) {
      if (corpo.tipo !== c.tipo) {
        c.tipo = corpo.tipo;
        // Valori sensati quando si cambia tipo. Il file resta: se si torna
        // a un tipo audio, non si perde nulla.
        c.loop = c.tipo === "sottofondo";
        if (c.tipo === "brano") c.sulSottofondo = "pausa";
        else if (c.tipo === "effetto") c.sulSottofondo = "abbassa";
        else c.sulSottofondo = "niente";
      }
    }
    if (typeof corpo.volume === "number") c.volume = Math.min(1, Math.max(0, corpo.volume));
    if (typeof corpo.loop === "boolean") c.loop = corpo.loop;
    if (corpo.sulSottofondo === "niente" || corpo.sulSottofondo === "abbassa" || corpo.sulSottofondo === "pausa") {
      c.sulSottofondo = corpo.sulSottofondo;
    }
    if (corpo.colore === null || typeof corpo.colore === "string") c.colore = corpo.colore ?? null;
    if (typeof corpo.evidenza === "boolean") {
      // "In evidenza" vale solo nella riga Sempre, massimo 4.
      if (corpo.evidenza && !trovato.fase.sempre) {
        return reply.status(400).send({ errore: "Solo le caselle della riga Sempre possono essere in evidenza" });
      }
      if (corpo.evidenza && !puoMettereInEvidenza(trovato.fase.cue, c.id)) {
        return reply.status(400).send({ errore: "Massimo 4 in evidenza" });
      }
      c.evidenza = corpo.evidenza;
    }
    cambiata();
    return c;
  });

  app.post("/api/fasi/:id/cue/riordina", async (req, reply) => {
    const trovata = trovaFase(store.config, (req.params as { id: string }).id);
    if (!trovata) return reply.status(404).send({ errore: "Fase non trovata" });
    const { ordine } = (req.body ?? {}) as { ordine?: string[] };
    if (Array.isArray(ordine)) riordina(trovata.fase.cue, ordine);
    cambiata();
    return trovata.fase.cue.map((c) => c.id);
  });

  app.post("/api/cue/:id/duplica", async (req, reply) => {
    const trovato = trovaCue(store.config, (req.params as { id: string }).id);
    if (!trovato) return reply.status(404).send({ errore: "Casella non trovata" });
    const copia = duplicaCue(trovato.cue, trovato.fase.cue.length);
    copia.titolo = `${trovato.cue.titolo} (copia)`;
    copia.evidenza = false; // la copia non ruba un posto tra le 4 in evidenza
    trovato.fase.cue.push(copia);
    cambiata();
    return copia;
  });

  app.delete("/api/cue/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const trovato = trovaCue(store.config, id);
    if (!trovato) return reply.status(404).send({ errore: "Casella non trovata" });
    cancellaFileCue(trovato.cue);
    trovato.fase.cue = trovato.fase.cue.filter((c) => c.id !== id);
    trovato.fase.cue.forEach((c, i) => (c.ordine = i));
    cambiata();
    return { fatto: true };
  });

  // ---- Audio ----

  async function salvaAudio(cue: Cue, nomeOriginale: string, stream: NodeJS.ReadableStream): Promise<void> {
    const ext = estensione(nomeOriginale);
    if (!ESTENSIONI_AUDIO.has(ext)) throw new Error(ERRORE_FORMATO);
    // Sostituire il file di un cue cancella il vecchio.
    cancellaFileCue(cue);
    const nomeFile = `${cue.id}.${ext}`;
    const percorso = path.join(cartellaAudio(), nomeFile);
    await pipeline(stream, fs.createWriteStream(percorso));
    cue.file = nomeFile;
    cue.fileOriginale = nomeOriginale;
    try {
      const meta = await parseFile(percorso);
      cue.durataSec = meta.format.duration ? Math.round(meta.format.duration * 10) / 10 : null;
    } catch {
      cue.durataSec = null;
    }
  }

  app.post("/api/cue/:id/audio", async (req, reply) => {
    const trovato = trovaCue(store.config, (req.params as { id: string }).id);
    if (!trovato) return reply.status(404).send({ errore: "Casella non trovata" });
    const file = await req.file();
    if (!file) return reply.status(400).send({ errore: "Nessun file ricevuto" });
    try {
      await salvaAudio(trovato.cue, file.filename, file.file);
    } catch (e) {
      return reply.status(400).send({ errore: e instanceof Error ? e.message : ERRORE_FORMATO });
    }
    cambiata();
    return trovato.cue;
  });

  app.post("/api/fasi/:id/audio-multipli", async (req, reply) => {
    const trovata = trovaFase(store.config, (req.params as { id: string }).id);
    if (!trovata) return reply.status(404).send({ errore: "Fase non trovata" });
    const creati: Cue[] = [];
    const scartati: string[] = [];
    for await (const file of req.files()) {
      const ext = estensione(file.filename);
      if (!ESTENSIONI_AUDIO.has(ext)) {
        scartati.push(file.filename);
        await file.toBuffer().catch(() => undefined); // scarta il contenuto
        continue;
      }
      const titolo = path.basename(file.filename, path.extname(file.filename));
      const cue = cueNuovo(trovata.fase.cue.length, { titolo, tipo: "effetto" });
      trovata.fase.cue.push(cue);
      await salvaAudio(cue, file.filename, file.file);
      creati.push(cue);
    }
    cambiata();
    if (creati.length === 0 && scartati.length > 0) {
      return reply.status(400).send({ errore: ERRORE_FORMATO, scartati });
    }
    return { creati, scartati };
  });

  // ---- Export / Import ----

  app.get("/api/export.zip", async (_req, reply) => {
    store.salvaSubito();
    const zip = archiver("zip", { zlib: { level: 1 } });
    zip.file(percorsoConfig(), { name: "regia.json" });
    zip.directory(cartellaAudio(), "audio");
    void zip.finalize();
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", 'attachment; filename="regia-export.zip"');
    return reply.send(zip);
  });

  app.post("/api/import", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.status(400).send({ errore: "Nessun file ricevuto" });
    const temp = path.join(os.tmpdir(), `regia-import-${Date.now()}.zip`);
    await pipeline(file.file, fs.createWriteStream(temp));

    let zip: AdmZip;
    let nuovaConfig: Config;
    try {
      zip = new AdmZip(temp);
      const voce = zip.getEntry("regia.json");
      if (!voce) throw new Error("Il file non è un export della Regia");
      nuovaConfig = JSON.parse(zip.readAsText(voce)) as Config;
      if (nuovaConfig.versione !== 1) throw new Error("Versione del file non riconosciuta");
    } catch (e) {
      fs.unlinkSync(temp);
      return reply.status(400).send({ errore: e instanceof Error ? e.message : "File non valido" });
    }

    // Backup automatico di quello che c'è ora.
    const d = new Date();
    const z = (n: number) => String(n).padStart(2, "0");
    const cartella = path.join(
      cartellaBackup(),
      `import-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`,
    );
    fs.mkdirSync(cartella, { recursive: true });
    store.salvaSubito();
    fs.copyFileSync(percorsoConfig(), path.join(cartella, "regia.json"));
    fs.renameSync(cartellaAudio(), path.join(cartella, "audio"));
    fs.mkdirSync(cartellaAudio(), { recursive: true });

    // Poi sostituisce tutto.
    for (const voce of zip.getEntries()) {
      if (voce.entryName.startsWith("audio/") && !voce.isDirectory) {
        const nome = path.basename(voce.entryName);
        fs.writeFileSync(path.join(cartellaAudio(), nome), voce.getData());
      }
    }
    store.sostituisci(nuovaConfig);
    store.salvaSubito();
    fs.unlinkSync(temp);
    hub()?.configCambiata();
    return { fatto: true };
  });

  // ---- Diario di serata ----

  app.get("/api/diario", async () => elencoGiorni());

  app.get("/api/diario/:data", async (req) => ({
    eventi: leggiGiorno((req.params as { data: string }).data),
  }));

  app.get("/api/diario/:data/csv", async (req, reply) => {
    const data = (req.params as { data: string }).data;
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="diario-${data}.csv"`);
    return csvGiorno(data);
  });

  // ---- Rete ----

  app.get("/api/rete", async () => {
    const ip = indirizzoLan();
    return {
      ip,
      urlTelecomando: `http://${ip}:${PORTA}/telecomando`,
      pin: store.config.impostazioni.pin,
    };
  });
}
