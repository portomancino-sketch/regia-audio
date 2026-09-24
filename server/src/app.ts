// Costruisce l'applicazione Fastify (usata dal server vero e dai test).
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import fs from "node:fs";
import path from "node:path";
import { Store } from "./store";
import { Hub } from "./ws";
import { registraApi } from "./api";
import { Luci } from "./luci";
import { cartellaAudio, cartellaDist } from "./percorsi";

export interface AppRegia {
  app: FastifyInstance;
  store: Store;
  luci: Luci;
  avviaHub: () => Hub;
}

export function creaApp(): AppRegia {
  const store = new Store();
  const luci = new Luci();
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });
  let hub: Hub | null = null;

  void app.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024, files: 40 },
  });

  // I file audio, con supporto Range (serve per i file lunghi).
  void app.register(fastifyStatic, {
    root: cartellaAudio(),
    prefix: "/audio/",
    acceptRanges: true,
    decorateReply: true,
    cacheControl: false,
  });

  // L'interfaccia web (se è stata costruita).
  const dist = cartellaDist();
  const distPronta = fs.existsSync(path.join(dist, "index.html"));
  if (distPronta) {
    void app.register(fastifyStatic, {
      root: dist,
      prefix: "/",
      decorateReply: false,
    });
  }

  registraApi(app, store, () => hub, luci);

  // SPA: ogni pagina non trovata torna a index.html.
  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url ?? "";
    if (req.method === "GET" && !url.startsWith("/api") && !url.startsWith("/audio") && distPronta) {
      return reply.type("text/html").send(fs.readFileSync(path.join(dist, "index.html")));
    }
    return reply.status(404).send({ errore: "Non trovato" });
  });

  return {
    app,
    store,
    luci,
    avviaHub: () => {
      hub = new Hub(app.server, store, luci);
      return hub;
    },
  };
}
