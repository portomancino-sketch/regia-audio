// Due strade: "/" è la Regia (sul Mac), "/telecomando" è per il telefono.
import { PaginaRegia } from "./pagine/Regia";
import { PaginaTelecomando } from "./pagine/Telecomando";

export function App() {
  if (location.pathname.startsWith("/telecomando")) return <PaginaTelecomando />;
  return <PaginaRegia />;
}
