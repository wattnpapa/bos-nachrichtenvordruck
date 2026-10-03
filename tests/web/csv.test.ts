import { describe, expect, it } from "vitest";
import { erkenneTrenner, leseCsv, schreibeCsv } from "../../web/src/csv.js";

describe("CSV", () => {
    it("liest Anführungszeichen, Zeilenumbrüche im Feld und BOM", () => {
        const text = "﻿Nr;Inhalt\r\n1;\"Zeile 1\nZeile 2; mit \"\"Zitat\"\"\"\r\n2;kurz";
        expect(leseCsv(text)).toEqual([
            ["Nr", "Inhalt"],
            ["1", "Zeile 1\nZeile 2; mit \"Zitat\""],
            ["2", "kurz"]
        ]);
    });

    it("erkennt Komma und Tabulator", () => {
        expect(erkenneTrenner("Nr,Inhalt,Absender\n1,2,3")).toBe(",");
        expect(erkenneTrenner("Nr\tInhalt\n1\t2")).toBe("\t");
        expect(erkenneTrenner("Nr;Inhalt")).toBe(";");
    });

    it("schreibt, was es wieder liest", () => {
        const zeilen = [["Nr", "Inhalt"], ["1", "a;b\n\"c\""]];
        expect(leseCsv(schreibeCsv(zeilen))).toEqual(zeilen);
    });
});
