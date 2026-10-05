import { describe, expect, it } from "vitest";
import { meldevordruckGekuerzt, zeichneMeldevordruck } from "../src/MeldevordruckRenderer.js";
import { nachrichtenvordruckGekuerzt, zeichneNachrichtenvordruck } from "../src/NachrichtenvordruckRenderer.js";
import { VordruckDaten } from "../src/VordruckDaten.js";
import { protokollPdf } from "./hilfen.js";

const OHNE = { ohneHintergrund: true, ohneRahmen: true };

function daten(werte: Partial<Pick<VordruckDaten, "betreff" | "pruefvermerk" | "blatt">>): VordruckDaten {
    return Object.assign(new VordruckDaten(), { inhalt: "Text" }, werte);
}

describe("Betreff in der Zeile „Inhalt“", () => {
    it("steht im Nachrichtenvordruck rechts neben „Inhalt“", () => {
        const { pdf, texte } = protokollPdf();
        zeichneNachrichtenvordruck(pdf, daten({ betreff: "Lage B 211" }), OHNE);
        expect(texte).toContainEqual({ text: "Lage B 211", x: 41, y: 70.2 });
    });

    it("steht im Meldevordruck hinter „Inhalt:“", () => {
        const { pdf, texte } = protokollPdf();
        zeichneMeldevordruck(pdf, daten({ betreff: "Lage B 211" }), OHNE);
        expect(texte).toContainEqual({ text: "Lage B 211", x: 31, y: 49.5 });
    });

    it("lässt Prüfvermerk und Blatt-Kennzeichen daneben stehen, ohne Überlappung", () => {
        for (const [zeichne, x] of [[zeichneNachrichtenvordruck, 41], [zeichneMeldevordruck, 31]] as const) {
            const { pdf, texte } = protokollPdf();
            zeichne(pdf, daten({ betreff: "Lage B 211", pruefvermerk: "Prüfen: Text gekürzt", blatt: "Blatt 1 von 2" }), OHNE);
            const betreff = texte.find(t => t.text === "Lage B 211");
            const vermerk = texte.find(t => t.text === "Prüfen: Text gekürzt");
            const blatt = texte.find(t => t.text === "Blatt 1 von 2");
            expect(betreff?.x).toBe(x);
            expect(vermerk!.x).toBeGreaterThan(x + pdf.getTextWidth("Lage B 211"));
            expect(vermerk!.x).toBeLessThan(blatt!.x);
        }
    });

    it("meldet einen zu langen Betreff als gekürzt", () => {
        const { pdf } = protokollPdf();
        const lang = daten({ betreff: "Sehr langer Betreff ".repeat(20) });
        expect(nachrichtenvordruckGekuerzt(pdf, lang)).toContain("betreff");
        expect(meldevordruckGekuerzt(pdf, lang)).toContain("betreff");
    });
});
