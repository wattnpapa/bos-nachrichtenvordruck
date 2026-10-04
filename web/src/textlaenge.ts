import { jsPDF } from "jspdf";
import { meldevordruckInhaltZeilen, nachrichtenvordruckInhaltZeilen } from "../../src/index.js";
import type { VordruckWahl } from "./pdf.js";

export interface Textlaenge {
    /**
     * „knapp“: höchstens noch eine Zeile frei; „abgeschnitten“: mehr Zeilen,
     * als der Vordruck hat. Die Schrift wird nie verkleinert, was nicht passt,
     * fehlt auf dem Papier.
     */
    stufe: "knapp" | "abgeschnitten";
    /** Zeilen, die der Text braucht. */
    zeilen: number;
    /** Zeilen, die der Vordruck hat. */
    maxZeilen: number;
    /** Der Vordruck, auf dem es am engsten wird. */
    vordruck: string;
}

let messPdf: jsPDF | undefined;

/**
 * Prüft, ob der Inhalt in die Zeilen der gewählten Vordrucke passt. Gibt `null`
 * zurück, wenn überall reichlich Platz ist.
 */
export function pruefeTextlaenge(inhalt: string, vordruck: VordruckWahl): Textlaenge | null {
    if (!inhalt.trim()) {
        return null;
    }
    messPdf ??= new jsPDF("p", "mm", "a5");
    const messungen = [
        ...(vordruck !== "meldung" ? [{ vordruck: "Nachrichtenvordruck", ...nachrichtenvordruckInhaltZeilen(messPdf, inhalt) }] : []),
        ...(vordruck !== "nachricht" ? [{ vordruck: "Meldevordruck", ...meldevordruckInhaltZeilen(messPdf, inhalt) }] : [])
    ];
    // Am engsten: die wenigsten freien Zeilen.
    const engste = [...messungen].sort((a, b) => (a.maxZeilen - a.zeilen) - (b.maxZeilen - b.zeilen))[0];
    if (!engste || engste.zeilen < engste.maxZeilen - 1) {
        return null;
    }
    return {
        stufe: engste.zeilen > engste.maxZeilen ? "abgeschnitten" : "knapp",
        zeilen: engste.zeilen,
        maxZeilen: engste.maxZeilen,
        vordruck: engste.vordruck
    };
}

/** Ob vor dem Herunterladen nachgefragt wird: Text fehlt auf dem Papier. */
export function istKritisch(laenge: Textlaenge | null): laenge is Textlaenge {
    return laenge !== null && laenge.stufe === "abgeschnitten";
}

/** Ein Satz für die Maske oder die Tabellenprüfung. */
export function textlaengeMeldung(laenge: Textlaenge): string {
    if (laenge.stufe === "abgeschnitten") {
        return `Text zu lang: Der ${laenge.vordruck} hat ${laenge.maxZeilen} Zeilen, der Text braucht ${laenge.zeilen}. `
            + `Gedruckt werden nur die ersten ${laenge.maxZeilen}, am Ende steht „…“, der Rest fehlt. Bitte kürzen oder auf zwei Vordrucke verteilen.`;
    }
    const frei = laenge.maxZeilen - laenge.zeilen;
    return `${laenge.zeilen} von ${laenge.maxZeilen} Zeilen auf dem ${laenge.vordruck} belegt${frei === 1 ? ", noch eine frei" : ", keine mehr frei"}.`;
}
