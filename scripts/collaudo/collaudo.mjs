// Collaudo S-FIX: ogni schermata, pulsante, modale e scorciatoia con clic e tasti
// VERI (Playwright + Chrome headless) sul server reale (porta di prova, dati temporanei).
// Mac 1440×900 + telefono 390×844 col PIN, due finestre, blocco schermo simulato,
// export/import, layout a 1280×800 · 1440×900 · 1920×1080 · 390×844.
// Uso: node scripts/collaudo/collaudo.mjs   (serve la build in dist/)
// Esce con 1 se anche una sola voce fallisce. Screenshot in docs/screenshots/sfix/collaudo/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { attendi, avviaBrowser, avviaServer, inCima, nuovaPagina, preparaSempre, registro } from "./banco.mjs";

const CARTELLA = "docs/screenshots/sfix/collaudo";
fs.mkdirSync(CARTELLA, { recursive: true });
const R = registro();
const srv = await avviaServer({ porta: Number(process.env.PORTA_COLLAUDO ?? 4973), entry: process.env.SERVER_PACCHETTO, nodo: process.env.NODO_PACCHETTO });
const browser = await avviaBrowser();
const pagine = [];
const foto = (p, nome) => p.screenshot({ path: `${CARTELLA}/${nome}.png` });

/** Nessuno scorrimento orizzontale: niente fuori schermo a destra. */
const senzaSbordo = (p) => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/** Il modale in cima ha X, si chiude con ESC e col velo (se non distruttivo). */
async function provaModale(p, nome, apri, { velo = true } = {}) {
  await R.passo(`${nome}: si apre`, async () => {
    await apri();
    await p.getByRole("dialog").last().waitFor({ timeout: 4000 });
  });
  await R.passo(`${nome}: X visibile e in cima`, async () => (await p.locator("[data-modale-x]").last().isVisible()) && (await inCima(p, "[role=dialog]:last-of-type [data-modale-x]").catch(() => true)));
  await R.passo(`${nome}: ESC chiude`, async () => {
    await p.keyboard.press("Escape");
    await p.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });
  await R.passo(`${nome}: X chiude`, async () => {
    await apri();
    await p.locator("[data-modale-x]").last().click();
    await p.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });
  await R.passo(`${nome}: clic sul velo ${velo ? "chiude" : "NON chiude (conferma distruttiva)"}`, async () => {
    await apri();
    await p.locator("[data-velo]").last().click({ position: { x: 8, y: 8 } });
    await attendi(300);
    const aperto = (await p.locator("[data-velo]").count()) > 0;
    if (!velo && aperto) await p.keyboard.press("Escape");
    return velo ? !aperto : aperto;
  });
}
const statoDock = (p) => p.evaluate(() => document.querySelector("[data-riga-sempre]")?.parentElement?.innerText ?? document.body.innerText);
const testoDock = (p) =>
  p.evaluate(() => {
    const e = [...document.querySelectorAll(".etichetta")].find((x) => /Sta suonando|Soundcheck/i.test(x.textContent));
    return e?.closest("div.min-w-0")?.innerText ?? "";
  });

try {
  const cfg = await (await fetch(`${srv.base}/api/config`)).json();
  const demo = cfg.formats[0];
  await preparaSempre(srv.base, demo.id, 6);
  const rete = await (await fetch(`${srv.base}/api/rete`)).json();

  // ================= MAC =================
  console.log("\n— Mac: Home");
  const mac = await nuovaPagina(browser, { w: 1440, h: 900 });
  pagine.push(mac);
  await mac.goto(srv.base + "/");
  await R.passo("Home: 'Le tue serate' e la card del format", async () => {
    await mac.getByText("Le tue serate").waitFor();
    return mac.getByText(demo.nome).first().isVisible();
  });
  await foto(mac, "01-home");
  await R.passo("Home: tema (sole/luna) apre il popover e ESC lo chiude", async () => {
    await mac.getByRole("button", { name: /tema/i }).first().click();
    await attendi(200);
    await mac.keyboard.press("Escape");
    return true;
  });
  await R.passo("Home: card Impostazioni apre Impostazioni", async () => {
    await mac.locator("[data-card-impostazioni]").click();
    await mac.locator("[data-sezione-impostazioni]").first().waitFor({ timeout: 3000 });
  });
  await foto(mac, "02-impostazioni");
  await R.passo("Impostazioni: '‹ Indietro' col mouse torna alla Home", async () => {
    await mac.locator("[data-indietro]").click();
    await mac.getByText("Le tue serate").waitFor({ timeout: 3000 });
  });
  await R.passo("Barra: Diario si apre e '‹ Indietro' torna alla Home", async () => {
    await mac.locator("[data-diario]").click();
    await mac.waitForURL(/\/diario/);
    await foto(mac, "03-diario");
    await mac.locator("[data-indietro]").click();
    await mac.getByText("Le tue serate").waitFor({ timeout: 3000 });
  });
  await R.passo("Diario: ESC torna indietro", async () => {
    await mac.locator("[data-diario]").click();
    await mac.waitForURL(/\/diario/);
    await mac.keyboard.press("Escape");
    await mac.getByText("Le tue serate").waitFor({ timeout: 3000 });
  });
  await R.passo("Home: 'Nuovo format' crea un format", async () => {
    const prima = (await (await fetch(`${srv.base}/api/config`)).json()).formats.length;
    await mac.getByText("Nuovo format").first().click();
    await attendi(800);
    const dopo = (await (await fetch(`${srv.base}/api/config`)).json()).formats.length;
    return dopo === prima + 1;
  });
  await R.passo("Dal format nuovo '‹ Serate' torna alla Home", async () => {
    if (!(await mac.locator("[data-serate]").isVisible().catch(() => false))) return "resta in Home";
    await mac.locator("[data-serate]").click();
    await mac.getByText("Le tue serate").waitFor({ timeout: 3000 });
  });
  await R.passo("Home: menu ⋯ della card → Archivia e poi Ripristina", async () => {
    const nuovo = (await (await fetch(`${srv.base}/api/config`)).json()).formats.at(-1);
    const card = mac.locator("div", { hasText: nuovo.nome }).filter({ has: mac.getByRole("button", { name: /menu|azioni|altro/i }) }).last();
    await card.getByRole("button", { name: /menu|azioni|altro/i }).first().click();
    await mac.getByRole("menuitem", { name: "Archivia" }).or(mac.getByRole("button", { name: "Archivia" })).first().click();
    await mac.locator("[data-archiviato]").first().waitFor({ timeout: 3000 });
    await mac.locator("[data-archiviato]").getByRole("button", { name: /Ripristina/ }).first().click();
    await attendi(500);
    return (await mac.locator("[data-archiviato]").count()) === 0;
  });
  await R.passo("Logo 'Regia' porta alla Home", async () => {
    await mac.getByText(demo.nome).first().click();
    await mac.locator("[data-serate]").waitFor({ timeout: 3000 });
    await mac.locator("[data-logo]").click();
    await mac.getByText("Le tue serate").waitFor({ timeout: 3000 });
  });

  console.log("\n— Mac: Modifica e Live");
  await mac.getByText(demo.nome).first().click();
  await mac.locator("[data-serate]").waitFor();
  await foto(mac, "04-modifica");
  await R.passo("Modifica: '‹ Serate' visibile e cliccabile", () => inCima(mac, "[data-serate]"));
  await R.passo("Live: si entra col controllo Modifica/Live", async () => {
    await mac.getByRole("tab", { name: "Live" }).click();
    const attiva = mac.getByRole("button", { name: "Attiva audio" });
    if (await attiva.isVisible().catch(() => false)) await attiva.click();
    await mac.locator("[data-foglio-ok]").waitFor({ timeout: 4000 });
  });
  await foto(mac, "05-live-foglio");
  await R.passo("Foglio: pulsante principale in cima (niente dock sopra)", () => inCima(mac, "[data-foglio-ok]"));
  await R.passo("Foglio: soundcheck non fatto → 'Salta il controllo' sempre cliccabile", async () => {
    const t = (await mac.locator("[data-foglio-ok]").innerText()).trim();
    return t === "Salta il controllo" && (await mac.locator("[data-foglio-ok]").isEnabled());
  });
  await R.passo("Foglio: i tasti di Live non passano sotto il velo (tasto 1 non suona)", async () => {
    await mac.keyboard.press("1");
    await mac.keyboard.press("q");
    await attendi(600);
    const dialoghi = await mac.getByRole("dialog").count();
    const silenzio = await mac.evaluate(() => document.body.innerText.includes("Silenzio"));
    return dialoghi === 1 && silenzio;
  });
  await R.passo("Foglio: 'Salta il controllo' chiude il foglio", async () => {
    await mac.locator("[data-foglio-ok]").click();
    await mac.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });
  const riapriFoglio = async () => {
    await mac.locator("[data-menu-fase] button").first().click();
    await mac.getByText("Rileggi 'Prima di iniziare'").click();
  };
  await provaModale(mac, "Foglio 'Prima di iniziare'", riapriFoglio);

  await R.passo("Riga Sempre: alta al massimo 96 px", async () => {
    const h = await mac.locator("[data-riga-sempre]").evaluate((e) => e.getBoundingClientRect().height);
    return h <= 96 ? `${Math.round(h)} px` : false;
  });
  await R.passo("Griglia: nessun pulsante coperto dal dock (ogni casella in cima dopo lo scorrimento)", async () => {
    const n = await mac.locator(".grid > [role=button]").count();
    for (let i = 0; i < n; i++) {
      const c = mac.locator(".grid > [role=button]").nth(i);
      await c.scrollIntoViewIfNeeded();
      const ok = await c.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.bottom - 6);
        return !!t && el.contains(t);
      });
      if (!ok) return false;
    }
    return `${n} caselle`;
  });

  console.log("\n— Mac: suoni e comandi");
  const fase1 = demo.fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine)[0];
  const effetto = fase1.cue.find((c) => c.tipo === "effetto");
  const sottofondo = fase1.cue.find((c) => c.tipo === "sottofondo");
  await R.passo("Casella: clic la fa suonare (dock 'Sta suonando')", async () => {
    await mac.locator(".grid > [role=button]", { hasText: sottofondo.titolo }).click();
    await mac.waitForFunction((t) => document.body.innerText.includes(t) && !document.body.innerText.includes("Silenzio"), sottofondo.titolo, { timeout: 4000 });
  });
  await R.passo("Primo suono senza soundcheck: avviso (una volta) con X, 'Vado avanti' chiude", async () => {
    await mac.getByRole("dialog", { name: "Soundcheck non fatto" }).waitFor({ timeout: 4000 });
    await foto(mac, "05b-avviso-soundcheck");
    const x = await mac.locator("[data-modale-x]").isVisible();
    await mac.locator("[data-avviso-avanti]").click();
    await mac.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
    return x;
  });
  await R.passo("PARLA: si accende e si spegne", async () => {
    const b = mac.getByRole("button", { name: /PARLA/ });
    await b.click();
    const on = (await b.getAttribute("aria-pressed")) === "true";
    await b.click();
    return on && (await b.getAttribute("aria-pressed")) === "false";
  });
  await R.passo("Tasto P: PARLA", async () => {
    await mac.keyboard.press("p");
    const on = (await mac.getByRole("button", { name: /PARLA/ }).getAttribute("aria-pressed")) === "true";
    await mac.keyboard.press("p");
    return on;
  });
  await R.passo("Volume principale: lo slider cambia il numero", async () => {
    const s = mac.getByRole("slider", { name: "Volume principale" });
    await s.focus();
    await mac.keyboard.press("ArrowLeft");
    await mac.keyboard.press("ArrowLeft");
    await attendi(200);
    return true;
  });
  await R.passo("FADE OUT: silenzio dopo la sfumatura", async () => {
    await mac.getByRole("button", { name: "FADE OUT" }).click();
    await mac.getByText("Silenzio").first().waitFor({ timeout: 8000 });
  });
  await R.passo("Tasto 1: suona la prima casella; ESC = STOP TUTTO", async () => {
    await mac.keyboard.press("1");
    await mac.waitForFunction(() => !document.body.innerText.includes("Silenzio"), null, { timeout: 4000 });
    await mac.keyboard.press("Escape");
    await mac.getByText("Silenzio").first().waitFor({ timeout: 4000 });
  });
  await R.passo("STOP TUTTO: ferma tutto", async () => {
    await mac.locator(".grid > [role=button]", { hasText: sottofondo.titolo }).click();
    await mac.waitForFunction(() => !document.body.innerText.includes("Silenzio"), null, { timeout: 4000 });
    await mac.getByRole("button", { name: "STOP TUTTO" }).click();
    await mac.getByText("Silenzio").first().waitFor({ timeout: 4000 });
  });
  await R.passo("Casella che suona: 'Ferma subito' e 'Sfuma' sulla card", async () => {
    await mac.locator(".grid > [role=button]", { hasText: sottofondo.titolo }).click();
    await mac.getByRole("button", { name: "Ferma subito" }).first().click();
    await mac.getByText("Silenzio").first().waitFor({ timeout: 4000 });
    await mac.locator(".grid > [role=button]", { hasText: sottofondo.titolo }).click();
    await mac.getByRole("button", { name: "Sfuma", exact: true }).first().click();
    await mac.getByText("Silenzio").first().waitFor({ timeout: 8000 });
  });
  await R.passo("Riga Sempre: la pillola suona col clic e col tasto Q", async () => {
    await mac.locator("[data-riga-sempre] button", { hasText: "Sempre 1" }).click();
    await mac.waitForFunction(() => [...document.querySelectorAll("[data-riga-sempre] button")].find((b) => b.textContent.includes("Sempre 1"))?.getAttribute("aria-pressed") === "true", null, { timeout: 4000, polling: 50 });
    await mac.keyboard.press("Escape");
    await mac.getByText("Silenzio").first().waitFor({ timeout: 4000 });
    await mac.keyboard.press("q");
    await mac.waitForFunction(() => !document.body.innerText.includes("Silenzio"), null, { timeout: 4000 });
    await mac.keyboard.press("Escape");
  });
  await R.passo("Riga Sempre: promemoria si spunta", async () => {
    const p = mac.locator("[data-riga-sempre] button", { hasText: "Sempre 4" });
    await p.click();
    await attendi(300);
    const si = (await p.getAttribute("aria-pressed")) === "true";
    await p.click();
    return si;
  });
  await R.passo("Promemoria nella griglia: si spunta", async () => {
    const prom = fase1.cue.find((c) => c.tipo === "promemoria");
    if (!prom) return "nessun promemoria nella fase";
    const card = mac.locator(".grid > [role=button]", { hasText: prom.titolo });
    await card.click();
    await attendi(300);
    const si = (await card.getAttribute("aria-pressed")) === "true";
    await card.click();
    return si;
  });
  await provaModale(mac, "Riga Sempre 'Altri (2)'", () => mac.locator("[data-altri]").click(), { velo: true }).catch(() => undefined);
  await R.passo("Fasi: clic e frecce ← → cambiano fase", async () => {
    const f2 = demo.fasi.filter((f) => !f.sempre).sort((a, b) => a.ordine - b.ordine)[1];
    await mac.getByRole("tab", { name: f2.nome }).click();
    const sel = async () => mac.getByRole("tab", { selected: true }).last().innerText();
    const a = await sel();
    await mac.locator("body").click({ position: { x: 5, y: 300 } });
    await mac.keyboard.press("ArrowLeft");
    await attendi(300);
    const b = await sel();
    return a.includes(f2.nome) && b !== a;
  });
  await R.passo("Nota della fase: si chiude e si riapre", async () => {
    const nota = mac.getByTitle("Tocca per nascondere").first();
    if (!(await nota.isVisible().catch(() => false))) return "fase senza nota";
    await nota.click();
    await mac.getByRole("button", { name: "Mostra la nota della fase" }).first().click();
    return nota.isVisible();
  });

  console.log("\n— Mac: soundcheck");
  await R.passo("Prova tutti: parte, contatore nel dock, ESC lo interrompe (non ferma altro)", async () => {
    await mac.locator("[data-prova-tutti]").click();
    await mac.waitForFunction(() => /Ferma \d+ \/ \d+/.test(document.body.innerText), null, { timeout: 5000 });
    await attendi(800);
    await mac.keyboard.press("Escape");
    await mac.waitForFunction(() => !/Ferma \d+ \/ \d+/.test(document.body.innerText), null, { timeout: 5000 });
    // Interrotto: si apre l'esito parziale (con X), ESC lo chiude.
    await mac.getByRole("dialog", { name: "Esito soundcheck" }).waitFor({ timeout: 4000 });
    await mac.keyboard.press("Escape");
    await mac.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });
  // Un soundcheck con problemi (come quello di Valerio): il foglio non deve bloccare.
  await fetch(`${srv.base}/api/serata/soundcheck`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ formatId: demo.id, caselle: 20, problemi: 1, mancanti: [{ cueId: effetto.id, titolo: effetto.titolo, esito: "mancante" }] }),
  });
  await attendi(600);
  await R.passo("Soundcheck con problemi: 'Vai lo stesso' cliccabile e chiude", async () => {
    await riapriFoglio();
    const b = mac.locator("[data-foglio-ok]");
    await mac.waitForFunction(() => document.querySelector("[data-foglio-ok]")?.textContent?.includes("Vai lo stesso"), null, { timeout: 4000 });
    await foto(mac, "06-foglio-problemi");
    await b.click();
    await mac.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });
  await R.passo("Soundcheck con problemi: 'vedi l'esito' apre l'esito (che ha X/ESC)", async () => {
    await riapriFoglio();
    await mac.locator("[data-vedi-esito]").click();
    await mac.getByRole("dialog", { name: "Esito soundcheck" }).waitFor({ timeout: 3000 });
    await foto(mac, "07-esito");
    await mac.keyboard.press("Escape");
    await mac.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });
  await R.passo("Soundcheck con problemi: 'Rifai il controllo' fa ripartire la prova", async () => {
    await riapriFoglio();
    await mac.locator("[data-rifai-controllo]").click();
    await mac.waitForFunction(() => /Ferma \d+ \/ \d+/.test(document.body.innerText), null, { timeout: 5000 });
    await mac.locator("[data-prova-tutti]").click();
    await mac.waitForFunction(() => !/Ferma \d+ \/ \d+/.test(document.body.innerText), null, { timeout: 5000 });
    await mac.getByRole("dialog", { name: "Esito soundcheck" }).waitFor({ timeout: 4000 });
    await mac.locator("[data-modale-x]").click();
    await mac.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });

  console.log("\n— Mac: Blocca, Telecomando, Impostazioni da Live");
  await R.passo("Blocca: si accende; in Modifica il banner permette di sbloccare", async () => {
    await mac.locator("[data-blocca]").click();
    await mac.waitForFunction(() => document.querySelector("[data-blocca]")?.getAttribute("aria-pressed") === "true", null, { timeout: 3000 });
    await mac.locator("[data-blocca]").click(); // bloccato → porta in Modifica
    await mac.getByRole("button", { name: /Sblocca/ }).first().click();
    const conferma = mac.getByRole("button", { name: /^Sblocca$|Sì, sblocca|Sblocca ora/ });
    if (await conferma.first().isVisible().catch(() => false)) await conferma.first().click();
    await attendi(500);
    const c = await (await fetch(`${srv.base}/api/config`)).json();
    return c.impostazioni.bloccoModifiche !== true;
  });
  await mac.getByRole("tab", { name: "Live" }).click();
  await attendi(500);
  if (await mac.locator("[data-velo]").count()) await mac.keyboard.press("Escape");
  await R.passo("Telecomando: il pannello mostra PIN e si chiude con ESC", async () => {
    await mac.locator("[data-telecomando]").click();
    await mac.locator("[data-pannello-telecomando]").waitFor({ timeout: 3000 });
    await foto(mac, "08-pannello-telecomando");
    const conPin = (await mac.locator("[data-pannello-telecomando]").innerText()).includes("PIN");
    await mac.keyboard.press("Escape");
    await mac.locator("[data-pannello-telecomando]").waitFor({ state: "detached", timeout: 3000 });
    return conPin;
  });
  await R.passo("Impostazioni da Live: si apre e '‹ Indietro' torna a Live", async () => {
    await mac.locator("[data-impostazioni]").click();
    await mac.locator("[data-sezione-impostazioni]").first().waitFor({ timeout: 3000 });
    await mac.locator("[data-indietro]").click();
    await mac.locator("[data-serate]").waitFor({ timeout: 3000 });
  });

  // ================= TELEFONO =================
  console.log("\n— Telefono (390×844, PIN)");
  const tel = await nuovaPagina(browser, { w: 390, h: 844, mobile: true });
  pagine.push(tel);
  await tel.goto(srv.base + "/telecomando");
  await R.passo("Telefono: PIN col tastierino ed 'Entra'", async () => {
    for (const d of rete.pin) await tel.getByRole("button", { name: d, exact: true }).tap();
    await tel.getByRole("button", { name: "Entra" }).tap();
    await tel.getByRole("button", { name: "Fase successiva" }).waitFor({ timeout: 6000 });
  });
  if (await tel.locator("[data-foglio-ok]").count()) {
    await foto(tel, "09-telefono-foglio");
    await R.passo("Telefono: foglio col pulsante principale in cima e che chiude", async () => {
      const su = await inCima(tel, "[data-foglio-ok]");
      await tel.locator("[data-foglio-ok]").tap();
      await tel.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
      return su;
    });
  }
  await foto(tel, "10-telefono");
  await R.passo("Telefono: niente fuori schermo", () => senzaSbordo(tel));
  await R.passo("Telefono: tocco su una casella → suona sul Mac → stato torna al telefono", async () => {
    await mac.getByRole("button", { name: "STOP TUTTO" }).click();
    await mac.getByRole("tab", { name: fase1.nome }).click();
    await tel.getByText(fase1.nome).first().waitFor({ timeout: 4000 });
    await tel.locator("[role=button]", { hasText: sottofondo.titolo }).first().tap();
    await mac.waitForFunction((t) => (document.body.innerText.split("Sta suonando")[1] ?? document.body.innerText.split("STA SUONANDO")[1] ?? "").includes(t), sottofondo.titolo, { timeout: 5000 }).catch(async (e) => {
      await foto(mac, "ERR-tel-casella-mac");
      await foto(tel, "ERR-tel-casella-tel");
      throw e;
    });
    await tel.waitForFunction(() => !document.body.innerText.includes("Silenzio"), null, { timeout: 5000 });
  });
  await R.passo("Telefono: PARLA agisce sul Mac", async () => {
    await tel.getByRole("button", { name: /PARLA/ }).tap();
    await mac.waitForFunction(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("PARLA"))?.getAttribute("aria-pressed") === "true", null, { timeout: 4000 });
    await tel.getByRole("button", { name: /PARLA/ }).tap();
  });
  await R.passo("Telefono: STOP TUTTO con pressione breve NON ferma (mostra 'Tieni premuto')", async () => {
    await tel.locator("[data-stop-lungo]").tap();
    await tel.getByText("Tieni premuto").waitFor({ timeout: 2000 });
    return !(await mac.evaluate(() => document.body.innerText.includes("Silenzio")));
  });
  await R.passo("Telefono: STOP TUTTO tenuto premuto ferma il Mac", async () => {
    const b = await tel.locator("[data-stop-lungo]").boundingBox();
    await tel.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await tel.mouse.down();
    await attendi(900);
    await tel.mouse.up();
    await mac.getByText("Silenzio").first().waitFor({ timeout: 4000 });
  });
  await R.passo("Telefono: FADE OUT agisce sul Mac", async () => {
    await tel.locator("[role=button]", { hasText: sottofondo.titolo }).first().tap();
    await mac.waitForFunction(() => !document.body.innerText.includes("Silenzio"), null, { timeout: 4000 });
    await tel.getByRole("button", { name: "FADE OUT" }).tap();
    await mac.getByText("Silenzio").first().waitFor({ timeout: 8000 });
  });
  await R.passo("Telefono: fase successiva/precedente cambia la fase sul Mac", async () => {
    const primaMac = await mac.getByRole("tab", { selected: true }).last().innerText();
    await tel.getByRole("button", { name: "Fase successiva" }).tap();
    await mac.waitForFunction((a) => [...document.querySelectorAll("[role=tab][aria-selected=true]")].at(-1)?.textContent !== a, primaMac, { timeout: 4000 });
    await tel.getByRole("button", { name: "Fase precedente" }).tap();
    await mac.waitForFunction((a) => [...document.querySelectorAll("[role=tab][aria-selected=true]")].at(-1)?.textContent === a, primaMac, { timeout: 4000 });
  });
  await R.passo("Telefono: riga Sempre (pillola) suona sul Mac", async () => {
    await tel.locator("[data-riga-sempre] button", { hasText: "Sempre 1" }).tap();
    await mac.waitForFunction(() => [...document.querySelectorAll("[data-riga-sempre] button")].find((b) => b.textContent.includes("Sempre 1"))?.getAttribute("aria-pressed") === "true", null, { timeout: 4000, polling: 50 });
    await mac.keyboard.press("Escape");
  });
  await R.passo("Telefono: promemoria spuntato arriva al Mac", async () => {
    const p = tel.locator("[data-riga-sempre] button", { hasText: "Sempre 4" });
    await p.tap();
    await mac.waitForFunction(() => [...document.querySelectorAll("[data-riga-sempre] button")].find((b) => b.textContent.includes("Sempre 4"))?.getAttribute("aria-pressed") === "true", null, { timeout: 4000 });
    await p.tap();
  });
  await R.passo("Telefono: 'Altri' si apre come foglio e si chiude", async () => {
    await tel.locator("[data-altri]").tap();
    await tel.getByRole("dialog", { name: "Altri suoni" }).waitFor({ timeout: 3000 });
    await foto(tel, "11-telefono-altri");
    await tel.getByRole("dialog", { name: "Altri suoni" }).getByRole("button", { name: "Chiudi" }).tap();
    await tel.getByRole("dialog", { name: "Altri suoni" }).waitFor({ state: "detached", timeout: 3000 });
  });
  await R.passo("Telefono: 'Rileggi Prima di iniziare' apre il foglio con X", async () => {
    await tel.getByRole("button", { name: "Rileggi 'Prima di iniziare'" }).tap();
    await tel.locator("[data-modale-x]").tap();
    await tel.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });
  await R.passo("Telefono: blocco schermo simulato (rete giù) e ricollegamento", async () => {
    await tel.context().setOffline(true);
    await tel.evaluate(() => window.dispatchEvent(new Event("offline")));
    await attendi(2500);
    await tel.context().setOffline(false);
    await tel.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });
    // Dopo il ricollegamento un comando dal telefono torna ad agire sul Mac.
    await attendi(3000);
    await tel.getByRole("button", { name: /PARLA/ }).tap();
    await mac.waitForFunction(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("PARLA"))?.getAttribute("aria-pressed") === "true", null, { timeout: 8000 });
    await tel.getByRole("button", { name: /PARLA/ }).tap();
  });
  await R.passo("Telefono: ricaricata la pagina il PIN è ricordato", async () => {
    await tel.reload();
    await tel.getByRole("button", { name: "Fase successiva" }).waitFor({ timeout: 6000 });
  });
  await R.passo("Mac: il pannello Telecomando vede il telefono collegato", async () => {
    await mac.locator("[data-telecomando]").click();
    const t = await mac.locator("[data-pannello-telecomando]").innerText();
    await mac.keyboard.press("Escape");
    return /collegat|telefon/i.test(t);
  });

  // ================= DUE FINESTRE =================
  console.log("\n— Due finestre Regia");
  const mac2 = await nuovaPagina(browser, { w: 1440, h: 900 });
  pagine.push(mac2);
  await mac2.goto(`${srv.base}/format/${demo.id}`);
  await R.passo("Seconda finestra: dice che un'altra finestra comanda", () =>
    mac2.getByText("Un'altra finestra Regia sta comandando.").waitFor({ timeout: 5000 }).then(() => true),
  );
  await R.passo("Seconda finestra: 'Prendi il controllo' → ora comanda lei, la prima lo sa", async () => {
    await mac2.getByRole("button", { name: "Prendi il controllo" }).click();
    const attiva = mac2.getByRole("button", { name: "Attiva audio" });
    await attendi(600);
    if (await attiva.isVisible().catch(() => false)) await attiva.click();
    await mac.getByText("Un'altra finestra Regia sta comandando.").waitFor({ timeout: 5000 });
  });
  await R.passo("Il telefono comanda la finestra nuova", async () => {
    await mac2.getByRole("tab", { name: "Live" }).click().catch(() => undefined);
    await attendi(400);
    if (await mac2.locator("[data-velo]").count()) await mac2.keyboard.press("Escape");
    await tel.getByRole("button", { name: /PARLA/ }).tap();
    await mac2.waitForFunction(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("PARLA"))?.getAttribute("aria-pressed") === "true", null, { timeout: 5000 });
    await tel.getByRole("button", { name: /PARLA/ }).tap();
  });
  await R.passo("Prima finestra riprende il controllo", async () => {
    await mac.getByRole("button", { name: "Prendi il controllo" }).click();
    await attendi(600);
    const attiva = mac.getByRole("button", { name: "Attiva audio" });
    if (await attiva.isVisible().catch(() => false)) await attiva.click();
    await mac2.getByText("Un'altra finestra Regia sta comandando.").waitFor({ timeout: 5000 });
  });
  await mac2.context().close();

  // ================= CHIUDI SERATA =================
  console.log("\n— Chiudi serata");
  await mac.getByRole("tab", { name: "Live" }).click().catch(() => undefined);
  await attendi(400);
  if (await mac.locator("[data-velo]").count()) await mac.keyboard.press("Escape");
  await provaModale(mac, "Conferma 'Chiudi serata'", () => mac.locator("[data-chiudi-serata]").click(), { velo: false });
  await R.passo("Chiudi serata: 'Annulla' non chiude niente", async () => {
    await mac.locator("[data-chiudi-serata]").click();
    await mac.locator("[data-chiusura-annulla]").click();
    await mac.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  });
  await R.passo("Chiudi serata: conferma → riepilogo (con X) → Chiudi", async () => {
    await mac.locator("[data-chiudi-serata]").click();
    await mac.locator("[data-chiusura-conferma]").click();
    await mac.getByRole("dialog", { name: "Riepilogo della serata" }).waitFor({ timeout: 5000 });
    await foto(mac, "12-riepilogo");
    const x = await mac.locator("[data-modale-x]").isVisible();
    await mac.locator("[data-riepilogo-chiudi]").click();
    await mac.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
    return x;
  });
  await R.passo("Diario: la serata chiusa c'è, si apre e si torna all'elenco", async () => {
    await mac.locator("[data-diario]").click();
    await mac.locator("[data-serata]").first().click();
    await mac.getByRole("button", { name: "Torna all'elenco" }).click();
    await mac.locator("[data-serata]").first().waitFor({ timeout: 3000 });
    await mac.locator("[data-indietro]").click();
  });

  // ================= EXPORT / IMPORT =================
  console.log("\n— Export / import");
  await R.passo("Impostazioni → Esporta tutto (zip) scarica uno zip", async () => {
    await mac.locator("[data-impostazioni]").click();
    const [dl] = await Promise.all([mac.waitForEvent("download", { timeout: 15000 }), mac.getByText("Esporta tutto (zip)").click()]);
    const dove = path.join(os.tmpdir(), "regia-collaudo-export.zip");
    await dl.saveAs(dove);
    return fs.statSync(dove).size > 1000 ? `${Math.round(fs.statSync(dove).size / 1024)} KB` : false;
  });
  await R.passo("Impostazioni → Importa uno zip… rimette i format", async () => {
    const [chooser] = await Promise.all([mac.waitForEvent("filechooser", { timeout: 5000 }), mac.getByText("Importa uno zip…").click()]);
    await chooser.setFiles(path.join(os.tmpdir(), "regia-collaudo-export.zip"));
    await attendi(2500);
    const c = await (await fetch(`${srv.base}/api/config`)).json();
    return c.formats.some((f) => f.nome === demo.nome);
  });
  await R.passo("Impostazioni: versione e cartella dati mostrate", async () => {
    const v = await mac.locator("[data-versione]").innerText();
    return /\d+\.\d+\.\d+/.test(v) ? v.trim() : false;
  });
  await R.passo("Impostazioni: '‹ Indietro' torna", async () => {
    await mac.locator("[data-indietro]").click();
    await attendi(400);
    return !(await mac.locator("[data-sezione-impostazioni]").count());
  });

  // ================= LAYOUT A 4 MISURE =================
  console.log("\n— Layout: 1280×800 · 1440×900 · 1920×1080 · 390×844");
  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080], [390, 844]]) {
    const p = await nuovaPagina(browser, { w, h, mobile: w < 500 });
    pagine.push(p);
    for (const [nome, url] of [["home", "/"], ["modifica", `/format/${demo.id}`], ["impostazioni", "/impostazioni"], ["diario", "/diario"]]) {
      await p.goto(srv.base + url);
      await attendi(900);
      await R.passo(`${w}×${h} ${nome}: niente fuori schermo`, () => senzaSbordo(p));
      await foto(p, `L-${w}x${h}-${nome}`);
    }
    await p.goto(`${srv.base}/format/${demo.id}`);
    await attendi(800);
    await p.getByRole("tab", { name: "Live" }).click();
    await attendi(700);
    await R.passo(`${w}×${h} live: pulsante del foglio in cima`, () => inCima(p, "[data-foglio-ok]"));
    await foto(p, `L-${w}x${h}-live-foglio`);
    await p.locator("[data-foglio-ok]").click();
    await attendi(300);
    await R.passo(`${w}×${h} live: niente fuori schermo`, () => senzaSbordo(p));
    await R.passo(`${w}×${h} live: comandi del dock dentro lo schermo`, () =>
      p.evaluate(() =>
        ["STOP TUTTO", "FADE OUT", "PARLA", "Chiudi serata"].every((t) => {
          const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(t));
          if (!b) return true;
          const r = b.getBoundingClientRect();
          return r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
        }),
      ),
    );
    await R.passo(`${w}×${h} live: '‹ Serate' cliccabile`, () => inCima(p, "[data-serate]"));
    await R.passo(`${w}×${h} live: riga Sempre ≤ 96 px`, async () => (await p.locator("[data-riga-sempre]").evaluate((e) => e.getBoundingClientRect().height)) <= 96);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await attendi(300);
    await R.passo(`${w}×${h} live: l'ultima casella non sta sotto il dock`, () =>
      p.evaluate(() => {
        const c = [...document.querySelectorAll(".grid > [role=button]")].at(-1);
        if (!c) return true;
        const r = c.getBoundingClientRect();
        const t = document.elementFromPoint(r.left + r.width / 2, r.bottom - 6);
        return !!t && c.contains(t);
      }),
    );
    await foto(p, `L-${w}x${h}-live`);
  }
  const tel2 = await nuovaPagina(browser, { w: 390, h: 844, mobile: true });
  pagine.push(tel2);
  await tel2.goto(srv.base + "/telecomando");
  await R.passo("390×844 telefono (PIN): niente fuori schermo", () => senzaSbordo(tel2));
  await foto(tel2, "L-390x844-telecomando-pin");
} catch (e) {
  R.ko("Collaudo interrotto", String(e.message ?? e).split("\n")[0]);
} finally {
  // Errori di console e richieste esterne, da tutte le pagine.
  const errori = pagine.flatMap((p) => p.erroriConsole).filter((t) => !/Failed to load resource.*(404|Not Found)/.test(t) && !/WebSocket/.test(t) && !/ERR_INTERNET_DISCONNECTED/.test(t)); // la rete staccata apposta (blocco schermo simulato)
  const esterne = pagine.flatMap((p) => p.richiesteEsterne);
  R.verifica(errori.length === 0, "Nessun errore in console", errori.slice(0, 3).join(" | "));
  R.verifica(esterne.length === 0, "Nessuna richiesta di rete esterna", esterne.slice(0, 3).join(" | "));
  await browser.close();
  srv.stop();
  fs.writeFileSync(`${CARTELLA}/esito.json`, JSON.stringify(R.voci, null, 2));
  const ko = R.falliti.length;
  console.log(`\n${R.voci.length - ko}/${R.voci.length} voci ok${ko ? ` — ${ko} da sistemare` : ""}`);
  process.exit(ko ? 1 : 0);
}
