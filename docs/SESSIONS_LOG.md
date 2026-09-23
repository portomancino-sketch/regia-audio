# Registro delle sessioni

## S1 — 23 settembre 2026 — MVP completo

Costruita da zero l'app "Regia": server Fastify (porta 4000) + web React/Vite/Tailwind.

- **/shared**: tipi e regole audio come macchina a stati pura (26 test Vitest).
  Precedenza pausa > abbassa calcolata su tutti i cue attivi; ripristino del
  sottofondo solo quando finisce l'ultimo cue attivo; effetti sovrapponibili.
- **/server**: store JSON con autosave (debounce 500 ms) e 50 backup; REST per
  format/fasi/cue (crea, rinomina, riordina, duplica, elimina); upload audio con
  durata (music-metadata); /audio con Range; export/import zip; WebSocket con PIN,
  un solo motore, stato conservato e reinviato; caffeinate su macOS (12 test API+WS).
- **/web**: Home con card trascinabili; Modifica con drag & drop di file e
  riordino; motore Web Audio (precarico < 180 s, streaming ≥ 180 s con pausa/ripresa);
  Live con tastiera (ESC, F, 1–9, frecce); pannello Telecomando con QR e PIN;
  pagina Telecomando con riconnessione e anti-blocco schermo.
- **Demo**: 6 WAV sintetizzati + format "Demo — Orient Express" (4 fasi) creati
  al primo avvio.
- **Avvio facile**: `npm run installa` crea Regia.command sulla Scrivania.

Nota di questo Mac: `~/Regia` coincide con la cartella del progetto `~/regia`
(disco senza distinzione maiuscole), quindi i dati vanno in `~/Regia-dati`.
La variabile `REGIA_DIR` resta prioritaria.

Repo: https://github.com/portomancino-sketch/regia-audio (branch main).

## S2 — 23 settembre 2026 — restyle "liquid glass"

Solo interfaccia, zero logica: regole audio, server, WebSocket e formato dati intatti.

- **Design system**: token in `web/src/stili/tokens.css` (sfondo #0a0c10 con gradienti
  radiali, vetro con blur 24px, brand #3e685b unico colore vivo, rosso solo per STOP
  TUTTO, tinte discrete per i tipi in pillole/barre). Font di sistema (San Francisco)
  con Inter Tight locale (@fontsource) di riserva; icone lucide-react tratto 1.75,
  niente emoji. Movimento 180 ms ease-out, prefers-reduced-motion rispettato.
- **Componenti** in `web/src/componenti/ui/`: Vetro, Pulsante, ControlloSegmentato
  (selezione che scorre), Slider, Pillola, Campo, BarraAvanzamento, Dock, Menu (⋯).
- **Schermate**: barra superiore con wordmark "Regia · Porto Mancino", segmentato
  Modifica|Live, "Salvato" discreto; Home a card con menu ⋯ e card "Nuovo format"
  tratteggiata; Modifica con caselle compatte che si aprono al click; Live con fasi
  segmentate, pulsanti alti col glow brand e onda che pulsa, dock flottante; overlay
  "Attiva audio" a tutto schermo; telecomando con tastierino PIN, safe-area, pillola
  rossa "Regia non collegata"; pannello Telecomando con QR su bianco e PIN grande.
- **Verifica**: 26/26 controlli end-to-end (Chrome headless + osservatore WS),
  scorciatoie provate con eventi tastiera veri (1, ESC, F, ← →), nessuna richiesta
  verso internet (tutto locale), 38 test verdi, tsc pulito. Screenshot in
  `docs/screenshots/s2/`.
- **Nota / problema noto**: una finestra Regia lasciata aperta con la pagina vecchia
  (o congelata dal risparmio energetico del browser) resta registrata come "motore"
  e ignora i comandi. Sistemarlo richiede un battito applicativo nel protocollo WS
  (vietato in S2): da fare in una prossima sessione.

## S1-bis — 23 settembre 2026 — cartella dati

La cartella dati di default è ora **`~/Regia-dati` su qualsiasi Mac** (prima era
`~/Regia` con ripiego automatico): su macOS il disco non distingue le maiuscole,
quindi `~/Regia` coincide con la cartella del codice `~/regia` e i dati sarebbero
finiti nel repository. Tolto il rilevamento della collisione, aggiornati README e
guida. `REGIA_DIR` resta prioritaria. Verificato l'avvio pulito: senza `REGIA_DIR`
il server crea `~/Regia-dati` con demo, audio e backup.
