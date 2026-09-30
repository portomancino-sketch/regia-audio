// Screenshot dei 3 bug S-FIX (sovrapposizioni, soundcheck non saltabile, nessuna uscita)
// a 1280×800, 1440×900, 1920×1080 e 390×844.
// Uso: node scripts/collaudo/screenshot-sfix.mjs prima|dopo   (serve la build in dist/)
import fs from "node:fs";
import { attendi, avviaBrowser, avviaServer, nuovaPagina, preparaSempre } from "./banco.mjs";

const quando = process.argv[2] === "prima" ? "prima" : "dopo";
const CARTELLA = "docs/screenshots/sfix";
fs.mkdirSync(CARTELLA, { recursive: true });

const srv = await avviaServer({ porta: 4971 });
const browser = await avviaBrowser();
try {
  const cfg = await (await fetch(`${srv.base}/api/config`)).json();
  const demo = cfg.formats[0];
  await preparaSempre(srv.base, demo.id, 6);
  // Un soundcheck di oggi CON problemi (un file mancante): il caso che bloccava la serata.
  const primaCasella = demo.fasi.find((f) => !f.sempre).cue[0];
  await fetch(`${srv.base}/api/serata/soundcheck`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ formatId: demo.id, caselle: 20, problemi: 1, mancanti: [{ cueId: primaCasella.id, titolo: primaCasella.titolo, esito: "mancante" }] }),
  });

  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080], [390, 844]]) {
    const telefono = w < 500;
    const page = await nuovaPagina(browser, { w, h, mobile: telefono });
    await page.goto(`${srv.base}/format/${demo.id}`);
    await page.waitForLoadState("networkidle");
    const attiva = page.getByRole("button", { name: "Attiva audio" });
    if (await attiva.isVisible().catch(() => false)) await attiva.click();
    await page.locator("button", { hasText: /^Live$/ }).first().click({ timeout: 3000 }).catch(async () => {
      console.log(`  ${w}×${h}: "Live" coperto nella barra, uso il tasto (bug)`);
      await page.locator("button", { hasText: /^Live$/ }).first().click({ force: true });
    });
    await attendi(700);
    await page.screenshot({ path: `${CARTELLA}/${quando}-${w}x${h}-1-foglio.png` });
    // Chiude il foglio col pulsante principale (clic vero), se si riesce.
    const principale = page.getByRole("dialog").getByRole("button", { name: /Ok, pronti|Vai lo stesso/ });
    let chiuso = false;
    try {
      await principale.click({ timeout: 2000 });
      chiuso = true;
    } catch {
      /* coperto: è il bug */
    }
    console.log(`  ${w}×${h}: pulsante principale del foglio ${chiuso ? "cliccabile" : "NON cliccabile (coperto)"}`);
    if (!chiuso) await page.keyboard.press("Escape");
    await attendi(400);
    // La griglia scrollata fino in fondo: l'ultimo pulsante non deve stare sotto il dock.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await attendi(300);
    await page.screenshot({ path: `${CARTELLA}/${quando}-${w}x${h}-2-griglia.png` });
    await page.context().close();
  }
} finally {
  await browser.close();
  srv.stop();
}
console.log(`Screenshot "${quando}" in ${CARTELLA}`);
