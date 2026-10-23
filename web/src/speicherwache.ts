/**
 * Schreibzugriffe auf den Gerätespeicher mit Rückmeldung. Ist der Speicher gesperrt
 * (blockierte Websitedaten, manche privaten Fenster) oder voll, wirft `setItem`; ohne
 * Abfangen steht dann weiter „gespeichert“ da, und beim Neuladen fehlt alles.
 */

export type SpeicherZustand = "ok" | "gesperrt" | "voll";

let zustand: SpeicherZustand = "ok";
/** Sammelschlüssel für Lesefehler: Der Speicher ist dann gesperrt, auch wenn Schreibversuche scheitern müssten. */
const LESEN = "(lesen)";
/** Schlüssel, deren letztes Schreiben scheiterte: Erst wenn genau diese wieder gelingen, ist der Speicher wieder „ok“. */
const gescheitert = new Map<string, "gesperrt" | "voll">();
const hoerer = new Set<(neu: SpeicherZustand) => void>();

/** Ließ sich der Speicher nicht lesen? Dann steht nicht fest, was darin liegt, und es wird nichts geschrieben. */
export function lesefehler(): boolean {
    return gescheitert.has(LESEN);
}

export function speicherZustand(): SpeicherZustand {
    return zustand;
}

/** Die Schlüssel, deren Schreiben scheiterte (ohne den Sammelschlüssel für Lesefehler). */
export function gescheiterteSchluessel(): string[] {
    return [...gescheitert.keys()].filter(schluessel => schluessel !== LESEN);
}

/** Ruft `fn` bei jedem Wechsel des Zustands auf. */
export function beiSpeicherZustand(fn: (neu: SpeicherZustand) => void): void {
    hoerer.add(fn);
    // Was schon vor dem Anmelden gescheitert ist (ein Lesefehler beim Start), kommt sofort an.
    fn(zustand);
}

let letzteUnterschrift = "";
function berechneZustand(): void {
    const arten = [...gescheitert.values()];
    const neu: SpeicherZustand = arten.includes("gesperrt") ? "gesperrt" : arten.includes("voll") ? "voll" : "ok";
    // Auch ein Wechsel der betroffenen Schlüssel meldet sich: Der Warntext hängt davon ab.
    const unterschrift = `${neu}|${[...gescheitert.entries()].map(([schluessel, art]) => `${schluessel}:${art}`).sort().join(",")}`;
    if (unterschrift !== letzteUnterschrift) {
        letzteUnterschrift = unterschrift;
        zustand = neu;
        hoerer.forEach(fn => fn(neu));
    }
}

function istVoll(fehler: unknown): boolean {
    const f = fehler as { name?: string; code?: number } | null;
    return f?.name === "QuotaExceededError" || f?.name === "NS_ERROR_DOM_QUOTA_REACHED" || f?.code === 22 || f?.code === 1014;
}

/**
 * Schreibt `wert`; `false`, wenn der Speicher gesperrt oder voll ist (der Zustand wird gemeldet).
 * Ein kleiner geglückter Schreibzugriff auf einen anderen Schlüssel nimmt die Warnung nicht zurück:
 * Der Entwurf, der nicht ankommt, ist damit nicht gerettet.
 */
export function schreibe(ort: Storage | null, schluessel: string, wert: string): boolean {
    // Ließ sich der Speicher schon nicht lesen, ist nicht bekannt, was darin steht: Schreiben überschriebe es still.
    if (gescheitert.has(LESEN)) {
        berechneZustand();
        return false;
    }
    if (!ort) {
        gescheitert.set(schluessel, "gesperrt");
        berechneZustand();
        return false;
    }
    try {
        ort.setItem(schluessel, wert);
        gescheitert.delete(schluessel);
        berechneZustand();
        return true;
    } catch (fehler) {
        gescheitert.set(schluessel, istVoll(fehler) ? "voll" : "gesperrt");
        berechneZustand();
        return false;
    }
}

/**
 * Der Gerätespeicher (localStorage) oder `null`. Auch Lesen und Löschen werfen in manchen
 * Browsern (gesperrte Websitedaten): Dort liefert `getItem` dann `null` statt zu werfen.
 */
export function geraeteSpeicher(art: "local" | "session" = "local"): Storage | null {
    try {
        const roh = art === "local" ? globalThis.localStorage : globalThis.sessionStorage;
        if (!roh) {
            return null;
        }
        return {
            getItem: (schluessel: string) => {
                try {
                    return roh.getItem(schluessel);
                } catch {
                    gescheitert.set(LESEN, "gesperrt");
                    berechneZustand();
                    return null;
                }
            },
            setItem: (schluessel: string, wert: string) => roh.setItem(schluessel, wert),
            removeItem: (schluessel: string) => {
                try {
                    roh.removeItem(schluessel);
                } catch {
                    // Nichts zu entfernen.
                }
            },
            clear: () => roh.clear(),
            key: (index: number) => roh.key(index),
            get length() {
                return roh.length;
            }
        } as Storage;
    } catch {
        return null;
    }
}

/** Wie `schreibe` für den Stand dieses Tabs: ein Fehler dort ist kein Grund zur Warnung. */
export function schreibeImTab(ort: Storage | null, schluessel: string, wert: string): boolean {
    try {
        ort?.setItem(schluessel, wert);
        return ort !== null;
    } catch {
        // Der Tab-Stand ist nur eine Zugabe; der Gerätespeicher trägt die Daten.
        return false;
    }
}

/** Beim Start: Ist der Speicher beschreibbar? Ein Versuch mit einem kleinen Wert. */
export function speicherPruefen(ort: Storage | null): boolean {
    const ok = schreibe(ort, "bnv.probe", "1");
    try {
        ort?.removeItem("bnv.probe");
    } catch {
        // Entfernen ist unwichtig.
    }
    return ok;
}

/**
 * Der Text zum Zustand, fest oben auf der Seite: kurz, denn er klebt dort. Scheitert nur die Liste (nicht der Entwurf),
 * sagt er das, statt einen verlorenen Entwurf zu behaupten.
 */
export function speicherWarnung(z: SpeicherZustand, schluessel: readonly string[] = [], lesenGescheitert = false): string {
    if (z === "ok") {
        return "";
    }
    if (lesenGescheitert) {
        return "Browser lässt Lesen nicht zu: Vorhandenes bleibt unverändert, ist aber nicht sichtbar. Neues wird nicht gespeichert. PDFs sofort laden.";
    }
    const nurListe = schluessel.length > 0 && schluessel.every(name => name === "bnv.verlauf.v1");
    if (nurListe) {
        return `${z === "voll" ? "Speicher voll" : "Browser speichert nichts"}: Die Liste erstellter Vordrucke bleibt nicht erhalten. „Liste als CSV“ sichern.`;
    }
    return z === "gesperrt"
        ? "Browser speichert nichts: Entwurf, Ablage, Liste gehen beim Neuladen verloren. PDFs sofort laden."
        : "Speicher voll: Entwurf, Ablage, Liste gehen beim Neuladen verloren. PDFs sofort laden, Liste als CSV sichern.";
}
