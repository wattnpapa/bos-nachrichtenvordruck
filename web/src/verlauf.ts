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
export function listenEintraege(zeilen: readonly { eingabe: Eingabe; liste?: { erstellt: string; vordruck: string; erstellung: string; einsatz?: string } }[]): Eintrag[] {
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

/** Ein Eintrag als Ganzes: Zeitpunkt auf die Minute, Vordruck, Druckfassung und Stand. */
export function eintragKennung(eintrag: Eintrag): string {
    return `${eintrag.zeit.slice(0, 16)}|${eintrag.vordruck ?? ""}|${eintrag.zusatz ?? ""}|${verlaufKennung(eintrag.eingabe)}`;
}

/**
 * Übernimmt Einträge in die Liste, zeitlich einsortiert. Ein Eintrag, der mit
 * Zeitpunkt (auf die Minute), Vordruck, Druckfassung und Stand schon dasteht,
 * kommt nicht doppelt hinein.
 */
export function uebernimmEintraege(dazu: readonly Eintrag[]): Gemerkt {
    const bisher = ladeVerlauf();
    const schon = new Set(bisher.map(eintragKennung));
    const neu = dazu.filter(eintrag => {
        const kennung = eintragKennung(eintrag);
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
 * Was der Helfer zur Einsatzgrenze gesagt hat. `grenzen`: „Neuer Einsatz“ zu
 * diesen Zeitpunkten (ms). `bruecken`: Zeitpunkte von Einträgen, nach denen eine
 * Pause von mehr als zwölf Stunden den Einsatz nicht beendet („Einsatz
 * fortsetzen“).
 */
export interface Einsatzstand {
    grenzen: number[];
    bruecken: number[];
}

export const OHNE_GRENZE: Einsatzstand = { grenzen: [], bruecken: [] };

/** Beide Stände zusammen, ohne Doppel, aufsteigend. */
export function einsatzVereinen(a: Einsatzstand, b: Einsatzstand): Einsatzstand {
    const vereint = (x: readonly number[], y: readonly number[]) => [...new Set([...x, ...y])].sort((m, n) => m - n);
    return { grenzen: vereint(a.grenzen, b.grenzen), bruecken: vereint(a.bruecken, b.bruecken) };
}

/**
 * Beginn des laufenden Einsatzes: der erste Eintrag einer Folge ohne Pause von
 * `EINSATZ_PAUSE`, die bis jetzt reicht, höchstens bis zur letzten gesetzten
 * Grenze. Die Grenze zählt dabei wie ein Eintrag: Auch sie läuft nach zwölf
 * Stunden ohne Vordruck ab. `liste` darf mehr als erstellte Vordrucke enthalten
 * (etwa Einträge der Ablage): Wer arbeitet, ist im Einsatz. Liegt alles länger
 * zurück, beginnt der Einsatz jetzt.
 */
export function einsatzBeginn(liste: readonly { zeit: string }[], stand: Einsatzstand = OHNE_GRENZE, jetzt = Date.now()): number {
    const grenze = Math.max(Number.NEGATIVE_INFINITY, ...stand.grenzen.filter(zeit => zeit <= jetzt));
    const punkte = liste.map(eintrag => new Date(eintrag.zeit).getTime())
        .filter(zeit => !Number.isNaN(zeit) && zeit >= grenze && zeit <= jetzt);
    if (Number.isFinite(grenze)) {
        punkte.push(grenze);
    }
    punkte.sort((a, b) => b - a);
    let beginn = jetzt;
    let spaeter = jetzt;
    for (const zeit of punkte) {
        if (spaeter - zeit > EINSATZ_PAUSE && !stand.bruecken.includes(zeit)) {
            break;
        }
        beginn = Math.min(beginn, zeit);
        spaeter = zeit;
    }
    return beginn;
}

/**
 * Je Eintrag die laufende Nummer seines Einsatzes, ab 0: neu an einer Grenze und
 * nach einer Pause von `EINSATZ_PAUSE`, außer sie ist überbrückt.
 */
export function einsatzFolgen(liste: readonly Eintrag[], stand: Einsatzstand = OHNE_GRENZE): number[] {
    let folge = 0;
    let vorher = Number.NaN;
    return liste.map(eintrag => {
        const zeit = new Date(eintrag.zeit).getTime();
        if (!Number.isNaN(vorher)) {
            const ueberGrenze = stand.grenzen.some(grenze => vorher < grenze && grenze <= zeit);
            const pause = zeit - vorher > EINSATZ_PAUSE && !stand.bruecken.includes(vorher);
            if (ueberGrenze || pause) {
                folge++;
            }
        }
        vorher = zeit;
        return folge;
    });
}

/**
 * Je Eintrag, ob er eine weitere Fassung einer früheren Nr. an dieselbe
 * Gegenstelle im selben Einsatz ist: „Korrektur“ bei anderem Stand, „erneut“
 * bei gleichem Stand in anderer Druckform. Sonst leer.
 */
export function fassungen(liste: readonly Eintrag[], stand: Einsatzstand = OHNE_GRENZE): ("" | "Korrektur" | "erneut")[] {
    const gesehen = new Map<string, Set<string>>();
    const folgen = einsatzFolgen(liste, stand);
    return liste.map((eintrag, index) => {
        // Neuer Einsatz: nach langer Pause oder über eine gesetzte Grenze hinweg.
        if (index > 0 && folgen[index] !== folgen[index - 1]) {
            gesehen.clear();
        }
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
 * Der Einsatzstand, den eine gesicherte Liste mitbringt (Spalte „Einsatz“):
 * neue Nummer des Einsatzes ergibt eine Grenze, dieselbe Nummer über eine
 * lange Pause hinweg eine Brücke.
 */
export function listenEinsatz(zeilen: readonly { eingabe: Eingabe; liste?: { erstellt: string; einsatz?: string } }[]): Einsatzstand {
    const reihe = zeilen.flatMap(zeile => {
        const zeit = zeile.liste ? leseZeitpunkt(zeile.liste.erstellt) : null;
        const folge = zeile.liste?.einsatz?.trim();
        return zeit && folge ? [{ zeit: zeit.getTime(), folge }] : [];
    }).sort((a, b) => a.zeit - b.zeit);
    const stand: Einsatzstand = { grenzen: [], bruecken: [] };
    reihe.forEach((eintrag, index) => {
        const vorher = reihe[index - 1];
        if (!vorher) {
            return;
        }
        if (vorher.folge !== eintrag.folge) {
            stand.grenzen.push(eintrag.zeit);
        } else if (eintrag.zeit - vorher.zeit > EINSATZ_PAUSE) {
            stand.bruecken.push(vorher.zeit);
        }
    });
    return stand;
}

/**
 * CSV im Format der Vorlage, damit sie im Reiter „Aus Excel oder CSV“ wieder
 * eingelesen werden kann; vorn steht, wann der Vordruck erstellt wurde.
 */
export function verlaufAlsCsv(liste: readonly Eintrag[], stand: Einsatzstand = OHNE_GRENZE): string {
    const folgen = einsatzFolgen(liste, stand);
    const zwei = (zahl: number) => String(zahl).padStart(2, "0");
    const zeitpunkt = (iso: string) => {
        const zeit = new Date(iso);
        return `${zwei(zeit.getDate())}.${zwei(zeit.getMonth() + 1)}.${zeit.getFullYear()} ${zwei(zeit.getHours())}:${zwei(zeit.getMinutes())}`;
    };
    return schreibeCsv([
        [ERSTELLT_SPALTE, ...LISTEN_SPALTEN, ...SPALTEN.map(spalte => spalte.titel)],
        ...liste.map((eintrag, index) => [
            zeitpunkt(eintrag.zeit),
            VORDRUCK[eintrag.vordruck ?? ""] ?? "",
            eintrag.zusatz ?? "",
            String((folgen[index] ?? 0) + 1),
            ...SPALTEN.map(spalte => eintrag.eingabe[spalte.schluessel] ?? "")
        ])
    ]);
}
