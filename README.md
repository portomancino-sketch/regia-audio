# Regia

La regia audio per le serate a tema di Porto Mancino. Gira su un Mac collegato al
mixer della sala; dal telefono (stesso WiFi) si comandano i suoni con pulsanti grandi.
Niente cloud, niente abbonamenti: tutto resta sul Mac.

## Installazione su un Mac nuovo (3 passi, senza Terminale)

1. Copia sul Mac lo zip **Regia-vX.Y.zip** (AirDrop o chiavetta) e scompattalo
   dove vuoi (per esempio in Documenti).
2. Nella cartella "Regia": doppio click su **"Avvia Regia.command"**. La
   **prima volta** macOS lo blocca: è normale. Guarda i pulsanti del messaggio:
   - un solo pulsante **"OK"**: premilo, poi tasto destro su "Avvia
     Regia.command" → Apri → Apri;
   - due pulsanti **"Fine"** e **"Sposta nel Cestino"** (macOS 15 o più
     recente): premi "Fine", poi Impostazioni di Sistema → Privacy e sicurezza
     → scendi fino a "Sicurezza" → "Apri comunque" → di nuovo "Apri comunque"
     → password del Mac. Se la Regia non parte da sola, rifai doppio click.
   Succede solo la prima volta.
3. Le volte dopo basta il **doppio click**. Non serve installare nulla:
   nella cartella c'è già tutto, internet non serve.

Lo zip si produce sul Mac di sviluppo con `npm run pacchetto`
(finisce in `dist-pacchetti/`). Sostituire la cartella "Regia" con una versione
nuova non tocca suoni e serate: vivono in `~/Regia-dati`.

## Novità 1.4.1

- **Soundcheck ricordato**: il foglio "Prima di iniziare" dice in rosso se il soundcheck di oggi non è fatto (col pulsante dentro), poi in verde con l'ora; pallino rosso su "Prova tutti"; al primo suono senza prova una finestra lo chiede, una volta sola; "file mancante" in rosso già in Live.
- **Chiudi serata** (dock del Mac): silenzio, luci com'erano, spunte e contatori azzerati, lucchetto spento, riepilogo con CSV. Due serate lo stesso giorno = due righe nel Diario.

## Novità 1.3.0

- **Prova tutti** (Live, Mac): 3 secondi di ogni casella, esito con file mancanti e picchi.
- **STOP TUTTO sul telefono** solo con pressione lunga (600 ms): niente stop per sbaglio.
- **Blocca modifiche** (lucchetto): Modifica in sola lettura su ogni finestra per la serata.
- **"Usato 1/3" e "già suonato"** sulle caselle; "Azzera serata" nel menu della fase.
- **Livello automatico** all'importazione (obiettivo −18 dBFS, picco ≤ −1) + cursore in dB e "Ascolta".
- **Passaggio morbido tra sottofondi** (0–5 s per format, default 2).
- **Orologio di scaletta**: durata prevista per fase, "Fase 12:40 / 15:00", anticipo/ritardo.
- **Riepilogo della serata** nel Diario (anche nel CSV) e **suoni mai usati** nelle ultime 10 serate.
- **Duplica** un format riusando gli stessi file; **Archivia** e ripristina.
- Config vecchie compatibili: tutti i campi nuovi sono facoltativi.

## Luci in un locale nuovo (per Jacopo, una volta)

1. Centralina Philips Hue collegata al router del locale con il cavo, lampadine
   già aggiunte alla centralina con l'app Philips Hue (quella serve solo la prima
   volta: dopo la Regia parla direttamente con la centralina, senza internet).
2. Sul Mac, in alto: sole/luna → **Impostazioni luci…**. Premi **Cerca sulla
   rete**; se non la trova, scrivi l'indirizzo IP della centralina (lo trovi
   nell'app Philips Hue o nel router) e premi **Prova questo IP**.
3. Premi **Abbina** e, entro 30 secondi, il pulsante rotondo sulla centralina.
   Lo stato diventa "Abbinata": la chiave resta salvata sul Mac (in
   `~/Regia-dati/luci.json`, non nei format).
4. **Lampadine**: premi "Lampeggia" per capire quale è e dalle un nome.
5. **Gruppi**: crea i gruppi della sala (per esempio Sala, Bar) e spunta le
   lampadine dentro. "Importa le stanze della centralina" le copia come punto
   di partenza. Un gruppo con almeno 3 luci viene creato anche sulla
   centralina, così un effetto è un comando solo.
6. **Effetti**: per ciascuno dei tre dai nome e colore del pulsante, poi per
   ogni gruppo scegli accese/spente, luminosità, colore e transizione. "Prova"
   lo fa vedere e dopo 3 secondi torna com'era.
7. In Live, Valerio vede solo i tre pulsanti e "Torna com'era". Col lucchetto
   attivo questa pagina è in sola lettura. Se la centralina non risponde, i
   suoni vanno avanti e "Luci" mostra un pallino grigio.

## Come si avvia

- Doppio click su **Avvia Regia.command** nella cartella Regia. Si apre una
  finestra nera (lasciala aperta: è il cuore della Regia) e poi la finestra
  della Regia. Finché la finestra nera è aperta il Mac non va in stop (caffeinate).
- In alternativa, dal Terminale: `cd ~/regia && npm start`, poi apri
  <http://localhost:4000> con Chrome.
- Al primo caricamento premi il pulsante **"Attiva audio"**: serve una volta sola.
- L'interfaccia parte in **tema chiaro**; il sole/luna in alto passa a scuro o
  automatico (scelta salvata per dispositivo).
- **Una finestra comanda, le altre guardano**: una seconda finestra Regia si apre
  in sola lettura, con "Prendi il controllo" per passare di mano quando serve.
- Il telefono si collega all'indirizzo mostrato nel pannello **📱 Telecomando**
  (c'è anche il QR da inquadrare) e chiede il **PIN** scritto lì.
- In serata: riga **"Sempre"** coi suoni sempre a portata, **"finisce tra"** sui
  pulsanti che suonano, **PARLA** per abbassare il suono base mentre parli,
  e il **Diario** che registra tutta la serata (esportabile in CSV).

## I dati

Tutto quello che prepari (format, fasi, suoni) sta nella cartella `~/Regia-dati`
(nella cartella Inizio dell'utente). Dentro trovi:
- `regia.json` — la configurazione;
- `audio/` — i file audio;
- `backup/` — le ultime 50 copie di sicurezza automatiche.

Dal pulsante **Esporta** (o `http://localhost:4000/api/export.zip`) scarichi tutto
in un unico file zip, da riportare su un altro Mac con l'import.

## Se il telefono non vede il Mac

1. **Stessa rete**: telefono e Mac devono stare sullo stesso WiFi. Controlla il
   nome della rete su entrambi.
2. **Firewall del Mac**: Impostazioni di Sistema → Rete → Firewall. Se è acceso,
   alla prima partenza macOS chiede se consentire "node": rispondi **Consenti**.
   Se hai detto no per sbaglio: Firewall → Opzioni → trova "node" → "Consenti
   connessioni in entrata".
3. **Piano B — hotspot del telefono**: se il WiFi della sala isola i
   dispositivi (rete ospiti), accendi l'hotspot personale sul telefono
   dell'assistente e collega il Mac a quella rete WiFi. Non serve internet:
   la Regia lavora tutta in locale. Poi riapri il pannello Telecomando:
   indirizzo e QR sono nuovi. Il telefono che fa da hotspot può comandare
   anche lui.
4. Sul telefono lo schermo non deve spegnersi durante la serata: metti il blocco
   automatico su **"Mai"** (la pagina prova a tenerlo sveglio da sola, ma non
   tutti i telefoni lo permettono).

## Per chi sviluppa

- La strada con git: `git clone https://github.com/portomancino-sketch/regia-audio.git ~/regia`,
  poi `cd ~/regia && npm run installa` (serve Node 20+); crea "Regia.command" sulla Scrivania.
- `npm run pacchetto` — crea la cartella autosufficiente e lo zip per Valerio.
- `npm run dev` — server (porta 4000) + interfaccia con ricarica automatica (porta 5173).
- `npm test` — tutti i test (regole audio + API).
- `npm run typecheck` — controlli TypeScript su server, web e shared.
- `npm run genera-demo` — aggiunge di nuovo il format demo "Orient Express".
- Variabile `REGIA_DIR` — cartella dati alternativa (usata anche dai test).

Struttura: `/shared` tipi e regole audio (pure, testate), `/server` Fastify + WebSocket,
`/web` React + motore Web Audio, `/scripts` avvio e utilità, `/docs` guide.
