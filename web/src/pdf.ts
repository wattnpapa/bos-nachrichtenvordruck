import { jsPDF } from "jspdf";
import {
    zeichneMeldevordruck,
    zeichneNachrichtenvordruck,
    type VordruckDaten,
    type VordruckRenderOptionen
} from "../../src/index.js";

export type VordruckWahl = "nachricht" | "meldung" | "beide";
export type Blattformat = "a4" | "a5";

export interface PdfOptionen {
    vordruck: VordruckWahl;
    blatt: Blattformat;
    /** Formularbild weglassen, zum Bedrucken vorgedruckter Bögen. */
    ohneHintergrund: boolean;
}

type Zeichner = (pdf: jsPDF, daten: VordruckDaten, optionen: VordruckRenderOptionen) => void;

/**
 * Setzt alle Vordrucke in eine PDF. Bei A4 quer stehen immer zwei Vordrucke
 * nebeneinander: mit „beide" Nachrichten- und Meldevordruck derselben Zeile,
 * sonst zwei aufeinanderfolgende Zeilen. Bei A5 bekommt jeder Vordruck ein
 * eigenes Blatt.
 */
export function erzeugePdf(alle: readonly VordruckDaten[], optionen: PdfOptionen): jsPDF {
    const stuecke: { zeichner: Zeichner; daten: VordruckDaten }[] = [];
    for (const daten of alle) {
        if (optionen.vordruck !== "meldung") {
            stuecke.push({ zeichner: zeichneNachrichtenvordruck, daten });
        }
        if (optionen.vordruck !== "nachricht") {
            stuecke.push({ zeichner: zeichneMeldevordruck, daten });
        }
    }

    const a4 = optionen.blatt === "a4";
    const pdf = a4 ? new jsPDF("l", "mm", "a4") : new jsPDF("p", "mm", "a5");
    const jeBlatt = a4 ? 2 : 1;

    stuecke.forEach((stueck, index) => {
        if (index > 0 && index % jeBlatt === 0) {
            pdf.addPage();
        }
        stueck.zeichner(pdf, stueck.daten, {
            offsetX: (index % jeBlatt) * 148.5,
            ohneHintergrund: optionen.ohneHintergrund
        });
    });

    return pdf;
}

export function dateiname(optionen: PdfOptionen, anzahl: number): string {
    const art = { nachricht: "nachrichtenvordruck", meldung: "meldevordruck", beide: "vordrucke" }[optionen.vordruck];
    const mehrzahl = anzahl > 1 && optionen.vordruck !== "beide" ? "e" : "";
    return `${art}${mehrzahl}.pdf`;
}
