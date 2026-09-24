// Una centralina Philips Hue finta (API locale v1) per test e prove: abbinamento
// che fallisce finché non si "preme" il pulsante, lampadine, gruppi, PUT/GET stato,
// registro dei comandi. Zero rete esterna.
// Da codice: const b = await avviaBridgeFinto(); b.premiPulsante(); b.comandi; await b.chiudi()
// Da terminale: node scripts/bridge-finto.mjs [porta]   (stampa la porta e resta acceso)
import http from "node:http";

function luce(name, state) {
  return { name, type: "Extended color light", state: { on: true, bri: 254, hue: 0, sat: 0, ct: 366, colormode: "ct", reachable: true, alert: "none", ...state } };
}

export async function avviaBridgeFinto(porta = 0) {
  const stato = {
    premuto: false,
    chiave: "chiavefinta123",
    comandi: [],
    prossimoGruppo: 3,
    lights: {
      1: luce("Faretto palco", { hue: 0, sat: 254, colormode: "hs", bri: 200 }),
      2: luce("Lampada bar", { ct: 300, bri: 150 }),
      3: luce("Applique sinistra", { on: false }),
      4: luce("Applique destra", { ct: 400, bri: 100 }),
      5: luce("Ingresso", { reachable: false, on: false }),
    },
    groups: {
      1: { name: "Sala", type: "Room", lights: ["1", "3", "4"], action: { on: true, bri: 200, colormode: "ct", ct: 366 } },
      2: { name: "Bar", type: "Room", lights: ["2"], action: { on: true, bri: 150, colormode: "ct", ct: 300 } },
    },
  };
  const json = (res, codice, corpo) => {
    res.writeHead(codice, { "content-type": "application/json" });
    res.end(JSON.stringify(corpo));
  };
  const successi = (prefisso, dati) => Object.keys(dati).map((k) => ({ success: { [`${prefisso}/${k}`]: dati[k] } }));
  const applica = (state, dati) => {
    const { transitiontime, alert, ...campi } = dati;
    Object.assign(state, campi);
    if ("ct" in campi) state.colormode = "ct";
    else if ("hue" in campi || "sat" in campi) state.colormode = "hs";
    if (alert) state.alert = alert;
  };
  const server = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (d) => (corpo += d));
    req.on("end", () => {
      const url = req.url ?? "/";
      let dati = {};
      try { dati = corpo ? JSON.parse(corpo) : {}; } catch { dati = {}; }
      // Comandi di prova (non esistono su una centralina vera).
      if (url === "/__finto/premi" && req.method === "POST") { stato.premuto = true; return json(res, 200, { premuto: true }); }
      if (url === "/__finto/comandi") return json(res, 200, stato.comandi);
      if (url === "/__finto/lights") return json(res, 200, stato.lights);
      if (url === "/__finto/azzera" && req.method === "POST") { stato.comandi = []; return json(res, 200, { ok: true }); }
      if (url === "/api/config" && req.method === "GET") {
        return json(res, 200, { name: "Centralina finta", bridgeid: "FINTO000000001", apiversion: "1.60.0", modelid: "BSB002" });
      }
      if (url === "/api" && req.method === "POST") {
        if (!stato.premuto) return json(res, 200, [{ error: { type: 101, address: "", description: "link button not pressed" } }]);
        return json(res, 200, [{ success: { username: stato.chiave } }]);
      }
      const m = url.match(/^\/api\/([^/]+)(\/.*)?$/);
      if (!m) return json(res, 404, [{ error: { type: 3, description: "resource not available" } }]);
      if (m[1] !== stato.chiave) return json(res, 200, [{ error: { type: 1, description: "unauthorized user" } }]);
      const resto = m[2] ?? "";
      // Lampadine
      if (resto === "/lights" && req.method === "GET") return json(res, 200, stato.lights);
      const l = resto.match(/^\/lights\/(\d+)(\/state)?$/);
      if (l && req.method === "GET") return json(res, 200, stato.lights[l[1]] ?? {});
      if (l && l[2] && req.method === "PUT") {
        const lampada = stato.lights[l[1]];
        if (!lampada) return json(res, 200, [{ error: { type: 3, description: "resource not available" } }]);
        applica(lampada.state, dati);
        stato.comandi.push({ tipo: "luce", id: l[1], stato: dati, quando: Date.now() });
        return json(res, 200, successi(`/lights/${l[1]}/state`, dati));
      }
      // Gruppi
      if (resto === "/groups" && req.method === "GET") return json(res, 200, stato.groups);
      if (resto === "/groups" && req.method === "POST") {
        const id = String(stato.prossimoGruppo++);
        stato.groups[id] = { name: dati.name ?? `Gruppo ${id}`, type: dati.type ?? "LightGroup", lights: (dati.lights ?? []).map(String), action: { on: true, bri: 254, colormode: "ct", ct: 366 } };
        return json(res, 200, [{ success: { id } }]);
      }
      const g = resto.match(/^\/groups\/(\d+)(\/action)?$/);
      if (g && req.method === "GET") return json(res, 200, stato.groups[g[1]] ?? {});
      if (g && !g[2] && req.method === "PUT") {
        const gruppo = stato.groups[g[1]];
        if (!gruppo) return json(res, 200, [{ error: { type: 3, description: "resource not available" } }]);
        if (dati.name) gruppo.name = dati.name;
        if (dati.lights) gruppo.lights = dati.lights.map(String);
        return json(res, 200, successi(`/groups/${g[1]}`, dati));
      }
      if (g && !g[2] && req.method === "DELETE") {
        delete stato.groups[g[1]];
        return json(res, 200, [{ success: `/groups/${g[1]} deleted` }]);
      }
      if (g && g[2] && req.method === "PUT") {
        const gruppo = stato.groups[g[1]];
        if (!gruppo) return json(res, 200, [{ error: { type: 3, description: "resource not available" } }]);
        applica(gruppo.action, dati);
        for (const id of gruppo.lights) if (stato.lights[id]) applica(stato.lights[id].state, dati);
        stato.comandi.push({ tipo: "gruppo", id: g[1], stato: dati, quando: Date.now() });
        return json(res, 200, successi(`/groups/${g[1]}/action`, dati));
      }
      return json(res, 404, [{ error: { type: 3, description: "resource not available" } }]);
    });
  });
  await new Promise((r) => server.listen(porta, "127.0.0.1", r));
  const p = server.address().port;
  return {
    porta: p,
    url: `http://127.0.0.1:${p}`,
    ip: `127.0.0.1:${p}`,
    stato,
    premiPulsante: () => { stato.premuto = true; },
    get comandi() { return stato.comandi; },
    azzeraComandi: () => { stato.comandi = []; },
    lights: () => stato.lights,
    groups: () => stato.groups,
    chiudi: () => new Promise((r) => server.close(() => r())),
  };
}

if (process.argv[1] && process.argv[1].endsWith("bridge-finto.mjs")) {
  const b = await avviaBridgeFinto(Number(process.argv[2] ?? 0));
  console.log(String(b.porta));
}
