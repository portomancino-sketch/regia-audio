# Inventario controlli e schermate — Regia (S-FIX, 30/09/2026)

Fatto dal CODICE (web/src) di v1.5.1 più le correzioni S-FIX. Le voci sono state provate dal collaudo automatico `scripts/collaudo/collaudo.mjs` (esito in `2026-09-30_esito.md`). (percorsi relativi a `/Users/jacopoiannuzzi/Downloads/regia-audio/web/src/`)

## A. Regia (Mac) — barra superiore (`pagine/Regia.tsx`)
1. **Logo "Regia · Porto Mancino"** (link alla Home). `pagine/Regia.tsx:932`. Selettori: `[data-logo]`, `aria-label="Vai alla Home"`
2. **"Indietro"**: compare solo in /diario, /impostazioni e /luci. Senza storia porta alla Home. `pagine/Regia.tsx:946`. Selettori: `[data-indietro]`, `aria-label="Indietro"`
3. **"Serate"**: torna all'elenco. Compare con un format aperto. `pagine/Regia.tsx:958`. Selettori: `[data-serate]`, `aria-label="Serate"`, title "Torna all'elenco delle serate"
4. **Titolo del format**: si rinomina direttamente nel campo (Invio salva, Esc annulla). `pagine/Regia.tsx:969-974`. Selettore: `[data-titolo-format] input`
5. **Indicatore "Salvataggio…" / "Salvato"**. `pagine/Regia.tsx:980-987`. Selettore: `aria-live="polite"`
6. **Controllo segmentato "Modifica" | "Live"**: un format archiviato non entra in Live. `pagine/Regia.tsx:989-997`. Selettori: `role="tab"` con testo "Modifica" / "Live"
7. **"Prova tutti" / "Ferma N / M"** (soundcheck): solo in Live e solo nella finestra che comanda. Mentre è in corso lo interrompe. `pagine/Regia.tsx:1000-1014`. Selettori: `[data-prova-tutti]`, aria-label "Prova tutti" oppure "Ferma il soundcheck N / M"
8. **Pallino rosso "Soundcheck di oggi non fatto"** (dentro Prova tutti). `pagine/Regia.tsx:1012`. Selettore: `[data-pallino-soundcheck]`
9. **"Blocca" / "Bloccato"** (lucchetto, solo in Live): se è sbloccato blocca, se è bloccato porta in Modifica. `pagine/Regia.tsx:1017-1033`. Selettori: `[data-blocca]`, `aria-pressed`, aria-label "Blocca modifiche" oppure "Modifiche bloccate (si sblocca dalla pagina Modifica)"
10. **"Diario"**: apre e chiude il diario. `pagine/Regia.tsx:1035-1048`. Selettori: `[data-diario]`, `aria-label="Diario di serata"`, `aria-pressed`
11. **Sole/luna (tema)**: InterruttoreTema con chiave "tema-regia", vedi sez. M. `pagine/Regia.tsx:1049`
12. **"Impostazioni"**. `pagine/Regia.tsx:1050-1063`. Selettori: `[data-impostazioni]`, `aria-label="Impostazioni"`, `aria-pressed`
13. **"Telecomando (N)"**: apre il pannello QR/PIN, vedi sez. L. `pagine/Regia.tsx:1064` → `pagine/PannelloTelecomando.tsx:63`. Selettore: `[data-telecomando]`
14. **Etichette che si nascondono** in base alla larghezza della finestra: Prova tutti sotto 1280px, Blocca sotto 1360, Diario sotto 1440, Impostazioni sotto 1600. `pagine/Regia.tsx:817-820`
15. **Banner "Un'altra finestra Regia sta comandando."** (due finestre aperte). `pagine/Regia.tsx:1066-1070`
16. **"Prendi il controllo"** (banner): invia `{tipo:"prendi_comando"}`. `pagine/Regia.tsx:1071-1077`. Selettore: testo "Prendi il controllo"

## B. Regia (Mac) — sovrapposizioni globali (`pagine/Regia.tsx`)
17. **Modale "Attiva audio"**: bloccante, senza X e senza Esc. `pagine/Regia.tsx:825-838`. Selettore: `role="dialog"` con `aria-label="Attiva audio"`
18. **Pulsante "Attiva audio"**. `pagine/Regia.tsx:827-837`. Selettori: `[data-modale-primario]`, testo "Attiva audio"
19. **Suggerimento "Vuoi bloccare le modifiche per la serata?"**: una volta al giorno, sparisce da solo dopo 8 s. `pagine/Regia.tsx:903-923`. Selettori: `[data-suggerimento-blocco]`, `role="status"`
20. **"Sì"** (del suggerimento, blocca). `pagine/Regia.tsx:908-917`
21. **"No"** (del suggerimento). `pagine/Regia.tsx:918-920`
22. **Modale "Chiudere la serata?"**: testo "Chiudere la serata di oggi?". Non si chiude cliccando sul velo. `pagine/Regia.tsx:876-892`. Selettore: `aria-label="Chiudere la serata?"`
23. **"Annulla"** (conferma chiusura). `pagine/Regia.tsx:884`. Selettori: `[data-chiusura-annulla]`, `[data-modale-primario]`
24. **"Chiudi"** (conferma chiusura serata): nell'ordine STOP TUTTO, azzeraTutto, `api.serata.chiudi`, poi il riepilogo. `pagine/Regia.tsx:887`, logica in `:516-533`. Selettore: `[data-chiusura-conferma]`

## C. Scorciatoie da tastiera
25. **Esc nel Diario** = Indietro. `pagine/Regia.tsx:711-713`
26. **Esc in Live** = STOP TUTTO, oppure interrompe il soundcheck se è in corso. `pagine/Regia.tsx:718-720`
27. **F** = FADE OUT. `pagine/Regia.tsx:721-722`
28. **P** = PARLA (accende/spegne). `pagine/Regia.tsx:723-724`
29. **Q W E R T** = pillole audio in evidenza della riga Sempre, nell'ordine. `pagine/Regia.tsx:725-732`
30. **1–9** = suoni audio della fase corrente, promemoria esclusi. `pagine/Regia.tsx:733-741`
31. **← / →** = fase precedente / successiva. `pagine/Regia.tsx:742-750`
32. **Quando le scorciatoie non valgono**: solo in vista Live, mai dentro INPUT o TEXTAREA. `pagine/Regia.tsx:715-717`
33. **Suggerimento "Scorciatoie da tastiera"**: icona tastiera con title che elenca i tasti. `pagine/Live.tsx:75-80`. Selettore: `aria-label="Scorciatoie da tastiera"`
34. **Esc chiude il Modale** e blocca le scorciatoie Live sotto il velo. `componenti/ui/Modale.tsx:37-47`
35. **Esc chiude "Altri suoni"** (in fase di cattura, non arriva a STOP TUTTO). `componenti/AltriSempre.tsx:26-36`
36. **Esc chiude il pannello Luci**. `componenti/PannelloLuci.tsx:27-38`
37. **Esc chiude il pannello Telecomando**. `pagine/PannelloTelecomando.tsx:26-35`
38. **Invio / Esc nei campi rinominabili** (InputInline): Invio salva, Esc annulla. `componenti/comuni.tsx:107-112`
39. **Invio / Spazio su una card cue**: suona oppure spunta. `componenti/PulsanteCue.tsx:95, 145, 233`

## D. Home (`pagine/Home.tsx`)
40. **Titolo "Le tue serate"**. `pagine/Home.tsx:145`
41. **Card format**: un clic apre il format in Modifica. `pagine/Home.tsx:27-31`
42. **Maniglia per riordinare** (trascinamento). `pagine/Home.tsx:42-50`. Selettore: `aria-label="Trascina per riordinare"`
43. **Menu ⋯ della card**. `pagine/Home.tsx:51`. Selettore: `aria-label="Altre azioni"` (default in `componenti/ui/Menu.tsx:36`)
44. **Voce "Rinomina"**. `pagine/Home.tsx:53`, campo di rinomina a `:69`
45. **Voce "Duplica"**: la copia si apre in Modifica. `pagine/Home.tsx:54`
46. **Voce "Archivia"**. `pagine/Home.tsx:55`
47. **Voce "Elimina"**: pericolosa, al primo clic diventa "Sicuro?". `pagine/Home.tsx:56-62`, conferma in `componenti/ui/Menu.tsx:74`
48. **"Nuovo format"** (stato vuoto, testo "Nessun format: crea la tua prima serata."). `pagine/Home.tsx:156`
49. **Card tratteggiata "Nuovo format"**. `pagine/Home.tsx:188-196`
50. **Card "Impostazioni"** (sottotitolo "Serata, luci, aspetto, dati"). `pagine/Home.tsx:97-110`. Selettore: `[data-card-impostazioni]`
51. **Sezione "Archiviati"**. `pagine/Home.tsx:203`. Selettori: `aria-label="Archiviati"`, righe `[data-archiviato]`
52. **Nome del format archiviato**: un clic lo apre. `pagine/Home.tsx:209-215`
53. **"Ripristina"** (toglie dall'archivio). `pagine/Home.tsx:216-222`

## E. Modifica (`pagine/Modifica.tsx`)
54. **Banner "Serata in corso — modifiche bloccate"**. `pagine/Modifica.tsx:746-779`. Selettore: `role="status"`
55. **"Sblocca"**. `pagine/Modifica.tsx:774`
56. **Conferma "Sbloccare le modifiche?"**: "Sì, sblocca" (`:758`) e "No" (`:769`)
57. **Fieldset in sola lettura quando è bloccato**. `pagine/Modifica.tsx:780-784`. Selettore: `fieldset[aria-disabled]`
58. **Nota del format "Prima di iniziare"** (AreaInline, salva quando si esce dal campo). `pagine/Modifica.tsx:813-818`. Placeholder "Le cose da ricordare prima della serata…"
59. **Menu del format ⋯**. `pagine/Modifica.tsx:801`. Selettore: `aria-label="Menu del format"`
60. **Voce "Analizza tutti i suoni"**. `pagine/Modifica.tsx:805`
61. **Avanzamento "Analizzo N / M" e "Interrompi"**. `pagine/Modifica.tsx:789-799`. Selettore: `[data-analisi]`
62. **Cursore "Passaggio tra sottofondi"** (0–5 s del format). `pagine/Modifica.tsx:821-841`. Selettori: `aria-label="Passaggio tra sottofondi, in secondi"`, valore in `[data-crossfade]`
63. **"+ Fase"**. `pagine/Modifica.tsx:860-866`. Selettore: testo "Fase"
64. **Maniglia per riordinare le fasi**. `pagine/Modifica.tsx:530`. Selettore: `aria-label="Trascina per riordinare le fasi"`
65. **Nome della fase** (si rinomina nel campo). `pagine/Modifica.tsx:539`
66. **"Durata prevista" in minuti** (non c'è nella riga Sempre). `pagine/Modifica.tsx:546-566`. Selettore: `aria-label="Durata prevista in minuti"`
67. **Menu ⋯ della fase**, voce "Azzera serata": toglie spunte e contatori della fase. `pagine/Modifica.tsx:581-586`. Nella riga Sempre c'è solo questa voce: `:570-576`
68. **Voce "Duplica fase"**. `pagine/Modifica.tsx:589`
69. **Voce "Elimina fase"** (con "Sicuro?"). `pagine/Modifica.tsx:594-599`
70. **Nota della fase** (AreaInline, placeholder "Cosa succede in questa fase (guida per chi è in sala)"). `pagine/Modifica.tsx:605-611`
71. **Menu "Luci all'inizio della fase"**: solo con la centralina abbinata. `pagine/Modifica.tsx:612-615`. Selettori: `[data-luci-fase]`, `select[data-menu-luci]`
72. **Più file audio trascinati sulla fase**: ogni file diventa una casella. `pagine/Modifica.tsx:507-527`
73. **"+ Casella"**. `pagine/Modifica.tsx:634-641`. Selettore: testo "Casella"
74. **Intestazione della casella**: un clic la apre o la chiude. `pagine/Modifica.tsx:186-188`
75. **Maniglia della casella**. `pagine/Modifica.tsx:190`. Selettore: `aria-label="Trascina per riordinare"`
76. **Titolo della casella** (placeholder "Titolo"). `pagine/Modifica.tsx:202`
77. **Stella "In evidenza"**: solo nella riga Sempre, massimo 4. Oltre il limite mostra "Massimo 4 in evidenza". `pagine/Modifica.tsx:208-230`, avviso a `:101`. Selettori: `aria-label="In evidenza"`, `aria-pressed`
78. **Etichetta "mai usato nelle ultime 10 serate"**. `pagine/Modifica.tsx:250`. Selettore: `[data-mai-usato]`
79. **Segmentato "Tipo"**: Sottofondo / Brano / Effetto / Promemoria. `pagine/Modifica.tsx:268-273`
80. **Nota della casella** (placeholder "Nota (facoltativa)"). `pagine/Modifica.tsx:276`
81. **Pulsante file**: "Trascina qui un file audio, o clicca per sceglierlo" oppure "Cambia il file audio". Si può anche trascinare il file sulla casella (`:167-182`). `pagine/Modifica.tsx:285-306`
82. **Cursore "Livello base"**. `pagine/Modifica.tsx:311-312`. Selettore: `aria-label="Livello base del suono"`
83. **Cursore "Volume"** (ritocco da −12 a +12 dB) con "auto X dB". `pagine/Modifica.tsx:319-337`. Selettori: `aria-label="Volume in dB (ritocco)"`, `[data-ritocco]`, `[data-auto]`
84. **"Ascolta" / "Ferma"** (anteprima). `pagine/Modifica.tsx:339-365`. Selettori: `[data-ascolta]`, `aria-pressed`
85. **"Per ascoltare, questa finestra deve comandare." + "Prendi il controllo"**. `pagine/Modifica.tsx:367-374`
86. **Menu "Luci" della casella**: Nessuna / Buio / Rosso / Caldo (nomi di default) / Torna com'era. `pagine/Modifica.tsx:380`, componente MenuLuci a `:20-44`. Selettore: `select[data-menu-luci]`
87. **Casella di spunta "A fine suono torna com'era"**. `pagine/Modifica.tsx:381-384`. Selettore: `[data-luce-fine]`
88. **"Usi previsti in serata"** (numero da 1 a 99, vuoto = illimitati). `pagine/Modifica.tsx:389-409`. Selettore: `aria-label="Usi previsti in serata"`
89. **Segmentato "Quando parte, il suono base…"**: Resta / Si abbassa / Si ferma. `pagine/Modifica.tsx:412-427`
90. **Casella di spunta "Ripeti da capo quando finisce"** (solo per il sottofondo). `pagine/Modifica.tsx:429-439`
91. **Sei pallini colore**. `pagine/Modifica.tsx:443-452`. Selettore: `aria-label="Colore del pulsante"`
92. **"Duplica casella"**. `pagine/Modifica.tsx:455`. Selettore: `aria-label="Duplica casella"`
93. **Menu ⋯ della casella, voce "Elimina casella"** (con "Sicuro?"). `pagine/Modifica.tsx:463-473`

## F. Live (Mac) (`pagine/Live.tsx`, `componenti/PulsanteCue.tsx`, `componenti/OrologioScaletta.tsx`)
94. **Segmentato delle fasi** (grande). `pagine/Live.tsx:56-62`. Selettore: `role="tab"` con il nome della fase
95. **Orologio di scaletta** "Fase mm:ss / mm:ss" con la pillola dello scarto. `componenti/OrologioScaletta.tsx:35-48`. Selettori: `[data-orologio]`, `[data-scarto]`
96. **Icona "Mostra la nota della fase"**. `pagine/Live.tsx:65-73`. Selettore: `aria-label="Mostra la nota della fase"`
97. **Menu della fase ⋯**. `pagine/Live.tsx:82-92`. Selettori: `[data-menu-fase]`, `aria-label="Menu della fase"`
98. **Voce "Rileggi 'Prima di iniziare'"**. `pagine/Live.tsx:86`
99. **Voce "Mostra la nota della fase"**. `pagine/Live.tsx:88`
100. **Nota della fase aperta** (title "Tocca per nascondere"). `pagine/Live.tsx:97-107`
101. **Card cue audio**: un clic la fa suonare. `componenti/PulsanteCue.tsx:225-238`
102. **Card promemoria**: un clic la spunta ("fatto"). `componenti/PulsanteCue.tsx:136-185`
103. **"Sfuma"** (piccolo, mentre il suono va). `componenti/PulsanteCue.tsx:318-330`. Selettore: title "Sfuma questo suono"
104. **"Ferma subito"** (quadrato). `componenti/PulsanteCue.tsx:331-344`. Selettore: `aria-label="Ferma subito"`
105. **Etichette sulla card**: "usato N/M", "fatto", "✓ già suonato". `componenti/PulsanteCue.tsx:200-214`
106. **Segnale "file mancante" / "file non leggibile"**. `componenti/PulsanteCue.tsx:192-196`. Selettore: `[data-file-mancante]`
107. **Pallino luce "con luci"**. `componenti/PulsanteCue.tsx:197-199`. Selettore: `[data-pallino-luce]`
108. **Tasto di scorciatoia 1–9 mostrato sulla card**. `componenti/PulsanteCue.tsx:356-360`

## G. Dock Live, Luci, riga Sempre (`componenti/BarraLive.tsx`, `PannelloLuci.tsx`, `RigaSempre.tsx`, `AltriSempre.tsx`)
109. **Stato "Sta suonando" / "Soundcheck" N / M**, con "Silenzio" e "Anteprima:". `componenti/BarraLive.tsx:44-75`
110. **Cursore "Volume principale"**. `componenti/BarraLive.tsx:79-85`. Selettore: `aria-label="Volume principale"`
111. **"Luci"**: solo con la centralina abbinata. Pallino grigio se la centralina non risponde. `componenti/PannelloLuci.tsx:126-138`. Selettori: `[data-luci]`, `[data-pallino-grigio]`
112. **"PARLA"** (acceso/spento). `componenti/BarraLive.tsx:97-108`. Selettori: `aria-pressed`, title "…(tasto P)"
113. **"FADE OUT"**. `componenti/BarraLive.tsx:109-116`
114. **"STOP TUTTO"** (Mac). `componenti/BarraLive.tsx:120-122`
115. **"Chiudi serata"** (Mac, solo in Live): apre la conferma. `componenti/BarraLive.tsx:124-134`. Selettore: `[data-chiudi-serata]`
116. **Mini-barra compatta in Modifica** (appare quando qualcosa suona). `pagine/Regia.tsx:1131-1163`
117. **Pannello "Luci"**. `componenti/PannelloLuci.tsx:51-121`. Selettore: `role="dialog"` con `aria-label="Luci"`
118. **Tre pulsanti effetto** (Buio / Rosso / Caldo di default). `componenti/PannelloLuci.tsx:80-94`. Selettori: `[data-effetto="luce1|luce2|luce3"]`, `aria-pressed`
119. **"Torna com'era"**. `componenti/PannelloLuci.tsx:95-102`. Selettore: `[data-effetto="torna"]`
120. **Cursore "Intensità"**. `componenti/PannelloLuci.tsx:104-119`. Selettori: `aria-label="Intensità delle luci"`, `[data-intensita]`
121. **Chiusura del pannello Luci**: X sul Mac (`:71`, `aria-label="Chiudi"`), "Chiudi" sul telefono (`:67`), anche con clic sul velo
122. **Riga "Sempre"** (dentro il dock). `componenti/ui/Dock.tsx:37`, `componenti/RigaSempre.tsx:167`. Selettori: `[data-riga-sempre]`, `aria-label="Sempre"`
123. **Pillola Sempre**: un tocco suona oppure spunta. Mostra tasto Q–T e pallini file/luci. `componenti/RigaSempre.tsx:64-123`. Selettori: `aria-pressed`, title uguale al titolo del cue
124. **"Altri (N)"**. `componenti/RigaSempre.tsx:185-203`. Selettori: `[data-altri]`, `aria-haspopup="dialog"`
125. **Pannello / foglio "Altri suoni"**: pannello sul Mac (`:146`), foglio dal basso sul telefono (`:127`). `componenti/AltriSempre.tsx`. Selettore: `aria-label="Altri suoni"`
126. **Campo "Cerca"**: compare con più di 8 voci. `componenti/AltriSempre.tsx:111-119`. Selettore: `aria-label="Cerca tra gli altri suoni"`
127. **Voce dell'elenco Altri**: suona oppure spunta e chiude il pannello. `componenti/AltriSempre.tsx:56-100`
128. **Chiusura di "Altri suoni"**: X sul Mac (`:155`, `aria-label="Chiudi"`), "Chiudi" sul telefono (`:135`)

## H. Finestre modali (`componenti/*.tsx`)
129. **Modale "Prima di iniziare"**. `componenti/FoglioInizio.tsx:34`. Selettore: `aria-label="Prima di iniziare"`
130. **Riga del soundcheck**: "Soundcheck di oggi: NON FATTO", oppure "… · tutto ok" / "N problemi". `componenti/FoglioInizio.tsx:38-48`. Selettore: `[data-soundcheck-stato]`
131. **"Prova tutti i suoni"**. `componenti/FoglioInizio.tsx:51`. Selettore: `[data-prova-dal-foglio]`
132. **"vedi l'esito"**. `componenti/FoglioInizio.tsx:60`. Selettore: `[data-vedi-esito]`
133. **"Rifai il controllo"**. `componenti/FoglioInizio.tsx:65`. Selettore: `[data-rifai-controllo]`
134. **Pulsante principale**: "Ok, pronti", "Vai lo stesso" oppure "Salta il controllo". `componenti/FoglioInizio.tsx:76`. Selettori: `[data-foglio-ok]`, `[data-modale-primario]`
135. **Modale "Esito soundcheck"**: file mancanti, file che non si leggono, picchi, "Luci: …". `componenti/EsitoSoundcheck.tsx:17-71`. Selettori: `aria-label="Esito soundcheck"`, `[data-esito-luci]`
136. **"Chiudi"** (esito). `componenti/EsitoSoundcheck.tsx:72`. Selettore: `[data-modale-primario]`
137. **Modale "Soundcheck non fatto"** ("Non hai ancora provato i suoni di oggi."). `componenti/AvvisoSoundcheck.tsx:9`
138. **"Prova tutti (1 min)"**. `componenti/AvvisoSoundcheck.tsx:14`. Selettore: `[data-avviso-prova]`
139. **"Vado avanti"**. `componenti/AvvisoSoundcheck.tsx:17`. Selettore: `[data-avviso-avanti]`
140. **Modale "Riepilogo della serata"** (dopo Chiudi serata). `componenti/RiepilogoSerata.tsx:107`. Selettori: `aria-label="Riepilogo della serata"`, riquadro `[data-riepilogo]` (`:21`)
141. **"Esporta CSV"** (riepilogo): scarica `/api/diario/{data}/csv?serata=N`. `componenti/RiepilogoSerata.tsx:115-119`
142. **"Chiudi"** (riepilogo). `componenti/RiepilogoSerata.tsx:120`. Selettore: `[data-riepilogo-chiudi]`
143. **X comune a tutti i modali e velo**: X con `aria-label="Chiudi"`, title "Chiudi (ESC)"; velo cliccabile. `componenti/ui/Modale.tsx:62, 82-91`. Selettori: `[data-modale-x]`, `[data-velo]`

## I. Diario (`pagine/Diario.tsx`)
144. **Titolo "Diario di serata"** (vuoto: "Ancora nessuna serata…"). `pagine/Diario.tsx:159-164`
145. **Riquadro "Ultime N serate"**: suoni mai usati e "Senza soundcheck". `pagine/Diario.tsx:168-191`. Selettori: `[data-mai-usati]`, `[data-senza-soundcheck]`
146. **Riga di una serata**: un clic apre il dettaglio. `pagine/Diario.tsx:194-225`. Selettore: `[data-serata="AAAA-MM-GG#n"]`
147. **Freccia "Torna all'elenco"** (dettaglio). `pagine/Diario.tsx:115-122`. Selettore: `aria-label="Torna all'elenco"`
148. **"Esporta CSV"** (dettaglio). `pagine/Diario.tsx:127-131`
149. **Riquadri del dettaglio**: Riepilogo della serata (`:134`), "Tempo per fase" (`:62`), "Cronologia" (`:138`)

## J. Impostazioni (`pagine/Impostazioni.tsx`)
150. **Sezioni Serata / Luci / Aspetto / Dati**. `pagine/Impostazioni.tsx:16`. Selettore: `[data-sezione-impostazioni="serata|luci|aspetto|dati"]`
151. **Cursore "Volume del suono base quando parlo"**. `pagine/Impostazioni.tsx:68`. Selettore: aria-label identica al testo
152. **Cursore "Passaggio tra sottofondi per i format nuovi"**. `pagine/Impostazioni.tsx:84`. Selettore: `[data-crossfade-default]`
153. **"PIN del telecomando"** (4 cifre, salva quando si esce dal campo, disattivo se bloccato). `pagine/Impostazioni.tsx:102`. Selettore: `aria-label="PIN del telecomando"`
154. **Pagina Luci incorporata** (vedi sez. K). `pagine/Impostazioni.tsx:121`. La vecchia strada /luci resta come alias: `pagine/Regia.tsx:813`
155. **Segmentato "Tema"**: Chiaro / Scuro / Auto. `pagine/Impostazioni.tsx:129-138`
156. **Cursore "Intensità sfondo"**. `pagine/Impostazioni.tsx:143`. Selettore: `aria-label="Intensità dello sfondo"`
157. **"Esporta tutto (zip)"**: link a `/api/export.zip`. `pagine/Impostazioni.tsx:155-159`
158. **"Importa uno zip…"**: disattivo se bloccato. Messaggio "Importato. Quello che c'era prima è nella cartella backup.". `pagine/Impostazioni.tsx:160-175`. Selettore dell'input: `aria-label="File zip da importare"`
159. **"Apri nel Finder"** con il percorso della cartella dati. `pagine/Impostazioni.tsx:181-187`. Selettore: `[data-cartella-dati]`
160. **"Regia versione X"**. `pagine/Impostazioni.tsx:189`. Selettore: `[data-versione]`

## K. Luci — parte tecnica (`pagine/Luci.tsx`)
161. **Banner "Luci simulate: niente lampadine vere"** + "Torna alle luci vere". `pagine/Luci.tsx:160-170`. Selettori: `[data-luci-simulate-attive]`, `[data-luci-vere]`
162. **Stato della centralina**: "Centralina non trovata", "Trovata, da abbinare", "Abbinata" oppure "Non raggiungibile". `pagine/Luci.tsx:177-186`. Selettore: `[data-stato-centralina]`
163. **"Cerca sulla rete"**. `pagine/Luci.tsx:194`
164. **Campo IP** (placeholder "oppure l'indirizzo IP…"). `pagine/Luci.tsx:197`. Selettore: `aria-label="Indirizzo IP della centralina"`
165. **"Prova questo IP"**. `pagine/Luci.tsx:204`
166. **"Abbina" / "Abbina… N s"**, con la frase "Premi il pulsante rotondo sulla centralina Philips.". `pagine/Luci.tsx:208-217`. Selettore: `[data-frase-abbina]`
167. **"Prova con luci simulate"** (quando la centralina non c'è). `pagine/Luci.tsx:220-227`. Selettori: `[data-luci-a-vuoto]`, `[data-luci-simulate]`
168. **Lampadine**: nome modificabile nel campo + "Lampeggia". `pagine/Luci.tsx:237-257`. Selettori: `[data-sezione="lampadine"]`, `[data-lampadina]`
169. **Gruppi**: nome modificabile, cestino, caselle di spunta per le lampadine. `pagine/Luci.tsx:261-295`. Selettori: `[data-sezione="gruppi"]`, `[data-gruppo]`, cestino con `aria-label="Elimina il gruppo {nome}"`
170. **"Nome del nuovo gruppo" + "Crea gruppo"**. `pagine/Luci.tsx:298-316`
171. **"Importa le stanze della centralina"**. `pagine/Luci.tsx:317`
172. **Effetto 1/2/3: nome e "Colore del pulsante"**. `pagine/Luci.tsx:328-344`. Selettori: `[data-effetto]`, aria-label "Nome dell'effetto N" e "Colore del pulsante {nome}"
173. **"Prova"** (effetto). `pagine/Luci.tsx:346`. Selettore: `[data-prova="luce1|2|3"]`
174. **Voci per gruppo**: usa gruppo, accese/spente, "Luminosità", "Colore", "Transizione", "solo alcune luci" e le singole lampade. `pagine/Luci.tsx:352-408`. Selettori: aria-label "{effetto}: usa il gruppo {g}", "Luminosità", "Colore della luce", "Transizione in secondi"
175. **Riquadro "Le luci simulate adesso"** (pallini). `pagine/Luci.tsx:420-435`. Selettori: `[data-pallini-simulate]`, `[data-pallino-simulato]`

## L. Pannello Telecomando sul Mac (`pagine/PannelloTelecomando.tsx`)
176. **Pannello "Telecomando"**: si chiude con Esc, con un clic fuori o cambiando pagina. `pagine/PannelloTelecomando.tsx:68`. Selettori: `[data-pannello-telecomando]`, `aria-label="Telecomando"`
177. **QR del telecomando + indirizzo**. `pagine/PannelloTelecomando.tsx:74-79`. Selettore: `img[alt="QR del telecomando"]`
178. **Campo "PIN"**. `pagine/PannelloTelecomando.tsx:82-91`. Selettore: `aria-label="PIN del telecomando"`
179. **"Telefoni collegati"** con gli IP, oppure "Nessun telefono collegato". `pagine/PannelloTelecomando.tsx:93-108`

## M. Tema e sfondo (`componenti/ui/InterruttoreTema.tsx`)
180. **Pulsante sole/luna**. `componenti/ui/InterruttoreTema.tsx:77-87`. Selettori: `[data-tema-pulsante]`, aria-label "Tema: Chiaro|Scuro|Automatico"
181. **Segmentato "Tema"** (Chiaro / Scuro / Auto) nel popover. `componenti/ui/InterruttoreTema.tsx:92-101`
182. **"Intensità sfondo"** (popover). `componenti/ui/InterruttoreTema.tsx:102-111`. Selettore: `aria-label="Intensità dello sfondo"`

## N. Telecomando (telefono, /telecomando) (`pagine/Telecomando.tsx`)
183. **Schermata PIN "Telecomando"** ("Scrivi il PIN che vedi sulla pagina Regia del Mac"). `pagine/Telecomando.tsx:94-160`
184. **Tastierino 0–9 e "Cancella"**. `pagine/Telecomando.tsx:130-146`. Selettori: aria-label con la cifra, `aria-label="Cancella"`
185. **Quattro caselle del PIN**. `pagine/Telecomando.tsx:117`. Selettore: `aria-label="PIN inserito"`
186. **"Entra"**; se sbagliato mostra "PIN errato, riprova". `pagine/Telecomando.tsx:148-156, 114`
187. **Pillole di stato**: "Ricollego…" (`:317`), "Regia non collegata" (`:323`), "Soundcheck in corso · N / M" (`:329`)
188. **Schermata "Scegli la serata"**: primo tocco "Confermi "{nome}"?", secondo tocco invia il comando. `pagine/Telecomando.tsx:342-366`
189. **"Annulla"** (scelta della serata). `pagine/Telecomando.tsx:370-379`
190. **Nome del format ▾**: apre la scelta della serata. `pagine/Telecomando.tsx:396-403`
191. **"Rileggi 'Prima di iniziare'"**. `pagine/Telecomando.tsx:404-412`. Selettore: aria-label identica
192. **"Fase precedente"**. `pagine/Telecomando.tsx:415`. Selettore: `aria-label="Fase precedente"`
193. **"Fase successiva"**. `pagine/Telecomando.tsx:433`. Selettore: `aria-label="Fase successiva"`
194. **Nome della fase**, scarto della scaletta (`[data-scarto]`) e pallino "soundcheck". `pagine/Telecomando.tsx:424-431`. Selettore: `[data-pallino-soundcheck]`
195. **Nota della fase**: si chiude con un tocco; per riaprirla c'è la pillola "nota della fase". `pagine/Telecomando.tsx:443-463`. Selettore della pillola: `aria-label="Mostra la nota della fase"`
196. **Card cue sul telefono**: tocco = suona. Mentre suona compaiono i tasti grandi "Sfuma" e "Stop". `componenti/PulsanteCue.tsx:363-397`. Selettore di Stop: `aria-label="Ferma subito"`
197. **Card promemoria sul telefono** (spunta grande). `componenti/PulsanteCue.tsx:84-134`
198. **Foglio "Prima di iniziare" sul telefono** ("Fallo dal Mac."). `pagine/Telecomando.tsx:486`
199. **Dock del telefono**: riga Sempre, sole/luna (chiave "tema-telecomando", popover verso l'alto), Volume, Luci, PARLA, FADE OUT. `pagine/Telecomando.tsx:487-516`
200. **"STOP TUTTO" a pressione lunga** (600 ms, vibrazione): un tocco breve mostra "Tieni premuto". `componenti/BarraLive.tsx:145-224`. Selettori: `[data-stop-lungo]`, `aria-label="STOP TUTTO (tieni premuto)"`, riempimento `[data-riempimento]`

## O. Comandi WebSocket inviati dal telefono (`invia(...)` in `pagine/Telecomando.tsx`; il tipo è in `shared/tipi.ts:123-137`)
201. **`{comando:"format", formatId}`**. `pagine/Telecomando.tsx:351`
202. **`{comando:"fase", faseId}`**. `pagine/Telecomando.tsx:307`
203. **`{comando:"play", cueId}`**. `pagine/Telecomando.tsx:311`
204. **`{comando:"stop", cueId}`**. `pagine/Telecomando.tsx:475, 498`
205. **`{comando:"sfuma", cueId}`**. `pagine/Telecomando.tsx:476, 499`
206. **`{comando:"spunta", cueId}`**. `pagine/Telecomando.tsx:481, 500`
207. **`{comando:"master", valore}`**. `pagine/Telecomando.tsx:508`
208. **`{comando:"fade"}`**. `pagine/Telecomando.tsx:509`
209. **`{comando:"stopTutto"}`**. `pagine/Telecomando.tsx:510`
210. **`{comando:"parla", acceso}`**. `pagine/Telecomando.tsx:512`
211. **Coda "Ricollego…"**: tiene un solo comando per 3 s e lo invia appena riconnesso. `pagine/Telecomando.tsx:249-253, 211-218`
212. **Comandi che solo il Mac invia**: `azzeraSerata` (`pagine/Regia.tsx:671`), `azzeraTutto` (`:520`), `prendi_comando` (`:476, :1074`), `rilascio` (`:380`), `battito` (`:628`). `azzeraSpunte` è gestito a `:251`, ma nessun elemento dell'interfaccia lo invia
213. **Durante il soundcheck la finestra che comanda ignora tutti i comandi dei telefoni**. `pagine/Regia.tsx:235`

## P. Componenti UI generici
214. **Menu ⋯**: aria-label di default "Altre azioni"; le voci con conferma diventano "Sicuro?". `componenti/ui/Menu.tsx:34-78`
215. **Controllo segmentato**. `componenti/ui/ControlloSegmentato.tsx:23-50`. Selettori: `role="tablist"`, `role="tab"`, `aria-selected`
216. **Componenti presenti ma non usati da nessuna schermata**: `BottoneConferma` ("Sicuro?", `componenti/comuni.tsx:8`) e `Campo` (`componenti/ui/Campo.tsx:4`)