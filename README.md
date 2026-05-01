# Quiz ASL Bari

Sito React/Vite per studiare i quiz del concorso infermieristico ASL Bari.

## Avvio del sito

Il sito usa il file gia generato:

```text
data/questions.json
```

Per avviarlo:

```bash
npm install
npm run dev
```

Poi apri l'indirizzo mostrato dal terminale, di solito:

```text
http://localhost:5173
```

Il sito salva automaticamente i progressi nel browser con `localStorage`: ordine randomico delle domande, domanda corrente, corrette, sbagliate, domande gia risposte ed errori da ripassare.

## Funzioni principali

- domande in ordine randomico, senza ripetizioni nello stesso ciclo;
- risposte mischiate per ogni domanda;
- feedback immediato corretto/sbagliato;
- ripresa automatica della sessione dopo la chiusura del browser;
- modalita `Ripassa errori`;
- reset con conferma;
- layout responsive per desktop, mobile e iPhone.

## File principali

- `src/App.jsx`: logica principale del quiz;
- `src/components/QuizCard.jsx`: card della domanda;
- `src/components/StatsBar.jsx`: statistiche e progress bar;
- `src/utils/storage.js`: salvataggio e lettura da `localStorage`;
- `src/utils/quizEngine.js`: progressi, validazione e mappa domande;
- `src/styles.css`: stile responsive.

## Deploy su GitHub Pages

Per generare la build locale:

```bash
npm run build
```

Il deploy automatico usa GitHub Actions con il workflow `.github/workflows/deploy.yml`.
Ogni push su `main` esegue `npm ci`, `npm run build` e pubblica la cartella `dist` su GitHub Pages.

Su GitHub controlla questa impostazione:

1. Vai nella repository `MicheleCarb/quiz-infermieri`.
2. Apri `Settings` -> `Pages`.
3. In `Build and deployment`, seleziona `Source: GitHub Actions`.

URL finale del sito:

```text
https://MicheleCarb.github.io/quiz-infermieri/
```

---

# Parser quiz ASL Bari

Questo progetto contiene uno script Python per convertire un file TXT di domande in un JSON strutturato.

## 1. Dove mettere `quiz_raw.txt`

Metti il file di input `quiz_raw.txt` nella stessa cartella di `parse_questions.py`, cioe nella radice del progetto.

## 2. Come eseguire lo script

Da terminale, entra nella cartella del progetto ed esegui:

```bash
python parse_questions.py
```

Lo script legge il file in UTF-8 e riconosce:

- inizio domanda, per esempio `1) Testo domanda`;
- risposte, per esempio `A) Risposta`;
- ID finale, per esempio `ID: 1546`;
- righe di continuazione della domanda o delle risposte.

## 3. Dove viene generato `questions.json`

Il file `questions.json` viene generato nella stessa cartella dello script.

La risposta corretta viene sempre impostata a:

```json
"correctAnswer": "A"
```

## 4. Come leggere il report di validazione

Alla fine dell'esecuzione lo script stampa un report con:

- numero totale di domande trovate;
- domande senza ID;
- domande senza risposta A;
- domande con meno di 3 risposte;
- ID duplicati;
- salti nella numerazione;
- domande duplicate per ID.

Per ogni tipo di anomalia vengono mostrati al massimo 10 esempi, cosi il report resta leggibile anche su file grandi.

## 5. Cosa controllare manualmente dopo la generazione

Dopo aver creato `questions.json`, conviene controllare:

- che il totale delle domande sia quello atteso;
- che non ci siano molte domande con meno di 3 risposte;
- che gli ID duplicati siano reali duplicati e non errori di parsing;
- che i salti nella numerazione dipendano davvero dal documento originale;
- qualche domanda a campione con testo lungo, per verificare che le righe di continuazione siano state unite correttamente.
