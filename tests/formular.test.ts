import { describe, expect, it } from "vitest";
import {
    MELDEVORDRUCK_FORMULAR,
    NACHRICHTENVORDRUCK_ANKREUZFELDER,
    NACHRICHTENVORDRUCK_FORMULAR,
    VORDRUCK_BREITE,
    VORDRUCK_HOEHE,
    zeichneFormular,
    type FormularElement
} from "../src/index.js";
import { protokollPdf } from "./hilfen.js";

type Rahmen = Extract<FormularElement, { art: "rahmen" }>;

describe("Formulargeometrie", () => {
    it("bleibt innerhalb des Vordrucks", () => {
        for (const element of [...NACHRICHTENVORDRUCK_FORMULAR, ...MELDEVORDRUCK_FORMULAR]) {
            const xs = element.art === "linie" ? [element.x1, element.x2] : [element.x];
            const ys = element.art === "linie" ? [element.y1, element.y2] : [element.y];
            if (element.art === "flaeche" || element.art === "rahmen") {
                xs.push(element.x + element.b);
                ys.push(element.y + element.h);
            }
            for (const x of xs) {
                expect(x).toBeGreaterThanOrEqual(0);
                expect(x).toBeLessThanOrEqual(VORDRUCK_BREITE);
            }
            for (const y of ys) {
                expect(y).toBeGreaterThanOrEqual(0);
                expect(y).toBeLessThanOrEqual(VORDRUCK_HOEHE);
            }
        }
    });

    // Die Ankreuzfelder wurden am Formularbild vermessen, das Formular stammt
    // aus der InDesign-Vorlage. Liegt der Anker eines „x" nicht mehr auf
    // seinem Kästchen (linke Kante, Grundlinie höchstens an der Unterkante),
    // ist eines von beiden verrutscht.
    it("hat unter jedem Ankreuzfeld ein Kästchen", () => {
        const kaestchen = NACHRICHTENVORDRUCK_FORMULAR
            .filter((e): e is Rahmen => e.art === "rahmen" && e.b < 5 && e.h < 5);

        for (const [name, feld] of Object.entries(NACHRICHTENVORDRUCK_ANKREUZFELDER)) {
            const treffer = kaestchen.find(k =>
                feld.x >= k.x - 0.3 && feld.x <= k.x + k.b
                && feld.y >= k.y && feld.y <= k.y + k.h + 0.35);
            expect(treffer, name).toBeDefined();
        }
    });
});

describe("zeichneFormular", () => {
    it("setzt die Beschriftung an die Grundlinie der Vorlage", () => {
        const { pdf, texte } = protokollPdf();

        zeichneFormular(pdf, NACHRICHTENVORDRUCK_FORMULAR, { offsetX: 10 });

        const beschriftungen = NACHRICHTENVORDRUCK_FORMULAR.filter(e => e.art === "text");
        expect(texte).toHaveLength(beschriftungen.length);
        expect(texte[0]).toEqual({ text: "Funk", x: 10 + 19.39, y: 8.82 });
    });

    it("hinterlässt jsPDF im Grundzustand", () => {
        const { pdf } = protokollPdf();

        zeichneFormular(pdf, MELDEVORDRUCK_FORMULAR, { farbe: "#ff0000" });

        expect(pdf.getFont().fontName).toBe("helvetica");
        expect(pdf.getFont().fontStyle).toBe("normal");
        expect(pdf.getTextColor()).toBe("#000000");
        expect(pdf.getDrawColor()).toBe("#000000");
        expect(pdf.getLineWidth()).toBeCloseTo(0.200025);
    });

    it("lässt Flächen zum Überlagern weg", () => {
        const mit = protokollPdf().pdf;
        const ohne = protokollPdf().pdf;

        zeichneFormular(mit, NACHRICHTENVORDRUCK_FORMULAR);
        zeichneFormular(ohne, NACHRICHTENVORDRUCK_FORMULAR, { flaechen: false });

        expect(mit.output()).toMatch(/ re\nf\n/);
        expect(ohne.output()).not.toMatch(/ re\nf\n/);
    });
});
