import { describe, expect, it } from "vitest";
import { istKritisch, pruefeTextlaenge, textlaengeMeldung } from "../../web/src/textlaenge.js";

const satz = "Lage unverändert, keine weiteren Kräfte nötig. ";

describe("Textlänge", () => {
    it("meldet nichts, solange reichlich Platz ist", () => {
        expect(pruefeTextlaenge("Kurz.", "beide")).toBeNull();
    });

    it("warnt, wenn der Text auf dem Nachrichtenvordruck abgeschnitten wird", () => {
        const laenge = pruefeTextlaenge(satz.repeat(20), "nachricht");
        expect(laenge?.stufe).toBe("abgeschnitten");
        expect(laenge?.maxZeilen).toBe(12);
        expect(istKritisch(laenge)).toBe(true);
        expect(textlaengeMeldung(laenge!)).toMatch(/nur die ersten 12 mit „…“.*auf 2 Vordrucke verteilen/);
    });

    it("sagt Bescheid, wenn es knapp wird, ohne nachzufragen", () => {
        const knapp = Array.from({ length: 11 }, (_, i) => `Zeile ${i + 1}`).join("\n");
        const laenge = pruefeTextlaenge(knapp, "nachricht");
        expect(laenge?.stufe).toBe("knapp");
        expect(istKritisch(laenge)).toBe(false);
    });

    it("nimmt bei „beide“ den engeren Vordruck", () => {
        expect(pruefeTextlaenge(satz.repeat(20), "beide")?.vordruck).toBe("Nachrichtenvordruck");
        expect(pruefeTextlaenge(satz.repeat(20), "meldung")).toBeNull();
    });
});
