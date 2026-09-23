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

## S1-bis — 23 settembre 2026 — cartella dati

La cartella dati di default è ora **`~/Regia-dati` su qualsiasi Mac** (prima era
`~/Regia` con ripiego automatico): su macOS il disco non distingue le maiuscole,
quindi `~/Regia` coincide con la cartella del codice `~/regia` e i dati sarebbero
finiti nel repository. Tolto il rilevamento della collisione, aggiornati README e
guida. `REGIA_DIR` resta prioritaria. Verificato l'avvio pulito: senza `REGIA_DIR`
il server crea `~/Regia-dati` con demo, audio e backup.

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

## S2-bis — 23 settembre 2026 — Sfuma/Ferma sul singolo suono

Sui pulsanti attivi (Mac e telefono) compaiono due comandi: **Sfuma** (sfuma quel
solo suono nel tempo di fade delle impostazioni) e **■** (lo ferma subito). Nuova
funzione pura `sfumaCue` in shared/regole.ts (+2 test, ora 40), nuovo comando WS
"sfuma" (il server inoltra i comandi così com'erano, nessuna logica nuova lato
server). Il server ora legge la variabile `PORT` (default 4000): serve alla
verifica end-to-end, che ora avvia un SUO server su porta 4999 con dati temporanei
— così una finestra Regia dell'utente rimasta aperta non falsa più i risultati.
29/29 controlli end-to-end.

## S3 — 23 settembre 2026 — tema chiaro, note guida, presa del comando

- **Tema chiaro di default** + scuro + automatico, tutto via token
  (`[data-tema="chiaro"]`), interruttore sole/luna su Mac e telefono, scelta
  salvata per dispositivo. Contrasto ≥ 4.5:1 verificato sui valori reali; i due
  rossi sono stati portati al valore più vicino conforme col testo bianco
  (scuro #d93b31, chiaro #e0312c). Classe `.vetro-solido` per menu e fogli
  (le utility bg-* non vincono sul CSS di .vetro).
- **Note guida a tre livelli** (dati additivi, retrocompatibili): "Prima di
  iniziare" sul format (foglio all'apertura in Live, riapribile), "Cosa succede"
  sulla fase (riga richiudibile in Live), e cue **Promemoria** (non suona mai,
  si spunta in serata; spunte condivise via stato WS, azzerate all'apertura del
  format o con "Azzera spunte"). Le scorciatoie 1–9 saltano i promemoria.
- **Presa del comando**: comanda sempre l'ULTIMA pagina Regia che si presenta;
  la precedente fa silenzio e mostra "Prendi il controllo". Battito ogni 5 s
  (timeout 12 s, regolabile con REGIA_BATTITO_MS nei test): una finestra
  congelata perde il comando e un'altra viene promossa da sola. "rilascio" su
  chiusura pagina, ri-presentazione quando la finestra torna visibile.
  Risolve il problema noto di S2 (finestra zombie).
- **Verifica**: 44 test unitari/API + 44 controlli end-to-end (tema, foglio,
  note, promemoria dal telefono, scalzamento, congelamento simulato con
  Page.setWebLifecycleState). Screenshot chiaro/scuro in docs/screenshots/s3/.

## S4 — 23 settembre 2026 — sfondo vivo, card con corpo, chi c'è comanda

- **Sfondo mesh**: tre macchie di colore sfumate + grana feTurbulence, in
  entrambi i temi. La deriva è guidata da JS a ~7 aggiornamenti/s (passi
  sub-pixel: fluida all'occhio, ma il compositing costa un ottavo di
  un'animazione CSS a 60 fps). Misura CPU con la Live aperta e ferma
  (delta di cputime dei renderer su 10 s, Chrome visibile): **2,9%**
  (con animazioni CSS a 60 fps era 6–7%, sopra la soglia del 5%).
  Ferma sul telecomando e con "riduci movimento". Contrasto ≥ 4.5:1
  verificato sui punti estremi dello sfondo.
- **Card con corpo**: vetro a gradiente con doppia ombra e riga di luce,
  hover con sollevamento (solo puntatore fine), pressione a molla; cerchietto
  36 px con tinta del tipo al 14% e icona (equalizzatore a 3 barre quando
  suona), durata, scorciatoia in pillola, barra 3 px, anello + glow che
  respira sulla card attiva. "Scatto" della card anche quando il comando
  arriva da tastiera o telefono. Entrata a cascata al cambio fase (220 ms /
  35 ms; telefono 160/25). STOP TUTTO a gradiente, dock più denso, cross-fade
  del titolo nel dock. Sul telefono niente blur sulle card (batteria).
- **Regola "chi c'è comanda"** (sostituisce "comanda l'ultima" di S3): una
  pagina nuova prende il comando da sola SOLO se nessun motore è vivo
  (o senza battiti da 12 s); altrimenti si apre in sola lettura col banner
  "Un'altra finestra Regia sta comandando" e "Prendi il controllo" per
  scalzare. Tornare visibile non prende più il comando. 45 test + 45
  controlli end-to-end. Screenshot chiaro/scuro in docs/screenshots/s4/.

## S4-bis — 23 settembre 2026 — sfondo visibile

Le macchie ora si vedono davvero: base chiara calda #f7f5f1, macchie 80–95vw
sovrapposte coi centri vicini agli angoli e un "plateau" pieno nel gradiente,
blur(60px) reale sui div, barra superiore meno velata (bg 25%). Variabile
`--sfondo-intensita` (0–1) per regolare tutto con un numero. Nel tema scuro il
blu notte è stato rinforzato (rgba(60,95,190,.7)) perché a schermo era
indistinguibile dal verde. Verifica MISURATA (scripts/verifica-sfondo.mjs):
campionati 5 punti dello screenshot, ≥3 zone distinte oltre 25/255 in entrambi
i temi; contrasto testo sulle card 17,7:1 (chiaro) e 15,3:1 (scuro); CPU in
Live ferma 2,7–3,6% (blur e deriva accesi). Screenshot in docs/screenshots/s4bis/.

## S4-ter — 23 settembre 2026 — i colori dello sfondo si VEDONO

Trovata la causa vera del "quasi bianco": le regole CSS delle macchie di
S4-bis non erano mai entrate nel file (sostituzioni testuali fallite in
silenzio), e le percentuali dei radial-gradient erano riferite all'angolo
lontano del riquadro, non al raggio. Riscritto `sfondo.css` da zero:
colori pieni senza alpha (chiaro: salvia #b6d6c5, pesca #f6c9a8, azzurro
#b5cbee, lavanda #d9cdef; scuro: #244a3f, #23346b, #5a3f16, #2c2749),
opacità div 0,95, blur(60px), gradienti `closest-side` con plateau pieno
fino al 55% del raggio, macchie che coprono la maggior parte dello schermo.
Verifica con soglia severa: ≥3 zone oltre 45/255 e nessun punto grigio puro
in entrambi i temi; contrasto card 15,5:1 (chiaro) e 7,9:1 (scuro);
CPU in Live ferma 2,8–3,1%. Screenshot in docs/screenshots/s4ter/.
