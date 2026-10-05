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

describe("Prüfvermerk und Bögen", () => {
    it("nennt verworfene und gekürzte Felder beim Namen", async () => {
        const { pruefvermerk } = await import("../../web/src/textlaenge.js");
        const { zuVordruckDaten } = await import("../../web/src/spalten.js");
        const { daten, fehler } = zuVordruckDaten({ vorrang: "Eilig", inhalt: "Kurz.", absender: "A".repeat(120) });
        expect(pruefvermerk(daten, "nachricht", fehler, false)).toBe("Prüfen: Absender gekürzt; Vorrang verworfen");
    });

    it("gibt bei „beide“ jedem Vordruck seine eigene Bogenzahl und seinen eigenen Vermerk", async () => {
        const { bogenListe } = await import("../../web/src/textlaenge.js");
        const { zuVordruckDaten } = await import("../../web/src/spalten.js");
        const { daten, fehler } = zuVordruckDaten({ inhalt: satz.repeat(20) });
        const boegen = bogenListe(daten, "beide", fehler, true);
        const nachricht = boegen.filter(bogen => bogen.nur === "nachricht");
        const meldung = boegen.filter(bogen => bogen.nur === "meldung");
        expect(nachricht.length).toBeGreaterThan(meldung.length);
        expect(meldung.every(bogen => !bogen.pruefvermerk)).toBe(true);
        expect(boegen[0]?.nur).toBe("nachricht");
        expect(boegen[1]?.nur).toBe("meldung");
        expect(nachricht.map(bogen => bogen.blatt).at(-1)).toBe(`Blatt ${nachricht.length} von ${nachricht.length}`);
    });
});

describe("Betreff in der Zeile „Inhalt“", () => {
    it("meldet einen Betreff, der erst neben Vermerk und Blattangabe gekürzt wird", async () => {
        const { bogenListe, gekuerzteFelder, gekuerzteFelderAufBoegen } = await import("../../web/src/textlaenge.js");
        const { zuVordruckDaten } = await import("../../web/src/spalten.js");
        const { daten, fehler } = zuVordruckDaten({ betreff: "Sandsacknachschub Deich Nord, Sielhafen, Lage am Abschnitt B, Verpflegung Helfer", inhalt: satz.repeat(20) });
        expect(gekuerzteFelder(daten, "nachricht")).not.toContain("Betreff");
        const boegen = bogenListe(daten, "nachricht", fehler, true);
        expect(boegen[0]?.pruefvermerk).toContain("Betreff gekürzt");
        expect(gekuerzteFelderAufBoegen(boegen, "nachricht")).toContain("Betreff");
    });

    it("nennt im Meldevordruck keine Felder, die er nicht hat", async () => {
        const { pruefvermerk } = await import("../../web/src/textlaenge.js");
        const { zuVordruckDaten } = await import("../../web/src/spalten.js");
        const { daten, fehler } = zuVordruckDaten({ vorrang: "Eilig", weg: "Fnuk", inhalt: "Kurz." });
        expect(pruefvermerk(daten, "meldung", fehler, false)).toBe("Prüfen: Übermittlungsweg verworfen");
    });
});
