import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { trenneLangeWoerter, umbrechen } from "../src/pdfText.js";

describe("Lange Wörter", () => {
    const pdf = new jsPDF("p", "mm", "a5");
    pdf.setFontSize(10);

    it("teilt ein Wort von 3000 Zeichen zügig in Stücke, die in die Zeile passen", () => {
        const start = performance.now();
        const zeilen = trenneLangeWoerter(pdf, "x".repeat(3000), 80).split(" ");
        expect(performance.now() - start).toBeLessThan(1500);
        expect(zeilen.length).toBeGreaterThan(10);
        expect(zeilen.every(stueck => pdf.getTextWidth(stueck) <= 80)).toBe(true);
        expect(zeilen.slice(0, -1).every(stueck => stueck.endsWith("-"))).toBe(true);
        expect(zeilen.join("").replace(/-/g, "")).toBe("x".repeat(3000));
    });

    it("bricht an eigenen Bruchstellen ohne Strich", () => {
        const adresse = `${"abcdefghij/".repeat(20)}ende`;
        const stuecke = trenneLangeWoerter(pdf, adresse, 60).split(" ");
        expect(stuecke.every(stueck => !stueck.endsWith("-"))).toBe(true);
        expect(stuecke.join("")).toBe(adresse);
        expect(umbrechen(pdf, adresse, 60, 10).length).toBeGreaterThan(1);
    });
});
