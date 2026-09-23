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

## S4-quater — 23 settembre 2026 — sfondo elegante + cursore intensità

Sfondo ridotto a DUE tinte tenui: salvia #cfe2d8 in alto a sinistra (la più
grande) e crema #f3dfcc in basso a destra; centro e metà schermo quasi bianchi
(#f7f5f1). Blur 70px, plateau al 40% del raggio, deriva invariata. Scuro:
verde #1e3a32 e ambra spenta #3a2d1a. `--sfondo-intensita` default 0,55.
Il sole/luna ora apre un popover: tema Chiaro/Scuro/Auto + cursore
"Intensità sfondo" 0–100 (scrive la variabile, salvato per dispositivo col
tema, applicato già dallo script anti-lampo in index.html). Anche sul
telecomando (popover verso l'alto). Barra superiore e controllo segmentato
con velo bianco denso al 55%: non si tingono più. Verificato: cursore →
variabile CSS e localStorage; screenshot a intensità 55 e 100 per entrambi
i temi in docs/screenshots/s4quater/ (+ scatto del popover); contrasto card
17,2/16,7 (chiaro) e 12,9/10,9 (scuro); CPU in Live ferma 3,1%.

## S5 — 23 settembre 2026 — cartella autosufficiente per Valerio

`npm run pacchetto` produce `dist-pacchetti/Regia/` + `Regia-vX.Y.zip`
(ditto -c -k --keepParent, permessi conservati): "Avvia Regia.command"
(doppio click, percorsi relativi, toglie da solo la quarantena, non duplica
il server se già acceso, Chrome in modalità app o Safari), `app/` col server
impacchettato da esbuild in un SOLO file (nessun ripiego necessario) + dist
+ genera-demo compilato, `node/` coi binari ufficiali Node v24.21.0 LTS
(arm64+x64; al primo avvio resta solo quello giusto), `LEGGIMI.txt`.
Verificato per davvero: zip scompattato sulla Scrivania, quarantena simulata
(xattr), avviato con PATH SENZA node → parte col Node della cartella,
demo creata, telecomando raggiungibile, export/import ok, secondo doppio
click non duplica. Zip 81 MB; cartella 240 MB → 124 MB dopo il primo avvio.
README: installazione = scompatta + doppio click; git sotto "Per chi sviluppa".

## S5-bis — 23 settembre 2026 — telecomando dopo il blocco schermo

Finché la connessione non è aperta: pillola "Ricollego…", e un tocco viene
tenuto in coda (1 comando, scade in 3 s) e spedito da solo appena collegati;
lo stato non viene più azzerato durante la riconnessione (niente lampo) e al
ritorno visibile della pagina si riprova subito. Il foglio "Prima di
iniziare" compare una volta per serata e per format (memoria sul telefono
con la data), non a ogni ricaricamento; l'icona libro lo riapre. Verificato
nell'end-to-end simulando la caduta della connessione (hook di prova
`?prova` + simulaCaduta): 51/51 controlli.

## S6 — 23 settembre 2026 — riga Sempre, tempo rimanente, PARLA, diario

- **Riga "Sempre"**: fase speciale per format (flag `sempre`, ordine -1, nome
  fisso, non eliminabile né riordinabile, creata da sola anche nelle config
  vecchie). In Modifica sta in cima ("Sempre — visibili in ogni fase"); in Live
  è una riga di caselle compatte sopra il dock (striscia scorrevole sul
  telefono), visibile solo se ha caselle. Scorciatoie Q W E R T.
- **Tempo rimanente**: sulle card che suonano e nel dock, "finisce tra 0:42"
  con conteggio fluido interpolato lato client; ultimi 10 s in ambra con barra
  che pulsa; "in loop" per i sottofondi che ripartono, "in pausa", niente
  numero per gli effetti sotto i 3 s.
- **PARLA**: interruttore nel dock (Mac e telefono) + tasto P. In regole.ts il
  fattore del sottofondo è il minimo tra le regole dei cue e PARLA
  (livelloParla, impostazione 0–60%, default 25%); "pausa" vince sempre;
  STOP TUTTO non lo spegne, il cambio format sì. 5 test nuovi.
- **Diario di serata**: il server scrive ~/Regia-dati/diario/YYYY-MM-DD.jsonl
  (365 giorni) con eventi nati dal diff dello stato reale del motore (partiti/
  fermati/fase/format/parla/promemoria) e fade/stop tutto dai comandi; origine
  mac/telefono con le ultime 4 cifre dell'id (correlazione comando→evento entro
  2 s). Pagina /diario sul Mac: elenco serate, tempo per fase, cronologia,
  export CSV. Invisibile sul telefono.
- Verifica: 51 test unitari/API + **68/68 controlli end-to-end** (tasto Q con
  eventi veri, conteggio che scorre, ambra, PARLA condiviso, diario completo
  con CSV). Il test "finestra congelata" ora ammutolisce il WS via hook di
  prova (Page.setWebLifecycleState non congela più la tab attiva).
  Screenshot in docs/screenshots/s6/.

## S7 — 23 settembre 2026 — pacchetto aggiornato e ri-verifica completa

Le due richieste di S7 erano già state costruite in S5/S5-bis (cartella
autosufficiente; telecomando robusto al blocco schermo con coda da 1 comando,
pillola "Ricollego…" e foglio con memoria-data): in S7 sono state RI-VERIFICATE
sul codice attuale e il pacchetto è stato rigenerato con tutte le novità S6.
- Versione 1.1.0: `npm run pacchetto` → Regia-v1.1.0.zip (80 MB; cartella
  240 MB → 124 MB dopo il primo avvio, resta una sola architettura). Bundle
  esbuild in un file solo, nessun ripiego su node_modules.
- Verifica vera ripetuta da zero: zip scompattato sulla Scrivania, quarantena
  "0081;;;" ricorsiva (AirDrop simulato), avvio con PATH SENZA node → parte
  col Node della cartella (v24 LTS), demo creata CON riga Sempre, telecomando
  e diario raggiungibili, export/import ok, secondo doppio click non duplica,
  quarantena rimossa da sola. Dati intatti in ~/Regia-dati.
- Parte A (blocco schermo): coperta dai controlli end-to-end esistenti
  (68/68 sul commit corrente): "Ricollego…", tocco in coda spedito al
  ricollegamento, PIN che resta dopo la ricarica, foglio una volta per
  serata/format, icona libro.

## S7-bis — 23 settembre 2026 — consegna a Valerio

Solo pacchetto e documenti (zero modifiche a prodotto/UI/server/web).
- **Avvia Regia.command**: ora avvia con `caffeinate -d -i` (Mac e schermo
  svegli finché la finestra è aperta) e lo dice a schermo.
- **LEGGIMI.txt riscritto per macOS 15+**: il tasto destro → Apri non basta più
  per il software non firmato; il percorso vero è "Fine" → Impostazioni →
  Privacy e sicurezza → "Apri comunque" (due volte) → password. Istruzioni
  separate per i Mac meno recenti.
- **Piano B rete corretto**: hotspot del TELEFONO (il Mac collegato solo al
  WiFi non può condividere WiFi→WiFi); tolta la Condivisione Internet dal
  README. Guida per Valerio inclusa nel pacchetto ("Guida per Valerio.txt").
- **docs/PROVA_A_VUOTO.md**: checklist a spunte per la prova in sala
  (preparazione, Mac, telefono, "cose brutte apposta", decisioni con Valerio).
- **v1.1.1** → dist-pacchetti/Regia-v1.1.1.zip (80 MB; 124 MB dopo il primo
  avvio). Ri-verifica completa: quarantena simulata, PATH senza node, demo,
  telecomando, secondo doppio click non duplica, dati intatti; caffeinate
  presente da accesa e sparito da spenta.
- NOTA: il passaggio Gatekeeper con doppio click in Finder NON è verificabile
  da qui (la simulazione via bash non attraversa Gatekeeper): lasciato a
  Jacopo a mano, seguendo LEGGIMI.txt passo 2.

## S8 — 23 settembre 2026 — v1.1.2: riga Sempre sul telefono + LEGGIMI corretto

- **Spazio sotto il dock misurato, non indovinato**: Dock.tsx osserva la
  propria altezza reale (riga Sempre compresa) con un ResizeObserver e la
  scrive in `--altezza-dock`; Telecomando e Live usano
  `calc(var(--altezza-dock) + 16px)` come spazio in fondo. Con 0, 1 o 6 caselle
  Sempre, e con i pulsanti del dock che vanno a capo, nessuna card finisce
  sotto il dock. Tolti pb-72/pb-44/pb-64/pb-36 e la prop `spazioSotto`.
- **Sul telefono le caselle Sempre sono pillole** (RigaSempre.tsx): 44px,
  icona del tipo + titolo su una riga con ellissi, larghezza automatica
  (max 60% dello schermo), tinta del tipo come bordo/sfondo tenue, "suona"
  con riempimento + respiro + equalizzatore, promemoria con spunta. Tocco =
  parte / si ferma / spunta. Striscia orizzontale senza barra di scorrimento,
  8px tra le pillole. Niente nota né "finisce tra" (c'è il dock). Sul Mac
  tutto com'era (card compatte, Q W E R T).
- **Dock sul telefono**: i pulsanti PARLA / FADE OUT / STOP TUTTO vanno a capo
  in ordine (STOP TUTTO prende la riga intera) invece di uscire dallo schermo.
- **LEGGIMI e README**: il blocco di macOS si distingue dai PULSANTI del
  messaggio, non dalle parole (su macOS 14 il messaggio "sviluppatore non
  identificato" contiene anche "malware"): un solo "OK" → tasto destro → Apri;
  "Fine"/"Sposta nel Cestino" → Impostazioni → Privacy e sicurezza → Apri comunque.
- Verifica: 51 test + typecheck verdi; **71/71 controlli end-to-end** (nuovo:
  su 390×844 con 3 pillole Sempre, scrollato in fondo, l'ultima card della
  fase è tutta sopra il dock; pillole alte 44px). `scripts/screenshot-s8.mjs`
  → docs/screenshots/s8/ (telefono chiaro/scuro con 1 e 5 pillole, scrollato
  in fondo, Mac invariato).
- **v1.1.2** → dist-pacchetti/Regia-v1.1.2.zip (81 MB); LEGGIMI dentro lo zip
  verificato nuovo, build web nuova inclusa.
- NOTA: pacchetto verificato solo su Mac Intel (x64); il binario arm64 non è
  mai stato eseguito, da confermare sul Mac di Valerio se è Apple Silicon.

## S8-bis — 23 settembre 2026 — v1.1.3: riga Sempre dentro il vetro, Sfuma/Stop grandi

- **Riga Sempre dentro il vetro del dock** (Dock.tsx): `props.sopra` è la
  prima riga a tutta larghezza del Vetro (min-w-0 + basis-full), con 12px e
  una riga sottile (bordo del tema) sotto. Prima stava fuori dal vetro, nella
  zona trasparente del contenitore fisso, e le card che scorrevano sotto ci
  passavano attraverso (foto iPhone Safari, v1.1.2).
- **RigaSempre.tsx, un solo layout** Mac/telefono: striscia scorrevole senza
  barra, `-mx-5 px-5` (padding pari a quello del vetro con margine negativo)
  così pillole e card compatte scorrono fino al bordo del vetro senza tagli a
  metà. Tolto `mb-3`. Il ResizeObserver misura il contenitore fisso: lo spazio
  sotto resta corretto senza altre modifiche (verificato: ultima card sopra il
  dock con 5 pillole).
- **Telefono, card che suona**: "finisce tra" da solo a destra sulla sua
  riga; sotto, due tasti grandi metà e metà, 52px, 10px tra loro: "Sfuma"
  (vetro, 17px semibold) e "■ Stop" (rosso tenue: bordo e sfondo dal rosso di
  STOP TUTTO, non pieno). Prop `telefono` di PulsanteCue; pillole Sempre e
  card compatte del Mac invariate.
- Verifica: 51 test + typecheck verdi; **72/72 controlli end-to-end** (nuovo:
  pagina non scrollata con 3 pillole, la striscia Sempre è dentro il vetro e
  nessuna card la "buca" al tocco — elementFromPoint lungo la striscia
  risponde sempre con elementi del dock). `scripts/screenshot-s8bis.mjs` →
  docs/screenshots/s8bis/ (telefono chiaro/scuro con 1 e 5 pillole, in cima e
  in fondo; Mac Live con riga Sempre; card che suona chiaro/scuro).
- NOTA: Chrome headless non disegna la sfocatura del vetro (backdrop-filter):
  negli screenshot il testo dietro al dock si legge più di quanto si legga su
  Safari, dove il vetro sfoca. Da confermare a occhio sull'iPhone.
- **v1.1.3** → dist-pacchetti/Regia-v1.1.3.zip (80 MB); dentro lo zip
  verificati build web nuova e LEGGIMI di S8. Pacchetto provato solo su Mac
  Intel (x64); arm64 da confermare sul Mac di Valerio.
