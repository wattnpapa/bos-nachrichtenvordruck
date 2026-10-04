import type { jsPDF } from "jspdf";
import type { VordruckDaten } from "./VordruckDaten.js";
import type { Uebermittlungsweg } from "./felder.js";
import { MELDEVORDRUCK_HINTERGRUND } from "./hintergrund.js";
import { schriftFuerBlock, zeichneAngepasst, zeichneImBlock } from "./pdfText.js";
import {
    zeichneHintergrund,
    zeichneRahmen,
    type VordruckRenderOptionen
} from "./NachrichtenvordruckRenderer.js";

/** Siehe `HINTERGRUND_ALIAS` im Nachrichtenvordruck. */
const HINTERGRUND_ALIAS = "bos-meldevordruck";

/**
 * Empfängerfeld des Meldevordrucks, am Formularbild gemessen: die Zelle reicht
 * von 30,8 bis 45,9 mm, waagerecht von 18,1 bis 112,0 mm. Oben steht die
 * Beschriftung „Empfänger", darunter bleibt Platz für zwei Zeilen.
 *
 * `y` ist die Grundlinie der ersten Zeile, `letzteGrundlinie` die der letzten,
 * die noch vollständig in der Zelle liegt (Unterkante minus Unterlängen).
 */
const EMPFAENGER_ZELLE = {
    x: 20,
    y: 40,
    maxBreite: 90,
    letzteGrundlinie: 45.5,
    zeilenhoehe: 5,
    schriftgroesse: 8
};

/**
 * Kästchen „Übermittelt“ am Formularbild gemessen: Funk 109,2–111,8 mm und
 * Kurier 127,3–130,0 mm in der oberen Zeile (7,1–9,8 mm), Telefon 92,0–94,7 mm
 * und Fax 109,0–111,7 mm in der unteren (12,7–15,2 mm). `x`/`y` ist die
 * Grundlinie des Kreuzes in 16 pt.
 */
const MELDEVORDRUCK_WEG: Partial<Record<Uebermittlungsweg, { x: number; y: number }>> = {
    funk: { x: 109.5, y: 10 },
    kurier: { x: 127.6, y: 10 },
    telefon: { x: 92.3, y: 15.4 },
    telefax: { x: 109.3, y: 15.4 }
};

/**
 * Inhaltsfeld des Meldevordrucks, am Formularbild gemessen: das Raster reicht
 * von 51,2 bis 185,7 mm, darunter beginnen Verfasser und Abfassungszeit.
 * `letzteGrundlinie` lässt Platz für die Unterlängen der letzten Zeile.
 */
const INHALT_FELD = {
    x: 20,
    y: 55,
    maxBreite: 120,
    zeilenhoehe: 5,
    schriftgroesse: 11.5,
    letzteGrundlinie: 184.5
};

/**
 * Schriftgröße, mit der der Meldevordruck `inhalt` setzt, und ob der Text
 * selbst in der kleinsten Größe ins Inhaltsfeld passt. Für Hinweise vor dem
 * Erzeugen; zeichnet nichts.
 */
export function meldevordruckInhaltSchrift(pdf: jsPDF, inhalt: string): { schriftgroesse: number; passt: boolean } {
    const { schriftgroesse, passt } = schriftFuerBlock(pdf, {
        text: inhalt,
        y: INHALT_FELD.y,
        maxWidth: INHALT_FELD.maxBreite,
        lineHeight: INHALT_FELD.zeilenhoehe,
        fontSize: INHALT_FELD.schriftgroesse,
        letzteGrundlinie: INHALT_FELD.letzteGrundlinie
    });
    return { schriftgroesse, passt };
}

/**
 * Zeichnet einen Meldevordruck aus `VordruckDaten` auf die aktuelle Seite.
 *
 * Der Meldevordruck ist der kürzere Bogen: er kennt weder Vermerke noch
 * Verteiler, füllt also nur einen Teil der Felder aus `VordruckDaten`.
 */
export function zeichneMeldevordruck(
    pdf: jsPDF,
    daten: VordruckDaten,
    optionen: VordruckRenderOptionen = {}
): void {
    const offsetX = optionen.offsetX ?? 0;

    zeichneHintergrund(pdf, optionen, MELDEVORDRUCK_HINTERGRUND, HINTERGRUND_ALIAS);

    // „Übermittelt“ im Kopf: Funk, Kurier, Telefon, Fax. DFÜ hat der
    // Meldevordruck nicht; ohne Weg bleibt alles leer.
    const kreuz = daten.uebermittlungsweg ? MELDEVORDRUCK_WEG[daten.uebermittlungsweg] : undefined;
    if (kreuz) {
        pdf.setFontSize(16);
        pdf.text("x", offsetX + kreuz.x, kreuz.y);
    }

    pdf.setFontSize(12);
    pdf.text(daten.nummer, offsetX + 80, 12);

    pdf.setFontSize(16);
    zeichneAngepasst(pdf, { text: daten.absender, maxWidth: 70, x: offsetX + 22, y: 25 });

    zeichneEmpfaenger(pdf, daten.empfaenger, offsetX);

    pdf.setFontSize(12);
    zeichneAngepasst(pdf, { text: daten.verfasser, maxWidth: 40, x: offsetX + 37, y: 192 });

    // Langer Inhalt wird verkleinert, statt über Verfasser, Abfassungszeit und
    // den Blattrand zu laufen.
    zeichneImBlock(pdf, {
        text: daten.inhalt,
        x: offsetX + INHALT_FELD.x,
        y: INHALT_FELD.y,
        maxWidth: INHALT_FELD.maxBreite,
        lineHeight: INHALT_FELD.zeilenhoehe,
        fontSize: INHALT_FELD.schriftgroesse,
        letzteGrundlinie: INHALT_FELD.letzteGrundlinie
    });

    if (!optionen.ohneRahmen) {
        zeichneRahmen(pdf, daten, offsetX);
    }
}

/**
 * Setzt die Empfänger in das Empfängerfeld und verkleinert die Schrift, bis alle
 * hineinpassen.
 *
 * Kein Empfänger darf wegfallen: wer nicht auf dem Vordruck steht, wird in der
 * Übung nicht angerufen. Die Vorgängerversion prüfte den Platz für die letzte
 * Zeile mit `grundlinie + zeilenhoehe <= untergrenze` und verwarf sie dadurch
 * schon dann, wenn nur der Abstand *unter* der Grundlinie fehlte – bei drei
 * Empfängern fiel die komplette zweite Zeile still weg.
 *
 * Reichen zwei Zeilen nicht, wird die Schrift verkleinert – mit dem Zeilenabstand
 * im gleichen Verhältnis. So bleibt jeder Empfänger lesbar in der Zelle, statt
 * ganz zu fehlen.
 */
function zeichneEmpfaenger(pdf: jsPDF, empfaenger: string[], offsetX: number): void {
    const text = empfaenger.join(", ");
    if (!text) {
        return;
    }

    const startX = offsetX + EMPFAENGER_ZELLE.x;
    const letzteGrundlinie = EMPFAENGER_ZELLE.letzteGrundlinie;

    let schriftgroesse = EMPFAENGER_ZELLE.schriftgroesse;
    pdf.setFontSize(schriftgroesse);
    let abstand = EMPFAENGER_ZELLE.zeilenhoehe;
    let zeilen: string[] = pdf.splitTextToSize(text, EMPFAENGER_ZELLE.maxBreite);

    while (EMPFAENGER_ZELLE.y + (zeilen.length - 1) * abstand > letzteGrundlinie
        && schriftgroesse > 4) {
        schriftgroesse -= 0.2;
        pdf.setFontSize(schriftgroesse);
        abstand = EMPFAENGER_ZELLE.zeilenhoehe * (schriftgroesse / EMPFAENGER_ZELLE.schriftgroesse);
        zeilen = pdf.splitTextToSize(text, EMPFAENGER_ZELLE.maxBreite);
    }

    zeilen.forEach((zeile, index) => {
        pdf.text(zeile, startX, EMPFAENGER_ZELLE.y + index * abstand);
    });
}
