import { schreibeCsv } from "./csv.js";
import { SPALTEN, type Eingabe } from "./spalten.js";

// Liste der erzeugten Einzelvordrucke auf diesem Gerät: zum Abgleich mit dem
// Betriebsbuch und als CSV wieder einlesbar, falls die PDF verloren geht.

export interface Eintrag {
    /** Zeitpunkt des Downloads, ISO. */
    zeit: string;
    eingabe: Eingabe;
}

const SCHLUESSEL = "bnv.verlauf.v1";
/** Ältere Einträge fallen heraus; die Liste ist kein Archiv. */
export const HOECHSTENS = 200;

function speicher(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

export function ladeVerlauf(): Eintrag[] {
    try {
        const daten = JSON.parse(speicher()?.getItem(SCHLUESSEL) ?? "[]") as unknown;
        return Array.isArray(daten) ? daten as Eintrag[] : [];
    } catch {
        return [];
    }
}

export function merkeVordruck(eingabe: Eingabe, zeit = new Date()): Eintrag[] {
    const liste = [...ladeVerlauf(), { zeit: zeit.toISOString(), eingabe }].slice(-HOECHSTENS);
    speicher()?.setItem(SCHLUESSEL, JSON.stringify(liste));
    return liste;
}

export function loescheVerlauf(): void {
    speicher()?.removeItem(SCHLUESSEL);
}

/** Zeilen mit dieser Nummer, damit eine doppelte Nummer auffällt. */
export function mitNummer(liste: readonly Eintrag[], nummer: string): Eintrag[] {
    const gesucht = nummer.trim();
    return gesucht ? liste.filter(eintrag => (eintrag.eingabe.nummer ?? "").trim() === gesucht) : [];
}

/** CSV im Format der Vorlage, damit sie im Reiter „Aus Excel oder CSV“ wieder eingelesen werden kann. */
export function verlaufAlsCsv(liste: readonly Eintrag[]): string {
    return schreibeCsv([
        SPALTEN.map(spalte => spalte.titel),
        ...liste.map(eintrag => SPALTEN.map(spalte => eintrag.eingabe[spalte.schluessel] ?? ""))
    ]);
}
