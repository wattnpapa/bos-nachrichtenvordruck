/**
 * Schreibzugriffe auf den Gerätespeicher mit Rückmeldung. Ist der Speicher gesperrt
 * (blockierte Websitedaten, manche privaten Fenster) oder voll, wirft `setItem`; ohne
 * Abfangen steht dann weiter „gespeichert“ da, und beim Neuladen fehlt alles.
 */

export type SpeicherZustand = "ok" | "gesperrt" | "voll";

let zustand: SpeicherZustand = "ok";
const hoerer = new Set<(neu: SpeicherZustand) => void>();

export function speicherZustand(): SpeicherZustand {
    return zustand;
}

/** Ruft `fn` bei jedem Wechsel des Zustands auf. */
export function beiSpeicherZustand(fn: (neu: SpeicherZustand) => void): void {
    hoerer.add(fn);
}

function setzeZustand(neu: SpeicherZustand): void {
    if (neu !== zustand) {
        zustand = neu;
        hoerer.forEach(fn => fn(neu));
    }
}

function istVoll(fehler: unknown): boolean {
    const f = fehler as { name?: string; code?: number } | null;
    return f?.name === "QuotaExceededError" || f?.name === "NS_ERROR_DOM_QUOTA_REACHED" || f?.code === 22 || f?.code === 1014;
}

/** Schreibt `wert`; `false`, wenn der Speicher gesperrt oder voll ist (der Zustand wird gemeldet). */
export function schreibe(ort: Storage | null, schluessel: string, wert: string): boolean {
    if (!ort) {
        setzeZustand("gesperrt");
        return false;
    }
    try {
        ort.setItem(schluessel, wert);
        setzeZustand("ok");
        return true;
    } catch (fehler) {
        setzeZustand(istVoll(fehler) ? "voll" : "gesperrt");
        return false;
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

/** Der Text zum Zustand, fest oben auf der Seite und in Rückmeldungen. */
export function speicherWarnung(z: SpeicherZustand): string {
    if (z === "gesperrt") {
        return "Dieser Browser speichert nichts: Entwurf, Ablage, Liste erstellter Vordrucke, Nummernprüfung und Einsatzwechsel gehen beim Neuladen verloren. "
            + "Websitedaten für diese Seite zulassen oder ein anderes Fenster nehmen; PDFs sofort herunterladen.";
    }
    if (z === "voll") {
        return "Der Speicher des Geräts ist voll: Neues wird nicht behalten und geht beim Neuladen verloren (Entwurf, Ablage, Liste, Einsatzwechsel). "
            + "Platz schaffen: in den Browser-Einstellungen Websitedaten löschen, vorher die Liste als CSV sichern. PDFs sofort herunterladen.";
    }
    return "";
}
