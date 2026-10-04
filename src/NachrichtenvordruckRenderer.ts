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
import { umbrechen, zeichneEinzeilig, zeichneInZelle, zeichneZeilenBegrenzt } from "./pdfText.js";

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
        zeichneEinzeilig(pdf, {
            text: wert,
            x: offsetX + feld.x,
            y: feld.y,
            maxWidth: feld.maxBreite,
            fontSize: feld.schriftgroesse
        });
    }

    pdf.setFontSize(10);
    pdf.text(daten.nummer, offsetX + 125.5, 17);

    // Zelle „Absender“: 39,0–142,2 mm. Was nicht hineinpasst, wird kleiner
    // gesetzt, statt über den Formularrand zu laufen; kurze Absender bleiben
    // unverändert in 12 pt.
    pdf.setFontSize(12);
    if (daten.absender) {
        zeichneEinzeilig(pdf, { text: daten.absender, x: offsetX + 44, y: 155, maxWidth: 97, fontSize: 12 });
    } else {
        pdf.text(daten.absender, offsetX + 44, 155);
    }

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
    pdf.text(daten.hinweis, offsetX + (VORDRUCK_BREITE / 2), VORDRUCK_HOEHE - 1.5, { align: "center" });

    pdf.setDrawColor(0);

    // Senkrecht am rechten Blattrand
    pdf.setFontSize(6);
    pdf.text(daten.fusszeile, VORDRUCK_BREITE - 3 + offsetX, VORDRUCK_HOEHE - 5, {
        angle: 90,
        align: "left"
    });
}
