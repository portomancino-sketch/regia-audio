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
