// Trova l'indirizzo del Mac sulla rete di casa/locale.
import os from "node:os";

export function indirizzoLan(): string {
  const interfacce = os.networkInterfaces();
  // Preferisce en0 (il WiFi del Mac).
  const preferite = ["en0"];
  for (const nome of preferite) {
    const voci = interfacce[nome];
    const v4 = voci?.find((v) => v.family === "IPv4" && !v.internal);
    if (v4) return v4.address;
  }
  for (const voci of Object.values(interfacce)) {
    const v4 = voci?.find((v) => v.family === "IPv4" && !v.internal);
    if (v4) return v4.address;
  }
  return "localhost";
}
