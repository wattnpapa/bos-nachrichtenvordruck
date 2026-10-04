import { describe, expect, it } from "vitest";
import { VordruckDaten, zeichneMeldevordruck } from "../src/index.js";
import { protokollPdf } from "./hilfen.js";

describe("Meldevordruck: Formular und Rahmen", () => {
    it("zeichnet Formular und Rahmen, ohne Bild", () => {
        const { pdf, texte, bilder } = protokollPdf();
        const daten = new VordruckDaten();
        daten.absender = "Heros Oldenburg 16/11";
        daten.titel = "Testübung";

        zeichneMeldevordruck(pdf, daten, { offsetX: 148 });

        expect(bilder).toHaveLength(0);
        expect(texte).toContainEqual({ text: "Meldung / Auftrag", x: 148 + 31.14, y: 12.62 });
        expect(texte.map(t => t.text)).toEqual(expect.arrayContaining(["Heros Oldenburg 16/11", "Testübung"]));
    });

    it("verkleinert einen langen Absender auf die Feldbreite", () => {
        const { pdf, texte } = protokollPdf();
        const daten = new VordruckDaten();
        daten.absender = "Heros Musterstadt-Langer-Ortsname Fachgruppe Führung/Kommunikation 16/11";

        zeichneMeldevordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        const absender = texte.find(t => t.text === daten.absender);
        expect(absender).toBeDefined();
    });
});
