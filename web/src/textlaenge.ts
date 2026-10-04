import { jsPDF } from "jspdf";
import { meldevordruckInhaltSchrift, nachrichtenvordruckInhaltSchrift } from "../../src/index.js";
import type { VordruckWahl } from "./pdf.js";

/** Darunter ist Text auf dem gedruckten Vordruck kaum noch zu lesen. */
export const LESBAR_AB = 8;

export interface Textlaenge {
    /** „verkleinert“: noch lesbar; „klein“: unter `LESBAR_AB`; „zu-lang“: passt nicht ins Feld. */
    stufe: "verkleinert" | "klein" | "zu-lang";
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
    const schlechteste = messungen
        .filter(messung => !messung.passt || messung.schriftgroesse < messung.normal - 0.01)
        .sort((a, b) => Number(a.passt) - Number(b.passt) || a.schriftgroesse - b.schriftgroesse)[0];
    if (!schlechteste) {
        return null;
    }
    return {
        stufe: !schlechteste.passt ? "zu-lang" : schlechteste.schriftgroesse < LESBAR_AB ? "klein" : "verkleinert",
        schriftgroesse: schlechteste.schriftgroesse,
        vordruck: schlechteste.vordruck
    };
}

function pt(groesse: number): string {
    return `${groesse.toFixed(1).replace(".", ",")} pt`;
}

/** Ein Satz für die Maske oder die Tabellenprüfung. */
export function textlaengeMeldung(laenge: Textlaenge): string {
    switch (laenge.stufe) {
        case "zu-lang":
            return `Text zu lang: Er passt selbst in kleinster Schrift nicht auf den ${laenge.vordruck} und läuft über das Feld hinaus. Bitte kürzen oder auf zwei Vordrucke verteilen.`;
        case "klein":
            return `Text sehr lang: Auf dem ${laenge.vordruck} wird er auf ${pt(laenge.schriftgroesse)} verkleinert und ist auf Papier kaum lesbar. Bitte kürzen oder auf zwei Vordrucke verteilen.`;
        case "verkleinert":
            return `Langer Text: Auf dem ${laenge.vordruck} wird er auf ${pt(laenge.schriftgroesse)} verkleinert.`;
    }
}
