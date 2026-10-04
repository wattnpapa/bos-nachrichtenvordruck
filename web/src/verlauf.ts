import { schreibeCsv } from "./csv.js";
import { ERSTELLT_SPALTE, SPALTEN, type Eingabe } from "./spalten.js";

// Liste der erzeugten Einzelvordrucke auf diesem Gerät: zum Abgleich mit dem
// Betriebsbuch und als CSV wieder einlesbar, falls die PDF verloren geht.

export interface Eintrag {
    /** Zeitpunkt des Downloads, ISO. */
    zeit: string;
    eingabe: Eingabe;
    /** Welcher Vordruck erstellt wurde: „nachricht“, „meldung“ oder „beide“. Ältere Einträge haben keinen. */
    vordruck?: string;
}

const SCHLUESSEL = "bnv.verlauf.v1";
/**
 * Ältere Einträge fallen heraus; die Liste ist kein Archiv. 1000 Einträge sind
 * etwa 1 MB, genug für mehrere Tabellenläufe neben den Einzelvordrucken.
 */
export const HOECHSTENS = 1000;

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

/** Ergebnis des Merkens: die neue Liste und wie viele alte Einträge dafür herausgefallen sind. */
export interface Gemerkt {
    liste: Eintrag[];
    /** Neu eingetragen; schon vorhandene Stände zählen nicht. */
    neu: number;
    verdraengt: number;
}

/**
 * Trägt erstellte Vordrucke ein. Ein Stand, der mit demselben Vordruck schon
 * in der Liste steht, kommt nicht doppelt hinein, etwa beim zweiten Download
 * derselben Tabelle.
 */
export function merkeVordrucke(eingaben: readonly Eingabe[], zeit = new Date(), vordruck?: string): Gemerkt {
    const bisher = ladeVerlauf();
    const schon = new Set(bisher.map(eintrag => `${eintrag.vordruck ?? ""}|${JSON.stringify(eintrag.eingabe)}`));
    const dazu: Eintrag[] = [];
    for (const eingabe of eingaben) {
        const kennung = `${vordruck ?? ""}|${JSON.stringify(eingabe)}`;
        if (!schon.has(kennung)) {
            schon.add(kennung);
            dazu.push({ zeit: zeit.toISOString(), eingabe, ...vordruck ? { vordruck } : {} });
        }
    }
    const alle = [...bisher, ...dazu];
    const liste = alle.slice(-HOECHSTENS);
    if (dazu.length > 0) {
        speicher()?.setItem(SCHLUESSEL, JSON.stringify(liste));
    }
    return { liste, neu: dazu.length, verdraengt: alle.length - liste.length };
}

/** Ein einzelner Vordruck. */
export function merkeVordruck(eingabe: Eingabe, zeit = new Date(), vordruck?: string): Gemerkt {
    return merkeVordrucke([eingabe], zeit, vordruck);
}

/** Schreibt eine ganze Liste zurück, etwa nach „Liste löschen“ und „Wiederherstellen“. */
export function setzeVerlauf(liste: readonly Eintrag[]): Eintrag[] {
    const gekuerzt = liste.slice(-HOECHSTENS);
    speicher()?.setItem(SCHLUESSEL, JSON.stringify(gekuerzt));
    return gekuerzt;
}

export function loescheVerlauf(): void {
    speicher()?.removeItem(SCHLUESSEL);
}

/** Zeilen mit dieser Nummer, damit eine doppelte Nummer auffällt. */
export function mitNummer(liste: readonly Eintrag[], nummer: string): Eintrag[] {
    const gesucht = nummer.trim();
    return gesucht ? liste.filter(eintrag => (eintrag.eingabe.nummer ?? "").trim() === gesucht) : [];
}

/**
 * CSV im Format der Vorlage, damit sie im Reiter „Aus Excel oder CSV“ wieder
 * eingelesen werden kann; vorn steht, wann der Vordruck erstellt wurde.
 */
export function verlaufAlsCsv(liste: readonly Eintrag[]): string {
    const zwei = (zahl: number) => String(zahl).padStart(2, "0");
    const zeitpunkt = (iso: string) => {
        const zeit = new Date(iso);
        return `${zwei(zeit.getDate())}.${zwei(zeit.getMonth() + 1)}.${zeit.getFullYear()} ${zwei(zeit.getHours())}:${zwei(zeit.getMinutes())}`;
    };
    return schreibeCsv([
        [ERSTELLT_SPALTE, ...SPALTEN.map(spalte => spalte.titel)],
        ...liste.map(eintrag => [zeitpunkt(eintrag.zeit), ...SPALTEN.map(spalte => eintrag.eingabe[spalte.schluessel] ?? "")])
    ]);
}
