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
        const { zeilen } = leseTabelle(leseCsv(verlaufAlsCsv(liste)));
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
