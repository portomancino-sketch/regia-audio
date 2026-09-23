# Regia

La regia audio per le serate a tema di Porto Mancino. Gira su un Mac collegato al
mixer della sala; dal telefono (stesso WiFi) si comandano i suoni con pulsanti grandi.
Niente cloud, niente abbonamenti: tutto resta sul Mac.

## Installazione su un Mac nuovo (5 passi)

1. Installa Node (versione 20 o più nuova) da <https://nodejs.org> — scarica e clicca Avanti fino alla fine.
2. Apri il **Terminale** (Cmd+Spazio, scrivi "Terminale", Invio).
3. Scarica il progetto:
   ```
   git clone https://github.com/portomancino-sketch/regia-audio.git ~/regia
   ```
   (oppure copia la cartella del progetto da una chiavetta in `~/regia`).
4. Entra nella cartella e installa:
   ```
   cd ~/regia && npm run installa
   ```
5. Sulla Scrivania compare **Regia.command**: doppio click e la Regia parte.
   La prima volta macOS può chiedere conferma: tasto destro → Apri.

## Come si avvia

- Doppio click su **Regia.command** sulla Scrivania. Si apre una finestra nera
  (lasciala aperta: è il cuore della Regia) e poi la finestra della Regia.
- In alternativa, dal Terminale: `cd ~/regia && npm start`, poi apri
  <http://localhost:4000> con Chrome.
- Al primo caricamento premi il pulsante **"Attiva audio"**: serve una volta sola.
- L'interfaccia parte in **tema chiaro**; il sole/luna in alto passa a scuro o
  automatico (scelta salvata per dispositivo).
- Tieni **una sola finestra Regia** aperta: se ne apri un'altra, comanda l'ultima
  (sulla vecchia c'è "Prendi il controllo" per riprendersi il comando).
- Il telefono si collega all'indirizzo mostrato nel pannello **📱 Telecomando**
  (c'è anche il QR da inquadrare) e chiede il **PIN** scritto lì.

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
3. **Piano B — hotspot del Mac**: se il WiFi della sala fa i capricci, accendi
   la Condivisione Internet del Mac (Impostazioni di Sistema → Generali →
   Condivisione → Condivisione Internet) e collega il telefono alla rete del Mac.
   Poi riapri il pannello Telecomando per il nuovo indirizzo/QR.
4. Sul telefono lo schermo non deve spegnersi durante la serata: metti il blocco
   automatico su **"Mai"** (la pagina prova a tenerlo sveglio da sola, ma non
   tutti i telefoni lo permettono).

## Per chi sviluppa

- `npm run dev` — server (porta 4000) + interfaccia con ricarica automatica (porta 5173).
- `npm test` — tutti i test (regole audio + API).
- `npm run typecheck` — controlli TypeScript su server, web e shared.
- `npm run genera-demo` — aggiunge di nuovo il format demo "Orient Express".
- Variabile `REGIA_DIR` — cartella dati alternativa (usata anche dai test).

Struttura: `/shared` tipi e regole audio (pure, testate), `/server` Fastify + WebSocket,
`/web` React + motore Web Audio, `/scripts` avvio e utilità, `/docs` guide.
