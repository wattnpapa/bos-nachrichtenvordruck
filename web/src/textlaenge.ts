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
    /** Dasselbe als Wortgruppe, bei „beide“ je Art: „3 Nachrichten- und 2 Meldevordrucke“. */
    verteilt: string;
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
        boegen: engste.zeilen > engste.maxZeilen ? teileInhalt(inhalt, vordruck).length : 1,
        verteilt: verteiltText(inhalt, vordruck)
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
            + `Auf einem Vordruck stünden nur die ersten ${laenge.maxZeilen} mit „…“ am Ende. Beim Erzeugen lässt er sich auf ${laenge.verteilt} verteilen, oder kürzen.`;
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
    const eindeutig = gekuerzteFelder(daten, vordruck);
    if (eindeutig.length === 0) {
        return "";
    }
    return `Zu lang für den Vordruck, wird mit „…“ gekürzt gedruckt: ${eindeutig.join(", ")}`;
}

/** Namen der einzeiligen Felder, die gekürzt gedruckt würden. */
export function gekuerzteFelder(daten: VordruckDaten, vordruck: VordruckWahl): string[] {
    messPdf ??= new jsPDF("p", "mm", "a5");
    const namen = [
        ...(vordruck !== "meldung" ? nachrichtenvordruckGekuerzt(messPdf, daten) : []),
        ...(vordruck !== "nachricht" ? meldevordruckGekuerzt(messPdf, daten) : [])
    ].map(name => FELDNAMEN[name]
        ?? SPALTEN.find(spalte => spalte.schluessel === name)?.titel
        ?? SPALTEN.find(spalte => spalte.schluessel === name.replace("vermerk", ""))?.titel
        ?? name);
    return [...new Set(namen)];
}

/**
 * Kurzer Prüfvermerk für den Bogen selbst: was dort anders steht als
 * eingegeben. Leer, wenn alles passt. Bei „beide“ gilt er für beide Vordrucke;
 * für einen einzelnen Bogen `vordruck` auf dessen Art setzen.
 */
export function pruefvermerk(daten: VordruckDaten, vordruck: VordruckWahl, fehler: readonly string[], verteilt: boolean): string {
    const felder = gekuerzteFelder(daten, vordruck);
    // Verworfene Werte mit Feldnamen: „Vorrang: „Eilig“ ist kein gültiger Wert“ ergibt „Vorrang“.
    // Der Meldevordruck nennt nur Felder, die er hat.
    const verworfen = [...new Set(fehler
        .filter(text => /kein gültiger Wert|weder ja noch nein|gibt es nicht/.test(text))
        .map(text => /^([^:]+):/.exec(text)?.[1]?.trim() ?? "Wert"))]
        .filter(name => vordruck !== "meldung" || !SPALTEN.find(spalte => spalte.titel === name)?.nurNachricht);
    // Kurz halten: Der Vermerk hat eine Zeile, abgeschnitten wäre er mitten im Wort.
    const nennen = (namen: readonly string[]) => namen.length > 2 ? `${namen.slice(0, 2).join(", ")} u. a.` : namen.join(", ");
    const punkte = [
        fehler.some(text => /^\d+ Felder, aber nur \d+ Spalten/.test(text)) ? "Spalten verrutscht, Text und Absender vergleichen" : "",
        !verteilt && istKritisch(pruefeTextlaenge(daten.inhalt, vordruck)) ? "Text gekürzt" : "",
        felder.length > 0 ? `${nennen(felder)} gekürzt` : "",
        verworfen.length > 0 ? `${nennen(verworfen)} verworfen` : "",
        fehler.some(text => text.startsWith("Zeichen ")) ? "Sonderzeichen als „?“" : ""
    ].filter(Boolean);
    return punkte.length > 0 ? `Prüfen: ${punkte.join("; ")}` : "";
}

const BETREFF = SPALTEN.find(spalte => spalte.schluessel === "betreff")?.titel ?? "Betreff";

/**
 * Gekürzte Felder auf den fertigen Bögen: dort teilt sich der Betreff die
 * Zeile mit Prüfvermerk und Blattangabe.
 */
export function gekuerzteFelderAufBoegen(boegen: readonly Bogen[], vordruck: VordruckWahl): string[] {
    return [...new Set(boegen.flatMap(bogen => [
        ...gekuerzteFelder(bogen, bogen.nur ?? vordruck),
        ...bogen.pruefvermerk.includes("Betreff gekürzt") ? [BETREFF] : []
    ]))];
}

/** Daten für genau einen Bogen; bei „beide“ sagt `nur`, welcher Vordruck. */
export type Bogen = VordruckDaten & { nur?: "nachricht" | "meldung" };

/**
 * Die Bögen eines Stands: je Vordruckart einer, oder mit `verteilen` so viele,
 * dass langer Text ganz aufs Papier kommt, jeder mit „Blatt n von m“. Bei
 * „beide“ zählt jede Art für sich, und jeder Bogen trägt nur den Prüfvermerk
 * seiner Art. Nachrichten- und Meldevordruck stehen abwechselnd, damit sie auf
 * A4 quer nebeneinander liegen.
 */
export function bogenListe(daten: VordruckDaten, vordruck: VordruckWahl, fehler: readonly string[], verteilen: boolean): Bogen[] {
    const arten = vordruck === "beide" ? ["nachricht", "meldung"] as const : [vordruck];
    const jeArt = arten.map(art => {
        const teile = verteilen && istKritisch(pruefeTextlaenge(daten.inhalt, art)) ? teileInhalt(daten.inhalt, art) : [daten.inhalt];
        let vermerk = pruefvermerk(daten, art, fehler, teile.length > 1);
        // Teilt sich der Betreff die Zeile mit Vermerk und Blattangabe, bleibt ihm
        // weniger Platz: am fertigen Bogen nachsehen, ob er jetzt gekürzt wird.
        if (daten.betreff && !vermerk.includes("Betreff")) {
            const probe = Object.assign(Object.create(Object.getPrototypeOf(daten) as object) as Bogen, daten);
            probe.pruefvermerk = vermerk;
            probe.blatt = teile.length > 1 ? `Blatt ${teile.length} von ${teile.length}` : "";
            if (gekuerzteFelder(probe, art).includes(BETREFF)) {
                vermerk = vermerk ? `${vermerk}; Betreff gekürzt` : "Prüfen: Betreff gekürzt";
            }
        }
        return teile.map((inhalt, index) => {
            const bogen = Object.assign(Object.create(Object.getPrototypeOf(daten) as object) as Bogen, daten);
            bogen.inhalt = inhalt;
            bogen.blatt = teile.length > 1 ? `Blatt ${index + 1} von ${teile.length}` : "";
            bogen.pruefvermerk = vermerk;
            if (vordruck === "beide") {
                bogen.nur = art === "meldung" ? "meldung" : "nachricht";
            }
            return bogen;
        });
    });
    const laengste = Math.max(...jeArt.map(boegen => boegen.length));
    return Array.from({ length: laengste }, (_, index) => jeArt.flatMap(boegen => boegen[index] ? [boegen[index]] : []))
        .flat();
}

/**
 * Wie viele Vordrucke beim Verteilen entstehen, als Wortgruppe: „3 Vordrucke“,
 * bei „beide“ „3 Nachrichten- und 2 Meldevordrucke“.
 */
export function verteiltText(inhalt: string, vordruck: VordruckWahl): string {
    // Direkt geteilt, nicht über pruefeTextlaenge: Die ruft diese Funktion selbst auf.
    const zahl = (art: "nachricht" | "meldung") => inhalt.trim() ? teileInhalt(inhalt, art).length : 1;
    if (vordruck === "beide") {
        return `${zahl("nachricht")} Nachrichten- und ${zahl("meldung")} ${zahl("meldung") === 1 ? "Meldevordruck" : "Meldevordrucke"}`;
    }
    const anzahl = zahl(vordruck);
    return `${anzahl} ${anzahl === 1 ? "Vordruck" : "Vordrucke"}`;
}

/**
 * Teilt den Inhalt auf Folgebögen: so viele Stücke, dass auf dem engsten der
 * gewählten Vordrucke nichts abgeschnitten wird.
 */
export function teileInhalt(inhalt: string, vordruck: VordruckWahl): string[] {
    messPdf ??= new jsPDF("p", "mm", "a5");
    return vordruck === "meldung" ? meldevordruckInhaltTeilen(messPdf, inhalt) : nachrichtenvordruckInhaltTeilen(messPdf, inhalt);
}
