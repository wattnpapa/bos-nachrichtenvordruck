import { describe, expect, it } from "vitest";
import { istKritisch, pruefeTextlaenge } from "../../web/src/textlaenge.js";

describe("Textlänge", () => {
    it("warnt, sobald der Nachrichtenvordruck verkleinern muss: der Text läuft dann über die Linien", () => {
        const laenge = pruefeTextlaenge("Lage unverändert, keine weiteren Kräfte nötig. ".repeat(15), "nachricht");
        expect(laenge?.stufe).toBe("ueber-linien");
        expect(istKritisch(laenge)).toBe(true);
    });

    it("bleibt beim Meldevordruck bei leichter Verkleinerung ein Hinweis", () => {
        const laenge = pruefeTextlaenge("Lage unverändert, keine weiteren Kräfte nötig. ".repeat(40), "meldung");
        expect(laenge?.stufe).toBe("verkleinert");
        expect(istKritisch(laenge)).toBe(false);
    });

    it("bewertet bei „beide“ den Nachrichtenvordruck mit, auch wenn der Meldevordruck kleiner wird", () => {
        expect(pruefeTextlaenge("Kurz.", "beide")).toBeNull();
        expect(pruefeTextlaenge("Lage unverändert, keine weiteren Kräfte nötig. ".repeat(15), "beide")?.stufe).toBe("ueber-linien");
    });
});
