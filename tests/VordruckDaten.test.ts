import { describe, expect, it } from "vitest";
import { VordruckDaten } from "../src/index.js";

describe("VordruckDaten", () => {
    it("kreuzt im Grundzustand Funk und Ausgang an", () => {
        expect(new VordruckDaten().ankreuzfelder()).toEqual([
            "kopfFunk",
            "betriebsbuchAusgang",
            "spruchkopfFunk"
        ]);
    });

    it("leitet Weg, Richtung, Art, Vorrang und Gesprächsnotiz in fester Reihenfolge ab", () => {
        const daten = new VordruckDaten();
        daten.uebermittlungsweg = "telefax";
        daten.richtung = "eingang";
        daten.art = "durchsage";
        daten.vorrang = "blitz";
        daten.gespraechsnotiz = true;
        daten.weitereAnkreuzfelder = ["verteilerLeiter", "blitz"];

        expect(daten.ankreuzfelder()).toEqual([
            "kopfTelefax",
            "betriebsbuchEingang",
            "spruchkopfTelefax",
            "durchsage",
            "blitz",
            "gespraechsnotiz",
            "verteilerLeiter"
        ]);
    });

    it("kreuzt ohne Weg und Richtung nichts davon an", () => {
        const daten = new VordruckDaten();
        delete daten.uebermittlungsweg;
        delete daten.richtung;
        daten.art = "spruch";

        expect(daten.ankreuzfelder()).toEqual(["spruch"]);
    });

    it("liefert nur belegte Textfelder", () => {
        const daten = new VordruckDaten();
        daten.aufnahmevermerk = { datum: "03.10.", uhrzeit: "1415", handzeichen: "JR" };
        daten.annahmevermerk = { uhrzeit: "1416" };
        daten.befoerderungsvermerk = { handzeichen: "MK" };
        daten.quittung = { zeichen: "AB" };
        daten.vermerke = "Rückfrage";

        expect(daten.textfelder()).toEqual({
            aufnahmevermerkDatum: "03.10.",
            aufnahmevermerkUhrzeit: "1415",
            aufnahmevermerkHdz: "JR",
            annahmevermerkUhrzeit: "1416",
            befoerderungsvermerkHdz: "MK",
            quittungZeichen: "AB",
            vermerke: "Rückfrage"
        });
        expect(new VordruckDaten().textfelder()).toEqual({});
    });
});
