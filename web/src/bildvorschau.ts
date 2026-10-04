import { jsPDF } from "jspdf";
import {
    VORDRUCK_BREITE,
    VORDRUCK_HOEHE,
    zeichneMeldevordruck,
    zeichneNachrichtenvordruck,
    type VordruckDaten
} from "../../src/index.js";
import { HERKUNFT, type PdfOptionen } from "./pdf.js";

// Vorschau als Bild für Browser, die PDFs nicht eingebettet zeigen (die
// meisten Telefone). Die Renderer zeichnen in ein echtes jsPDF, damit
// Umbruch und Schriftverkleinerung genau wie in der PDF ausfallen; hier
// wird nur mitgeschrieben, was wohin geschrieben wird, und auf ein Canvas
// übertragen. Die Schrift des Browsers weicht von Helvetica leicht ab.

interface Text {
    art: "text";
    text: string;
    x: number;
    y: number;
    groesse: number;
    ausrichtung: "left" | "center" | "right";
    winkel: number;
    /** Zusätzlicher Zeichenabstand in mm (Beschriftung des Formulars). */
    abstand: number;
    fett: boolean;
    farbe: string;
}

interface Bild {
    art: "bild";
    quelle: string;
}

/** Linie und Rechteck des gezeichneten Formulars. */
interface Linie {
    art: "linie";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    staerke: number;
    farbe: string;
}

interface Rechteck {
    art: "rechteck";
    x: number;
    y: number;
    b: number;
    h: number;
    stil: string;
    staerke: number;
    rand: string;
    fuellung: string;
}

type Aufruf = Text | Bild | Linie | Rechteck;

const PT_IN_MM = 25.4 / 72;

function mitschreiben(zeichnen: (pdf: jsPDF) => void): Aufruf[] {
    const pdf = new jsPDF("p", "mm", "a5");
    const aufrufe: Aufruf[] = [];
    const text = pdf.text.bind(pdf);
    const addImage = pdf.addImage.bind(pdf);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).text = (inhalt: string | string[], x: number, y: number, optionen?: { align?: Text["ausrichtung"]; angle?: number; charSpace?: number }) => {
        aufrufe.push({
            art: "text",
            text: Array.isArray(inhalt) ? inhalt.join(" ") : String(inhalt),
            x,
            y,
            groesse: pdf.getFontSize(),
            ausrichtung: optionen?.align ?? "left",
            winkel: optionen?.angle ?? 0,
            abstand: optionen?.charSpace ?? 0,
            fett: pdf.getFont().fontStyle === "bold",
            farbe: pdf.getTextColor()
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (text as any)(inhalt, x, y, optionen);
    };
    // Das gezeichnete Formular: Linien und Rechtecke mit Farbe und Strichstärke merken.
    const line = pdf.line.bind(pdf);
    const rect = pdf.rect.bind(pdf);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).line = (x1: number, y1: number, x2: number, y2: number, stil?: string) => {
        aufrufe.push({ art: "linie", x1, y1, x2, y2, staerke: pdf.getLineWidth(), farbe: pdf.getDrawColor() });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (line as any)(x1, y1, x2, y2, stil);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).rect = (x: number, y: number, b: number, h: number, stil?: string) => {
        aufrufe.push({
            art: "rechteck", x, y, b, h, stil: stil ?? "S",
            staerke: pdf.getLineWidth(), rand: pdf.getDrawColor(), fuellung: pdf.getFillColor()
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (rect as any)(x, y, b, h, stil);
    };
    // Ein eigenes Formularbild nicht in die Wegwerf-PDF kodieren, nur merken.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).addImage = (quelle: unknown, ...rest: unknown[]) => {
        if (typeof quelle === "string") {
            aufrufe.push({ art: "bild", quelle });
            return pdf;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (addImage as any)(quelle, ...rest);
    };
    zeichnen(pdf);
    return aufrufe;
}

const bilder = new Map<string, Promise<HTMLImageElement>>();

function ladeBild(quelle: string): Promise<HTMLImageElement> {
    let bild = bilder.get(quelle);
    if (!bild) {
        bild = new Promise((fertig, fehler) => {
            const element = new Image();
            element.onload = () => fertig(element);
            element.onerror = fehler;
            element.src = quelle;
        });
        bilder.set(quelle, bild);
    }
    return bild;
}

/**
 * Zeichnet die gewählten Vordrucke für `daten` untereinander auf `canvas`,
 * in der Breite des Canvas-Elements.
 */
export async function zeichneBildvorschau(canvas: HTMLCanvasElement, daten: VordruckDaten, optionen: PdfOptionen): Promise<void> {
    // Wie die PDF: ohne Formular keine Herkunftszeile, dafür mit Druckversatz.
    daten.fusszeile = optionen.ohneHintergrund ? "" : HERKUNFT;
    const versatz = optionen.ohneHintergrund ? { x: optionen.versatzX ?? 0, y: optionen.versatzY ?? 0 } : { x: 0, y: 0 };
    const renderOptionen = { ohneHintergrund: optionen.ohneHintergrund };
    const seiten: Aufruf[][] = [];
    if (optionen.vordruck !== "meldung") {
        seiten.push(mitschreiben(pdf => zeichneNachrichtenvordruck(pdf, daten, renderOptionen)));
    }
    if (optionen.vordruck !== "nachricht") {
        seiten.push(mitschreiben(pdf => zeichneMeldevordruck(pdf, daten, renderOptionen)));
    }

    // Breite der Spalte, nicht des Canvas: das wird am Desktop in der Höhe begrenzt und dadurch schmaler.
    const breite = canvas.parentElement?.clientWidth || canvas.clientWidth || 360;
    const pxJeMm = (breite / VORDRUCK_BREITE) * (window.devicePixelRatio || 1);
    const abstand = 4;
    const hoehe = seiten.length * VORDRUCK_HOEHE + (seiten.length - 1) * abstand;
    canvas.width = Math.round(VORDRUCK_BREITE * pxJeMm);
    canvas.height = Math.round(hoehe * pxJeMm);

    const kontext = canvas.getContext("2d");
    if (!kontext) {
        return;
    }
    // Bilder vorher laden, damit ein späterer Aufruf nicht mitten hineinmalt.
    const geladen = new Map<string, HTMLImageElement>();
    for (const seite of seiten) {
        for (const aufruf of seite) {
            if (aufruf.art === "bild" && !geladen.has(aufruf.quelle)) {
                geladen.set(aufruf.quelle, await ladeBild(aufruf.quelle));
            }
        }
    }

    kontext.setTransform(1, 0, 0, 1, 0, 0);
    kontext.clearRect(0, 0, canvas.width, canvas.height);
    kontext.scale(pxJeMm, pxJeMm);
    seiten.forEach((seite, index) => {
        kontext.save();
        kontext.translate(0, index * (VORDRUCK_HOEHE + abstand));
        kontext.fillStyle = "#fff";
        kontext.fillRect(0, 0, VORDRUCK_BREITE, VORDRUCK_HOEHE);
        kontext.translate(versatz.x, versatz.y);
        for (const aufruf of seite) {
            if (aufruf.art === "bild") {
                const bild = geladen.get(aufruf.quelle);
                if (bild) {
                    kontext.drawImage(bild, 0, 0, VORDRUCK_BREITE, VORDRUCK_HOEHE);
                }
                continue;
            }
            if (aufruf.art === "linie") {
                kontext.strokeStyle = aufruf.farbe;
                kontext.lineWidth = aufruf.staerke;
                kontext.beginPath();
                kontext.moveTo(aufruf.x1, aufruf.y1);
                kontext.lineTo(aufruf.x2, aufruf.y2);
                kontext.stroke();
                continue;
            }
            if (aufruf.art === "rechteck") {
                if (aufruf.stil.includes("F")) {
                    kontext.fillStyle = aufruf.fuellung;
                    kontext.fillRect(aufruf.x, aufruf.y, aufruf.b, aufruf.h);
                }
                if (aufruf.stil.includes("D") || aufruf.stil === "S") {
                    kontext.strokeStyle = aufruf.rand;
                    kontext.lineWidth = aufruf.staerke;
                    kontext.strokeRect(aufruf.x, aufruf.y, aufruf.b, aufruf.h);
                }
                continue;
            }
            kontext.save();
            kontext.fillStyle = aufruf.farbe;
            kontext.font = `${aufruf.fett ? "bold " : ""}${aufruf.groesse * PT_IN_MM}px Helvetica, Arial, sans-serif`;
            // Zeichenabstand wie in der PDF, soweit der Browser ihn kann.
            (kontext as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${aufruf.abstand}px`;
            kontext.textAlign = aufruf.ausrichtung;
            kontext.textBaseline = "alphabetic";
            kontext.translate(aufruf.x, aufruf.y);
            if (aufruf.winkel) {
                kontext.rotate(-aufruf.winkel * Math.PI / 180);
            }
            kontext.fillText(aufruf.text, 0, 0);
            kontext.restore();
        }
        kontext.restore();
    });
}
