import { describe, expect, it } from "vitest";
import { datumZeitGruppe, leseTabelle, leseVerteiler, naechsteNummer, schluesselZuKopf, zuVordruckDaten } from "../../web/src/spalten.js";

describe("zuVordruckDaten", () => {
    it("übernimmt Auswahlwerte unabhängig von Schreibweise", () => {
        const { daten, fehler } = zuVordruckDaten({
            art: " spruch ", vorrang: "BLITZ", weg: "DFÜ", richtung: "Eingang", gespraechsnotiz: "x"
        });
        expect(fehler).toEqual([]);
        expect(daten.ankreuzfelder()).toEqual([
            "kopfDfue", "betriebsbuchEingang", "spruchkopfDfue", "spruch", "blitz", "gespraechsnotiz"
        ]);
    });

    it("kreuzt bei leeren Auswahlfeldern nichts an", () => {
        expect(zuVordruckDaten({}).daten.ankreuzfelder()).toEqual([]);
    });

    it("meldet ungültige Werte und lässt das Feld leer", () => {
        const { daten, fehler } = zuVordruckDaten({ art: "Funkspruch", gespraechsnotiz: "vielleicht" });
        expect(daten.art).toBeUndefined();
        expect(fehler).toHaveLength(2);
        expect(fehler[0]).toContain("Funkspruch");
    });

    it("trennt Empfänger und Anschriften an Semikolon und Zeilenumbruch", () => {
        const { daten } = zuVordruckDaten({ empfaenger: "Heros 1; Heros 2\nHeros 3", anschrift: "TEL" });
        expect(daten.empfaenger).toEqual(["Heros 1", "Heros 2", "Heros 3"]);
        expect(daten.anschriften).toEqual(["TEL"]);
    });

    it("setzt Vermerke, Quittung und Fußfelder", () => {
        const { daten } = zuVordruckDaten({
            annahmeUhrzeit: "14:16", quittungZeichen: "MK", abfassungszeit: "031415okt26", inhalt: "a\r\nb"
        });
        expect(daten.textfelder()).toMatchObject({
            annahmevermerkUhrzeit: "14:16", quittungZeichen: "MK", abfassungszeit: "031415okt26"
        });
        expect(daten.inhalt).toBe("a\nb");
    });
});

describe("leseVerteiler", () => {
    it("liest Leiter und Rasterfelder", () => {
        const fehler: string[] = [];
        expect(leseVerteiler("Leiter, S1/2; s6-3", fehler)).toEqual(["verteilerLeiter", "verteilerS1Spalte2", "verteilerS6Spalte3"]);
        expect(fehler).toEqual([]);
    });

    it("lehnt Felder ab, die das Raster nicht hat", () => {
        const fehler: string[] = [];
        expect(leseVerteiler("S5/1, S1/4", fehler)).toEqual([]);
        expect(fehler).toHaveLength(2);
    });
});

describe("leseTabelle", () => {
    it("erkennt Spalten am Kopf, überspringt leere Zeilen und zählt wie Excel", () => {
        const { zeilen, unbekannteSpalten } = leseTabelle([
            ["Inhalt", "Nr", "Bemerkung intern", "Empfänger"],
            ["Text 1", "1", "x", "Heros 1"],
            ["", "", "", ""],
            ["Text 2", "2", "", "Heros 2"]
        ]);
        expect(unbekannteSpalten).toEqual(["Bemerkung intern"]);
        expect(zeilen.map(zeile => [zeile.zeile, zeile.daten.nummer, zeile.daten.inhalt])).toEqual([
            [2, "1", "Text 1"],
            [4, "2", "Text 2"]
        ]);
    });

    it("kennt Kopf-Varianten", () => {
        expect(schluesselZuKopf("Übermittlungsweg")).toBe("weg");
        expect(schluesselZuKopf("uebermittlungsweg")).toBe("weg");
        expect(schluesselZuKopf("Nr.")).toBe("nummer");
        expect(schluesselZuKopf("Empfänger")).toBe("empfaenger");
        expect(schluesselZuKopf("Quittung Uhrzeit")).toBe("quittungUhrzeit");
        expect(schluesselZuKopf("Farbe")).toBeUndefined();
    });
});

describe("datumZeitGruppe", () => {
    it("setzt TTHHMMmonJJ", () => {
        expect(datumZeitGruppe(new Date(2026, 9, 3, 14, 5))).toBe("031405okt26");
        expect(datumZeitGruppe(new Date(2027, 2, 9, 7, 30))).toBe("090730mrz27");
    });
});

describe("naechsteNummer", () => {
    it("zählt hoch und behält führende Nullen", () => {
        expect(naechsteNummer("17")).toBe("18");
        expect(naechsteNummer(" 009 ")).toBe("010");
        expect(naechsteNummer("99")).toBe("100");
    });

    it("lässt die Nummer leer, wenn sie keine reine Zahl ist", () => {
        expect(naechsteNummer("")).toBe("");
        expect(naechsteNummer("17a")).toBe("");
    });
});
