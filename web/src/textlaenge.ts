import { jsPDF } from "jspdf";
import { meldevordruckInhaltSchrift, nachrichtenvordruckInhaltSchrift } from "../../src/index.js";
import type { VordruckWahl } from "./pdf.js";

/** Darunter ist Text auf dem gedruckten Vordruck kaum noch zu lesen. */
export const LESBAR_AB = 8;

export interface Textlaenge {
    /**
     * „verkleinert“: noch lesbar, nur auf dem Kästchenraster des Meldevordrucks;
     * „ueber-linien“: auf dem Nachrichtenvordruck kleiner als die Linien, der
     * Text läuft über sie; „klein“: unter `LESBAR_AB`; „zu-lang“: passt nicht ins Feld.
     */
    stufe: "verkleinert" | "ueber-linien" | "klein" | "zu-lang";
    /** Kleinste Schriftgröße in pt über die gewählten Vordrucke. */
    schriftgroesse: number;
    /** Der Vordruck, auf dem der Text am kleinsten wird. */
    vordruck: string;
}

let messPdf: jsPDF | undefined;

/**
 * Prüft, wie der Inhalt auf den gewählten Vordrucken gesetzt wird. Gibt `null`
 * zurück, wenn er überall in Normalgröße passt.
 */
export function pruefeTextlaenge(inhalt: string, vordruck: VordruckWahl): Textlaenge | null {
    if (!inhalt.trim()) {
        return null;
    }
    messPdf ??= new jsPDF("p", "mm", "a5");
    const messungen = [
        ...(vordruck !== "meldung" ? [{ vordruck: "Nachrichtenvordruck", normal: 12, ...nachrichtenvordruckInhaltSchrift(messPdf, inhalt) }] : []),
        ...(vordruck !== "nachricht" ? [{ vordruck: "Meldevordruck", normal: 11.5, ...meldevordruckInhaltSchrift(messPdf, inhalt) }] : [])
    ];
    const betroffen = messungen.filter(messung => !messung.passt || messung.schriftgroesse < messung.normal - 0.01);
    const schlechteste = [...betroffen].sort((a, b) => Number(a.passt) - Number(b.passt) || a.schriftgroesse - b.schriftgroesse)[0];
    if (!schlechteste) {
        return null;
    }
    if (!schlechteste.passt || schlechteste.schriftgroesse < LESBAR_AB) {
        return { stufe: schlechteste.passt ? "klein" : "zu-lang", schriftgroesse: schlechteste.schriftgroesse, vordruck: schlechteste.vordruck };
    }
    // Der Nachrichtenvordruck hat Linien: jede Verkleinerung legt Text auf sie.
    const nachricht = betroffen.find(messung => messung.vordruck === "Nachrichtenvordruck");
    if (nachricht) {
        return { stufe: "ueber-linien", schriftgroesse: nachricht.schriftgroesse, vordruck: nachricht.vordruck };
    }
    return { stufe: "verkleinert", schriftgroesse: schlechteste.schriftgroesse, vordruck: schlechteste.vordruck };
}

function pt(groesse: number): string {
    return `${groesse.toFixed(1).replace(".", ",")} pt`;
}

/** Ob vor dem Herunterladen nachgefragt wird: der Text wäre schlecht oder gar nicht lesbar. */
export function istKritisch(laenge: Textlaenge | null): laenge is Textlaenge {
    return laenge !== null && laenge.stufe !== "verkleinert";
}

/** Ein Satz für die Maske oder die Tabellenprüfung. */
export function textlaengeMeldung(laenge: Textlaenge): string {
    switch (laenge.stufe) {
        case "zu-lang":
            return `Text zu lang: Er passt selbst in kleinster Schrift nicht auf den ${laenge.vordruck} und läuft über das Feld hinaus. Bitte kürzen oder auf zwei Vordrucke verteilen.`;
        case "klein":
            return `Text sehr lang: Auf dem ${laenge.vordruck} wird er auf ${pt(laenge.schriftgroesse)} verkleinert und ist auf Papier kaum lesbar. Bitte kürzen oder auf zwei Vordrucke verteilen.`;
        case "ueber-linien":
            return `Text länger als die 11 Zeilen des Nachrichtenvordrucks: Er wird auf ${pt(laenge.schriftgroesse)} verkleinert und läuft über die vorgedruckten Linien. Besser kürzen oder auf zwei Vordrucke verteilen.`;
        case "verkleinert":
            return `Langer Text: Auf dem ${laenge.vordruck} wird er auf ${pt(laenge.schriftgroesse)} verkleinert.`;
    }
}
