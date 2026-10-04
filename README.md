# bos-nachrichtenvordruck

Füllt den BOS-Nachrichtenvordruck (4fach-Satz) und den Meldevordruck mit jsPDF als PDF aus. Die Formularbilder sind eingebettet, eine Anwendung muss keine Dateien kopieren oder ausliefern. Beide Vordrucke haben das Format A5 hoch (148 × 210 mm), zwei passen nebeneinander auf ein A4-Querformat.

Herausgelöst aus [sprechfunk-uebung](https://github.com/wattnpapa/sprechfunk-uebung), wo es die Vordrucke für Übungsteilnehmer und Übungsleitung erzeugt.

## Web-App

Unter `web/` liegt eine Web-App, die auf GitHub Pages läuft. Sie füllt einen einzelnen Vordruck über eine Eingabemaske mit Live-Vorschau aus oder erzeugt viele auf einmal aus einer Excel- oder CSV-Tabelle. Eine Excel-Vorlage mit Auswahllisten und eine CSV-Vorlage gibt es dort zum Herunterladen. Alles läuft im Browser, nichts wird hochgeladen. Nach dem ersten Aufruf startet die App auch ohne Netz: Beim Bauen entsteht `sw.js` aus der Vorlage `web/offline/sw.js` mit allen Dateien der App.

```bash
npm run web          # Entwicklungsserver
npm run web:build    # dist-web/
```

Der Workflow `.github/workflows/pages.yml` baut die App bei jedem Push auf `main` und veröffentlicht sie. Einmalig in den Repository-Einstellungen unter Pages als Quelle „GitHub Actions“ wählen; dort lässt sich auch eine eigene Domain eintragen.

## Installation

Das Paket liegt noch nicht auf npm. Eingebunden wird es direkt aus GitHub, `npm` baut es dabei über das `prepare`-Skript:

```bash
npm install jspdf github:wattnpapa/bos-nachrichtenvordruck#v1.0.0
```

`jspdf` (ab 4.0) ist Peer-Abhängigkeit und muss in der Anwendung installiert sein.

## Verwendung

```ts
import { jsPDF } from "jspdf";
import { VordruckDaten, zeichneMeldevordruck, zeichneNachrichtenvordruck } from "bos-nachrichtenvordruck";

const daten = new VordruckDaten();
daten.nummer = "17";
daten.art = "spruch";
daten.vorrang = "sofort";
daten.empfaenger = ["Heros Jever 21/10"];
daten.anschriften = ["Technische Einsatzleitung"];
daten.inhalt = "Erkundung abgeschlossen.\nZufahrt ist frei.";
daten.absender = "Heros Oldenburg 16/11";
daten.verfasser = "Heros Oldenburg 16/11";
daten.abfassungszeit = "031415okt26";

const pdf = new jsPDF("l", "mm", "a4");
zeichneNachrichtenvordruck(pdf, daten);
zeichneMeldevordruck(pdf, daten, { offsetX: 148.5 });
pdf.save("vordrucke.pdf");
```

Nicht gesetzte Felder bleiben leer. `VordruckDaten` kennt jedes Feld des Nachrichtenvordrucks: Übermittlungsweg (Kopfzeile und Spruchkopf), Richtung im Technischen Betriebsbuch, Aufnahme-, Annahme- und Beförderungsvermerk, Art, Vorrang, Gesprächsnotiz, Abfassungszeit, Zeichen, Funktion, Quittung, Vermerke und über `weitereAnkreuzfelder` das Verteilerraster. Der Meldevordruck nutzt davon nur Nummer, Absender, Empfänger, Verfasser und Inhalt.

`titel`, `hinweis` und `fusszeile` stehen außerhalb des Formulars am Blattrand.

Langer Inhalt wird auf beiden Vordrucken verkleinert, bis er ins Inhaltsfeld passt, beim Nachrichtenvordruck bis 3 pt, beim Meldevordruck bis 4 pt. `nachrichtenvordruckInhaltSchrift(pdf, inhalt)` und `meldevordruckInhaltSchrift(pdf, inhalt)` geben vorab die Schriftgröße zurück und ob der Text überhaupt passt, etwa um vor dem Erzeugen zu warnen.

### Optionen

| Option | Wirkung |
| --- | --- |
| `offsetX` | Versatz in mm, z. B. `148.5` für die rechte Hälfte eines A4-Querformats |
| `ohneHintergrund` | Formularbild weglassen, zum Bedrucken vorgedruckter Bögen |
| `hintergrund` | eigenes Formularbild (Data-URL, Base64 oder PNG-Bytes) statt des mitgelieferten |
| `ohneRahmen` | Titel, Hinweis und Fußzeile am Blattrand weglassen |

Das mitgelieferte Bild landet unter festem Namen in der PDF und wird deshalb nur einmal gespeichert, auch bei vielen Seiten.

### Feldgeometrie

`NACHRICHTENVORDRUCK_ANKREUZFELDER` und `NACHRICHTENVORDRUCK_TEXTFELDER` enthalten die vermessenen Anker in Millimetern. Wer ein eigenes Formularbild mit anderer Aufteilung verwendet, kann sie zum Prüfen heranziehen.

## Entwicklung

```bash
npm install
npm test            # Vitest
npm run typecheck
npm run build       # dist/
```

Die Formularbilder liegen in `assets/` und werden als Data-URL nach `src/hintergrund.ts` geschrieben. Nach einer Änderung an einem PNG:

```bash
npm run bilder
```

Ein Test schlägt fehl, wenn `src/hintergrund.ts` nicht zu den PNGs passt.

## Lizenz

EUPL-1.2, siehe [LICENSE](LICENSE).
