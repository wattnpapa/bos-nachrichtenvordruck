// CSV lesen und schreiben, wie Excel und LibreOffice es in Deutschland tun:
// Semikolon als Trenner, Anführungszeichen um Felder mit Trenner oder
// Zeilenumbruch, verdoppelte Anführungszeichen im Feld.

/** Trenner aus der Kopfzeile erraten: Semikolon, Tabulator oder Komma. */
export function erkenneTrenner(text: string): string {
    const kopf = text.split(/\r?\n/, 1)[0] ?? "";
    const kandidaten = [";", "\t", ","];
    let bester = ";";
    let anzahl = 0;
    for (const trenner of kandidaten) {
        const treffer = kopf.split(trenner).length - 1;
        if (treffer > anzahl) {
            bester = trenner;
            anzahl = treffer;
        }
    }
    return bester;
}

export function leseCsv(text: string, trenner = erkenneTrenner(text)): string[][] {
    const quelle = text.replace(/^﻿/, "");
    const zeilen: string[][] = [];
    let zeile: string[] = [];
    let feld = "";
    let inAnfuehrung = false;

    for (let i = 0; i < quelle.length; i++) {
        const zeichen = quelle[i];
        if (inAnfuehrung) {
            if (zeichen === "\"") {
                if (quelle[i + 1] === "\"") {
                    feld += "\"";
                    i++;
                } else {
                    inAnfuehrung = false;
                }
            } else {
                feld += zeichen;
            }
            continue;
        }
        if (zeichen === "\"") {
            inAnfuehrung = true;
        } else if (zeichen === trenner) {
            zeile.push(feld);
            feld = "";
        } else if (zeichen === "\n" || zeichen === "\r") {
            if (zeichen === "\r" && quelle[i + 1] === "\n") {
                i++;
            }
            zeile.push(feld);
            zeilen.push(zeile);
            zeile = [];
            feld = "";
        } else {
            feld += zeichen;
        }
    }
    if (feld !== "" || zeile.length > 0) {
        zeile.push(feld);
        zeilen.push(zeile);
    }
    return zeilen;
}

export function schreibeCsv(zeilen: string[][], trenner = ";"): string {
    const feld = (wert: string) =>
        /[";\n\r,\t]/.test(wert) ? `"${wert.replace(/"/g, "\"\"")}"` : wert;
    // BOM, damit Excel die Datei als UTF-8 öffnet und Umlaute stimmen.
    return "﻿" + zeilen.map(zeile => zeile.map(feld).join(trenner)).join("\r\n") + "\r\n";
}
