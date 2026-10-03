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
    { schluessel: "empfaenger", titel: "Empfänger", beschreibung: "Rufname der Gegenstelle. Mehrere mit Semikolon trennen.", beispiel: "Heros Jever 21/10", breite: 24 },
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
    fehler: string[];
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
    ["rufname", "empfaenger"], ["gegenstelle", "empfaenger"], ["an", "empfaenger"],
    ["anschriften", "anschrift"], ["text", "inhalt"], ["nachricht", "inhalt"],
    ["von", "absender"], ["dtg", "abfassungszeit"], ["handzeichen", "zeichen"]
] as const) {
    KOPF_ZU_SCHLUESSEL.set(normiere(alias), schluessel);
}

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
            fehler.push(`Verteiler: „${eintrag}“ gibt es nicht (erlaubt: Leiter, S1/1 … S6/3)`);
        }
    }
    return felder;
}

function liste(roh: string | undefined): string[] {
    return (roh ?? "").split(/[;\n]+/).map(teil => teil.trim()).filter(Boolean);
}

/** Wandelt eine Zeile in `VordruckDaten`. Ungültige Auswahlwerte landen in `fehler`. */
export function zuVordruckDaten(eingabe: Eingabe): Umwandlung {
    const fehler: string[] = [];
    const daten = new VordruckDaten();
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

    return { daten, fehler };
}

/** Eine Zeile ohne einen einzigen Wert – in Tabellen meist die leeren Reste unten. */
export function istLeer(eingabe: Eingabe): boolean {
    return Object.values(eingabe).every(wert => !wert || !wert.trim());
}

export interface TabellenErgebnis {
    zeilen: { zeile: number; eingabe: Eingabe; daten: VordruckDaten; fehler: string[] }[];
    unbekannteSpalten: string[];
}

/**
 * Erste Zeile ist der Kopf, jede weitere ein Vordruck. `zeile` zählt wie in
 * Excel ab 1, damit Fehlermeldungen auf die richtige Zeile zeigen.
 */
export function leseTabelle(tabelle: string[][]): TabellenErgebnis {
    const [kopf = [], ...rest] = tabelle;
    const zuordnung = kopf.map(zelle => schluesselZuKopf(zelle));
    const unbekannteSpalten = kopf
        .filter((zelle, index) => zelle.trim() && !zuordnung[index])
        .map(zelle => zelle.trim());

    const zeilen: TabellenErgebnis["zeilen"] = [];
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
        const { daten, fehler } = zuVordruckDaten(eingabe);
        zeilen.push({ zeile: index + 2, eingabe, daten, fehler });
    });

    return { zeilen, unbekannteSpalten };
}

const MONATE = ["jan", "feb", "mrz", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "dez"];

/** Datum-Zeit-Gruppe wie auf dem Vordruck üblich: TTHHMMmonJJ, z. B. „031415okt26". */
export function datumZeitGruppe(zeit: Date): string {
    const zwei = (zahl: number) => String(zahl).padStart(2, "0");
    return `${zwei(zeit.getDate())}${zwei(zeit.getHours())}${zwei(zeit.getMinutes())}`
        + `${MONATE[zeit.getMonth()]}${zwei(zeit.getFullYear() % 100)}`;
}
