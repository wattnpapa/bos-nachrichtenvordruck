import {
    NACHRICHTENVORDRUCK_ANKREUZFELDER,
    VordruckDaten,
    type NachrichtenvordruckAnkreuzfeld,
    type Uebermittlungsweg,
    type VordruckArt,
    type Vordruckrichtung,
    type Vorrang
} from "../../src/index.js";

// Eine Zeile der Tabelle bzw. der Eingabemaske: jedes Feld als Text. Die
// Umwandlung in `VordruckDaten` steht nur hier, damit Maske, Excel und CSV
// dieselben Werte gleich verstehen.

export type Schluessel =
    | "nummer" | "art" | "vorrang" | "weg" | "richtung" | "gespraechsnotiz"
    | "empfaenger" | "anschrift" | "inhalt" | "absender" | "verfasser"
    | "abfassungszeit" | "zeichen" | "funktion"
    | "quittungUhrzeit" | "quittungZeichen" | "quittungStelle" | "vermerke"
    | "aufnahmeDatum" | "aufnahmeUhrzeit" | "aufnahmeHdz"
    | "annahmeDatum" | "annahmeUhrzeit" | "annahmeHdz"
    | "befoerderungDatum" | "befoerderungUhrzeit" | "befoerderungHdz"
    | "verteiler" | "titel" | "hinweis";

export type Eingabe = Partial<Record<Schluessel, string>>;

export interface Spalte {
    schluessel: Schluessel;
    /** Spaltenkopf in Vorlage und CSV. */
    titel: string;
    /** Erklärung im Blatt „Anleitung". */
    beschreibung: string;
    beispiel: string;
    /** Feste Auswahl; in der Excel-Vorlage als Liste hinterlegt. */
    auswahl?: readonly string[];
    /** Spaltenbreite in Zeichen. */
    breite: number;
    /** Nur auf dem Nachrichtenvordruck vorhanden. */
    nurNachricht?: boolean;
}

export const ART_AUSWAHL = ["Spruch", "Durchsage"] as const;
export const VORRANG_AUSWAHL = ["Sofort", "Blitz"] as const;
export const WEG_AUSWAHL = ["Funk", "Telefon", "Telefax", "DFÜ", "Kurier"] as const;
export const RICHTUNG_AUSWAHL = ["Eingang", "Ausgang"] as const;
export const JA_NEIN = ["ja", "nein"] as const;

export const SPALTEN: readonly Spalte[] = [
    { schluessel: "nummer", titel: "Nr", beschreibung: "Laufende Nummer im Betriebsbuch.", beispiel: "17", breite: 6 },
    { schluessel: "art", titel: "Art", beschreibung: "Spruch oder Durchsage. Leer: nichts angekreuzt.", beispiel: "Spruch", auswahl: ART_AUSWAHL, breite: 11, nurNachricht: true },
    { schluessel: "vorrang", titel: "Vorrang", beschreibung: "Sofort oder Blitz. Leer: ohne Vorrang.", beispiel: "Sofort", auswahl: VORRANG_AUSWAHL, breite: 9, nurNachricht: true },
    { schluessel: "weg", titel: "Übermittlungsweg", beschreibung: "Funk, Telefon, Telefax, DFÜ oder Kurier. Wird in Kopfzeile und Spruchkopf angekreuzt.", beispiel: "Funk", auswahl: WEG_AUSWAHL, breite: 16, nurNachricht: true },
    { schluessel: "richtung", titel: "Richtung", beschreibung: "Eingang oder Ausgang im Technischen Betriebsbuch.", beispiel: "Ausgang", auswahl: RICHTUNG_AUSWAHL, breite: 10, nurNachricht: true },
    { schluessel: "gespraechsnotiz", titel: "Gesprächsnotiz", beschreibung: "ja: Kästchen „Gesprächsnotiz“ ankreuzen.", beispiel: "nein", auswahl: JA_NEIN, breite: 14, nurNachricht: true },
    { schluessel: "empfaenger", titel: "Gegenstelle", beschreibung: "Rufname der Gegenstelle (Nachrichtenvordruck) bzw. Empfänger (Meldevordruck). Mehrere mit Semikolon trennen. Die Spalte darf auch „Empfänger“ heißen.", beispiel: "Heros Jever 21/10", breite: 24 },
    { schluessel: "anschrift", titel: "Anschrift", beschreibung: "Anschrift bzw. Stelle der Gegenstelle. Mehrere mit Semikolon trennen.", beispiel: "Technische Einsatzleitung", breite: 24, nurNachricht: true },
    { schluessel: "inhalt", titel: "Inhalt", beschreibung: "Nachrichtentext. Zeilenumbrüche in der Zelle (Alt+Enter) werden übernommen.", beispiel: "Erkundung abgeschlossen. Zufahrt ist frei.", breite: 50 },
    { schluessel: "absender", titel: "Absender", beschreibung: "Rufname des Absenders.", beispiel: "Heros Oldenburg 16/11", breite: 22 },
    { schluessel: "verfasser", titel: "Verfasser", beschreibung: "Verfasser; nur der Meldevordruck hat dafür ein Feld.", beispiel: "Heros Oldenburg 16/11", breite: 22 },
    { schluessel: "abfassungszeit", titel: "Abfassungszeit", beschreibung: "Datum-Zeit-Gruppe, z. B. TTHHMMmonJJ.", beispiel: "031415okt26", breite: 15, nurNachricht: true },
    { schluessel: "zeichen", titel: "Zeichen", beschreibung: "Handzeichen des Verfassers.", beispiel: "JR", breite: 9, nurNachricht: true },
    { schluessel: "funktion", titel: "Funktion", beschreibung: "Funktion des Verfassers.", beispiel: "S 2", breite: 10, nurNachricht: true },
    { schluessel: "quittungUhrzeit", titel: "Quittung Uhrzeit", beschreibung: "Uhrzeit der Quittung.", beispiel: "", breite: 10, nurNachricht: true },
    { schluessel: "quittungZeichen", titel: "Quittung Zeichen", beschreibung: "Zeichen der Quittung.", beispiel: "", breite: 10, nurNachricht: true },
    { schluessel: "quittungStelle", titel: "Quittung Stelle", beschreibung: "Stelle der Quittung.", beispiel: "", breite: 10, nurNachricht: true },
    { schluessel: "vermerke", titel: "Vermerke", beschreibung: "Freitext im Feld „Vermerke“.", beispiel: "", breite: 14, nurNachricht: true },
    { schluessel: "aufnahmeDatum", titel: "Aufnahme Datum", beschreibung: "Aufnahmevermerk (Eingang): Datum.", beispiel: "", breite: 10, nurNachricht: true },
    { schluessel: "aufnahmeUhrzeit", titel: "Aufnahme Uhrzeit", beschreibung: "Aufnahmevermerk: Uhrzeit.", beispiel: "", breite: 10, nurNachricht: true },
    { schluessel: "aufnahmeHdz", titel: "Aufnahme Hdz", beschreibung: "Aufnahmevermerk: Handzeichen.", beispiel: "", breite: 8, nurNachricht: true },
    { schluessel: "annahmeDatum", titel: "Annahme Datum", beschreibung: "Annahmevermerk (Ausgang): Datum.", beispiel: "03.10.", breite: 10, nurNachricht: true },
    { schluessel: "annahmeUhrzeit", titel: "Annahme Uhrzeit", beschreibung: "Annahmevermerk: Uhrzeit.", beispiel: "14:16", breite: 10, nurNachricht: true },
    { schluessel: "annahmeHdz", titel: "Annahme Hdz", beschreibung: "Annahmevermerk: Handzeichen.", beispiel: "MK", breite: 8, nurNachricht: true },
    { schluessel: "befoerderungDatum", titel: "Beförderung Datum", beschreibung: "Beförderungsvermerk (Ausgang): Datum.", beispiel: "", breite: 10, nurNachricht: true },
    { schluessel: "befoerderungUhrzeit", titel: "Beförderung Uhrzeit", beschreibung: "Beförderungsvermerk: Uhrzeit.", beispiel: "", breite: 10, nurNachricht: true },
    { schluessel: "befoerderungHdz", titel: "Beförderung Hdz", beschreibung: "Beförderungsvermerk: Handzeichen.", beispiel: "", breite: 8, nurNachricht: true },
    { schluessel: "verteiler", titel: "Verteiler", beschreibung: "Kreuze im Verteilerraster: „Leiter“ sowie Zeile/Spalte wie S1/1, S2/3 (Zeilen S1–S4, S6; Spalten 1–3). Mit Komma trennen.", beispiel: "Leiter, S3/1", breite: 16, nurNachricht: true },
    { schluessel: "titel", titel: "Titel", beschreibung: "Überschrift am oberen Blattrand, außerhalb des Formulars.", beispiel: "", breite: 16 },
    { schluessel: "hinweis", titel: "Hinweis", beschreibung: "Zeile am unteren Blattrand, außerhalb des Formulars.", beispiel: "", breite: 16 }
];

export interface Umwandlung {
    daten: VordruckDaten;
    /** Ungültige Werte: sie fehlen auf dem Vordruck oder werden ersetzt. */
    fehler: string[];
    /** Auffälligkeiten, die so gedruckt werden, wie sie dastehen (Format, Lücken). */
    hinweise: string[];
}

/** Kleinbuchstaben, Umlaute ausgeschrieben, ohne Leer- und Sonderzeichen. */
export function normiere(text: string): string {
    return text
        .toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9]/g, "");
}

const KOPF_ZU_SCHLUESSEL = new Map<string, Schluessel>();
for (const spalte of SPALTEN) {
    KOPF_ZU_SCHLUESSEL.set(normiere(spalte.titel), spalte.schluessel);
    KOPF_ZU_SCHLUESSEL.set(normiere(spalte.schluessel), spalte.schluessel);
}
for (const [alias, schluessel] of [
    ["nummer", "nummer"], ["nr.", "nummer"], ["lfdnr", "nummer"],
    ["weg", "weg"], ["uebermittlung", "weg"],
    ["rufname", "empfaenger"], ["empfaenger", "empfaenger"], ["an", "empfaenger"],
    ["anschriften", "anschrift"], ["text", "inhalt"], ["nachricht", "inhalt"],
    ["von", "absender"], ["dtg", "abfassungszeit"], ["handzeichen", "zeichen"],
    ["prio", "vorrang"], ["prioritaet", "vorrang"], ["dringlichkeit", "vorrang"],
    ["datumzeitgruppe", "abfassungszeit"], ["zeit", "abfassungszeit"], ["abfassung", "abfassungszeit"],
    ["empfaengerrufname", "empfaenger"], ["rufnamedergegenstelle", "empfaenger"]
] as const) {
    KOPF_ZU_SCHLUESSEL.set(normiere(alias), schluessel);
}

/**
 * Spalten, die diese App selbst schreibt, die aber kein Feld des Vordrucks
 * sind: „Erstellt“ aus der Liste erstellter Vordrucke. Sie werden beim
 * Einlesen still übergangen statt als unbekannt gemeldet.
 */
export const ERSTELLT_SPALTE = "Erstellt";
const UEBERGANGEN = new Set([normiere(ERSTELLT_SPALTE)]);

/** Ordnet einen Spaltenkopf einem Feld zu; unbekannte Köpfe ergeben `undefined`. */
export function schluesselZuKopf(kopf: string): Schluessel | undefined {
    return KOPF_ZU_SCHLUESSEL.get(normiere(kopf));
}

function auswahlWert<T extends string>(
    roh: string | undefined,
    werte: Record<string, T>,
    feld: string,
    fehler: string[]
): T | undefined {
    const wert = normiere(roh ?? "");
    if (!wert) {
        return undefined;
    }
    const treffer = werte[wert];
    if (!treffer) {
        fehler.push(`${feld}: „${(roh ?? "").trim()}“ ist kein gültiger Wert`);
    }
    return treffer;
}

const ARTEN: Record<string, VordruckArt> = { spruch: "spruch", durchsage: "durchsage" };
const VORRAENGE: Record<string, Vorrang> = { sofort: "sofort", blitz: "blitz" };
const WEGE: Record<string, Uebermittlungsweg> = {
    funk: "funk", telefon: "telefon", tel: "telefon", telefax: "telefax", fax: "telefax",
    dfue: "dfue", dfu: "dfue", kurier: "kurier", melder: "kurier"
};
const RICHTUNGEN: Record<string, Vordruckrichtung> = {
    eingang: "eingang", ein: "eingang", ausgang: "ausgang", aus: "ausgang"
};
const WAHR: Record<string, true> = { ja: true, j: true, x: true, "1": true, wahr: true, true: true };
const FALSCH = new Set(["nein", "n", "0", "falsch", "false"]);

/** Liest das Verteilerraster („Leiter, S1/2, S6-3") in Ankreuzfelder. */
export function leseVerteiler(roh: string, fehler: string[]): NachrichtenvordruckAnkreuzfeld[] {
    const felder: NachrichtenvordruckAnkreuzfeld[] = [];
    for (const teil of roh.split(/[,;\n]+/)) {
        const eintrag = teil.trim();
        if (!eintrag) {
            continue;
        }
        if (normiere(eintrag) === "leiter") {
            felder.push("verteilerLeiter");
            continue;
        }
        const treffer = /^s\s*(\d)\s*[/\-.: ]\s*(\d)$/i.exec(eintrag);
        const name = treffer ? `verteilerS${treffer[1]}Spalte${treffer[2]}` : "";
        if (name in NACHRICHTENVORDRUCK_ANKREUZFELDER) {
            felder.push(name as NachrichtenvordruckAnkreuzfeld);
        } else {
            fehler.push(`Verteiler: „${eintrag}“ gibt es nicht (erlaubt: Leiter sowie S1 bis S4 und S6 mit Spalte 1 bis 3, etwa S3/1)`);
        }
    }
    return felder;
}

function liste(roh: string | undefined): string[] {
    return (roh ?? "").split(/[;\n]+/).map(teil => teil.trim()).filter(Boolean);
}

// Die Standardschrift der PDF (Helvetica) kennt nur Windows-1252. Alles andere
// käme als Zeichensalat aufs Papier, aus „км 3“ etwa „:< 3“.
const WIN_ANSI_ZUSATZ = new Set(Array.from("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"));

function istDruckbar(zeichen: string): boolean {
    const code = zeichen.codePointAt(0) ?? 0;
    return zeichen === "\n" || zeichen === "\r" || zeichen === "\t"
        || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_ZUSATZ.has(zeichen);
}

/** Gängige Zeichen außerhalb von Windows-1252 und was stattdessen gedruckt wird. */
const ERSATZ: Record<string, string> = {
    "→": "->", "←": "<-", "⇒": "=>", "⇐": "<=", "↑": "^", "↓": "v",
    "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "−": "-", "‐": "-", "‑": "-", "‒": "-",
    "′": "'", "″": "\"", "✓": "x", "✔": "x", "✗": "x", "✘": "x", "\u2009": " ", "\u202f": " ",
    "\u200b": "", "\u200c": "", "\u200d": "", "\ufe0f": "", "\ufeff": ""
};

/**
 * Ersetzt, was die PDF-Schrift nicht darstellen kann: bekannte Zeichen durch
 * ihre übliche Schreibweise, den Rest durch „?“. `fremd` sammelt die Zeichen,
 * die als „?“ gedruckt werden.
 */
export function druckbar(text: string, fremd: Set<string>): string {
    return Array.from(text, zeichen => {
        if (istDruckbar(zeichen)) {
            return zeichen;
        }
        const ersatz = ERSATZ[zeichen];
        if (ersatz !== undefined) {
            return ersatz;
        }
        fremd.add(zeichen);
        return "?";
    }).join("");
}

const UHRZEIT_FELDER: readonly Schluessel[] = ["aufnahmeUhrzeit", "annahmeUhrzeit", "befoerderungUhrzeit", "quittungUhrzeit"];
const DATUM_FELDER: readonly Schluessel[] = ["aufnahmeDatum", "annahmeDatum", "befoerderungDatum"];
const MONATE_DTG = new Set([
    "jan", "feb", "mrz", "mär", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "dez",
    "mar", "may", "oct", "dec"
]);

/** Excel speichert Zeiten als Tagesbruchteil und Tage ab dem 30.12.1899. */
function excelZeit(zahl: number): Date {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(zahl * 86_400_000));
}
const zwei = (zahl: number) => String(zahl).padStart(2, "0");

/**
 * Holt Zahlen, die aus Excel ohne Datumsformat kommen, in die Schreibweise
 * des Vordrucks zurück: 0,59 in einer Uhrzeitspalte wird „14:09“, 46299 in
 * einer Datumsspalte „04.10.“, ein Datum mit Uhrzeit in der Abfassungszeit
 * die Datum-Zeit-Gruppe. Alles andere bleibt, wie es ist.
 */
export function ausExcel(schluessel: Schluessel, wert: string): string {
    const zahl = /^\d*[.,]?\d+$/.test(wert.trim()) ? Number(wert.trim().replace(",", ".")) : NaN;
    if (UHRZEIT_FELDER.includes(schluessel) && zahl > 0 && zahl < 1) {
        const zeit = excelZeit(zahl);
        return `${zwei(zeit.getUTCHours())}:${zwei(zeit.getUTCMinutes())}`;
    }
    if (DATUM_FELDER.includes(schluessel) && zahl >= 20_000 && zahl < 80_000) {
        const zeit = excelZeit(zahl);
        return `${zwei(zeit.getUTCDate())}.${zwei(zeit.getUTCMonth() + 1)}.`;
    }
    if (schluessel === "abfassungszeit") {
        // Nur mit Nachkommastellen: Datum und Uhrzeit aus Excel. Eine getippte
        // Zeitgruppe ohne Monat wie „041416“ ist auch eine Zahl in diesem
        // Bereich und muss bleiben, wie sie ist.
        if (zahl >= 20_000 && zahl < 80_000 && /[.,]\d/.test(wert)) {
            const zeit = excelZeit(zahl);
            return datumZeitGruppe(new Date(zeit.getUTCFullYear(), zeit.getUTCMonth(), zeit.getUTCDate(), zeit.getUTCHours(), zeit.getUTCMinutes()));
        }
        const datum = /^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}):(\d{2})$/.exec(wert.trim());
        if (datum) {
            const [, tag, monat, jahr, stunde, minute] = datum.map(Number) as [number, number, number, number, number, number];
            return datumZeitGruppe(new Date(jahr, monat - 1, tag, stunde, minute));
        }
    }
    return wert;
}

/** Prüft die Schreibweise von Zeiten und Daten; gedruckt wird trotzdem, was dasteht. */
function pruefeFormat(eingabe: Eingabe, hinweise: string[]): void {
    const dtg = (eingabe.abfassungszeit ?? "").trim();
    if (dtg) {
        const teile = /^(\d{2})(\d{2})(\d{2})([a-zäöü]{3})(\d{2})$/i.exec(dtg);
        const gueltig = teile
            && Number(teile[1]) >= 1 && Number(teile[1]) <= 31
            && Number(teile[2]) <= 23 && Number(teile[3]) <= 59
            && MONATE_DTG.has((teile[4] ?? "").toLowerCase());
        if (!gueltig) {
            hinweise.push(`Abfassungszeit „${dtg}“ ist keine Datum-Zeit-Gruppe TTHHMMmonJJ (z. B. 041416okt26)`);
        }
    }
    for (const schluessel of UHRZEIT_FELDER) {
        const wert = (eingabe[schluessel] ?? "").trim();
        const teile = /^(\d{1,2})[:.]?(\d{2})$/.exec(wert);
        if (wert && !(teile && Number(teile[1]) <= 23 && Number(teile[2]) <= 59)) {
            hinweise.push(`${feldName(schluessel)} „${wert}“ ist keine Uhrzeit (z. B. 14:16)`);
        }
    }
    for (const schluessel of DATUM_FELDER) {
        const wert = (eingabe[schluessel] ?? "").trim();
        const teile = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/.exec(wert);
        if (wert && !(teile && Number(teile[1]) >= 1 && Number(teile[1]) <= 31 && Number(teile[2]) >= 1 && Number(teile[2]) <= 12)) {
            hinweise.push(`${feldName(schluessel)} „${wert}“ ist kein Datum (z. B. 04.10.)`);
        }
    }
}

function feldName(schluessel: Schluessel): string {
    return SPALTEN.find(spalte => spalte.schluessel === schluessel)?.titel ?? schluessel;
}

/** Wandelt eine Zeile in `VordruckDaten`. Ungültige Auswahlwerte landen in `fehler`. */
export function zuVordruckDaten(roh: Eingabe): Umwandlung {
    const fehler: string[] = [];
    const hinweise: string[] = [];
    const daten = new VordruckDaten();
    const fremd = new Set<string>();
    const eingabe = Object.fromEntries(Object.entries(roh)
        .map(([schluessel, wert]) => [schluessel, druckbar(ausExcel(schluessel as Schluessel, wert ?? ""), fremd)])) as Eingabe;
    pruefeFormat(eingabe, hinweise);
    if (fremd.size > 0) {
        fehler.push(`Zeichen ${[...fremd].slice(0, 10).map(zeichen => `„${zeichen}“`).join(", ")} kann der Vordruck nicht darstellen, sie werden als „?“ gedruckt`);
    }
    const text = (schluessel: Schluessel) => (eingabe[schluessel] ?? "").trim();

    daten.nummer = text("nummer");
    // Leer heißt hier „nichts ankreuzen", auch dort, wo `VordruckDaten` eine
    // Vorgabe hat (Funk, Ausgang). Die Maske setzt diese Vorgaben selbst.
    const art = auswahlWert(eingabe.art, ARTEN, "Art", fehler);
    const vorrang = auswahlWert(eingabe.vorrang, VORRAENGE, "Vorrang", fehler);
    const weg = auswahlWert(eingabe.weg, WEGE, "Übermittlungsweg", fehler);
    const richtung = auswahlWert(eingabe.richtung, RICHTUNGEN, "Richtung", fehler);
    delete daten.art;
    delete daten.vorrang;
    delete daten.uebermittlungsweg;
    delete daten.richtung;
    if (art) {
        daten.art = art;
    }
    if (vorrang) {
        daten.vorrang = vorrang;
    }
    if (weg) {
        daten.uebermittlungsweg = weg;
    }
    if (richtung) {
        daten.richtung = richtung;
    }

    const notiz = normiere(eingabe.gespraechsnotiz ?? "");
    daten.gespraechsnotiz = WAHR[notiz] === true;
    if (notiz && !WAHR[notiz] && !FALSCH.has(notiz)) {
        fehler.push(`Gesprächsnotiz: „${text("gespraechsnotiz")}“ ist weder ja noch nein`);
    }

    daten.empfaenger = liste(eingabe.empfaenger);
    daten.anschriften = liste(eingabe.anschrift);
    // Windows-Zeilenenden aus Excel und CSV, sonst stehen sie als Zeichen im PDF.
    daten.inhalt = (eingabe.inhalt ?? "").replace(/\r\n?/g, "\n").trim();
    daten.absender = text("absender");
    daten.verfasser = text("verfasser");

    daten.abfassungszeit = text("abfassungszeit");
    daten.zeichen = text("zeichen");
    daten.funktion = text("funktion");
    daten.quittung = {
        uhrzeit: text("quittungUhrzeit"),
        zeichen: text("quittungZeichen"),
        stelle: text("quittungStelle")
    };
    daten.vermerke = text("vermerke");

    daten.aufnahmevermerk = { datum: text("aufnahmeDatum"), uhrzeit: text("aufnahmeUhrzeit"), handzeichen: text("aufnahmeHdz") };
    daten.annahmevermerk = { datum: text("annahmeDatum"), uhrzeit: text("annahmeUhrzeit"), handzeichen: text("annahmeHdz") };
    daten.befoerderungsvermerk = { datum: text("befoerderungDatum"), uhrzeit: text("befoerderungUhrzeit"), handzeichen: text("befoerderungHdz") };

    daten.weitereAnkreuzfelder = leseVerteiler(eingabe.verteiler ?? "", fehler);
    daten.titel = text("titel");
    daten.hinweis = text("hinweis");

    return { daten, fehler, hinweise };
}

/** Eine Zeile ohne einen einzigen Wert – in Tabellen meist die leeren Reste unten. */
export function istLeer(eingabe: Eingabe): boolean {
    return Object.values(eingabe).every(wert => !wert || !wert.trim());
}

export interface TabellenErgebnis {
    zeilen: { zeile: number; eingabe: Eingabe; daten: VordruckDaten; fehler: string[]; hinweise: string[] }[];
    /** Spalten des Kopfes, die einem Feld zugeordnet sind. */
    bekannteSpalten: number;
    /** Spaltenpaare für dasselbe Feld; genommen wird jeweils die rechte. */
    doppelteSpalten: string[];
    /** Zeile des Kopfes, wie in Excel ab 1 gezählt. */
    kopfZeile: number;
    unbekannteSpalten: string[];
    /** Zeilen, die unverändert die Beispielzeile der Vorlage sind; sie werden nicht gedruckt. */
    beispielZeilen: number[];
}

/**
 * Die Beispielzeile der CSV-Vorlage, unverändert übernommen: jede vorhandene
 * Spalte trägt genau ihren Beispielwert, auch Abfassungszeit und Vermerke.
 * Eine echte Nachricht mit zufällig gleichem Text bleibt so erhalten.
 */
function istBeispiel(eingabe: Eingabe): boolean {
    const vorhanden = SPALTEN.filter(spalte => spalte.schluessel in eingabe);
    return vorhanden.filter(spalte => spalte.beispiel).length >= 5
        && vorhanden.every(spalte => (eingabe[spalte.schluessel] ?? "").trim() === spalte.beispiel);
}

/**
 * Erste Zeile ist der Kopf, jede weitere ein Vordruck. `zeile` zählt wie in
 * Excel ab 1, damit Fehlermeldungen auf die richtige Zeile zeigen.
 */
/** Die Zeile unter den ersten zehn mit den meisten bekannten Spaltenköpfen; sonst die erste. */
export function findeKopfzeile(tabelle: readonly string[][]): number {
    let beste = 0;
    let treffer = 0;
    tabelle.slice(0, 10).forEach((zeile, index) => {
        const anzahl = zeile.filter(zelle => schluesselZuKopf(zelle)).length;
        if (anzahl > treffer) {
            beste = index;
            treffer = anzahl;
        }
    });
    return beste;
}

export function leseTabelle(tabelle: string[][]): TabellenErgebnis {
    // Der Kopf muss nicht in Zeile 1 stehen: oft steht ein Titel oder eine Leerzeile davor.
    const kopfIndex = findeKopfzeile(tabelle);
    const kopf = tabelle[kopfIndex] ?? [];
    const rest = tabelle.slice(kopfIndex + 1);
    const zuordnung = kopf.map(zelle => schluesselZuKopf(zelle));
    // Zwei Spalten für dasselbe Feld: die rechte gewinnt, das soll man erfahren.
    const doppelteSpalten = zuordnung.flatMap((schluessel, index) =>
        schluessel && zuordnung.indexOf(schluessel) !== index
            ? [`„${(kopf[zuordnung.indexOf(schluessel)] ?? "").trim()}“ und „${(kopf[index] ?? "").trim()}“`]
            : []);
    const unbekannteSpalten = kopf
        .filter((zelle, index) => zelle.trim() && !zuordnung[index] && !UEBERGANGEN.has(normiere(zelle)))
        .map(zelle => zelle.trim());

    const zeilen: TabellenErgebnis["zeilen"] = [];
    const beispielZeilen: number[] = [];
    const gefuellt = rest.filter(werte => werte.some(wert => wert.trim()));
    const trennerAmZeilenende = gefuellt.length > 1
        && gefuellt.every(werte => werte.length === kopf.length + 1 && !(werte.at(-1) ?? "").trim());
    rest.forEach((werte, index) => {
        const eingabe: Eingabe = {};
        zuordnung.forEach((schluessel, spalte) => {
            if (schluessel) {
                eingabe[schluessel] = werte[spalte] ?? "";
            }
        });
        if (istLeer(eingabe)) {
            return;
        }
        if (istBeispiel(eingabe)) {
            beispielZeilen.push(index + kopfIndex + 2);
            return;
        }
        const { daten, fehler, hinweise } = zuVordruckDaten(eingabe);
        if (!daten.inhalt) {
            hinweise.push("kein Text");
        }
        if ("nummer" in eingabe && !daten.nummer) {
            hinweise.push("keine Nr.");
        }
        if ("empfaenger" in eingabe && daten.empfaenger.length === 0) {
            hinweise.push("keine Gegenstelle bzw. kein Empfänger");
        }
        // Mehr gefüllte Zellen als Spalten im Kopf: meist ein Trennzeichen im
        // Text, etwa mehrere Empfänger mit Semikolon in einer CSV ohne
        // Anführungszeichen. Dann ist alles danach verrutscht.
        // Auch wenn die letzten Spalten leer sind, wie in der Vorlage üblich:
        // dann ist die überzählige Zelle leer, die Werte davor sind trotzdem
        // verrutscht. Ausgenommen sind Dateien, die jede Zeile mit einem
        // Trennzeichen abschließen.
        if (werte.length > kopf.length && !trennerAmZeilenende) {
            fehler.unshift(`${werte.length} Felder, aber nur ${kopf.length} Spalten im Kopf. Steht ein Semikolon im Text? Dann die Zelle in Anführungszeichen setzen; die Werte sind sonst verrutscht`);
        }
        zeilen.push({ zeile: index + kopfIndex + 2, eingabe, daten, fehler, hinweise });
    });

    // Doppelte Nummern: im Betriebsbuch muss jede Nummer eindeutig sein.
    const nachNummer = new Map<string, number[]>();
    for (const zeile of zeilen) {
        if (zeile.daten.nummer) {
            nachNummer.set(zeile.daten.nummer, [...nachNummer.get(zeile.daten.nummer) ?? [], zeile.zeile]);
        }
    }
    for (const zeile of zeilen) {
        const gleich = (nachNummer.get(zeile.daten.nummer) ?? []).filter(andere => andere !== zeile.zeile);
        if (gleich.length > 0) {
            zeile.hinweise.push(`Nr. ${zeile.daten.nummer} steht auch in Zeile ${gleich.join(", ")}`);
        }
    }

    return {
        zeilen, unbekannteSpalten, beispielZeilen, doppelteSpalten,
        bekannteSpalten: zuordnung.filter(Boolean).length,
        kopfZeile: kopfIndex + 1
    };
}

const MONATE = ["jan", "feb", "mrz", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "dez"];

/** Datum-Zeit-Gruppe wie auf dem Vordruck üblich: TTHHMMmonJJ, z. B. „031415okt26". */
export function datumZeitGruppe(zeit: Date): string {
    const zwei = (zahl: number) => String(zahl).padStart(2, "0");
    return `${zwei(zeit.getDate())}${zwei(zeit.getHours())}${zwei(zeit.getMinutes())}`
        + `${MONATE[zeit.getMonth()]}${zwei(zeit.getFullYear() % 100)}`;
}

/**
 * Zählt die Ziffern am Ende hoch und behält Vorsatz und führende Nullen:
 * „17“ → „18“, „A-09“ → „A-10“. Ohne Ziffern am Ende leer.
 */
export function naechsteNummer(nummer: string): string {
    const teile = /^(.*?)(\d+)$/.exec(nummer.trim());
    if (!teile) {
        return "";
    }
    const [, vorsatz = "", ziffern = ""] = teile;
    return vorsatz + String(Number(ziffern) + 1).padStart(ziffern.length, "0");
}
