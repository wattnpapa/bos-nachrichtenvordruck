import {
    BETRIEBSBUCH_RICHTUNG,
    KOPF_UEBERMITTLUNGSWEG,
    SPRUCHKOPF_UEBERMITTLUNGSWEG,
    type NachrichtenvordruckAnkreuzfeld,
    type NachrichtenvordruckTextfeld,
    type Uebermittlungsweg,
    type VordruckArt,
    type Vordruckrichtung,
    type Vorrang
} from "./felder.js";

/** Datum, Uhrzeit und Handzeichen eines Vermerks im Kopf des Vordrucks. */
export interface VordruckVermerk {
    datum?: string;
    uhrzeit?: string;
    handzeichen?: string;
}

/** Quittung am Fuß des Vordrucks. */
export interface VordruckQuittung {
    uhrzeit?: string;
    zeichen?: string;
    /** Für die Stelle hat der Bogen keine Beschriftung, nur freien Platz. */
    stelle?: string;
}

/**
 * Ein ausgefüllter Vordruck – jedes Feld des Bogens als Property.
 *
 * Die Klasse kennt bewusst keine Anwendung: sie ist die Schnittstelle zwischen
 * dem Aufrufer, der die Werte kennt, und dem Renderer, der nur noch zeichnet.
 *
 * Nicht belegte Felder bleiben leer und werden nicht gezeichnet – eine Anwendung
 * setzt also nur, was sie kennt.
 */
export class VordruckDaten {

    // ---- Kopf ---------------------------------------------------------------

    /** Laufende Nummer oder X-Zeit-Marke im Feld „Nr." des Betriebsbuchs. */
    nummer = "";

    /** Übermittlungsweg; wird in Kopfzeile und Spruchkopf angekreuzt. */
    uebermittlungsweg?: Uebermittlungsweg = "funk";

    /** Richtung im Technischen Betriebsbuch. */
    richtung?: Vordruckrichtung = "ausgang";

    /** Aufnahmevermerk (Eingang). */
    aufnahmevermerk: VordruckVermerk = {};

    /** Annahmevermerk (Ausgang). */
    annahmevermerk: VordruckVermerk = {};

    /** Beförderungsvermerk (Ausgang). */
    befoerderungsvermerk: VordruckVermerk = {};

    // ---- Spruchkopf ---------------------------------------------------------

    /** Spruch oder Durchsage. Bleibt offen, wenn die Art nicht geübt wird. */
    art?: VordruckArt;

    /** Vorrangstufe, falls die Nachricht eine hat. */
    vorrang?: Vorrang;

    /** Kästchen „GESPRÄCHSNOTIZ". */
    gespraechsnotiz = false;

    /** Funkrufnamen der Gegenstellen, obere Zeile des Spruchkopfs. */
    empfaenger: string[] = [];

    /** Anschriften bzw. Stellenbezeichnungen der Gegenstellen. */
    anschriften: string[] = [];

    // ---- Inhalt -------------------------------------------------------------

    /** Nachrichtentext. Ein Zeilenumbruch im Text wird übernommen. */
    inhalt = "";

    /** Absender der Nachricht. */
    absender = "";

    /**
     * Verfasser der Nachricht. Nur der Meldevordruck hat dafür ein eigenes Feld;
     * im Übungsbetrieb ist es derselbe Funkrufname wie der Absender.
     */
    verfasser = "";

    // ---- Fuß ----------------------------------------------------------------

    /** Abfassungszeit im NATO-Format, z. B. „311131aug26". */
    abfassungszeit = "";

    /** Handzeichen des Verfassers, üblich 2–4 Zeichen. */
    zeichen = "";

    /** Funktion des Verfassers, z. B. „S 2". */
    funktion = "";

    /** Quittung mit Uhrzeit, Zeichen und Stelle. */
    quittung: VordruckQuittung = {};

    /** Freitext im Feld „Vermerke". */
    vermerke = "";

    /**
     * Weitere Ankreuzfelder, die kein eigenes Property haben – vor allem das
     * Verteilerraster „TEL / EL / EAL / UEAL" (`verteilerLeiter`,
     * `verteilerS1Spalte1` …). Fünfzehn Boolean-Properties wären hier mehr
     * Rauschen als Nutzen.
     */
    weitereAnkreuzfelder: NachrichtenvordruckAnkreuzfeld[] = [];

    // ---- Rahmen (nicht Teil des Formulars) ----------------------------------

    /** Überschrift am oberen Blattrand, z. B. der Name einer Übung. */
    titel = "";

    /** Kleingedruckte Zeile am rechten Blattrand (Herkunft, Version, Zeit). */
    fusszeile = "";

    /** Hinweiszeile am unteren Blattrand. */
    hinweis = "";

    /**
     * Kennzeichen eines Folgebogens, z. B. „Blatt 2 von 3“. Steht fett rechts
     * neben „Inhalt“, im Formular statt am Blattrand, wo Drucker abschneiden.
     */
    blatt = "";

    /**
     * Welche Ankreuzfelder aus den gesetzten Angaben folgen.
     *
     * Die Reihenfolge ist stabil, damit sich die PDF-Ausgabe bei gleicher
     * Eingabe nicht ändert.
     */
    public ankreuzfelder(): NachrichtenvordruckAnkreuzfeld[] {
        const felder: NachrichtenvordruckAnkreuzfeld[] = [];

        if (this.uebermittlungsweg) {
            felder.push(KOPF_UEBERMITTLUNGSWEG[this.uebermittlungsweg]);
        }
        if (this.richtung) {
            felder.push(BETRIEBSBUCH_RICHTUNG[this.richtung]);
        }
        if (this.uebermittlungsweg) {
            felder.push(SPRUCHKOPF_UEBERMITTLUNGSWEG[this.uebermittlungsweg]);
        }
        if (this.art) {
            felder.push(this.art === "spruch" ? "spruch" : "durchsage");
        }
        if (this.vorrang) {
            felder.push(this.vorrang);
        }
        if (this.gespraechsnotiz) {
            felder.push("gespraechsnotiz");
        }
        for (const feld of this.weitereAnkreuzfelder) {
            if (!felder.includes(feld)) {
                felder.push(feld);
            }
        }

        return felder;
    }

    /** Welche Textfelder belegt sind, mit ihrem Inhalt. */
    public textfelder(): Partial<Record<NachrichtenvordruckTextfeld, string>> {
        const felder: Partial<Record<NachrichtenvordruckTextfeld, string>> = {};

        const uebernehmeVermerk = (
            vermerk: VordruckVermerk,
            datum: NachrichtenvordruckTextfeld,
            uhrzeit: NachrichtenvordruckTextfeld,
            handzeichen: NachrichtenvordruckTextfeld
        ) => {
            if (vermerk.datum) {
                felder[datum] = vermerk.datum;
            }
            if (vermerk.uhrzeit) {
                felder[uhrzeit] = vermerk.uhrzeit;
            }
            if (vermerk.handzeichen) {
                felder[handzeichen] = vermerk.handzeichen;
            }
        };

        uebernehmeVermerk(
            this.aufnahmevermerk,
            "aufnahmevermerkDatum",
            "aufnahmevermerkUhrzeit",
            "aufnahmevermerkHdz"
        );
        uebernehmeVermerk(
            this.annahmevermerk,
            "annahmevermerkDatum",
            "annahmevermerkUhrzeit",
            "annahmevermerkHdz"
        );
        uebernehmeVermerk(
            this.befoerderungsvermerk,
            "befoerderungsvermerkDatum",
            "befoerderungsvermerkUhrzeit",
            "befoerderungsvermerkHdz"
        );

        if (this.abfassungszeit) {
            felder.abfassungszeit = this.abfassungszeit;
        }
        if (this.zeichen) {
            felder.zeichen = this.zeichen;
        }
        if (this.funktion) {
            felder.funktion = this.funktion;
        }
        if (this.quittung.uhrzeit) {
            felder.quittungUhrzeit = this.quittung.uhrzeit;
        }
        if (this.quittung.zeichen) {
            felder.quittungZeichen = this.quittung.zeichen;
        }
        if (this.quittung.stelle) {
            felder.quittungStelle = this.quittung.stelle;
        }
        if (this.vermerke) {
            felder.vermerke = this.vermerke;
        }

        return felder;
    }
}
