import { jsPDF } from "jspdf";
import {
    zeichneMeldevordruck,
    zeichneNachrichtenvordruck,
    type VordruckDaten,
    type VordruckRenderOptionen
} from "../../src/index.js";

export type VordruckWahl = "nachricht" | "meldung" | "beide";
/** A4 quer mit zwei Vordrucken, A4 hoch mit einem mittig, A5 randlos. */
export type Blattformat = "a4" | "a4hoch" | "a5";

export interface PdfOptionen {
    vordruck: VordruckWahl;
    blatt: Blattformat;
    /** Formularbild weglassen, zum Bedrucken vorgedruckter Bögen. */
    ohneHintergrund: boolean;
}

type Zeichner = (pdf: jsPDF, daten: VordruckDaten, optionen: VordruckRenderOptionen) => void;

/** Herkunftszeile am Blattrand jedes Vordrucks, den diese App erzeugt. */
export const HERKUNFT = "Erstellt mit nachrichtenvordruck.app · © Johannes Rudolph";

/** Breite und Höhe eines Vordrucks sowie von A4 in mm. */
const VORDRUCK = { breite: 148, hoehe: 210 };
const A4 = { breite: 210, hoehe: 297 };

/**
 * Setzt alle Vordrucke in eine PDF. Bei A4 quer stehen immer zwei Vordrucke
 * nebeneinander: mit „beide" Nachrichten- und Meldevordruck derselben Zeile,
 * sonst zwei aufeinanderfolgende Zeilen. Bei A4 hoch steht jeder Vordruck
 * allein und mittig auf dem Blatt, bei A5 füllt er es aus.
 */
export function erzeugePdf(alle: readonly VordruckDaten[], optionen: PdfOptionen): jsPDF {
    const stuecke: { zeichner: Zeichner; daten: VordruckDaten }[] = [];
    for (const daten of alle) {
        daten.fusszeile = HERKUNFT;
        if (optionen.vordruck !== "meldung") {
            stuecke.push({ zeichner: zeichneNachrichtenvordruck, daten });
        }
        if (optionen.vordruck !== "nachricht") {
            stuecke.push({ zeichner: zeichneMeldevordruck, daten });
        }
    }

    const pdf = {
        a4: () => new jsPDF("l", "mm", "a4"),
        a4hoch: () => new jsPDF("p", "mm", "a4"),
        a5: () => new jsPDF("p", "mm", "a5")
    }[optionen.blatt]();
    const jeBlatt = optionen.blatt === "a4" ? 2 : 1;

    stuecke.forEach((stueck, index) => {
        if (index > 0 && index % jeBlatt === 0) {
            pdf.addPage();
        }
        const zeichnen = () => stueck.zeichner(pdf, stueck.daten, {
            offsetX: (index % jeBlatt) * 148.5,
            ohneHintergrund: optionen.ohneHintergrund
        });
        if (optionen.blatt === "a4hoch") {
            mittig(pdf, zeichnen);
        } else {
            zeichnen();
        }
    });

    return pdf;
}

/**
 * Zeichnet den Vordruck um den Rand von A4 hoch versetzt. Die Renderer kennen
 * nur einen waagerechten Versatz; die Transformationsmatrix verschiebt alles
 * gleichermaßen, Formularbild wie Text. Sie rechnet in Punkt, mit dem
 * Ursprung unten links: nach unten verschieben heißt negatives y.
 */
function mittig(pdf: jsPDF, zeichnen: () => void): void {
    const randX = (A4.breite - VORDRUCK.breite) / 2;
    const randY = (A4.hoehe - VORDRUCK.hoehe) / 2;
    const punktJeMm = pdf.internal.scaleFactor;
    pdf.saveGraphicsState();
    pdf.setCurrentTransformationMatrix(pdf.Matrix(1, 0, 0, 1, randX * punktJeMm, -randY * punktJeMm));
    zeichnen();
    pdf.restoreGraphicsState();
}

export function dateiname(optionen: PdfOptionen, anzahl: number): string {
    const art = { nachricht: "nachrichtenvordruck", meldung: "meldevordruck", beide: "vordrucke" }[optionen.vordruck];
    const mehrzahl = anzahl > 1 && optionen.vordruck !== "beide" ? "e" : "";
    return `${art}${mehrzahl}.pdf`;
}
