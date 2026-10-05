import { describe, expect, it } from "vitest";
import { leseCsv } from "../../web/src/csv.js";
import { leseTabelle } from "../../web/src/spalten.js";
import { mitNummer, verlaufAlsCsv, type Eintrag } from "../../web/src/verlauf.js";

const liste: Eintrag[] = [
    { zeit: "2026-10-04T12:00:00.000Z", eingabe: { nummer: "17", empfaenger: "Heros Jever 21/10", inhalt: "Lage; unverändert", vorrang: "Blitz" } },
    { zeit: "2026-10-04T12:05:00.000Z", eingabe: { nummer: "18", inhalt: "Zweite\nZeile" } }
];

describe("Liste erstellter Vordrucke", () => {
    it("lässt sich als CSV im Format der Vorlage wieder einlesen", () => {
        const csv = verlaufAlsCsv(liste);
        expect(csv.split("\r\n")[0]).toMatch(/^\uFEFF?Erstellt;Vordruck;Erstellung;Nr;/);
        const { zeilen, unbekannteSpalten } = leseTabelle(leseCsv(csv));
        expect(unbekannteSpalten).toEqual([]);
        expect(zeilen.map(zeile => [zeile.daten.nummer, zeile.daten.inhalt, zeile.daten.vorrang])).toEqual([
            ["17", "Lage; unverändert", "blitz"],
            ["18", "Zweite\nZeile", undefined]
        ]);
    });

    it("findet frühere Vordrucke mit derselben Nummer", () => {
        expect(mitNummer(liste, " 17 ")).toHaveLength(1);
        expect(mitNummer(liste, "")).toEqual([]);
    });
});

describe("Merken", () => {
    it("trägt denselben Stand mit demselben Vordruck nur einmal ein, mit anderem Vordruck getrennt", async () => {
        const daten = new Map<string, string>();
        globalThis.localStorage = {
            getItem: (k: string) => daten.get(k) ?? null,
            setItem: (k: string, v: string) => void daten.set(k, v),
            removeItem: (k: string) => void daten.delete(k)
        } as Storage;
        const { merkeVordrucke, merkeVordruck } = await import("../../web/src/verlauf.js");
        const zeilen = [{ nummer: "1" }, { nummer: "2" }];
        expect(merkeVordrucke(zeilen, new Date(), "nachricht").neu).toBe(2);
        const zweimal = merkeVordrucke(zeilen, new Date(), "nachricht");
        expect(zweimal.neu).toBe(0);
        expect(zweimal.liste).toHaveLength(2);
        expect(merkeVordruck({ nummer: "1" }, new Date(), "meldung").liste).toHaveLength(3);
    });
});

describe("Einsatz und Fassungen", () => {
    const stunde = 60 * 60 * 1000;
    const eintrag = (zeit: number, nummer: string, inhalt = "Text", zusatz?: string): Eintrag =>
        ({ zeit: new Date(zeit).toISOString(), eingabe: { nummer, empfaenger: "Heros Jever 21/10", inhalt }, vordruck: "nachricht", ...zusatz ? { zusatz } : {} });

    it("lässt einen Einsatz nach zwölf Stunden Pause neu beginnen, über Nacht mit kürzerer Pause nicht", async () => {
        const { einsatzBeginn } = await import("../../web/src/verlauf.js");
        const jetzt = Date.UTC(2026, 9, 5, 8);
        // Übung am Vortag bis 18 Uhr, 14 Stunden Pause: neuer Einsatz.
        expect(einsatzBeginn([eintrag(jetzt - 20 * stunde, "1"), eintrag(jetzt - 14 * stunde, "40")], null, jetzt)).toBe(jetzt);
        // Einsatz über Nacht mit acht Stunden Pause: dieselbe Folge, auch nach mehr als 24 Stunden.
        const nacht = [eintrag(jetzt - 30 * stunde, "1"), eintrag(jetzt - 20 * stunde, "4"), eintrag(jetzt - 9 * stunde, "5"), eintrag(jetzt - 1 * stunde, "6")];
        expect(einsatzBeginn(nacht, null, jetzt)).toBe(jetzt - 30 * stunde);
        // Eine gesetzte Grenze geht vor.
        expect(einsatzBeginn(nacht, jetzt - 2 * stunde, jetzt)).toBe(jetzt - 2 * stunde);
        // Eine gesetzte Grenze gilt auch über lange Pausen hinweg.
        expect(einsatzBeginn([eintrag(jetzt - 40 * stunde, "1"), eintrag(jetzt - 20 * stunde, "2")], jetzt - 48 * stunde, jetzt)).toBe(jetzt - 48 * stunde);
    });

    it("unterscheidet Korrektur und erneuten Druck derselben Nr.", async () => {
        const { fassungen } = await import("../../web/src/verlauf.js");
        const start = Date.UTC(2026, 9, 5, 8);
        const liste = [
            eintrag(start, "40", "Lage", "auf 3 Vordrucke verteilt"),
            eintrag(start + 60_000, "40", "Lage", "Text gekürzt gedruckt"),
            eintrag(start + 120_000, "40", "Lage korrigiert"),
            eintrag(start + 20 * stunde, "40", "Neuer Einsatz")
        ];
        expect(fassungen(liste, null)).toEqual(["", "erneut", "Korrektur", ""]);
    });

    it("übernimmt eine wieder eingelesene Liste mit Zeit und Vordruck, ohne Doppel", async () => {
        const daten = new Map<string, string>();
        globalThis.localStorage = {
            getItem: (k: string) => daten.get(k) ?? null,
            setItem: (k: string, v: string) => void daten.set(k, v),
            removeItem: (k: string) => void daten.delete(k)
        } as Storage;
        const { listenEintraege, uebernimmEintraege, verlaufAlsCsv: alsCsv } = await import("../../web/src/verlauf.js");
        const gesichert: Eintrag[] = [
            { zeit: new Date(2026, 9, 5, 7, 42).toISOString(), eingabe: { nummer: "19", inhalt: "Meldung" }, vordruck: "meldung", zusatz: "Absender gekürzt gedruckt" },
            { zeit: new Date(2026, 9, 5, 7, 45).toISOString(), eingabe: { nummer: "20", inhalt: "Nachricht" }, vordruck: "nachricht" }
        ];
        const tabelle = leseTabelle(leseCsv(alsCsv(gesichert)));
        expect(tabelle.istListe).toBe(true);
        const eintraege = listenEintraege(tabelle.zeilen);
        expect(eintraege.map(e => [e.zeit, e.vordruck, e.zusatz, e.eingabe.nummer])).toEqual(gesichert.map(e => [e.zeit, e.vordruck, e.zusatz, e.eingabe.nummer]));
        expect(uebernimmEintraege(eintraege).neu).toBe(2);
        expect(uebernimmEintraege(eintraege).neu).toBe(0);
    });
});

describe("Einsatzfolgen", () => {
    it("trennt nach langer Pause und an der Grenze, nicht über eine Pause nach der Grenze", async () => {
        const { einsatzFolgen } = await import("../../web/src/verlauf.js");
        const h = 60 * 60 * 1000;
        const t0 = Date.UTC(2026, 9, 1, 8);
        const liste: Eintrag[] = [0, 1, 20, 21, 50].map(stunden => ({ zeit: new Date(t0 + stunden * h).toISOString(), eingabe: { nummer: String(stunden) } }));
        expect(einsatzFolgen(liste, null)).toEqual([0, 0, 1, 1, 2]);
        expect(einsatzFolgen(liste, t0 + 10 * h)).toEqual([0, 0, 1, 1, 1]);
    });
});
