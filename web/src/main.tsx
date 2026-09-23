import React from "react";
import { createRoot } from "react-dom/client";
// Font di riserva locale (su Mac e iPhone esce il San Francisco di sistema).
import "@fontsource/inter-tight/400.css";
import "@fontsource/inter-tight/500.css";
import "@fontsource/inter-tight/600.css";
import "./stile.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
