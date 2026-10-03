import { describe, expect, it } from "vitest";
// @ts-expect-error – JavaScript-Modul ohne Typdeklaration
import { erzeugeQuelle } from "../scripts/bilder-einbetten.mjs";
import { readFile } from "node:fs/promises";
import { MELDEVORDRUCK_HINTERGRUND, NACHRICHTENVORDRUCK_HINTERGRUND } from "../src/index.js";

describe("eingebettete Formularbilder", () => {
    it("passen zu den PNGs in assets/", async () => {
        const eingecheckt = await readFile(new URL("../src/hintergrund.ts", import.meta.url), "utf8");

        // Schlägt fehl, wenn ein PNG geändert wurde, ohne `npm run bilder` laufen zu lassen.
        expect(eingecheckt).toBe(await erzeugeQuelle());
    });

    it("sind PNG-Data-URLs", () => {
        for (const bild of [NACHRICHTENVORDRUCK_HINTERGRUND, MELDEVORDRUCK_HINTERGRUND]) {
            expect(bild.startsWith("data:image/png;base64,iVBORw0KGgo")).toBe(true);
        }
    });
});
