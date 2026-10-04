import type { jsPDF } from "jspdf";

// Textausgabe für die Vordrucke. Freie Funktionen statt Methoden einer
// Basisklasse, damit die Renderer mit einem nackten `jsPDF` auskommen.

/**
 * Zeichnet Text mehrzeilig mit automatischem Umbruch.
 * - Respektiert explizite Zeilenumbrüche (auch als Text geschriebene)
 * - Nutzt jsPDF-eigenes Wrapping (maxWidth)
 */
export function zeichneMehrzeilig(pdf: jsPDF, options: {
    text: string;
    x: number;
    y: number;
    maxWidth: number;
    lineHeight: number;
    fontSize: number;
    lineSpacing?: number;
}): void {
    const { text, x, y, maxWidth, lineHeight, fontSize, lineSpacing = 0 } = options;
    if (!text) {
        return;
    }

    pdf.setFontSize(fontSize);

    const normalized = String(text).replace(/\\n/g, "\n");
    let currentY = y;

    normalized.split("\n").forEach(paragraph => {
        if (paragraph.trim() === "") {
            currentY += lineHeight;
            return;
        }
        const lines: string[] = pdf.splitTextToSize(paragraph, maxWidth);
        lines.forEach(line => {
            pdf.text(line, x, currentY);
            currentY += lineHeight + lineSpacing;
        });
    });
}

/** Ergebnis der Schriftanpassung an eine Zelle oder einen Block. */
export interface Schriftanpassung {
    /** Schriftgröße in pt, mit der gezeichnet wird. */
    schriftgroesse: number;
    /** Umbrochene Zeilen in dieser Größe. */
    zeilen: string[];
    /** Falsch, wenn der Text selbst in der kleinsten Größe nicht hineinpasst. */
    passt: boolean;
}

/**
 * Rechnet aus, mit welcher Schriftgröße `zeichneInZelle` den Text setzt: ab
 * `maxFontSize` in 0,1-pt-Schritten abwärts bis 3 pt. Ändert die Schriftgröße
 * des Dokuments nicht dauerhaft.
 */
export function schriftFuerZelle(pdf: jsPDF, options: {
    text: string;
    width: number;
    height: number;
    maxFontSize: number;
}): Schriftanpassung {
    const { text, width, height, maxFontSize } = options;
    const vorher = pdf.getFontSize();
    const minFontSize = 3;
    const lineSpacing = 0.5; // kontrollierter, fixer Zeilenabstand

    let fontSize = maxFontSize;
    let lines: string[] = pdf.splitTextToSize(text, width);
    let passt = false;

    while (fontSize >= minFontSize) {
        pdf.setFontSize(fontSize);
        lines = pdf.splitTextToSize(text, width);
        if (lines.length * fontSize * lineSpacing <= height) {
            passt = true;
            break;
        }
        fontSize -= 0.1;
    }

    pdf.setFontSize(vorher);
    return { schriftgroesse: fontSize, zeilen: lines, passt };
}

/**
 * Füllt eine Formularzelle: verkleinert die Schrift, bis der umbrochene Text in
 * `height` passt, und zeichnet ihn ab der Oberkante.
 *
 * `height` muss der Zelle im Formular entsprechen und nicht größer sein – sonst
 * greift die Verkleinerung nicht und der Text läuft aus dem Kasten.
 */
export function zeichneInZelle(pdf: jsPDF, options: {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
}): void {
    const { text, x, y, width, height } = options;
    if (!text || !text.trim()) {
        return;
    }

    const maxFontSize = pdf.getFontSize();
    // Sicherheitsnetz: selbst bei der kleinsten Größe alles zeichnen
    const { schriftgroesse: fontSize, zeilen: lines } = schriftFuerZelle(pdf, { text, width, height, maxFontSize });
    const lineHeight = fontSize * 0.5;
    pdf.setFontSize(fontSize);

    // jsPDF setzt auf der Grundlinie an, `y` ist die Oberkante der Zelle
    let currentY = y + (fontSize * 0.4);
    for (const line of lines) {
        pdf.text(line, x, currentY);
        currentY += lineHeight;
    }

    pdf.setFontSize(maxFontSize);
}

/**
 * Bricht den Text so um, wie `zeichneMehrzeilig` ihn setzt: Absätze an
 * Zeilenumbrüchen (auch als Text geschriebenen), leere Absätze als leere Zeile.
 */
export function umbrechen(pdf: jsPDF, text: string, maxWidth: number, fontSize: number): string[] {
    pdf.setFontSize(fontSize);
    return String(text).replace(/\\n/g, "\n").split("\n").flatMap(absatz =>
        absatz.trim() === "" ? [""] : pdf.splitTextToSize(absatz, maxWidth) as string[]);
}

/**
 * Setzt den Text wie `zeichneMehrzeilig` in fester Schriftgröße auf die Linien
 * des Formulars, aber höchstens `maxZeilen` Zeilen. Was darüber hinausgeht,
 * fällt weg; die letzte Zeile endet dann mit „…“, damit auf dem Papier zu sehen
 * ist, dass Text fehlt. Verkleinert wird nicht: kleinere Schrift läge zwischen
 * den Linien und wäre schlecht lesbar.
 */
export function zeichneZeilenBegrenzt(pdf: jsPDF, options: {
    text: string;
    x: number;
    y: number;
    maxWidth: number;
    lineHeight: number;
    fontSize: number;
    maxZeilen: number;
}): { zeilen: number; gezeichnet: number } {
    const { text, x, y, maxWidth, lineHeight, fontSize, maxZeilen } = options;
    if (!text) {
        return { zeilen: 0, gezeichnet: 0 };
    }
    const zeilen = umbrechen(pdf, text, maxWidth, fontSize);
    const sichtbar = zeilen.slice(0, maxZeilen);
    if (zeilen.length > maxZeilen && sichtbar.length > 0) {
        let letzte = (sichtbar[sichtbar.length - 1] ?? "").trimEnd();
        while (letzte && pdf.getTextWidth(`${letzte} …`) > maxWidth) {
            letzte = letzte.slice(0, -1).trimEnd();
        }
        sichtbar[sichtbar.length - 1] = letzte ? `${letzte} …` : "…";
    }
    let currentY = y;
    for (const zeile of sichtbar) {
        if (zeile !== "") {
            pdf.text(zeile, x, currentY);
        }
        currentY += lineHeight;
    }
    return { zeilen: zeilen.length, gezeichnet: sichtbar.length };
}

/**
 * Schreibt einen einzeiligen Wert ab 12 pt und verkleinert in 0,5-pt-Schritten
 * bis 7 pt, damit er in `maxWidth` passt.
 *
 * Wird für die großen Felder des Meldevordrucks gebraucht, deren Schriftbild
 * sich nicht ändern soll.
 */
export function zeichneAngepasst(pdf: jsPDF, options: {
    text: string;
    x: number;
    y: number;
    maxWidth: number;
}): void {
    const { text, x, y, maxWidth } = options;
    let fontSize = 12;
    pdf.setFontSize(fontSize);
    while (pdf.getTextWidth(text) > maxWidth && fontSize > 7) {
        fontSize -= 0.5;
        pdf.setFontSize(fontSize);
    }
    pdf.text(text, x, y);
}

/**
 * Schreibt einen einzeiligen Wert und verkleinert die Schrift ab `fontSize`, bis
 * er in `maxWidth` passt. Untergrenze 4 pt, damit auch die 6 mm schmalen
 * Handzeichen-Zellen etwas Lesbares abbekommen.
 */
export function zeichneEinzeilig(pdf: jsPDF, options: {
    text: string;
    x: number;
    y: number;
    maxWidth: number;
    fontSize: number;
}): void {
    const { text, x, y, maxWidth, fontSize } = options;
    if (!text) {
        return;
    }

    let aktuell = fontSize;
    pdf.setFontSize(aktuell);
    while (pdf.getTextWidth(text) > maxWidth && aktuell > 4) {
        aktuell -= 0.2;
        pdf.setFontSize(aktuell);
    }
    pdf.text(text, x, y);
}
