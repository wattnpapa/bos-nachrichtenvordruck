# bos-nachrichtenvordruck

Füllt den BOS-Nachrichtenvordruck (4fach-Satz) und den Meldevordruck mit jsPDF als PDF aus. Das Formular selbst, also Rahmen, Linien, Kästchen, graue Flächen und Beschriftung, zeichnet die Bibliothek als Vektorgrafik; ein Formularbild braucht sie nicht. Die Geometrie stammt aus den InDesign-Vorlagen in `assets/` und ist auf 0,01 mm genau übernommen, damit die Felder auch auf einem Nadeldrucker an der richtigen Stelle landen. Beide Vordrucke haben das Format A5 hoch (148 × 210 mm), zwei passen nebeneinander auf ein A4-Querformat.

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

Nicht gesetzte Felder bleiben leer. `VordruckDaten` kennt jedes Feld des Nachrichtenvordrucks: Übermittlungsweg (Kopfzeile und Spruchkopf), Richtung im Technischen Betriebsbuch, Aufnahme-, Annahme- und Beförderungsvermerk, Art, Vorrang, Gesprächsnotiz, Abfassungszeit, Zeichen, Funktion, Quittung, Vermerke und über `weitereAnkreuzfelder` das Verteilerraster. Der Meldevordruck nutzt davon nur Nummer, Übermittlungsweg (Funk, Kurier, Telefon, Telefax; DFÜ hat er nicht), Absender, Empfänger, Verfasser und Inhalt.

`titel`, `hinweis` und `fusszeile` stehen außerhalb des Formulars am Blattrand.

Die Schrift im Inhaltsfeld wird nie verkleinert: Der Nachrichtenvordruck schreibt 12 Zeilen in 12 pt auf die Linien, der Meldevordruck 26 Zeilen in 11,5 pt ins Raster. Was darüber hinausgeht, wird abgeschnitten, die letzte gedruckte Zeile endet dann mit „…“. `nachrichtenvordruckInhaltZeilen(pdf, inhalt)` und `meldevordruckInhaltZeilen(pdf, inhalt)` geben vorab `{ zeilen, maxZeilen }` zurück, etwa um vor dem Erzeugen zu warnen.

### Optionen

| Option | Wirkung |
| --- | --- |
| `offsetX` | Versatz in mm, z. B. `148.5` für die rechte Hälfte eines A4-Querformats |
| `ohneHintergrund` | Formular weglassen, zum Bedrucken vorgedruckter Bögen |
| `hintergrund` | eigenes Formularbild (Data-URL, Base64 oder PNG-Bytes) statt des gezeichneten Formulars |
| `formularfarbe` | Farbe des gezeichneten Formulars, z. B. `"#ff0000"`; Standard Schwarz |
| `ohneRahmen` | Titel, Hinweis und Fußzeile am Blattrand weglassen |

Die Beschriftung des Formulars steht in Helvetica, der Standardschrift jeder PDF, in der Schriftgröße der Vorlage (8 pt, Titel des Meldevordrucks 10 pt fett). Die Vorlage ist in Verdana gesetzt, die sich nicht frei mitliefern lässt; der Zeichenabstand jeder Beschriftung wird deshalb so angepasst, dass sie dieselbe Breite einnimmt wie in der Vorlage.
Mit `new jsPDF({ …, compress: true })` bleibt die Datei klein.

### Feldgeometrie

`NACHRICHTENVORDRUCK_ANKREUZFELDER` und `NACHRICHTENVORDRUCK_TEXTFELDER` enthalten die vermessenen Anker in Millimetern. Wer ein eigenes Formularbild mit anderer Aufteilung verwendet, kann sie zum Prüfen heranziehen.

`NACHRICHTENVORDRUCK_FORMULAR` und `MELDEVORDRUCK_FORMULAR` beschreiben das Formular selbst als Liste von Flächen, Linien, Rahmen und Beschriftungen in Millimetern. `zeichneFormular(pdf, formular, { offsetX, farbe, flaechen })` zeichnet sie einzeln, etwa als Strichbild über ein eingescanntes Formular.

## Entwicklung

```bash
npm install
npm test            # Vitest
npm run typecheck
npm run build       # dist/
```

In `assets/` liegen die InDesign-Vorlagen (PDF) und daraus erzeugte Formularbilder (PNG, 200 dpi). Sie gehören nicht zum Paket, sondern dienen als Referenz für `src/formularGeometrie.ts`. Zum Abgleich:

```bash
npm run vergleich
```

Das schreibt `vergleich/vergleich.pdf`: die Formularbilder mit dem gezeichneten Formular in Rot darüber. Sieht neben einer roten Linie Grau oder Schwarz hervor, weicht die Geometrie ab.

## Lizenz

EUPL-1.2, siehe [LICENSE](LICENSE).
