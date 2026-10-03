import "@fontsource-variable/archivo";
import "./stil.css";
import { schreibeCsv, leseCsv } from "./csv.js";
import { dateiname, erzeugePdf, type Blattformat, type PdfOptionen, type VordruckWahl } from "./pdf.js";
import {
    SPALTEN,
    datumZeitGruppe,
    leseTabelle,
    zuVordruckDaten,
    type Eingabe,
    type Schluessel,
    type TabellenErgebnis
} from "./spalten.js";

// ---- Hilfen --------------------------------------------------------------

function element<T extends HTMLElement>(id: string): T {
    const gefunden = document.getElementById(id);
    if (!gefunden) {
        throw new Error(`#${id} fehlt im Markup`);
    }
    return gefunden as T;
}

function speicher(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function herunterladen(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Knopf während der Arbeit: bleibt lesbar, sagt in Worten, was läuft. */
async function mitArbeit(knopf: HTMLButtonElement, text: string, arbeit: () => Promise<void>): Promise<void> {
    const vorher = knopf.textContent;
    knopf.disabled = true;
    knopf.classList.add("arbeitet");
    knopf.setAttribute("aria-busy", "true");
    knopf.textContent = text;
    try {
        await arbeit();
    } finally {
        knopf.disabled = false;
        knopf.classList.remove("arbeitet");
        knopf.removeAttribute("aria-busy");
        knopf.textContent = vorher;
    }
}

// ---- Anzeigemodus --------------------------------------------------------

const MODUS_SCHLUESSEL = "bnv.anzeigemodus.v1";
const MODI = ["standard", "dunkel", "feld", "nacht"] as const;
type Modus = (typeof MODI)[number];

function aktuellerModus(): Modus {
    const klassen = document.documentElement.classList;
    return MODI.find(modus => klassen.contains(`${modus}-modus`)) ?? "standard";
}

function setzeModus(modus: Modus): void {
    for (const andere of MODI) {
        document.documentElement.classList.toggle(`${andere}-modus`, andere === modus && modus !== "standard");
    }
    speicher()?.setItem(MODUS_SCHLUESSEL, modus);
    for (const knopf of document.querySelectorAll<HTMLButtonElement>(".anzeige-schalter button")) {
        knopf.setAttribute("aria-pressed", String(knopf.dataset["modus"] === modus));
    }
    const farbe = modus === "nacht" ? "#221f16" : "#12275e";
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", farbe);
}

for (const knopf of document.querySelectorAll<HTMLButtonElement>(".anzeige-schalter button")) {
    knopf.addEventListener("click", () => setzeModus(knopf.dataset["modus"] as Modus));
}
for (const knopf of document.querySelectorAll<HTMLButtonElement>(".anzeige-schalter button")) {
    knopf.setAttribute("aria-pressed", String(knopf.dataset["modus"] === aktuellerModus()));
}

element<HTMLButtonElement>("sprungmarke").addEventListener("click", () => {
    const inhalt = element<HTMLElement>("inhalt");
    inhalt.focus();
    inhalt.scrollIntoView();
});

// ---- Reiter --------------------------------------------------------------

const REITER = [
    { knopf: element<HTMLButtonElement>("reiter-einzeln"), ansicht: element<HTMLElement>("ansicht-einzeln"), name: "einzeln" },
    { knopf: element<HTMLButtonElement>("reiter-tabelle"), ansicht: element<HTMLElement>("ansicht-tabelle"), name: "tabelle" }
];

function zeigeReiter(name: string, fokus = false): void {
    for (const reiter of REITER) {
        const aktiv = reiter.name === name;
        reiter.knopf.setAttribute("aria-selected", String(aktiv));
        reiter.knopf.tabIndex = aktiv ? 0 : -1;
        reiter.ansicht.hidden = !aktiv;
        if (aktiv && fokus) {
            reiter.knopf.focus();
        }
    }
    if (location.hash !== `#${name}`) {
        history.replaceState(null, "", name === "einzeln" ? location.pathname + location.search : `#${name}`);
    }
    if (name === "einzeln") {
        planeVorschau();
    }
}

REITER.forEach((reiter, index) => {
    reiter.knopf.addEventListener("click", () => zeigeReiter(reiter.name));
    reiter.knopf.addEventListener("keydown", ereignis => {
        const schritt = ereignis.key === "ArrowRight" ? 1 : ereignis.key === "ArrowLeft" ? -1 : 0;
        if (schritt) {
            const ziel = REITER[(index + schritt + REITER.length) % REITER.length];
            if (ziel) {
                zeigeReiter(ziel.name, true);
            }
        }
    });
});

// ---- Einstellungen -------------------------------------------------------

const EINSTELLUNGEN_SCHLUESSEL = "bnv.einstellungen.v1";

function optionen(): PdfOptionen {
    const wert = (name: string) =>
        document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? "";
    return {
        vordruck: (wert("vordruck") || "nachricht") as VordruckWahl,
        blatt: (wert("blatt") || "a4") as Blattformat,
        ohneHintergrund: document.querySelector<HTMLInputElement>('input[name="ohneHintergrund"]')?.checked ?? false
    };
}

function felderFuerVordruckZeigen(): void {
    const { vordruck } = optionen();
    for (const bereich of document.querySelectorAll<HTMLElement>("[data-nur]")) {
        const nur = bereich.dataset["nur"];
        bereich.hidden = vordruck !== "beide" && nur !== vordruck;
    }
}

function einstellungenLaden(): void {
    try {
        const gespeichert = JSON.parse(speicher()?.getItem(EINSTELLUNGEN_SCHLUESSEL) ?? "null") as Partial<PdfOptionen> | null;
        if (!gespeichert) {
            return;
        }
        for (const [name, wert] of [["vordruck", gespeichert.vordruck], ["blatt", gespeichert.blatt]] as const) {
            const feld = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${wert}"]`);
            if (feld) {
                feld.checked = true;
            }
        }
        const ohne = document.querySelector<HTMLInputElement>('input[name="ohneHintergrund"]');
        if (ohne) {
            ohne.checked = gespeichert.ohneHintergrund === true;
        }
    } catch {
        // Kaputter Eintrag: Vorgaben aus dem Markup gelten.
    }
}

document.querySelector(".einstellungen")?.addEventListener("change", () => {
    speicher()?.setItem(EINSTELLUNGEN_SCHLUESSEL, JSON.stringify(optionen()));
    felderFuerVordruckZeigen();
    planeVorschau();
    tabelleAnzeigen();
});

// ---- Einzeln: Maske ------------------------------------------------------

const maske = element<HTMLFormElement>("maske");
const ENTWURF_SCHLUESSEL = "bnv.entwurf.v1";

// Verteilerraster: Zeilen S1–S4 und S6, je drei Spalten wie auf dem Bogen.
const raster = element<HTMLTableSectionElement>("verteiler-raster");
for (const zeile of [1, 2, 3, 4, 6]) {
    const tr = document.createElement("tr");
    const kopf = document.createElement("th");
    kopf.scope = "row";
    kopf.textContent = `S${zeile}`;
    tr.append(kopf);
    for (const spalte of [1, 2, 3]) {
        const td = document.createElement("td");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.name = "verteiler";
        box.value = `S${zeile}/${spalte}`;
        box.setAttribute("aria-label", `S${zeile}, Spalte ${spalte}`);
        label.append(box);
        td.append(label);
        tr.append(td);
    }
    raster.append(tr);
}

function maskeLesen(): Eingabe {
    const formular = new FormData(maske);
    const eingabe: Eingabe = {};
    for (const spalte of SPALTEN) {
        const werte = formular.getAll(spalte.schluessel).map(String);
        eingabe[spalte.schluessel] = werte.join(spalte.schluessel === "verteiler" ? ", " : "");
    }
    return eingabe;
}

function maskeSchreiben(eingabe: Eingabe): void {
    for (const feld of Array.from(maske.elements)) {
        if (!(feld instanceof HTMLInputElement || feld instanceof HTMLSelectElement || feld instanceof HTMLTextAreaElement)) {
            continue;
        }
        const wert = eingabe[feld.name as Schluessel];
        if (wert === undefined) {
            continue;
        }
        if (feld instanceof HTMLInputElement && feld.type === "checkbox") {
            feld.checked = feld.name === "verteiler"
                ? wert.split(",").map(teil => teil.trim()).includes(feld.value)
                : wert === feld.value;
        } else {
            feld.value = wert;
        }
    }
}

const vorgaben = maskeLesen();
try {
    const entwurf = JSON.parse(speicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Eingabe | null;
    if (entwurf) {
        maskeSchreiben(entwurf);
    }
} catch {
    // Kaputter Entwurf: leere Maske.
}

const vorschau = element<HTMLIFrameElement>("einzeln-vorschau");
const einzelnFehler = element<HTMLParagraphElement>("einzeln-fehler");
let vorschauUrl = "";
let vorschauTimer: ReturnType<typeof setTimeout> | undefined;

function einzelPdf() {
    const { daten, fehler } = zuVordruckDaten(maskeLesen());
    einzelnFehler.hidden = fehler.length === 0;
    einzelnFehler.textContent = fehler.join(" · ");
    return erzeugePdf([daten], optionen());
}

// Telefone zeigen eine PDF im iframe meist gar nicht an. Dann bleibt nur der Weg über den neuen Tab.
const eingebettet = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
vorschau.hidden = !eingebettet;
element<HTMLElement>("vorschau-ersatz").hidden = eingebettet;

function vorschauAktualisieren(): void {
    if (element<HTMLElement>("ansicht-einzeln").hidden) {
        return;
    }
    if (!eingebettet) {
        // Fehlermeldungen zu ungültigen Werten trotzdem aktuell halten.
        einzelPdf();
        return;
    }
    const pdf = einzelPdf();
    const alt = vorschauUrl;
    vorschauUrl = URL.createObjectURL(pdf.output("blob"));
    // Seitenbreite einpassen, keine Werkzeugleiste: die Vorschau ist ein Blick, kein Betrachter.
    vorschau.src = `${vorschauUrl}#toolbar=0&view=Fit`;
    if (alt) {
        setTimeout(() => URL.revokeObjectURL(alt), 1_000);
    }
}

function planeVorschau(): void {
    clearTimeout(vorschauTimer);
    vorschauTimer = setTimeout(vorschauAktualisieren, 350);
}

maske.addEventListener("input", () => {
    speicher()?.setItem(ENTWURF_SCHLUESSEL, JSON.stringify(maskeLesen()));
    planeVorschau();
});
maske.addEventListener("change", () => {
    speicher()?.setItem(ENTWURF_SCHLUESSEL, JSON.stringify(maskeLesen()));
    planeVorschau();
});

element<HTMLButtonElement>("jetzt").addEventListener("click", () => {
    const feld = maske.elements.namedItem("abfassungszeit") as HTMLInputElement;
    feld.value = datumZeitGruppe(new Date());
    feld.dispatchEvent(new Event("input", { bubbles: true }));
});

element<HTMLButtonElement>("einzeln-pdf").addEventListener("click", () => {
    const pdf = einzelPdf();
    herunterladen(pdf.output("blob"), dateiname(optionen(), 1));
});

element<HTMLButtonElement>("einzeln-oeffnen").addEventListener("click", () => {
    window.open(URL.createObjectURL(einzelPdf().output("blob")), "_blank", "noopener");
});

element<HTMLButtonElement>("einzeln-leeren").addEventListener("click", () => {
    const eingabe = maskeLesen();
    const belegt = SPALTEN.filter(spalte => (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? ""));
    if (belegt.length > 0 && !confirm(`Alle Felder leeren? ${belegt.length} ausgefüllte Angaben gehen verloren.`)) {
        return;
    }
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(vorgaben);
    speicher()?.removeItem(ENTWURF_SCHLUESSEL);
    planeVorschau();
});

// ---- Tabelle -------------------------------------------------------------

let ergebnis: TabellenErgebnis | null = null;
let dateiName = "";

element<HTMLButtonElement>("vorlage-xlsx").addEventListener("click", ereignis => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    void mitArbeit(knopf, "Vorlage wird erstellt…", async () => {
        const { erzeugeVorlage } = await import("./excel.js");
        herunterladen(await erzeugeVorlage(), "nachrichtenvordruck-vorlage.xlsx");
    });
});

element<HTMLButtonElement>("vorlage-csv").addEventListener("click", () => {
    const csv = schreibeCsv([
        SPALTEN.map(spalte => spalte.titel),
        SPALTEN.map(spalte => spalte.beispiel)
    ]);
    herunterladen(new Blob([csv], { type: "text/csv;charset=utf-8" }), "nachrichtenvordruck-vorlage.csv");
});

async function dateiEinlesen(datei: File): Promise<void> {
    const zusammenfassung = element<HTMLParagraphElement>("ergebnis-zusammenfassung");
    element<HTMLElement>("ergebnis").hidden = false;
    zusammenfassung.textContent = `${datei.name} wird gelesen…`;
    dateiName = datei.name;
    try {
        let tabelle: string[][];
        if (/\.xlsx$/i.test(datei.name)) {
            const { leseExcel } = await import("./excel.js");
            tabelle = await leseExcel(await datei.arrayBuffer());
        } else if (/\.xls$/i.test(datei.name)) {
            throw new Error("Das alte Excel-Format .xls wird nicht gelesen. Bitte in Excel als .xlsx oder CSV speichern.");
        } else {
            tabelle = leseCsv(await datei.text());
        }
        ergebnis = leseTabelle(tabelle);
    } catch (fehler) {
        ergebnis = null;
        element<HTMLElement>("ergebnis-fehler").hidden = false;
        element<HTMLElement>("ergebnis-fehler").textContent =
            `${datei.name} ließ sich nicht lesen: ${fehler instanceof Error ? fehler.message : String(fehler)}`;
        zusammenfassung.textContent = "";
        element<HTMLElement>("ergebnis-warnung").hidden = true;
        element<HTMLTableElement>("ergebnis-tabelle").tBodies[0]?.replaceChildren();
        element<HTMLButtonElement>("tabelle-pdf").disabled = true;
        element<HTMLButtonElement>("tabelle-oeffnen").disabled = true;
        return;
    }
    tabelleAnzeigen();
    element<HTMLElement>("ergebnis").scrollIntoView({ block: "start" });
}

function kurz(text: string, laenge: number): string {
    const einzeilig = text.replace(/\s+/g, " ").trim();
    return einzeilig.length > laenge ? `${einzeilig.slice(0, laenge - 1)}…` : einzeilig;
}

function tabelleAnzeigen(): void {
    if (!ergebnis) {
        return;
    }
    const { zeilen, unbekannteSpalten } = ergebnis;
    const mitFehler = zeilen.filter(zeile => zeile.fehler.length > 0);
    const { vordruck } = optionen();
    const art = { nachricht: "Nachrichtenvordrucke", meldung: "Meldevordrucke", beide: "Nachrichten- und Meldevordrucke" }[vordruck];

    element<HTMLParagraphElement>("ergebnis-zusammenfassung").textContent = zeilen.length === 0
        ? `In ${dateiName} steht keine ausgefüllte Zeile.`
        : `${dateiName}: ${zeilen.length} ${zeilen.length === 1 ? "Zeile" : "Zeilen"} → ${art}.`;

    const warnung = element<HTMLElement>("ergebnis-warnung");
    warnung.hidden = unbekannteSpalten.length === 0;
    warnung.textContent = `Diese Spalten sind unbekannt und werden ignoriert: ${unbekannteSpalten.join(", ")}.`;

    const fehlerKasten = element<HTMLElement>("ergebnis-fehler");
    fehlerKasten.hidden = mitFehler.length === 0;
    fehlerKasten.replaceChildren();
    if (mitFehler.length > 0) {
        const satz = document.createElement("p");
        satz.textContent = `${mitFehler.length} ${mitFehler.length === 1 ? "Zeile hat" : "Zeilen haben"} ungültige Werte. Diese Felder bleiben auf dem Vordruck leer; besser in der Datei korrigieren und neu einlesen.`;
        const liste = document.createElement("ul");
        for (const zeile of mitFehler.slice(0, 20)) {
            const punkt = document.createElement("li");
            punkt.textContent = `Zeile ${zeile.zeile}: ${zeile.fehler.join("; ")}`;
            liste.append(punkt);
        }
        if (mitFehler.length > 20) {
            const punkt = document.createElement("li");
            punkt.textContent = `… und ${mitFehler.length - 20} weitere`;
            liste.append(punkt);
        }
        fehlerKasten.append(satz, liste);
    }

    const tbody = element<HTMLTableElement>("ergebnis-tabelle").tBodies[0];
    tbody?.replaceChildren(...zeilen.map(zeile => {
        const tr = document.createElement("tr");
        tr.classList.toggle("mit-fehler", zeile.fehler.length > 0);
        const zellen = [
            [String(zeile.zeile), "zahl"],
            [zeile.daten.nummer, "zahl"],
            [zeile.daten.empfaenger.join(", "), ""],
            [kurz(zeile.daten.inhalt, 90), "inhalt"],
            [zeile.daten.absender, ""]
        ] as const;
        for (const [text, klasse] of zellen) {
            const td = document.createElement("td");
            td.textContent = text;
            if (klasse) {
                td.className = klasse;
            }
            tr.append(td);
        }
        return tr;
    }));

    const pdfKnopf = element<HTMLButtonElement>("tabelle-pdf");
    pdfKnopf.disabled = zeilen.length === 0;
    pdfKnopf.textContent = `PDF herunterladen (${zeilen.length} ${zeilen.length === 1 ? "Vordruck" : "Vordrucke"})`;
    element<HTMLButtonElement>("tabelle-oeffnen").disabled = zeilen.length === 0;
}

function tabellenPdf() {
    return erzeugePdf((ergebnis?.zeilen ?? []).map(zeile => zeile.daten), optionen());
}

element<HTMLButtonElement>("tabelle-pdf").addEventListener("click", ereignis => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    void mitArbeit(knopf, "PDF wird erstellt…", async () => {
        // Einen Takt warten, damit der Knopf seinen Arbeitszustand zeigt, bevor jsPDF rechnet.
        await new Promise(fertig => setTimeout(fertig, 30));
        herunterladen(tabellenPdf().output("blob"), dateiname(optionen(), ergebnis?.zeilen.length ?? 0));
    });
});

element<HTMLButtonElement>("tabelle-oeffnen").addEventListener("click", () => {
    window.open(URL.createObjectURL(tabellenPdf().output("blob")), "_blank", "noopener");
});

const dateiFeld = element<HTMLInputElement>("datei");
dateiFeld.addEventListener("change", () => {
    const datei = dateiFeld.files?.[0];
    if (datei) {
        void dateiEinlesen(datei);
    }
    dateiFeld.value = "";
});

const dateiZiel = element<HTMLLabelElement>("datei-ziel");
dateiZiel.addEventListener("dragover", ereignis => {
    ereignis.preventDefault();
    dateiZiel.classList.add("ueber");
});
dateiZiel.addEventListener("dragleave", () => dateiZiel.classList.remove("ueber"));
dateiZiel.addEventListener("drop", ereignis => {
    ereignis.preventDefault();
    dateiZiel.classList.remove("ueber");
    const datei = ereignis.dataTransfer?.files[0];
    if (datei) {
        void dateiEinlesen(datei);
    }
});

// ---- Start ---------------------------------------------------------------

einstellungenLaden();
felderFuerVordruckZeigen();
zeigeReiter(location.hash === "#tabelle" ? "tabelle" : "einzeln");
