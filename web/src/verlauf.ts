import { schreibeCsv } from "./csv.js";
import { ERSTELLT_SPALTE, LISTEN_SPALTEN, SPALTEN, type Eingabe } from "./spalten.js";

// Liste der erzeugten Einzelvordrucke auf diesem Gerät: zum Abgleich mit dem
// Betriebsbuch und als CSV wieder einlesbar, falls die PDF verloren geht.

export interface Eintrag {
    /** Zeitpunkt des Downloads, ISO. */
    zeit: string;
    eingabe: Eingabe;
    /** Welcher Vordruck erstellt wurde: „nachricht“, „meldung“ oder „beide“. Ältere Einträge haben keinen. */
    vordruck?: string;
    /** Was vom Stand abweicht, etwa „2 Blätter“ oder „Text gekürzt“. */
    zusatz?: string;
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

/**
 * Vergleichsschlüssel eines Stands: leere Felder und die Reihenfolge zählen
 * nicht, damit eine wieder eingelesene Listen-CSV mit anderen Spalten als
 * derselbe Stand gilt.
 */
export function verlaufKennung(eingabe: Eingabe): string {
    return JSON.stringify(Object.entries(eingabe)
        .map(([schluessel, wert]) => [schluessel, (wert ?? "").trim()])
        .filter(([, wert]) => wert)
        .sort(([a], [b]) => (a ?? "").localeCompare(b ?? "")));
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
export function merkeVordrucke(
    eingaben: readonly Eingabe[],
    zeit = new Date(),
    vordruck?: string,
    zusatz: (index: number) => string = () => ""
): Gemerkt {
    const bisher = ladeVerlauf();
    // Derselbe Stand in anderer Druckfassung (gekürzt, verteilt) bekommt einen eigenen Eintrag.
    const schon = new Set(bisher.map(eintrag => `${eintrag.vordruck ?? ""}|${eintrag.zusatz ?? ""}|${verlaufKennung(eintrag.eingabe)}`));
    const dazu: Eintrag[] = [];
    eingaben.forEach((eingabe, index) => {
        const text = zusatz(index);
        const kennung = `${vordruck ?? ""}|${text}|${verlaufKennung(eingabe)}`;
        if (!schon.has(kennung)) {
            schon.add(kennung);
            dazu.push({ zeit: zeit.toISOString(), eingabe, ...vordruck ? { vordruck } : {}, ...text ? { zusatz: text } : {} });
        }
    });
    const alle = [...bisher, ...dazu];
    const liste = alle.slice(-HOECHSTENS);
    if (dazu.length > 0) {
        speicher()?.setItem(SCHLUESSEL, JSON.stringify(liste));
    }
    return { liste, neu: dazu.length, verdraengt: alle.length - liste.length };
}

/** Ein einzelner Vordruck. */
export function merkeVordruck(eingabe: Eingabe, zeit = new Date(), vordruck?: string, zusatz = ""): Gemerkt {
    return merkeVordrucke([eingabe], zeit, vordruck, () => zusatz);
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

const VORDRUCK: Record<string, string> = { nachricht: "Nachrichtenvordruck", meldung: "Meldevordruck", beide: "Beide" };

/** „05.10.2026 07:42“ aus der Spalte „Erstellt“ als Zeitpunkt; ungültig ergibt `null`. */
function leseZeitpunkt(text: string): Date | null {
    const teile = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text.trim());
    if (!teile) {
        return null;
    }
    const [, tag, monat, jahr, stunde = "0", minute = "0"] = teile;
    const zeit = new Date(Number(jahr), Number(monat) - 1, Number(tag), Number(stunde), Number(minute));
    return Number.isNaN(zeit.getTime()) || zeit.getDate() !== Number(tag) ? null : zeit;
}

/**
 * Einträge aus einer wieder eingelesenen Liste (Spalten „Erstellt“, „Vordruck“,
 * „Erstellung“). Zeilen ohne lesbaren Zeitpunkt fehlen.
 */
export function listenEintraege(zeilen: readonly { eingabe: Eingabe; liste?: { erstellt: string; vordruck: string; erstellung: string } }[]): Eintrag[] {
    const art = Object.fromEntries(Object.entries(VORDRUCK).map(([schluessel, name]) => [name.toLowerCase(), schluessel]));
    return zeilen.flatMap(zeile => {
        const zeit = zeile.liste ? leseZeitpunkt(zeile.liste.erstellt) : null;
        if (!zeile.liste || !zeit) {
            return [];
        }
        const vordruck = art[zeile.liste.vordruck.toLowerCase()];
        const eingabe = Object.fromEntries(Object.entries(zeile.eingabe).filter(([, wert]) => (wert ?? "").trim())) as Eingabe;
        return [{ zeit: zeit.toISOString(), eingabe, ...vordruck ? { vordruck } : {}, ...zeile.liste.erstellung ? { zusatz: zeile.liste.erstellung } : {} }];
    });
}

/**
 * Übernimmt Einträge in die Liste, zeitlich einsortiert. Ein Eintrag, der mit
 * Zeitpunkt (auf die Minute), Vordruck und Stand schon dasteht, kommt nicht
 * doppelt hinein.
 */
export function uebernimmEintraege(dazu: readonly Eintrag[]): Gemerkt {
    const bisher = ladeVerlauf();
    const minute = (iso: string) => iso.slice(0, 16);
    const schon = new Set(bisher.map(eintrag => `${minute(eintrag.zeit)}|${eintrag.vordruck ?? ""}|${verlaufKennung(eintrag.eingabe)}`));
    const neu = dazu.filter(eintrag => {
        const kennung = `${minute(eintrag.zeit)}|${eintrag.vordruck ?? ""}|${verlaufKennung(eintrag.eingabe)}`;
        if (schon.has(kennung)) {
            return false;
        }
        schon.add(kennung);
        return true;
    });
    const alle = [...bisher, ...neu].sort((a, b) => a.zeit.localeCompare(b.zeit));
    const liste = setzeVerlauf(alle);
    return { liste, neu: neu.length, verdraengt: alle.length - liste.length };
}

/** Ohne erstellten Vordruck in dieser Zeit beginnt ein neuer Einsatz. */
export const EINSATZ_PAUSE = 12 * 60 * 60 * 1000;

/**
 * Beginn des laufenden Einsatzes: die ausdrücklich gesetzte Grenze, sonst der
 * erste Eintrag einer Folge ohne Pause von `EINSATZ_PAUSE`, die bis jetzt
 * reicht. Liegt der letzte Eintrag länger zurück, beginnt der Einsatz jetzt.
 */
export function einsatzBeginn(liste: readonly Eintrag[], grenze: number | null, jetzt = Date.now()): number {
    const zeiten = liste.map(eintrag => new Date(eintrag.zeit).getTime()).filter(zeit => !Number.isNaN(zeit)).sort((a, b) => b - a);
    let beginn = jetzt;
    let spaeter = jetzt;
    for (const zeit of zeiten) {
        if (spaeter - zeit > EINSATZ_PAUSE) {
            break;
        }
        beginn = Math.min(beginn, zeit);
        spaeter = zeit;
    }
    return grenze === null ? beginn : Math.max(beginn, grenze);
}

/**
 * Je Eintrag, ob er eine weitere Fassung einer früheren Nr. an dieselbe
 * Gegenstelle im selben Einsatz ist: „Korrektur“ bei anderem Stand, „erneut“
 * bei gleichem Stand in anderer Druckform. Sonst leer.
 */
export function fassungen(liste: readonly Eintrag[], grenze: number | null): ("" | "Korrektur" | "erneut")[] {
    const gesehen = new Map<string, Set<string>>();
    let vorher = Number.NEGATIVE_INFINITY;
    return liste.map(eintrag => {
        const zeit = new Date(eintrag.zeit).getTime();
        // Neuer Einsatz: nach langer Pause oder über die gesetzte Grenze hinweg.
        if (zeit - vorher > EINSATZ_PAUSE || (grenze !== null && vorher < grenze && zeit >= grenze)) {
            gesehen.clear();
        }
        vorher = zeit;
        const nummer = (eintrag.eingabe.nummer ?? "").trim();
        if (!nummer) {
            return "";
        }
        const schluessel = `${nummer}|${(eintrag.eingabe.empfaenger ?? "").trim()}|${eintrag.vordruck ?? ""}`;
        const staende = gesehen.get(schluessel);
        const kennung = verlaufKennung(eintrag.eingabe);
        const art = !staende ? "" : staende.has(kennung) ? "erneut" : "Korrektur";
        gesehen.set(schluessel, new Set([...staende ?? [], kennung]));
        return art;
    });
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
        [ERSTELLT_SPALTE, ...LISTEN_SPALTEN, ...SPALTEN.map(spalte => spalte.titel)],
        ...liste.map(eintrag => [
            zeitpunkt(eintrag.zeit),
            VORDRUCK[eintrag.vordruck ?? ""] ?? "",
            eintrag.zusatz ?? "",
            ...SPALTEN.map(spalte => eintrag.eingabe[spalte.schluessel] ?? "")
        ])
    ]);
}
