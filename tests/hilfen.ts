import { jsPDF } from "jspdf";

export interface TextAufruf {
    text: string;
    x: number;
    y: number;
}

export interface BildAufruf {
    daten: unknown;
    x: number;
    alias: unknown;
}

/** Ein A5-PDF, das jeden `text`- und `addImage`-Aufruf mitschreibt. */
export function protokollPdf(): { pdf: jsPDF; texte: TextAufruf[]; bilder: BildAufruf[] } {
    const pdf = new jsPDF("p", "mm", "a5");
    const texte: TextAufruf[] = [];
    const bilder: BildAufruf[] = [];
    const text = pdf.text.bind(pdf);
    const addImage = pdf.addImage.bind(pdf);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).text = (inhalt: string | string[], x: number, y: number, optionen?: unknown) => {
        texte.push({ text: Array.isArray(inhalt) ? inhalt.join(" ") : String(inhalt), x, y });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (text as any)(inhalt, x, y, optionen);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).addImage = (...args: unknown[]) => {
        bilder.push({ daten: args[0], x: args[2] as number, alias: args[6] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (addImage as any)(...args);
    };

    return { pdf, texte, bilder };
}
