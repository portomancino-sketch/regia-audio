// Le "Luci simulate": una centralina Philips Hue finta (API locale v1) dentro la
// Regia, per provare il mondo delle luci da casa, senza lampadine vere.
// Sei lampadine d'esempio in due stanze ("Sala", "Palco"). Vive solo in memoria:
// mai attiva di default, non sopravvive al riavvio, non scrive in luci.json.
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface StatoLuceFinta {
  on: boolean;
  bri: number;
  hue: number;
  sat: number;
  ct: number;
  colormode: string;
  reachable: boolean;
  alert: string;
}
interface LuceFinta {
  name: string;
  type: string;
  state: StatoLuceFinta;
}
interface GruppoFinto {
  name: string;
  type: string;
  lights: string[];
  action: Partial<StatoLuceFinta>;
}

export const ID_CENTRALINA_FINTA = "SIMULATE0000001";
export const CHIAVE_FINTA = "luci-simulate";

function luce(name: string, state: Partial<StatoLuceFinta> = {}): LuceFinta {
  return { name, type: "Extended color light", state: { on: true, bri: 200, hue: 8000, sat: 140, ct: 366, colormode: "ct", reachable: true, alert: "none", ...state } };
}

export class CentralinaFinta {
  private server: http.Server | null = null;
  porta = 0;
  lights: Record<string, LuceFinta> = {
    "1": luce("Sala sinistra"),
    "2": luce("Sala centro"),
    "3": luce("Sala destra"),
    "4": luce("Palco sinistra", { ct: 300, bri: 254 }),
    "5": luce("Palco centro", { ct: 300, bri: 254 }),
    "6": luce("Palco destra", { ct: 300, bri: 254 }),
  };
  groups: Record<string, GruppoFinto> = {
    "1": { name: "Sala", type: "Room", lights: ["1", "2", "3"], action: { on: true, bri: 200, colormode: "ct", ct: 366 } },
    "2": { name: "Palco", type: "Room", lights: ["4", "5", "6"], action: { on: true, bri: 254, colormode: "ct", ct: 300 } },
  };
  private prossimoGruppo = 3;

  get ip(): string {
    return `127.0.0.1:${this.porta}`;
  }

  private applica(state: Partial<StatoLuceFinta>, dati: Record<string, unknown>): void {
    const { transitiontime: _t, alert, ...campi } = dati;
    Object.assign(state, campi);
    if ("ct" in campi) state.colormode = "ct";
    else if ("hue" in campi || "sat" in campi) state.colormode = "hs";
    if (typeof alert === "string") state.alert = alert;
  }

  async avvia(): Promise<void> {
    const json = (res: http.ServerResponse, codice: number, corpo: unknown) => {
      res.writeHead(codice, { "content-type": "application/json" });
      res.end(JSON.stringify(corpo));
    };
    const successi = (prefisso: string, dati: Record<string, unknown>) => Object.keys(dati).map((k) => ({ success: { [`${prefisso}/${k}`]: dati[k] } }));
    this.server = http.createServer((req, res) => {
      let corpo = "";
      req.on("data", (d) => (corpo += d));
      req.on("end", () => {
        const url = req.url ?? "/";
        let dati: Record<string, unknown> = {};
        try {
          dati = corpo ? (JSON.parse(corpo) as Record<string, unknown>) : {};
        } catch {
          dati = {};
        }
        if (url === "/api/config" && req.method === "GET") {
          return json(res, 200, { name: "Luci simulate", bridgeid: ID_CENTRALINA_FINTA, apiversion: "1.60.0", modelid: "BSB002" });
        }
        if (url === "/api" && req.method === "POST") return json(res, 200, [{ success: { username: CHIAVE_FINTA } }]);
        const m = url.match(/^\/api\/([^/]+)(\/.*)?$/);
        if (!m) return json(res, 404, [{ error: { type: 3, description: "resource not available" } }]);
        if (m[1] !== CHIAVE_FINTA) return json(res, 200, [{ error: { type: 1, description: "unauthorized user" } }]);
        const resto = m[2] ?? "";
        if (resto === "/lights" && req.method === "GET") return json(res, 200, this.lights);
        const l = resto.match(/^\/lights\/(\d+)(\/state)?$/);
        if (l && req.method === "GET") return json(res, 200, this.lights[l[1]!] ?? {});
        if (l && l[2] && req.method === "PUT") {
          const lampada = this.lights[l[1]!];
          if (!lampada) return json(res, 200, [{ error: { type: 3, description: "resource not available" } }]);
          this.applica(lampada.state, dati);
          return json(res, 200, successi(`/lights/${l[1]}/state`, dati));
        }
        if (resto === "/groups" && req.method === "GET") return json(res, 200, this.groups);
        if (resto === "/groups" && req.method === "POST") {
          const id = String(this.prossimoGruppo++);
          this.groups[id] = {
            name: typeof dati.name === "string" ? dati.name : `Gruppo ${id}`,
            type: typeof dati.type === "string" ? dati.type : "LightGroup",
            lights: Array.isArray(dati.lights) ? dati.lights.map(String) : [],
            action: { on: true, bri: 254, colormode: "ct", ct: 366 },
          };
          return json(res, 200, [{ success: { id } }]);
        }
        const g = resto.match(/^\/groups\/(\d+)(\/action)?$/);
        if (g && req.method === "GET") return json(res, 200, this.groups[g[1]!] ?? {});
        if (g && !g[2] && req.method === "PUT") {
          const gruppo = this.groups[g[1]!];
          if (!gruppo) return json(res, 200, [{ error: { type: 3, description: "resource not available" } }]);
          if (typeof dati.name === "string") gruppo.name = dati.name;
          if (Array.isArray(dati.lights)) gruppo.lights = dati.lights.map(String);
          return json(res, 200, successi(`/groups/${g[1]}`, dati));
        }
        if (g && !g[2] && req.method === "DELETE") {
          delete this.groups[g[1]!];
          return json(res, 200, [{ success: `/groups/${g[1]} deleted` }]);
        }
        if (g && g[2] && req.method === "PUT") {
          const gruppo = this.groups[g[1]!];
          if (!gruppo) return json(res, 200, [{ error: { type: 3, description: "resource not available" } }]);
          this.applica(gruppo.action, dati);
          for (const id of gruppo.lights) if (this.lights[id]) this.applica(this.lights[id]!.state, dati);
          return json(res, 200, successi(`/groups/${g[1]}/action`, dati));
        }
        return json(res, 404, [{ error: { type: 3, description: "resource not available" } }]);
      });
    });
    await new Promise<void>((ok) => this.server!.listen(0, "127.0.0.1", () => ok()));
    this.porta = (this.server.address() as AddressInfo).port;
  }

  async chiudi(): Promise<void> {
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>((ok) => s.close(() => ok()));
  }
}
