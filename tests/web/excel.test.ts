import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { erzeugeVorlage, leseExcel, zellText } from "../../web/src/excel.js";
import { SPALTEN, leseTabelle } from "../../web/src/spalten.js";

describe("Excel", () => {
    it("liest die eigene Vorlage nach dem Ausfüllen wieder ein", async () => {
        const vorlage = await erzeugeVorlage();
        const mappe = new ExcelJS.Workbook();
        await mappe.xlsx.load(await vorlage.arrayBuffer());

        const blatt = mappe.getWorksheet("Vordrucke");
        if (!blatt) {
            throw new Error("Blatt „Vordrucke“ fehlt");
        }
        expect(blatt.getRow(1).values).toEqual([undefined, ...SPALTEN.map(spalte => spalte.titel)]);
        expect(blatt.getCell("B2").dataValidation?.formulae).toEqual(['"Spruch,Durchsage"']);
        expect(blatt.getCell("A2").numFmt).toBe("@");

        blatt.getCell("A2").value = "17";
        blatt.getCell("B2").value = "Spruch";
        blatt.getCell("G2").value = "Heros Jever 21/10";
        blatt.getCell("I2").value = { richText: [{ text: "Erkundung " }, { text: "abgeschlossen." }] };
        blatt.getCell("I4").value = "Zweiter";
        const puffer = await mappe.xlsx.writeBuffer();

        const { zeilen } = leseTabelle(await leseExcel(puffer as ArrayBuffer));
        expect(zeilen.map(zeile => [zeile.zeile, zeile.daten.nummer, zeile.daten.art, zeile.daten.inhalt])).toEqual([
            [2, "17", "spruch", "Erkundung abgeschlossen."],
            [4, "", undefined, "Zweiter"]
        ]);
        expect(zeilen[0]?.daten.empfaenger).toEqual(["Heros Jever 21/10"]);
    });

    it("nimmt ohne Blatt „Vordrucke“ das erste mit bekannten Spalten", async () => {
        const mappe = new ExcelJS.Workbook();
        mappe.addWorksheet("Notizen").addRow(["irgendwas"]);
        const daten = mappe.addWorksheet("Daten");
        daten.addRow(["Inhalt", "Absender"]);
        daten.addRow(["Hallo", "Heros 1"]);
        const tabelle = await leseExcel(await mappe.xlsx.writeBuffer() as ArrayBuffer);
        expect(tabelle).toEqual([["Inhalt", "Absender"], ["Hallo", "Heros 1"]]);
    });

    it("meldet eine Mappe ohne bekannte Spalten", async () => {
        const mappe = new ExcelJS.Workbook();
        mappe.addWorksheet("A").addRow(["Farbe"]);
        await expect(leseExcel(await mappe.xlsx.writeBuffer() as ArrayBuffer)).rejects.toThrow(/kein Blatt/);
    });

    it("zeigt Zellwerte so, wie sie in der Zelle stehen", () => {
        expect(zellText(null)).toBe("");
        expect(zellText(42)).toBe("42");
        expect(zellText(true)).toBe("ja");
        expect(zellText(new Date(Date.UTC(1899, 11, 30, 14, 15)))).toBe("14:15");
        expect(zellText(new Date(Date.UTC(2026, 9, 3)))).toBe("03.10.2026");
        expect(zellText(new Date(Date.UTC(2026, 9, 3, 9, 5)))).toBe("03.10.2026 09:05");
        expect(zellText({ formula: "1+1", result: 2 } as ExcelJS.CellFormulaValue)).toBe("2");
        expect(zellText({ text: "Link", hyperlink: "https://example.org" })).toBe("Link");
    });
});
