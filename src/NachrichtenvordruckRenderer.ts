import type { jsPDF } from "jspdf";
import {
    NACHRICHTENVORDRUCK_ANKREUZFELDER,
    NACHRICHTENVORDRUCK_TEXTFELDER,
    VORDRUCK_BREITE,
    VORDRUCK_HOEHE
} from "./felder.js";
import type { VordruckDaten } from "./VordruckDaten.js";
import { zeichneFormular, type Formular } from "./formular.js";
import { NACHRICHTENVORDRUCK_FORMULAR } from "./formularGeometrie.js";
import { trenneLangeWoerter, umbrechen, wirdGekuerzt, zeichneEinzeilig, zeichneInZelle, zeichneZeilenBegrenzt } from "./pdfText.js";

/** Bilddaten, die `jsPDF.addImage` als Formularbild annimmt. */
export type VordruckHintergrund = string | Uint8Array;

/** Was außer den Feldern gezeichnet wird. */
export interface VordruckRenderOptionen {
    /** Seitenversatz in mm – für zwei Vordrucke auf einem A4-Querformat. */
    offsetX?: number;
    /** Formular (Linien, Kästchen, Beschriftung) weglassen, etwa zum Druck auf vorgedruckte Bögen. */
    ohneHintergrund?: boolean;
    /**
     * Eigenes Formularbild statt des gezeichneten Formulars, etwa ein Bogen mit
     * Wappen oder eine andere Auflage. Data-URL, Base64 oder PNG-Bytes;
     * gezeichnet wird es auf 148 × 210 mm.
     */
    hintergrund?: VordruckHintergrund;
    /** Farbe des gezeichneten Formulars, z. B. `"#ff0000"`. Standard Schwarz. */
    formularfarbe?: string;
    /** Titel, Hinweis und Herkunftszeile weglassen. */
    ohneRahmen?: boolean;
}

/** Schriftgröße des „x" in den Ankreuzfeldern. */
const ANKREUZ_SCHRIFTGROESSE = 16;

/**
 * Zeichnet einen Nachrichtenvordruck aus `VordruckDaten` auf die aktuelle Seite.
 *
 * Kennt weder Übung noch Nachricht – alles kommt aus den Daten. Die
 * Zeichenreihenfolge ist bewusst festgeschrieben, damit die PDF-Ausgabe bei
 * gleicher Eingabe unverändert bleibt.
 */
export function zeichneNachrichtenvordruck(
    pdf: jsPDF,
    daten: VordruckDaten,
    optionen: VordruckRenderOptionen = {}
): void {
    const offsetX = optionen.offsetX ?? 0;

    zeichneHintergrund(pdf, optionen, NACHRICHTENVORDRUCK_FORMULAR);

    for (const feld of daten.ankreuzfelder()) {
        const position = NACHRICHTENVORDRUCK_ANKREUZFELDER[feld];
        pdf.setFontSize(ANKREUZ_SCHRIFTGROESSE);
        pdf.text("x", offsetX + position.x, position.y);
    }

    for (const [name, wert] of Object.entries(daten.textfelder())) {
        if (!wert) {
            continue;
        }
        const feld = NACHRICHTENVORDRUCK_TEXTFELDER[name as keyof typeof NACHRICHTENVORDRUCK_TEXTFELDER];
        if (name === "vermerke") {
            zeichneVermerke(pdf, wert, offsetX);
            continue;
        }
        zeichneEinzeilig(pdf, {
            text: wert,
            x: offsetX + feld.x,
            y: feld.y,
            maxWidth: feld.maxBreite,
            fontSize: feld.schriftgroesse
        });
    }

    // Kästchen „Nr.“: 122,3–142,4 mm.
    zeichneEinzeilig(pdf, { text: daten.nummer, x: offsetX + 125.5, y: 17, maxWidth: 16, fontSize: 10 });

    // Zelle „Absender“: 39,0–142,2 mm. Was nicht hineinpasst, wird kleiner
    // gesetzt, statt über den Formularrand zu laufen; kurze Absender bleiben
    // unverändert in 12 pt.
    pdf.setFontSize(12);
    if (daten.absender) {
        zeichneEinzeilig(pdf, { text: daten.absender, x: offsetX + 44, y: 155, maxWidth: 97, fontSize: 12 });
    } else {
        pdf.text(daten.absender, offsetX + 44, 155);
    }
    // Rufname und Anschrift beginnen in 12 pt, gleich wie lang der Absender ist.
    pdf.setFontSize(12);

    // Die Zellhöhen sind am Formularbild gemessen und dürfen nicht größer
    // gesetzt werden – `zeichneInZelle` verkleinert die Schrift nur, solange der
    // Text nicht hineinpasst.
    // Zelle „Rufname der Gegenstelle": 57,3–142,2 mm breit, 29,6–38,9 mm hoch.
    zeichneInZelle(pdf, {
        text: daten.empfaenger.join(", "),
        x: offsetX + 58,
        y: 30,
        width: 83,
        height: 8.5
    });

    // Zelle „Anschrift": 39,6–116,5 mm breit, 48,3–65,1 mm hoch.
    zeichneInZelle(pdf, {
        text: daten.anschriften.join(", "),
        x: offsetX + 42,
        y: 48,
        width: 74,
        height: 16.5
    });

    // Folgebogen: rechts in der Zeile „Inhalt“ (65,4–71,9 mm).
    if (daten.blatt) {
        pdf.setFont("helvetica", "bold");
        zeichneEinzeilig(pdf, { text: daten.blatt, x: offsetX + 100, y: 70.2, maxWidth: 41, fontSize: 10 });
        pdf.setFont("helvetica", "normal");
    }

    // Inhalt auf den zwölf Linien des Formulars (78,41–149,84 mm), je 1,3 mm über
    // der Linie. Längerer Text wird abgeschnitten, nicht verkleinert.
    zeichneZeilenBegrenzt(pdf, {
        text: daten.inhalt,
        x: offsetX + 17,
        y: INHALT_FELD.y,
        maxWidth: INHALT_FELD.breite,
        lineHeight: INHALT_FELD.zeilenhoehe,
        fontSize: INHALT_FELD.schriftgroesse,
        maxZeilen: INHALT_FELD.zeilen
    });

    if (!optionen.ohneRahmen) {
        zeichneRahmen(pdf, daten, offsetX);
    }
}

/** Zeilen der Vermerke unterhalb des Streifens neben „Vermerke“; `erste` ist die Zeile im Streifen. */
function vermerkeAufteilen(pdf: jsPDF, text: string): { erste: string; rest: string } {
    pdf.setFontSize(9);
    // Eigene Zeilenumbrüche bleiben: nur der erste Absatz beginnt im Streifen.
    const [absatz = "", ...weitere] = String(text).replace(/\\n/g, "\n").split(/\r?\n/);
    const erste = (pdf.splitTextToSize(trenneLangeWoerter(pdf, absatz, 22), 22) as string[])[0] ?? "";
    // Endet die erste Zeile mit einem Trennstrich, geht das Wort in der nächsten Zeile weiter.
    const verbraucht = erste.endsWith("-") && !absatz.startsWith(erste) ? erste.slice(0, -1) : erste;
    const restAbsatz = absatz.slice(absatz.indexOf(verbraucht) + verbraucht.length).trim();
    return { erste, rest: [restAbsatz, ...weitere].filter((zeile, index) => index > 0 || zeile).join("\n").trim() };
}

/**
 * Felder des Nachrichtenvordrucks, deren Wert nicht ganz auf das Blatt passt und
 * gekürzt gedruckt würde: Namen wie in `VordruckDaten.textfelder()`, dazu
 * `nummer` und `absender`. Der Inhalt hat eine eigene Prüfung
 * (`nachrichtenvordruckInhaltZeilen`). Zeichnet nichts.
 */
export function nachrichtenvordruckGekuerzt(pdf: jsPDF, daten: VordruckDaten): string[] {
    const vorher = pdf.getFontSize();
    const gekuerzt: string[] = [];
    if (daten.nummer && wirdGekuerzt(pdf, daten.nummer, 16)) {
        gekuerzt.push("nummer");
    }
    if (daten.absender && wirdGekuerzt(pdf, daten.absender, 97)) {
        gekuerzt.push("absender");
    }
    for (const [name, wert] of Object.entries(daten.textfelder())) {
        if (!wert) {
            continue;
        }
        if (name === "vermerke") {
            const { rest } = vermerkeAufteilen(pdf, wert);
            if (rest && umbrechen(pdf, rest, 47.5, 9).length > 6) {
                gekuerzt.push(name);
            }
            continue;
        }
        const feld = NACHRICHTENVORDRUCK_TEXTFELDER[name as keyof typeof NACHRICHTENVORDRUCK_TEXTFELDER];
        if (wirdGekuerzt(pdf, wert, feld.maxBreite)) {
            gekuerzt.push(name);
        }
    }
    pdf.setFontSize(vorher);
    return gekuerzt;
}

/**
 * Vermerke: die erste Zeile im Streifen rechts neben „Vermerke“ (118,0–142,6 mm),
 * der Rest auf der freien Fläche darunter (92,6–142,6 × 174,3–204,2 mm), in
 * 9 pt und höchstens sechs Zeilen; was dann noch fehlt, endet mit „…“.
 */
function zeichneVermerke(pdf: jsPDF, text: string, offsetX: number): void {
    const { erste, rest } = vermerkeAufteilen(pdf, text);
    pdf.text(erste, offsetX + 118.8, 173.2);
    if (!rest) {
        return;
    }
    zeichneZeilenBegrenzt(pdf, { text: rest, x: offsetX + 94, y: 178.4, maxWidth: 47.5, lineHeight: 4.2, fontSize: 9, maxZeilen: 6 });
}

/**
 * Inhaltsfeld des Nachrichtenvordrucks: 120 mm breit, zwölf Linien von 78,41 bis
 * 149,84 mm, also im Abstand von 6,4936 mm.
 */
const INHALT_FELD = { y: 77.11, breite: 120, zeilen: 12, zeilenhoehe: (149.84 - 78.41) / 11, schriftgroesse: 12 };

/**
 * Wie viele Zeilen `inhalt` auf dem Nachrichtenvordruck braucht und wie viele
 * Platz haben. Mehr als `maxZeilen` wird abgeschnitten. Für Hinweise vor dem
 * Erzeugen; zeichnet nichts.
 */
export function nachrichtenvordruckInhaltZeilen(pdf: jsPDF, inhalt: string): { zeilen: number; maxZeilen: number } {
    const vorher = pdf.getFontSize();
    const zeilen = inhalt ? umbrechen(pdf, inhalt, INHALT_FELD.breite, INHALT_FELD.schriftgroesse).length : 0;
    pdf.setFontSize(vorher);
    return { zeilen, maxZeilen: INHALT_FELD.zeilen };
}

/**
 * Teilt `inhalt` in Stücke, die je genau auf einen Nachrichtenvordruck passen,
 * für Folgebögen statt abgeschnittenen Textes. Jedes Stück ergibt umbrochen
 * dieselben Zeilen wie im Ganzen. Zeichnet nichts.
 */
export function nachrichtenvordruckInhaltTeilen(pdf: jsPDF, inhalt: string): string[] {
    return inhaltTeilen(pdf, inhalt, INHALT_FELD.breite, INHALT_FELD.schriftgroesse, INHALT_FELD.zeilen);
}

/** Gemeinsam für beide Vordrucke: Zeilen umbrechen und in Blöcke zu `maxZeilen` fassen. */
export function inhaltTeilen(pdf: jsPDF, inhalt: string, breite: number, schriftgroesse: number, maxZeilen: number): string[] {
    const vorher = pdf.getFontSize();
    const zeilen = inhalt ? umbrechen(pdf, inhalt, breite, schriftgroesse) : [];
    pdf.setFontSize(vorher);
    const stuecke: string[] = [];
    for (let i = 0; i < zeilen.length; i += maxZeilen) {
        stuecke.push(zeilen.slice(i, i + maxZeilen).join("\n").replace(/^\n+|\n+$/g, ""));
    }
    return stuecke.filter(stueck => stueck.trim() !== "");
}

/**
 * Zeichnet das Formular als Vektorgrafik oder legt stattdessen das Bild aus
 * `optionen.hintergrund` auf die Seite.
 */
export function zeichneHintergrund(
    pdf: jsPDF,
    optionen: VordruckRenderOptionen,
    formular: Formular
): void {
    if (optionen.ohneHintergrund) {
        return;
    }
    const offsetX = optionen.offsetX ?? 0;
    if (optionen.hintergrund !== undefined) {
        pdf.addImage(optionen.hintergrund, "PNG", offsetX, 0, VORDRUCK_BREITE, VORDRUCK_HOEHE);
        return;
    }
    zeichneFormular(pdf, formular, { offsetX, farbe: optionen.formularfarbe });
}

/**
 * Titel, Hinweis und Herkunftszeile außerhalb des Formulars. Identisch für
 * Nachrichten- und Meldevordruck.
 */
export function zeichneRahmen(pdf: jsPDF, daten: VordruckDaten, offsetX: number): void {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(daten.titel, offsetX + (VORDRUCK_BREITE / 2), 4, { align: "center" });
    pdf.text(daten.hinweis, offsetX + (VORDRUCK_BREITE / 2), VORDRUCK_HOEHE - 2.5, { align: "center" });

    pdf.setDrawColor(0);

    // Senkrecht am rechten Blattrand
    pdf.setFontSize(6);
    pdf.text(daten.fusszeile, VORDRUCK_BREITE - 3 + offsetX, VORDRUCK_HOEHE - 5, {
        angle: 90,
        align: "left"
    });
}
