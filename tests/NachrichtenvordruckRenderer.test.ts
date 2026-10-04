import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    NACHRICHTENVORDRUCK_ANKREUZFELDER,
    NACHRICHTENVORDRUCK_TEXTFELDER,
    VordruckDaten,
    zeichneNachrichtenvordruck
} from "../src/index.js";
import { protokollPdf } from "./hilfen.js";

function volleDaten(): VordruckDaten {
    const daten = new VordruckDaten();
    daten.nummer = "X+12";
    daten.art = "spruch";
    daten.vorrang = "sofort";
    daten.empfaenger = ["Heros Jever 21/10", "Heros Wilhelmshaven 21/10"];
    daten.anschriften = ["Technische Einsatzleitung"];
    daten.inhalt = "Erkundung abgeschlossen.\\nZufahrt ist frei.";
    daten.absender = "Heros Oldenburg 16/11";
    daten.abfassungszeit = "031415okt26";
    daten.zeichen = "JR";
    daten.funktion = "S 2";
    daten.quittung = { uhrzeit: "1420", zeichen: "MK", stelle: "TEL" };
    daten.titel = "Testübung";
    daten.hinweis = "Nur für Übungszwecke";
    daten.fusszeile = "bos-nachrichtenvordruck";
    return daten;
}

describe("zeichneNachrichtenvordruck", () => {
    it("zeichnet das Formular selbst, ohne Bild", () => {
        const { pdf, texte, bilder } = protokollPdf();

        zeichneNachrichtenvordruck(pdf, volleDaten(), { offsetX: 148 });

        expect(bilder).toHaveLength(0);
        expect(texte).toContainEqual({ text: "Aufnahmevermerk", x: 148 + 19.69, y: 16.87 });
    });

    it("legt ein eigenes Formularbild statt des gezeichneten Formulars", () => {
        const { pdf, texte, bilder } = protokollPdf();
        const eigenes = new Uint8Array(readFileSync(new URL("../assets/nachrichtenvordruck4fach.png", import.meta.url)));

        zeichneNachrichtenvordruck(pdf, volleDaten(), { hintergrund: eigenes });

        expect(bilder).toHaveLength(1);
        expect(bilder[0]?.daten).toBe(eigenes);
        expect(texte.map(t => t.text)).not.toContain("Aufnahmevermerk");
    });

    it("lässt Formular und Rahmen auf Wunsch weg", () => {
        const { pdf, texte, bilder } = protokollPdf();

        zeichneNachrichtenvordruck(pdf, volleDaten(), { ohneHintergrund: true, ohneRahmen: true });

        expect(bilder).toHaveLength(0);
        expect(texte.map(t => t.text)).not.toContain("Testübung");
        expect(texte.map(t => t.text)).not.toContain("Aufnahmevermerk");
    });

    it("färbt das Formular, nicht aber die Eintragungen", () => {
        const { pdf } = protokollPdf();

        zeichneNachrichtenvordruck(pdf, volleDaten(), { formularfarbe: "#ff0000", ohneRahmen: true });

        expect(pdf.getTextColor()).toBe("#000000");
        expect(pdf.getDrawColor()).toBe("#000000");
        const seite = pdf.output();
        expect(seite).toContain("1. 0. 0. RG");
        expect(seite).toContain("1. 0. 0. rg");
    });

    it("kreuzt jedes Feld aus den Daten an der vermessenen Stelle an", () => {
        const { pdf, texte } = protokollPdf();
        const daten = volleDaten();

        zeichneNachrichtenvordruck(pdf, daten, { ohneHintergrund: true });

        const kreuze = texte.filter(t => t.text === "x");
        expect(kreuze).toHaveLength(daten.ankreuzfelder().length);
        for (const feld of daten.ankreuzfelder()) {
            const position = NACHRICHTENVORDRUCK_ANKREUZFELDER[feld];
            expect(kreuze).toContainEqual({ text: "x", x: position.x, y: position.y });
        }
    });

    it("schreibt die Textfelder an ihre Anker", () => {
        const { pdf, texte } = protokollPdf();

        zeichneNachrichtenvordruck(pdf, volleDaten(), { ohneHintergrund: true });

        const feld = NACHRICHTENVORDRUCK_TEXTFELDER.abfassungszeit;
        expect(texte).toContainEqual({ text: "031415okt26", x: feld.x, y: feld.y });
        expect(texte.map(t => t.text)).toEqual(expect.arrayContaining(["TEL", "MK", "1420", "S 2", "JR"]));
    });

    it("versetzt alles um offsetX, für zwei Vordrucke auf einem Querformat", () => {
        const ohne = protokollPdf();
        const mit = protokollPdf();

        zeichneNachrichtenvordruck(ohne.pdf, volleDaten());
        zeichneNachrichtenvordruck(mit.pdf, volleDaten(), { offsetX: 148 });

        expect(mit.texte).toHaveLength(ohne.texte.length);
        mit.texte.forEach((aufruf, i) => {
            expect(aufruf.x).toBeCloseTo((ohne.texte[i]?.x ?? 0) + 148, 5);
        });
    });

    it("übernimmt Zeilenumbrüche im Inhalt, auch als Text geschriebene", () => {
        const { pdf, texte } = protokollPdf();

        zeichneNachrichtenvordruck(pdf, volleDaten(), { ohneHintergrund: true });

        const erste = texte.find(t => t.text === "Erkundung abgeschlossen.");
        const zweite = texte.find(t => t.text === "Zufahrt ist frei.");
        expect(erste?.y).toBe(77);
        expect(zweite?.y).toBeCloseTo(83.3, 5);
    });

    it("verkleinert langen Inhalt, statt in den Fußblock zu laufen", () => {
        const { pdf, texte } = protokollPdf();
        const daten = volleDaten();
        daten.inhalt = Array.from({ length: 40 }, (_, i) => `Zeile ${i + 1} eines langen Fernschreibens.`).join("\n");

        zeichneNachrichtenvordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        const inhalt = texte.filter(t => t.text.includes("langen Fernschreibens"));
        expect(inhalt.length).toBeGreaterThan(0);
        inhalt.forEach(zeile => expect(zeile.y).toBeLessThanOrEqual(148));
    });

    it("lässt leere Felder aus", () => {
        const { pdf, texte } = protokollPdf();

        zeichneNachrichtenvordruck(pdf, new VordruckDaten(), { ohneHintergrund: true, ohneRahmen: true });

        expect(texte.filter(t => t.text.trim() !== "" && t.text !== "x")).toHaveLength(0);
    });
});
