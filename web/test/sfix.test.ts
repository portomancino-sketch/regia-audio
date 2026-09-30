// S-FIX: i tre bug di consegna non devono tornare.
// 1. Sovrapposizioni: i livelli (z-index) stanno SOLO nei token, nell'ordine giusto.
// 2. Soundcheck: il pulsante del foglio c'è sempre (mai bloccante).
// 3. Uscite: ogni modale passa dal componente Modale (X, ESC, velo).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pulsanteFoglio, rigaSoundcheck } from "../../shared/serata";

const SRC = path.resolve(__dirname, "../src");
function fileTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? fileTsx(p) : /\.(tsx|ts|css)$/.test(e.name) ? [p] : [];
  });
}

describe("livelli (z-index)", () => {
  const tokens = fs.readFileSync(path.join(SRC, "stili/tokens.css"), "utf8");
  const z = (nome: string) => Number(tokens.match(new RegExp(`--z-${nome}:\\s*(-?\\d+)`))?.[1]);

  // v1.5.3: i popover (tema, menu ⋯, telecomando) stanno in un portal su body SOPRA i
  // modali: un menu aperto da dentro un modale resta visibile.
  it("ordine unico: sfondo < contenuto < Sempre < dock < barra < modali < popover < toast", () => {
    const ordine = ["sfondo", "contenuto", "sempre", "dock", "barra", "modale", "popover", "toast"].map(z);
    expect(ordine.every((v) => Number.isFinite(v))).toBe(true);
    for (let i = 1; i < ordine.length; i++) expect(ordine[i]).toBeGreaterThan(ordine[i - 1]!);
  });

  it("nessun z-index scritto a mano fuori dai token (niente z-40/z-50 sparsi)", () => {
    const colpevoli = fileTsx(SRC)
      .filter((f) => !f.endsWith("tokens.css"))
      .flatMap((f) =>
        fs
          .readFileSync(f, "utf8")
          .split("\n")
          .map((riga, i) => ({ f, i: i + 1, riga }))
          .filter(({ riga }) => /\bz-(?:[1-9]\d*)\b|z-index:\s*-?\d|zIndex:\s*\d/.test(riga) && !/\bz-10\b/.test(riga) /* z-10 = ordine locale dentro un componente */),
      );
    expect(colpevoli.map((c) => `${path.relative(SRC, c.f)}:${c.i}`)).toEqual([]);
  });

  it("i modali a tutto schermo usano il componente Modale (X, ESC, velo)", () => {
    const fuori = fileTsx(SRC).filter((f) => {
      if (f.endsWith("Modale.tsx") || f.endsWith("AltriSempre.tsx") || f.endsWith("PannelloLuci.tsx") || f.endsWith("Popover.tsx")) return false;
      return /fixed inset-0[^"]*bg-black/.test(fs.readFileSync(f, "utf8"));
    });
    expect(fuori.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});

describe("foglio 'Prima di iniziare': il soundcheck non blocca mai", () => {
  const ora = new Date().toISOString();
  it("con problemi: 'Vai lo stesso'", () => {
    const r = rigaSoundcheck({ ora, completo: true, problemi: 2, caselle: 10, mancanti: {} } as never);
    expect(pulsanteFoglio(r.stato, true)).toBe("Vai lo stesso");
    expect(pulsanteFoglio(r.stato, false)).toBe("Vai lo stesso");
  });
  it("non fatto: 'Salta il controllo' dal Mac, 'Ok, pronti' dal telefono", () => {
    expect(pulsanteFoglio(rigaSoundcheck(null).stato, true)).toBe("Salta il controllo");
    expect(pulsanteFoglio(rigaSoundcheck(null).stato, false)).toBe("Ok, pronti");
  });
  it("tutto ok: 'Ok, pronti'", () => {
    const r = rigaSoundcheck({ ora, completo: true, problemi: 0, caselle: 10, mancanti: {} } as never);
    expect(pulsanteFoglio(r.stato, true)).toBe("Ok, pronti");
  });
  it("il pulsante del foglio non ha mai 'disabled'", () => {
    const src = fs.readFileSync(path.join(SRC, "componenti/FoglioInizio.tsx"), "utf8");
    const pulsante = src.slice(src.indexOf("data-foglio-ok") - 200, src.indexOf("data-foglio-ok"));
    expect(pulsante).not.toMatch(/disabled/);
  });
});

describe("riga Sempre compatta", () => {
  it("il dock limita la riga Sempre a 96 px", () => {
    const src = fs.readFileSync(path.join(SRC, "componenti/ui/Dock.tsx"), "utf8");
    expect(src).toContain("max-h-[96px]");
  });
});

describe("popover e menu (v1.5.3): mai tagliati, mai nascosti", () => {
  const leggi = (f: string) => fs.readFileSync(path.join(SRC, f), "utf8");
  it("il Popover va in un portal su document.body e tiene il box dentro la finestra", () => {
    const src = leggi("componenti/ui/Popover.tsx");
    expect(src).toContain("createPortal(");
    expect(src).toContain("document.body");
    expect(src).toMatch(/MARGINE = 12/);
    expect(src).toMatch(/innerWidth < 640/);
  });
  it("sole, menu ⋯ e Telecomando usano il Popover (niente pannelli absolute dentro barra o dock)", () => {
    for (const f of ["componenti/ui/InterruttoreTema.tsx", "componenti/ui/Menu.tsx", "pagine/PannelloTelecomando.tsx"]) {
      const src = leggi(f);
      expect(src, f).toContain("<Popover");
      expect(src, f).not.toMatch(/absolute[^"]*z-\[var\(--z-popover\)\]/);
    }
  });
});
