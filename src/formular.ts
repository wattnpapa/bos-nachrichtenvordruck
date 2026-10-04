import type { jsPDF } from "jspdf";

/**
 * Ein Zeichenelement des Formulars. Alle Maße in Millimetern, gemessen von der
 * linken oberen Ecke des Vordrucks (148 × 210 mm). Linien und Rahmen liegen wie
 * in PDF auf der Mitte des Strichs.
 */
export type FormularElement =
    /** Graue Hinterlegung ohne Rand. */
    | { readonly art: "flaeche"; readonly x: number; readonly y: number; readonly b: number; readonly h: number }
    /** Gerade Linie, Strichstärke in pt. */
    | {
        readonly art: "linie";
        readonly x1: number;
        readonly y1: number;
        readonly x2: number;
        readonly y2: number;
        readonly staerke: number;
    }
    /**
     * Rechteck mit Rand, Strichstärke in pt. `weiss`: innen weiß gefüllt
     * (Ankreuzkästchen auf grauer Fläche). `raster`: grauer Rand (Schreibraster
     * des Meldevordrucks).
     */
    | {
        readonly art: "rahmen";
        readonly x: number;
        readonly y: number;
        readonly b: number;
        readonly h: number;
        readonly staerke: number;
        readonly weiss?: boolean;
        readonly raster?: boolean;
    }
    /**
     * Beschriftung. `x`/`y` ist der Anfang der Grundlinie, `groesse` die
     * Schriftgröße in pt, `breite` die Laufweite der Vorlage von der linken
     * Kante des ersten bis zur rechten Kante des letzten Zeichens.
     */
    | {
        readonly art: "text";
        readonly text: string;
        readonly x: number;
        readonly y: number;
        readonly groesse: number;
        readonly breite: number;
        readonly fett?: boolean;
    };

/** Ein Formular als Folge von Zeichenelementen, in Zeichenreihenfolge. */
export type Formular = readonly FormularElement[];

/** Wie das Formular gezeichnet wird. */
export interface FormularOptionen {
    /** Seitenversatz in mm. */
    offsetX?: number;
    /** Farbe für Linien, Rahmen und Beschriftung, z. B. `"#ff0000"`. Standard Schwarz. */
    farbe?: string | undefined;
    /**
     * Graue Flächen und weiße Kästchenfüllung zeichnen. Abgeschaltet bleibt nur
     * das Strichbild – zum Überlagern eines Formularbildes beim Abgleich.
     */
    flaechen?: boolean;
}

/** Grau der hinterlegten Flächen (91 % Weiß wie in der Vorlage). */
const FLAECHENGRAU = 232;
/**
 * Grau des Schreibrasters im Meldevordruck. Die Vorlage zeichnet es mit 66 %
 * Schwarz bei 17 % Deckkraft; das ergibt deckend etwa 11 % Schwarz.
 */
const RASTERGRAU = "#e2e2e2";
/** 1 pt in mm. */
const PUNKT = 25.4 / 72;

/**
 * Zeichnet ein Formular – Linien, Kästchen, Flächen und Beschriftung – als
 * Vektorgrafik auf die aktuelle Seite.
 *
 * Die Beschriftung steht in Helvetica, der Standardschrift jeder PDF. Die
 * Vorlage ist in Verdana gesetzt; damit jede Beschriftung trotzdem genau die
 * Fläche der Vorlage einnimmt, wird der Zeichenabstand auf die gemessene
 * Laufweite angepasst. Schriftgröße und Grundlinie bleiben unverändert.
 *
 * Danach sind Schrift, Farben und Strichstärke auf die jsPDF-Vorgaben
 * zurückgesetzt, damit das Ausfüllen nicht vom Formular abhängt.
 */
export function zeichneFormular(pdf: jsPDF, formular: Formular, optionen: FormularOptionen = {}): void {
    const dx = optionen.offsetX ?? 0;
    const farbe = optionen.farbe ?? "#000000";
    const flaechen = optionen.flaechen ?? true;

    pdf.setDrawColor(farbe);
    pdf.setTextColor(farbe);
    pdf.setFillColor(255, 255, 255);

    for (const element of formular) {
        switch (element.art) {
            case "flaeche":
                if (flaechen) {
                    pdf.setFillColor(FLAECHENGRAU, FLAECHENGRAU, FLAECHENGRAU);
                    pdf.rect(dx + element.x, element.y, element.b, element.h, "F");
                    pdf.setFillColor(255, 255, 255);
                }
                break;
            case "linie":
                pdf.setLineWidth(element.staerke * PUNKT);
                pdf.line(dx + element.x1, element.y1, dx + element.x2, element.y2);
                break;
            case "rahmen":
                pdf.setLineWidth(element.staerke * PUNKT);
                if (element.raster && !optionen.farbe) {
                    pdf.setDrawColor(RASTERGRAU);
                }
                pdf.rect(dx + element.x, element.y, element.b, element.h, element.weiss && flaechen ? "FD" : "S");
                pdf.setDrawColor(farbe);
                break;
            case "text": {
                pdf.setFont("helvetica", element.fett ? "bold" : "normal");
                pdf.setFontSize(element.groesse);
                const zeichen = element.text.length;
                const charSpace = zeichen > 1
                    ? (element.breite - pdf.getTextWidth(element.text)) / (zeichen - 1)
                    : 0;
                pdf.text(element.text, dx + element.x, element.y, { charSpace });
                break;
            }
        }
    }

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);
    pdf.setDrawColor(0);
    pdf.setFillColor(0, 0, 0);
    pdf.setLineWidth(0.200025);
}
