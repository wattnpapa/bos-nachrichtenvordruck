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
        expect(csv.split("\r\n")[0]).toMatch(/^\uFEFF?Erstellt;Vordruck;Erstellung;Einsatz;Nr;/);
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
        const { einsatzBeginn, OHNE_GRENZE } = await import("../../web/src/verlauf.js");
        const jetzt = Date.UTC(2026, 9, 5, 8);
        // Übung am Vortag bis 18 Uhr, 14 Stunden Pause: neuer Einsatz.
        expect(einsatzBeginn([eintrag(jetzt - 20 * stunde, "1"), eintrag(jetzt - 14 * stunde, "40")], OHNE_GRENZE, jetzt)).toBe(jetzt);
        // Einsatz über Nacht mit acht Stunden Pause: dieselbe Folge, auch nach mehr als 24 Stunden.
        const nacht = [eintrag(jetzt - 30 * stunde, "1"), eintrag(jetzt - 20 * stunde, "4"), eintrag(jetzt - 9 * stunde, "5"), eintrag(jetzt - 1 * stunde, "6")];
        expect(einsatzBeginn(nacht, OHNE_GRENZE, jetzt)).toBe(jetzt - 30 * stunde);
        // Eine gesetzte Grenze geht vor.
        expect(einsatzBeginn(nacht, { grenzen: [jetzt - 2 * stunde], bruecken: [] }, jetzt)).toBe(jetzt - 2 * stunde);
        // Auch eine gesetzte Grenze läuft nach zwölf Stunden ohne Vordruck ab: Die Übung der Woche darauf beginnt neu.
        expect(einsatzBeginn([eintrag(jetzt - 40 * stunde, "1")], { grenzen: [jetzt - 48 * stunde], bruecken: [] }, jetzt)).toBe(jetzt);
        // Eine Brücke („Einsatz fortsetzen“) überspringt die Pause nach dem angegebenen Eintrag.
        const vorPause = eintrag(jetzt - 30 * stunde, "1");
        expect(einsatzBeginn([vorPause, eintrag(jetzt - 1 * stunde, "2")], { grenzen: [], bruecken: [jetzt - 30 * stunde] }, jetzt)).toBe(jetzt - 30 * stunde);
        // Auch abgelegte Entwürfe zählen als Arbeit: Ohne erstelltes PDF beginnt der Einsatz nicht erst jetzt.
        expect(einsatzBeginn([{ zeit: new Date(jetzt - 3 * stunde).toISOString() }], OHNE_GRENZE, jetzt)).toBe(jetzt - 3 * stunde);
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
        expect(fassungen(liste)).toEqual(["", "erneut", "Korrektur", ""]);
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
    const h = 60 * 60 * 1000;
    const t0 = Date.UTC(2026, 9, 1, 8);
    const liste: Eintrag[] = [0, 1, 20, 21, 50].map(stunden => ({ zeit: new Date(t0 + stunden * h).toISOString(), eingabe: { nummer: String(stunden) } }));

    it("trennt nach langer Pause und an einer Grenze", async () => {
        const { einsatzFolgen } = await import("../../web/src/verlauf.js");
        expect(einsatzFolgen(liste)).toEqual([0, 0, 1, 1, 2]);
        expect(einsatzFolgen(liste, { grenzen: [t0 + 10 * h], bruecken: [] })).toEqual([0, 0, 1, 1, 2]);
        expect(einsatzFolgen(liste, { grenzen: [t0 + 30 * h], bruecken: [] })).toEqual([0, 0, 1, 1, 2]);
        expect(einsatzFolgen(liste, { grenzen: [t0 + 0.5 * h], bruecken: [] })).toEqual([0, 1, 2, 2, 3]);
    });

    it("überbrückt eine Pause nach einem Eintrag", async () => {
        const { einsatzFolgen } = await import("../../web/src/verlauf.js");
        expect(einsatzFolgen(liste, { grenzen: [], bruecken: [new Date(liste[1]?.zeit ?? "").getTime()] })).toEqual([0, 0, 0, 0, 1]);
    });

    it("zählt Arbeit außerhalb der Liste (abgelegte Entwürfe) mit: Pausen werden dort unterbrochen und überbrückt", async () => {
        const { einsatzFolgen } = await import("../../web/src/verlauf.js");
        // Vordrucke nach 0, 1 und 50 Stunden; ein Entwurf bei 25 Stunden teilt die Pause von 49 Stunden in zwei von 24.
        const mitEntwurf: Eintrag[] = [0, 1, 50].map(stunden => ({ zeit: new Date(t0 + stunden * h).toISOString(), eingabe: { nummer: String(stunden) } }));
        const entwurf = t0 + 25 * h;
        expect(einsatzFolgen(mitEntwurf, { grenzen: [], bruecken: [] }, [entwurf])).toEqual([0, 0, 1]);
        // Die Brücke am Ende der ersten Pause genügt nicht, die zweite bleibt.
        expect(einsatzFolgen(mitEntwurf, { grenzen: [], bruecken: [t0 + h] }, [entwurf])).toEqual([0, 0, 1]);
        expect(einsatzFolgen(mitEntwurf, { grenzen: [], bruecken: [t0 + h, entwurf] }, [entwurf])).toEqual([0, 0, 0]);
    });

    it("nimmt die Einsatzgrenzen einer gesicherten Liste auf einem anderen Gerät mit", async () => {
        const { listenEinsatz, verlaufAlsCsv: alsCsv, einsatzFolgen: folgen } = await import("../../web/src/verlauf.js");
        const stand = { grenzen: [t0 + 0.5 * h], bruecken: [new Date(liste[3]?.zeit ?? "").getTime()] };
        const csv = alsCsv(liste, stand);
        expect(csv.split("\r\n")[0]).toMatch(/Erstellt;Vordruck;Erstellung;Einsatz;Nr/);
        const tabelle = leseTabelle(leseCsv(csv));
        const geladen = listenEinsatz(tabelle.zeilen);
        // Auf dem Ersatzgerät entstehen dieselben Einsätze.
        expect(folgen(liste, geladen)).toEqual(folgen(liste, stand));
    });
});

describe("Einsatz und Eintragen", () => {
    it("trägt denselben Stand nach „Neuer Einsatz“ noch einmal ein", async () => {
        const daten = new Map<string, string>();
        globalThis.localStorage = {
            getItem: (k: string) => daten.get(k) ?? null,
            setItem: (k: string, v: string) => void daten.set(k, v),
            removeItem: (k: string) => void daten.delete(k)
        } as Storage;
        const { merkeVordruck } = await import("../../web/src/verlauf.js");
        const stand = { nummer: "1", inhalt: "Gleich" };
        expect(merkeVordruck(stand, new Date(), "nachricht").neu).toBe(1);
        expect(merkeVordruck(stand, new Date(), "nachricht").neu).toBe(0);
        // Mit „ab“ nach dem ersten Eintrag gilt der Stand wieder als neu.
        expect(merkeVordruck(stand, new Date(), "nachricht", "", Date.now() + 1000).neu).toBe(1);
    });

    it("liest die Spalte „Erstellt“ mit und ohne Sekunden", async () => {
        const { listenEintraege } = await import("../../web/src/verlauf.js");
        const zeile = (erstellt: string) => ({ eingabe: { nummer: "1" }, liste: { erstellt, vordruck: "", erstellung: "" } });
        const mit = listenEintraege([zeile("05.10.2026 07:42:31")]);
        const ohne = listenEintraege([zeile("05.10.2026 07:42")]);
        expect(new Date(mit[0]?.zeit ?? "").getSeconds()).toBe(31);
        expect(new Date(ohne[0]?.zeit ?? "").getSeconds()).toBe(0);
    });
});
