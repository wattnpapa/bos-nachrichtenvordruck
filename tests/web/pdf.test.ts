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
