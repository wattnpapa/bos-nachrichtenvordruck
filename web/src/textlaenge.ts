import { jsPDF } from "jspdf";
import {
    meldevordruckGekuerzt,
    meldevordruckInhaltTeilen,
    meldevordruckInhaltZeilen,
    nachrichtenvordruckGekuerzt,
    nachrichtenvordruckInhaltTeilen,
    nachrichtenvordruckInhaltZeilen,
    type VordruckDaten
} from "../../src/index.js";
import { SPALTEN } from "./spalten.js";
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
    /** Wie viele Vordrucke der ganze Text auf Folgebögen braucht. */
    boegen: number;
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
        vordruck: engste.vordruck,
        boegen: engste.zeilen > engste.maxZeilen ? teileInhalt(inhalt, vordruck).length : 1
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
            + `Auf einem Vordruck stünden nur die ersten ${laenge.maxZeilen} mit „…“ am Ende. Beim Erzeugen lässt er sich auf ${laenge.boegen} Vordrucke verteilen, oder kürzen.`;
    }
    const frei = laenge.maxZeilen - laenge.zeilen;
    return `${laenge.zeilen} von ${laenge.maxZeilen} Zeilen auf dem ${laenge.vordruck} belegt${frei === 1 ? ", noch eine frei" : ", keine mehr frei"}.`;
}

/** Feldnamen der Bibliothek, die keine eigene Spalte haben. */
const FELDNAMEN: Record<string, string> = {
    ausgang: "Ausgang (Datum, Uhrzeit)",
    eingang: "Eingang (Datum, Uhrzeit)"
};

/**
 * Einzeilige Felder, die nicht ganz aufs Blatt passen und mit „…“ gekürzt
 * gedruckt würden, als Satz; leer, wenn alles passt.
 */
export function gekuerztMeldung(daten: VordruckDaten, vordruck: VordruckWahl): string {
    messPdf ??= new jsPDF("p", "mm", "a5");
    const namen = [
        ...(vordruck !== "meldung" ? nachrichtenvordruckGekuerzt(messPdf, daten) : []),
        ...(vordruck !== "nachricht" ? meldevordruckGekuerzt(messPdf, daten) : [])
    ].map(name => FELDNAMEN[name]
        ?? SPALTEN.find(spalte => spalte.schluessel === name)?.titel
        ?? SPALTEN.find(spalte => spalte.schluessel === name.replace("vermerk", ""))?.titel
        ?? name);
    const eindeutig = [...new Set(namen)];
    if (eindeutig.length === 0) {
        return "";
    }
    return `Zu lang für den Vordruck, wird mit „…“ gekürzt gedruckt: ${eindeutig.join(", ")}`;
}

/**
 * Teilt den Inhalt auf Folgebögen: so viele Stücke, dass auf dem engsten der
 * gewählten Vordrucke nichts abgeschnitten wird.
 */
export function teileInhalt(inhalt: string, vordruck: VordruckWahl): string[] {
    messPdf ??= new jsPDF("p", "mm", "a5");
    return vordruck === "meldung" ? meldevordruckInhaltTeilen(messPdf, inhalt) : nachrichtenvordruckInhaltTeilen(messPdf, inhalt);
}
