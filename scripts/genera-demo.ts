// Rigenera i suoni di prova e aggiunge il format "Demo — Orient Express".
// Uso: npm run genera-demo
import fs from "node:fs";
import { creaFormatDemo } from "../server/src/demo";
import { cartellaAudio, cartellaDati, percorsoConfig } from "../server/src/percorsi";
import type { Config } from "../shared/tipi";

fs.mkdirSync(cartellaAudio(), { recursive: true });

const percorso = percorsoConfig();
if (!fs.existsSync(percorso)) {
  console.log("Non c'è ancora una configurazione: parte il server e la crea da sola.");
  console.log("Avvia prima la Regia con: npm start");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(percorso, "utf8")) as Config;
const demo = creaFormatDemo(cartellaAudio());
demo.ordine = config.formats.length;
config.formats.push(demo);
fs.writeFileSync(percorso, JSON.stringify(config, null, 2));

console.log(`Fatto: "${demo.nome}" aggiunto in ${cartellaDati()}`);
console.log("Se la Regia era aperta, ricarica la pagina.");
