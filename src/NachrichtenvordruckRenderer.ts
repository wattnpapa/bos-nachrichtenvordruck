import type { jsPDF } from "jspdf";
import {
    NACHRICHTENVORDRUCK_ANKREUZFELDER,
    NACHRICHTENVORDRUCK_TEXTFELDER,
    VORDRUCK_BREITE,
    VORDRUCK_HOEHE
} from "./felder.js";
import type { VordruckDaten } from "./VordruckDaten.js";
import { NACHRICHTENVORDRUCK_HINTERGRUND } from "./hintergrund.js";
import { zeichneEinzeilig, zeichneInZelle, zeichneMehrzeilig } from "./pdfText.js";

/** Bilddaten, die `jsPDF.addImage` als Formularbild annimmt. */
export type VordruckHintergrund = string | Uint8Array;

/** Was außer den Feldern gezeichnet wird. */
export interface VordruckRenderOptionen {
    /** Seitenversatz in mm – für zwei Vordrucke auf einem A4-Querformat. */
    offsetX?: number;
    /** Formularbild weglassen, etwa zum Druck auf vorgedruckte Bögen. */
    ohneHintergrund?: boolean;
    /**
     * Eigenes Formularbild statt des mitgelieferten, etwa ein Bogen mit
     * Wappen oder eine andere Auflage. Data-URL, Base64 oder PNG-Bytes;
     * gezeichnet wird es auf 148 × 210 mm.
     */
    hintergrund?: VordruckHintergrund;
    /** Titel, Hinweis und Herkunftszeile weglassen. */
    ohneRahmen?: boolean;
}

/** Schriftgröße des „x" in den Ankreuzfeldern. */
const ANKREUZ_SCHRIFTGROESSE = 16;

/**
 * Name, unter dem jsPDF das mitgelieferte Formularbild ablegt. Mit festem Namen
 * landet es nur einmal in der PDF, auch wenn hundert Vordrucke es benutzen.
 */
const HINTERGRUND_ALIAS = "bos-nachrichtenvordruck";

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

    zeichneHintergrund(pdf, optionen, NACHRICHTENVORDRUCK_HINTERGRUND, HINTERGRUND_ALIAS);

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

    pdf.setFontSize(12);
    pdf.text(daten.absender, offsetX + 44, 155);

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

    // Inhalt ab 77 mm bis zum Fußblock bei 148 mm. Funksprüche passen in
    // Normalgröße; lange Ausdrucke und E-Mails einer Führungsstellen-Übung
    // werden verkleinert, statt in den Fußblock zu laufen.
    const inhaltHoehe = 71;
    pdf.setFontSize(12);
    const inhaltZeilen: string[] = pdf.splitTextToSize(String(daten.inhalt).replace(/\\n/g, "\n"), 120);
    if (inhaltZeilen.length * 6.3 <= inhaltHoehe) {
        zeichneMehrzeilig(pdf, {
            text: daten.inhalt,
            x: offsetX + 17,
            y: 77,
            maxWidth: 120,
            lineHeight: 6.3,
            fontSize: 12,
            lineSpacing: 0
        });
    } else {
        zeichneInZelle(pdf, {
            text: String(daten.inhalt).replace(/\\n/g, "\n"),
            x: offsetX + 17,
            y: 77,
            width: 120,
            height: inhaltHoehe
        });
    }

    if (!optionen.ohneRahmen) {
        zeichneRahmen(pdf, daten, offsetX);
    }
}

/**
 * Legt das Formularbild auf die Seite – das mitgelieferte oder das aus
 * `optionen.hintergrund`. Ein eigenes Bild bekommt keinen festen Alias, damit es
 * nicht mit dem mitgelieferten verwechselt wird.
 */
export function zeichneHintergrund(
    pdf: jsPDF,
    optionen: VordruckRenderOptionen,
    standard: string,
    standardAlias: string
): void {
    if (optionen.ohneHintergrund) {
        return;
    }
    const offsetX = optionen.offsetX ?? 0;
    if (optionen.hintergrund !== undefined) {
        pdf.addImage(optionen.hintergrund, "PNG", offsetX, 0, VORDRUCK_BREITE, VORDRUCK_HOEHE);
        return;
    }
    pdf.addImage(standard, "PNG", offsetX, 0, VORDRUCK_BREITE, VORDRUCK_HOEHE, standardAlias);
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
