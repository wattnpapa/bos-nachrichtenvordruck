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
