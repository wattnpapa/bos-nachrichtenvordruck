import { describe, expect, it } from "vitest";
import { VordruckDaten } from "../../src/index.js";
import { dateiname, erzeugePdf } from "../../web/src/pdf.js";

const drei = [new VordruckDaten(), new VordruckDaten(), new VordruckDaten()];

describe("erzeugePdf", () => {
    it("stellt auf A4 quer zwei Vordrucke nebeneinander", () => {
        const pdf = erzeugePdf(drei, { vordruck: "nachricht", blatt: "a4", ohneHintergrund: true });
        expect(pdf.getNumberOfPages()).toBe(2);
        expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    });

    it("setzt mit „beide“ Nachricht und Meldung derselben Zeile auf ein Blatt", () => {
        const pdf = erzeugePdf(drei, { vordruck: "beide", blatt: "a4", ohneHintergrund: true });
        expect(pdf.getNumberOfPages()).toBe(3);
    });

    it("gibt auf A5 jedem Vordruck ein Blatt", () => {
        const pdf = erzeugePdf(drei, { vordruck: "beide", blatt: "a5", ohneHintergrund: true });
        expect(pdf.getNumberOfPages()).toBe(6);
        expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(148, 0);
    });

    it("benennt die Datei nach dem Vordruck", () => {
        expect(dateiname({ vordruck: "meldung", blatt: "a4", ohneHintergrund: false }, 1)).toBe("meldevordruck.pdf");
        expect(dateiname({ vordruck: "nachricht", blatt: "a4", ohneHintergrund: false }, 4)).toBe("nachrichtenvordrucke.pdf");
        expect(dateiname({ vordruck: "beide", blatt: "a4", ohneHintergrund: false }, 4)).toBe("vordrucke.pdf");
    });
});

describe("A4 hoch", () => {
    it("gibt jedem Vordruck ein A4-Blatt im Hochformat", () => {
        const pdf = erzeugePdf(drei, { vordruck: "beide", blatt: "a4hoch", ohneHintergrund: true });
        expect(pdf.getNumberOfPages()).toBe(6);
        expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
        expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    });

    it("verschiebt den Vordruck um 31 mm nach rechts und 43,5 mm nach unten", () => {
        const pdf = erzeugePdf([new VordruckDaten()], { vordruck: "nachricht", blatt: "a4hoch", ohneHintergrund: true }, { komprimiert: false });
        const inhalt = pdf.output();
        // 31 mm = 87,87 pt, 43,5 mm = 123,31 pt
        expect(inhalt).toMatch(/^1\. 0\. 0\. 1\. 87\.87\d* -123\.30\d* cm$/m);
    });
});

describe("Herkunftszeile", () => {
    it("steht auf Nachrichten- und Meldevordruck", () => {
        const pdf = erzeugePdf([new VordruckDaten()], { vordruck: "beide", blatt: "a5", ohneHintergrund: false }, { komprimiert: false });
        const inhalt = pdf.output();
        expect(inhalt.match(/Erstellt mit nachrichtenvordruck\.app/g)).toHaveLength(2);
    });

    it("fehlt beim Druck auf vorgedruckte Bögen", () => {
        const pdf = erzeugePdf([new VordruckDaten()], { vordruck: "beide", blatt: "a5", ohneHintergrund: true }, { komprimiert: false });
        expect(pdf.output()).not.toMatch(/Erstellt mit/);
    });
});

describe("Druckversatz", () => {
    it("verschiebt ohne Formularbild um den eingestellten Versatz", () => {
        const pdf = erzeugePdf([new VordruckDaten()], { vordruck: "nachricht", blatt: "a5", ohneHintergrund: true, versatzX: 2, versatzY: -1.5 }, { komprimiert: false });
        // 2 mm = 5,67 pt nach rechts, 1,5 mm = 4,25 pt nach oben
        expect(pdf.output()).toMatch(/^1\. 0\. 0\. 1\. 5\.66\d* 4\.25\d* cm$/m);
    });

    it("lässt den Versatz mit Formularbild weg", () => {
        const pdf = erzeugePdf([new VordruckDaten()], { vordruck: "nachricht", blatt: "a5", ohneHintergrund: false, versatzX: 2 }, { komprimiert: false });
        expect(pdf.output()).not.toMatch(/^1\. 0\. 0\. 1\. 5\.66/m);
    });
});

describe("dateiname mit Nummer und Zeit", () => {
    it("macht Downloads unterscheidbar", () => {
        const zeit = new Date(2026, 9, 4, 14, 6);
        expect(dateiname({ vordruck: "nachricht", blatt: "a4", ohneHintergrund: false }, 1, zeit, "17"))
            .toBe("nachrichtenvordruck_nr17_2026-10-04_1406.pdf");
        expect(dateiname({ vordruck: "nachricht", blatt: "a4", ohneHintergrund: false }, 3, zeit))
            .toBe("nachrichtenvordrucke_2026-10-04_1406.pdf");
        expect(dateiname({ vordruck: "nachricht", blatt: "a4", ohneHintergrund: false }, 1, new Date(2026, 9, 4, 14, 6, 9)))
            .toBe("nachrichtenvordruck_2026-10-04_140609.pdf");
        expect(dateiname({ vordruck: "meldung", blatt: "a4", ohneHintergrund: false }, 1, zeit, "17/a b"))
            .toBe("meldevordruck_nr17ab_2026-10-04_1406.pdf");
    });
});

describe("Dateigröße", () => {
    it("bleibt mit Formularbild klein", () => {
        const pdf = erzeugePdf([new VordruckDaten()], { vordruck: "beide", blatt: "a4", ohneHintergrund: false });
        expect(pdf.output("arraybuffer").byteLength).toBeLessThan(100_000);
    });
});
