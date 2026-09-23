// Due strade: "/" è la Regia (sul Mac), "/telecomando" è per il telefono.
import { PaginaRegia } from "./pagine/Regia";
import { PaginaTelecomando } from "./pagine/Telecomando";
import { Sfondo } from "./componenti/Sfondo";

export function App() {
  const telecomando = location.pathname.startsWith("/telecomando");
  return (
    <>
      <Sfondo animato={!telecomando} />
      {telecomando ? <PaginaTelecomando /> : <PaginaRegia />}
    </>
  );
}
