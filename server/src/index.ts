// Avvio del server della Regia.
import { spawn } from "node:child_process";
import { creaApp } from "./app";
import { indirizzoLan } from "./rete";
import { cartellaDati } from "./percorsi";

const PORTA = 4000;

async function avvia(): Promise<void> {
  const { app, store, avviaHub } = creaApp();
  avviaHub();

  await app.listen({ port: PORTA, host: "0.0.0.0" });

  // Su Mac: impedisce al computer di addormentarsi finché la Regia è accesa.
  if (process.platform === "darwin") {
    try {
      const caffe = spawn("caffeinate", ["-i", "-w", String(process.pid)], {
        stdio: "ignore",
        detached: false,
      });
      caffe.unref();
    } catch {
      // Non è grave: al massimo il Mac va in stop da solo.
    }
  }

  const ip = indirizzoLan();
  console.log("");
  console.log("  🎭 Regia accesa!");
  console.log(`  Sul Mac:      http://localhost:${PORTA}`);
  console.log(`  Dal telefono: http://${ip}:${PORTA}/telecomando`);
  console.log(`  PIN telecomando: ${store.config.impostazioni.pin}`);
  console.log(`  Dati in: ${cartellaDati()}`);
  console.log("");

  const chiudi = () => {
    store.salvaSubito();
    void app.close().then(() => process.exit(0));
  };
  process.on("SIGINT", chiudi);
  process.on("SIGTERM", chiudi);
}

avvia().catch((e) => {
  console.error("Il server non è partito:", e);
  process.exit(1);
});
