// Collaudo FIX v1.5.3: il pannello "Aspetto" (il sole) e tutti gli altri popover/menu
// con clic VERI (Playwright + Chrome headless) sul server di prova.
// Per ogni finestra (390×844 telefono col PIN, 1280×800, 1440×900, 1920×1080) e per
// chiaro e scuro: il pannello è per intero dentro la finestra, sta sopra a tutto
// (elementFromPoint al centro = pannello), i controlli si usano e il valore si salva.
// Uso: node scripts/collaudo/fix153.mjs   (serve la build in dist/)
// Screenshot in docs/screenshots/fix153/. Esce con 1 se una voce fallisce.
import fs from "node:fs";
import { attendi, avviaBrowser, avviaServer, nuovaPagina, preparaSempre, registro } from "./banco.mjs";

const CARTELLA = "docs/screenshots/fix153";
fs.mkdirSync(CARTELLA, { recursive: true });
const R = registro();
const srv = await avviaServer({ porta: Number(process.env.PORTA_COLLAUDO ?? 4974) });
const browser = await avviaBrowser();
const pagine = [];
const foto = (p, nome) => p.screenshot({ path: `${CARTELLA}/${nome}.png` });

/** Il box di `sel` è per intero nella finestra e al suo centro c'è lui (niente sopra). */
function dentroEInCima(p, sel, margine = 0) {
  return p.evaluate(
    ([s, m]) => {
      const el = [...document.querySelectorAll(s)].at(-1);
      if (!el) return "assente";
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (r.width < 10 || r.height < 10) return `vuoto ${Math.round(r.width)}×${Math.round(r.height)}`;
      if (r.left < m - 0.5 || r.top < m - 0.5 || r.right > vw - m + 0.5 || r.bottom > vh - m + 0.5)
        return `fuori: ${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}×${vh}`;
      // Centro e metà dei quattro lati (gli angoli sono arrotondati: fuori dal box vero).
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (const [x, y] of [
        [cx, cy],
        [cx, r.top + 4],
        [cx, r.bottom - 4],
        [r.left + 4, cy],
        [r.right - 4, cy],
      ]) {
        const t = document.elementFromPoint(x, y);
        if (!t || !(t === el || el.contains(t))) return `coperto a ${Math.round(x)},${Math.round(y)} da ${t?.tagName}.${String(t?.className).slice(0, 60)}`;
      }
      return true;
    },
    [sel, margine],
  );
}
const esito = (v) => (v === true ? true : Promise.reject(new Error(String(v))));

/** Il pannello tema: apri, geometria, Chiaro/Scuro, intensità, salvataggio, chiusura. */
async function provaTema(p, nome, { telefono, chiaveTema, live = false, telecomando = telefono }) {
  const apri = async () => {
    await p.locator("[data-tema-pulsante]").click();
    await p.locator("[data-pannello-tema]").waitFor({ timeout: 3000 });
    await attendi(150);
  };
  for (const tema of ["scuro", "chiaro"]) {
    await R.passo(`${nome} ${tema}: il sole apre "Aspetto"`, apri);
    await R.passo(`${nome} ${tema}: sceglie ${tema === "scuro" ? "Scuro" : "Chiaro"} e si salva`, async () => {
      await p.locator("[data-pannello-tema]").getByRole("tab", { name: tema === "scuro" ? "Scuro" : "Chiaro", exact: true }).click();
      await attendi(150);
      const r = await p.evaluate((k) => ({ attr: document.documentElement.dataset.tema, salvato: localStorage.getItem(k) }), chiaveTema);
      return r.attr === tema && r.salvato === tema ? true : Promise.reject(new Error(JSON.stringify(r)));
    });
    await R.passo(`${nome} ${tema}: pannello tutto dentro la finestra e sopra a tutto`, async () => esito(await dentroEInCima(p, "[data-pannello-tema]", telefono ? 0 : 12)));
    if (telefono) {
      await R.passo(`${nome} ${tema}: foglio a tutta larghezza, attaccato in basso, con maniglia, titolo e X`, async () => {
        const g = await p.evaluate(() => {
          const r = document.querySelector("[data-pannello-tema]").getBoundingClientRect();
          return { l: r.left, w: r.width, b: r.bottom, vw: innerWidth, vh: innerHeight, titolo: document.querySelector("[data-pannello-tema] h2")?.textContent, x: !!document.querySelector("[data-pannello-tema] [data-popover-x]"), velo: !!document.querySelector("[data-popover-velo]") };
        });
        return g.l === 0 && Math.abs(g.w - g.vw) < 1 && Math.abs(g.b - g.vh) < 1 && g.titolo === "Aspetto" && g.x && g.velo ? true : Promise.reject(new Error(JSON.stringify(g)));
      });
    } else {
      await R.passo(`${nome} ${tema}: popover largo 320, sotto il sole, allineato a destra`, async () => {
        const g = await p.evaluate(() => {
          const a = document.querySelector("[data-tema-pulsante]").getBoundingClientRect();
          const r = document.querySelector("[data-pannello-tema]").getBoundingClientRect();
          return { w: Math.round(r.width), sotto: r.top >= a.bottom, destra: Math.round(Math.min(a.right, innerWidth - 12) - r.right) };
        });
        return g.w === 320 && g.sotto && Math.abs(g.destra) <= 1 ? true : Promise.reject(new Error(JSON.stringify(g)));
      });
    }
    await foto(p, `${nome}-${tema}-aspetto`);
    if (tema === "scuro") {
      await R.passo(`${nome}: intensità sfondo cambia e resta dopo il ricaricamento`, async () => {
        const s = p.locator("[data-pannello-tema] input[type=range]");
        const prima = Number(await s.inputValue());
        const box = await s.boundingBox();
        await p.mouse.click(box.x + box.width * (prima > 50 ? 0.25 : 0.8), box.y + box.height / 2);
        await attendi(150);
        const dopo = Number(await s.inputValue());
        if (dopo === prima) throw new Error(`fermo a ${prima}`);
        await p.reload();
        await attendi(900);
        if (telecomando) await entraTelefono(p);
        else if (live) {
          await p.getByRole("tab", { name: "Live" }).click();
          await chiudiFoglio(p);
        }
        await apri();
        const riletto = Number(await p.locator("[data-pannello-tema] input[type=range]").inputValue());
        const testo = await p.locator("[data-intensita-valore]").innerText();
        return riletto === dopo && testo.trim() === String(dopo) ? `${prima} → ${dopo}` : Promise.reject(new Error(`${dopo} → ${riletto}/${testo}`));
      });
    }
    if (telefono) {
      await R.passo(`${nome} ${tema}: tocco sul velo chiude`, async () => {
        await p.locator("[data-popover-velo]").click({ position: { x: 20, y: 20 } });
        await p.locator("[data-pannello-tema]").waitFor({ state: "detached", timeout: 2000 });
      });
    } else {
      await R.passo(`${nome} ${tema}: ESC chiude`, async () => {
        await p.keyboard.press("Escape");
        await p.locator("[data-pannello-tema]").waitFor({ state: "detached", timeout: 2000 });
      });
      await R.passo(`${nome} ${tema}: clic fuori chiude`, async () => {
        await apri();
        await p.mouse.click(40, p.viewportSize().height / 2);
        await p.locator("[data-pannello-tema]").waitFor({ state: "detached", timeout: 2000 });
      });
    }
    await R.passo(`${nome} ${tema}: X chiude`, async () => {
      await apri();
      await p.locator("[data-pannello-tema] [data-popover-x]").click();
      await p.locator("[data-pannello-tema]").waitFor({ state: "detached", timeout: 2000 });
    });
  }
}

/** Un popover/menu qualsiasi: si apre col clic vero, sta dentro e sopra, si chiude. */
async function provaPopover(p, nome, apri, sel, { telefono } = {}) {
  await R.passo(`${nome}: si apre, tutto dentro la finestra e sopra a tutto`, async () => {
    await apri();
    await p.locator(sel).last().waitFor({ timeout: 3000 });
    await attendi(200);
    return esito(await dentroEInCima(p, sel, telefono ? 0 : 12));
  });
  await foto(p, nome.replace(/[^\w-]+/g, "-").toLowerCase());
  await R.passo(`${nome}: si chiude (${telefono ? "velo" : "ESC"})`, async () => {
    if (telefono) await p.locator("[data-velo]").last().click({ position: { x: 20, y: 20 } });
    else await p.keyboard.press("Escape");
    await p.locator(sel).waitFor({ state: "detached", timeout: 2000 });
  });
}

async function chiudiFoglio(p) {
  const attiva = p.getByRole("button", { name: "Attiva audio" });
  if (await attiva.isVisible().catch(() => false)) await attiva.click();
  await p.locator("[data-foglio-ok]").waitFor({ timeout: 3000 }).catch(() => undefined);
  if (await p.locator("[data-foglio-ok]").isVisible().catch(() => false)) {
    await p.locator("[data-foglio-ok]").click();
    await p.locator("[data-foglio-ok]").waitFor({ state: "detached", timeout: 3000 }).catch(() => undefined);
  }
  // Un'altra finestra Regia (quella del telefono) comanda: si prende il controllo.
  const controllo = p.getByRole("button", { name: "Prendi il controllo" });
  if (await controllo.isVisible().catch(() => false)) {
    await controllo.click();
    await attendi(400);
  }
}
let pin = "";
let nomeDemo = "";
async function entraTelefono(p) {
  if (await p.getByRole("button", { name: "Entra" }).isVisible().catch(() => false)) {
    for (const d of pin) await p.getByRole("button", { name: d, exact: true }).tap();
    await p.getByRole("button", { name: "Entra" }).tap();
  }
  await p.locator("[data-foglio-ok], [aria-label='Fase successiva']").or(p.getByText("Scegli la serata")).first().waitFor({ timeout: 6000 });
  if (!(await p.locator("[data-foglio-ok], [aria-label='Fase successiva']").count()) && (await p.getByText("Scegli la serata").isVisible().catch(() => false))) {
    await p.getByText(nomeDemo).first().tap({ timeout: 2000 }).catch(() => undefined); // può passare da solo in Live
  }
  await p.locator("[data-foglio-ok]").waitFor({ timeout: 2500 }).catch(() => undefined);
  if (await p.locator("[data-foglio-ok]").isVisible().catch(() => false)) {
    await attendi(800); // il foglio entra con un'animazione
    await p.locator("[data-foglio-ok]").tap();
    await p.locator("[data-velo]").waitFor({ state: "detached", timeout: 3000 });
  }
  await p.locator("[aria-label='Fase successiva']").waitFor({ timeout: 4000 });
}

try {
  const cfg = await (await fetch(`${srv.base}/api/config`)).json();
  const demo = cfg.formats[0];
  await preparaSempre(srv.base, demo.id, 8);
  nomeDemo = demo.nome;
  // Luci simulate accese: il pulsante Luci compare in Live e il suo pannello si prova davvero.
  await fetch(`${srv.base}/api/luci/simulate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attive: true }) });
  pin = (await (await fetch(`${srv.base}/api/rete`)).json()).pin;

  // La Regia aperta in Live sul Mac: il telefono ha qualcosa a cui collegarsi.
  const regia = await nuovaPagina(browser, { w: 1440, h: 900 });
  pagine.push(regia);
  await regia.goto(`${srv.base}/format/${demo.id}`);
  await regia.locator("[data-serate]").waitFor({ timeout: 5000 });
  await regia.getByRole("tab", { name: "Live" }).click();
  await chiudiFoglio(regia);

  // ================= TELEFONO =================
  console.log("\n— Telefono 390×844 (telecomando col PIN)");
  const tel = await nuovaPagina(browser, { w: 390, h: 844, mobile: true });
  tel.setDefaultTimeout(5000);
  pagine.push(tel);
  await tel.goto(srv.base + "/telecomando");
  await R.passo("Telefono: PIN ed 'Entra'", () =>
    entraTelefono(tel).catch(async (e) => {
      await foto(tel, "ERR-telefono");
      console.log(String(e.stack).split("\n").filter((r) => r.includes("fix153")).join("\n"));
      throw e;
    }),
  );
  await provaTema(tel, "390x844", { telefono: true, chiaveTema: "tema-telecomando" });

  // ================= MAC =================
  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    console.log(`\n— Mac ${w}×${h}`);
    const mac = await nuovaPagina(browser, { w, h });
    mac.setDefaultTimeout(5000);
    pagine.push(mac);
    const nome = `${w}x${h}`;
    await mac.goto(`${srv.base}/format/${demo.id}`);
    await mac.locator("[data-serate]").waitFor({ timeout: 5000 });
    await mac.getByRole("tab", { name: "Live" }).click();
    await attendi(500);
    await chiudiFoglio(mac);
    await provaTema(mac, `${nome}-live`, { telefono: false, chiaveTema: "tema-regia", live: true });

    // Gli altri popover e menu della barra e di Live.
    await provaPopover(mac, `${nome} Telecomando`, () => mac.locator("[data-telecomando]").click(), "[data-pannello-telecomando]");
    await R.passo(`${nome} Telecomando: il PIN si legge nel pannello`, async () => {
      await mac.locator("[data-telecomando]").click();
      await mac.locator("[data-pannello-telecomando]").getByText("PIN").waitFor({ timeout: 3000 });
      await mac.locator("[data-pannello-telecomando] [aria-label='PIN del telefono'], [data-pannello-telecomando] input").first().waitFor();
      await mac.keyboard.press("Escape");
      await mac.locator("[data-pannello-telecomando]").waitFor({ state: "detached", timeout: 2000 });
    });
    await provaPopover(mac, `${nome} Menu della fase`, () => mac.locator("[data-menu-fase] button").first().click(), "[data-menu]");
    await provaPopover(mac, `${nome} Luci`, () => mac.locator("[data-luci]").click(), "[role=dialog][aria-label=Luci]");
    await provaPopover(mac, `${nome} Altri suoni`, () => mac.getByRole("button", { name: /altri/i }).first().click(), "[role=dialog][aria-label='Altri suoni']");
    for (const [etichetta, sel] of [["Prova tutti", "[data-prova-tutti]"], ["Blocca", "[data-blocca]"], ["Diario", "[data-diario]"], ["Impostazioni", "[data-impostazioni]"], ["Sole", "[data-tema-pulsante]"], ["Telecomando", "[data-telecomando]"]]) {
      await R.passo(`${nome} barra: '${etichetta}' visibile, dentro e cliccabile`, async () => esito(await dentroEInCima(mac, sel)));
    }
    await R.passo(`${nome} Blocca: diventa 'Bloccato' e resta dentro e cliccabile`, async () => {
      await mac.locator("[data-blocca]").click();
      await mac.locator("[data-blocca][aria-pressed=true]").waitFor({ timeout: 3000 });
      const r = await dentroEInCima(mac, "[data-blocca]");
      await fetch(`${srv.base}/api/impostazioni`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ bloccoModifiche: false }) });
      await mac.locator("[data-blocca][aria-pressed=false]").waitFor({ timeout: 3000 });
      return esito(r);
    });
    // Home: il menu ⋯ del format.
    await mac.locator("[data-serate]").click();
    await mac.getByText("Le tue serate").waitFor({ timeout: 3000 });
    await provaPopover(mac, `${nome} Menu del format`, () => mac.getByRole("button", { name: "Altre azioni" }).first().click(), "[data-menu]");
    await R.passo(`${nome} Home: menu del format all'estrema destra resta dentro`, async () => {
      await mac.getByRole("button", { name: "Altre azioni" }).last().click();
      await mac.locator("[data-menu]").waitFor({ timeout: 2000 });
      const r = await dentroEInCima(mac, "[data-menu]", 12);
      await mac.keyboard.press("Escape");
      return esito(r);
    });
    await provaTema(mac, `${nome}-home`, { telefono: false, chiaveTema: "tema-regia" }).catch(() => undefined);
    // Modifica: i menu ⋯ delle fasi e dei suoni.
    await mac.getByText(demo.nome).first().click();
    await mac.locator("[data-serate]").waitFor({ timeout: 3000 });
    await attendi(400);
    await provaPopover(mac, `${nome} Menu in Modifica`, () => mac.getByRole("button", { name: /azioni|menu/i }).last().click(), "[data-menu]");
  }

  // ================= TELEFONO: la Regia stretta (Mac con finestra piccola) =================
  console.log("\n— Regia a 390×844");
  const stretta = await nuovaPagina(browser, { w: 390, h: 844, mobile: true });
  stretta.setDefaultTimeout(5000);
  pagine.push(stretta);
  await stretta.goto(srv.base + "/");
  await stretta.getByText("Le tue serate").waitFor({ timeout: 5000 });
  await provaTema(stretta, "390x844-regia", { telefono: true, telecomando: false, chiaveTema: "tema-regia" });
  await provaPopover(stretta, "390x844 Menu del format", () => stretta.getByRole("button", { name: "Altre azioni" }).first().click(), "[data-menu]", { telefono: true });
} catch (e) {
  R.ko("Collaudo interrotto", String(e.message ?? e).split("\n")[0] + " " + String(e.stack).split("\n").filter((r) => r.includes("fix153")).join(" "));
  await pagine.at(-1)?.screenshot({ path: `${CARTELLA}/ERR-interrotto.png` }).catch(() => undefined);
} finally {
  const errori = pagine.flatMap((p) => p.erroriConsole).filter((t) => !/Failed to load resource.*(404|Not Found)/.test(t) && !/WebSocket/.test(t));
  R.verifica(errori.length === 0, "Nessun errore in console", errori.slice(0, 3).join(" | "));
  await browser.close();
  srv.stop();
  const k = R.falliti.length;
  console.log(`\n${R.voci.length - k}/${R.voci.length} ok${k ? ` — ${k} da guardare` : ""}`);
  process.exit(k ? 1 : 0);
}
