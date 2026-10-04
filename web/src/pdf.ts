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
    /** Formular weglassen, zum Bedrucken vorgedruckter Bögen. */
    ohneHintergrund: boolean;
    /**
     * Nur mit `ohneHintergrund`: Text in mm nach rechts bzw. unten verschieben,
     * damit er auf einem vorgedruckten Bogen in den Feldern landet. Drucker
     * ziehen das Papier selten genau gleich ein.
     */
    versatzX?: number;
    versatzY?: number;
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
export function erzeugePdf(
    alle: readonly VordruckDaten[],
    optionen: PdfOptionen,
    /** Unkomprimiert nur für Tests, die den Inhaltsstrom lesen. */
    { komprimiert = true }: { komprimiert?: boolean } = {}
): jsPDF {
    const stuecke: { zeichner: Zeichner; daten: VordruckDaten }[] = [];
    for (const daten of alle) {
        // Auf einen vorgedruckten Originalbogen gehört kein fremder Text.
        daten.fusszeile = optionen.ohneHintergrund ? "" : HERKUNFT;
        if (optionen.vordruck !== "meldung") {
            stuecke.push({ zeichner: zeichneNachrichtenvordruck, daten });
        }
        if (optionen.vordruck !== "nachricht") {
            stuecke.push({ zeichner: zeichneMeldevordruck, daten });
        }
    }

    // Komprimiert: sonst legt jsPDF die Formularbilder entpackt ab, ein Blatt
    // wiegt dann fast 4 MB statt rund 30 KB.
    const pdf = {
        a4: () => new jsPDF({ orientation: "l", unit: "mm", format: "a4", compress: komprimiert }),
        a4hoch: () => new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: komprimiert }),
        a5: () => new jsPDF({ orientation: "p", unit: "mm", format: "a5", compress: komprimiert })
    }[optionen.blatt]();
    const jeBlatt = optionen.blatt === "a4" ? 2 : 1;
    const versatz = optionen.ohneHintergrund
        ? { x: optionen.versatzX ?? 0, y: optionen.versatzY ?? 0 }
        : { x: 0, y: 0 };
    const rand = optionen.blatt === "a4hoch"
        ? { x: (A4.breite - VORDRUCK.breite) / 2, y: (A4.hoehe - VORDRUCK.hoehe) / 2 }
        : { x: 0, y: 0 };

    stuecke.forEach((stueck, index) => {
        if (index > 0 && index % jeBlatt === 0) {
            pdf.addPage();
        }
        const zeichnen = () => stueck.zeichner(pdf, stueck.daten, {
            offsetX: (index % jeBlatt) * 148.5,
            ohneHintergrund: optionen.ohneHintergrund
        });
        const dx = rand.x + versatz.x;
        const dy = rand.y + versatz.y;
        if (dx || dy) {
            verschoben(pdf, dx, dy, zeichnen);
        } else {
            zeichnen();
        }
    });

    return pdf;
}

/**
 * Zeichnet den Vordruck um `dx`/`dy` mm versetzt: um den Rand von A4 hoch und
 * um den eingestellten Druckversatz. Die Renderer kennen nur einen
 * waagerechten Versatz; die Transformationsmatrix verschiebt alles
 * gleichermaßen, Formular wie Eintragungen. Sie rechnet in Punkt, mit dem
 * Ursprung unten links: nach unten verschieben heißt negatives y.
 */
function verschoben(pdf: jsPDF, dx: number, dy: number, zeichnen: () => void): void {
    const punktJeMm = pdf.internal.scaleFactor;
    pdf.saveGraphicsState();
    pdf.setCurrentTransformationMatrix(pdf.Matrix(1, 0, 0, 1, dx * punktJeMm, -dy * punktJeMm));
    zeichnen();
    pdf.restoreGraphicsState();
}

/**
 * Dateiname aus Vordruck, Nummer und Zeitpunkt, damit mehrere Downloads im
 * Ordner unterscheidbar bleiben, z. B. „nachrichtenvordruck_nr17_2026-10-04_1416.pdf“.
 */
export function dateiname(optionen: PdfOptionen, anzahl: number, zeit?: Date, nummer = ""): string {
    const art = { nachricht: "nachrichtenvordruck", meldung: "meldevordruck", beide: "vordrucke" }[optionen.vordruck];
    const mehrzahl = anzahl > 1 && optionen.vordruck !== "beide" ? "e" : "";
    const zwei = (zahl: number) => String(zahl).padStart(2, "0");
    const teile = [
        `${art}${mehrzahl}`,
        nummer.replace(/[^\p{L}\p{N}-]+/gu, "").slice(0, 20) ? `nr${nummer.replace(/[^\p{L}\p{N}-]+/gu, "").slice(0, 20)}` : "",
        // Ohne Nummer mit Sekunden: zwei Einzelvordrucke derselben Minute heißen sonst gleich.
        zeit ? `${zeit.getFullYear()}-${zwei(zeit.getMonth() + 1)}-${zwei(zeit.getDate())}_${zwei(zeit.getHours())}${zwei(zeit.getMinutes())}`
            + (anzahl === 1 && !nummer ? zwei(zeit.getSeconds()) : "") : ""
    ];
    return `${teile.filter(Boolean).join("_")}.pdf`;
}
