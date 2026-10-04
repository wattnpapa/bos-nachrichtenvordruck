/// <reference types="vite/client" />
import "./seite.js";
import { zeichneBildvorschau } from "./bildvorschau.js";
import { dekodiereCsv, schreibeCsv, leseCsv } from "./csv.js";
import { dateiname, erzeugePdf, type Blattformat, type PdfOptionen, type VordruckWahl } from "./pdf.js";
import { pruefeTextlaenge, textlaengeMeldung } from "./textlaenge.js";
import {
    SPALTEN,
    datumZeitGruppe,
    leseTabelle,
    naechsteNummer,
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
    // Der Nachrichtenvordruck fragt nach der Gegenstelle, der Meldevordruck nach dem Empfänger.
    element<HTMLSpanElement>("empfaenger-titel").textContent =
        vordruck === "meldung" ? "Empfänger" : "Rufname der Gegenstelle";
    richtungPruefen();
}

/** Ohne gewählte Richtung bleibt im Betriebsbuch beides leer; das soll auffallen. */
function richtungPruefen(): void {
    const gewaehlt = document.querySelector<HTMLInputElement>('input[name="richtung"]:checked');
    const hinweis = element<HTMLParagraphElement>("richtung-hinweis");
    hinweis.hidden = Boolean(gewaehlt) || optionen().vordruck === "meldung";
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
        if (feld instanceof HTMLInputElement && feld.type === "radio") {
            feld.checked = feld.value === wert;
        } else if (feld instanceof HTMLInputElement && feld.type === "checkbox") {
            feld.checked = feld.name === "verteiler"
                ? wert.split(",").map(teil => teil.trim()).includes(feld.value)
                : wert === feld.value;
        } else {
            feld.value = wert;
        }
    }
}

const vorgaben = maskeLesen();

/** Der Entwurf trägt den Zeitpunkt der letzten Änderung mit; maskeSchreiben übergeht ihn. */
type Entwurf = Eingabe & { _geaendert?: string };

function entwurfSpeichern(): void {
    const entwurf: Entwurf = { ...maskeLesen(), _geaendert: new Date().toISOString() };
    speicher()?.setItem(ENTWURF_SCHLUESSEL, JSON.stringify(entwurf));
}

function weichtAb(eingabe: Eingabe): boolean {
    return SPALTEN.some(spalte => (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? ""));
}

let wiederhergestellt: Entwurf | null = null;
try {
    const entwurf = JSON.parse(speicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Entwurf | null;
    if (entwurf) {
        maskeSchreiben(entwurf);
        wiederhergestellt = weichtAb(maskeLesen()) ? entwurf : null;
    }
} catch {
    // Kaputter Entwurf: leere Maske.
}

// Belegte Felder im zugeklappten Bereich sichtbar machen: was dort steht, wird mitgedruckt.
const weitere = element<HTMLDetailsElement>("weitere");
const weitereZahl = element<HTMLSpanElement>("weitere-zahl");

function weitereZaehlen(): number {
    const eingabe = maskeLesen();
    const namen = new Set(Array.from(weitere.querySelectorAll<HTMLInputElement>("input"), feld => feld.name as Schluessel));
    let zahl = 0;
    for (const name of namen) {
        const wert = eingabe[name] ?? "";
        if (name === "verteiler") {
            zahl += wert ? wert.split(",").length : 0;
        } else if (wert !== (vorgaben[name] ?? "")) {
            zahl += 1;
        }
    }
    weitereZahl.hidden = zahl === 0;
    weitereZahl.textContent = `${zahl} ${zahl === 1 ? "Angabe" : "Angaben"}`;
    return zahl;
}

const entwurfHinweis = element<HTMLDivElement>("entwurf-hinweis");

function zeitpunkt(iso: string | undefined): string {
    const datum = iso ? new Date(iso) : null;
    if (!datum || Number.isNaN(datum.getTime())) {
        return "vom letzten Mal";
    }
    const heute = new Date().toDateString() === datum.toDateString();
    const uhr = datum.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return heute ? `von heute, ${uhr} Uhr` : `vom ${datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${uhr} Uhr`;
}

if (wiederhergestellt) {
    const nummer = wiederhergestellt.nummer?.trim();
    element<HTMLParagraphElement>("entwurf-text").textContent =
        `Angaben ${zeitpunkt(wiederhergestellt._geaendert)} wiederhergestellt${nummer ? ` (Nr. ${nummer})` : ""}. ` +
        "Sie werden so gedruckt, wie sie hier stehen, auch die unter „Vermerke, Quittung und Verteiler“.";
    entwurfHinweis.hidden = false;
    if (weitereZaehlen() > 0) {
        weitere.open = true;
    }
}
weitereZaehlen();

const vorschau = element<HTMLIFrameElement>("einzeln-vorschau");
const einzelnFehler = element<HTMLParagraphElement>("einzeln-fehler");
const textlaenge = element<HTMLParagraphElement>("textlaenge");
const einzelnStatus = element<HTMLParagraphElement>("einzeln-status");
let vorschauUrl = "";
let vorschauTimer: ReturnType<typeof setTimeout> | undefined;

/** Liest die Maske und hält Fehler- und Längenhinweise aktuell. */
function einzelPruefen() {
    const { daten, fehler } = zuVordruckDaten(maskeLesen());
    richtungPruefen();
    einzelnFehler.hidden = fehler.length === 0;
    einzelnFehler.textContent = fehler.join(" · ");
    const laenge = pruefeTextlaenge(daten.inhalt, optionen().vordruck);
    textlaenge.hidden = !laenge;
    textlaenge.textContent = laenge ? textlaengeMeldung(laenge) : "";
    textlaenge.className = `textlaenge ${laenge && laenge.stufe !== "verkleinert" ? "warnung" : "hinweis"}`;
    return daten;
}

function einzelPdf() {
    return erzeugePdf([einzelPruefen()], optionen());
}

// Telefone zeigen eine PDF im iframe meist gar nicht an. Dann zeigt ein Bild den Vordruck.
const eingebettet = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
const bildvorschau = element<HTMLCanvasElement>("einzeln-bild");
vorschau.hidden = !eingebettet;
bildvorschau.hidden = eingebettet;
element<HTMLElement>("vorschau-ersatz").hidden = eingebettet;

function vorschauAktualisieren(): void {
    if (element<HTMLElement>("ansicht-einzeln").hidden) {
        return;
    }
    if (!eingebettet) {
        void zeichneBildvorschau(bildvorschau, einzelPruefen(), optionen());
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

function maskeGeaendert(): void {
    entwurfSpeichern();
    weitereZaehlen();
    einzelnStatus.textContent = "";
    planeVorschau();
}

maske.addEventListener("input", maskeGeaendert);
maske.addEventListener("change", maskeGeaendert);

element<HTMLButtonElement>("jetzt").addEventListener("click", () => {
    const feld = maske.elements.namedItem("abfassungszeit") as HTMLInputElement;
    feld.value = datumZeitGruppe(new Date());
    feld.dispatchEvent(new Event("input", { bubbles: true }));
});

/** Stand der Maske beim letzten Herunterladen, um ungesicherte Arbeit zu erkennen. */
let zuletztHeruntergeladen = "";

element<HTMLButtonElement>("einzeln-pdf").addEventListener("click", () => {
    const pdf = einzelPdf();
    const name = dateiname(optionen(), 1);
    herunterladen(pdf.output("blob"), name);
    const eingabe = maskeLesen();
    zuletztHeruntergeladen = JSON.stringify(eingabe);
    const nummer = eingabe.nummer?.trim();
    const uhr = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    einzelnStatus.textContent = `${name}${nummer ? ` (Nr. ${nummer})` : ""} um ${uhr} Uhr erstellt. Für die nächste Nachricht „Nächster Vordruck“ wählen.`;
});

// Was „Nächster Vordruck“ stehen lässt: eigene Angaben und Einstellungen, die
// von Nachricht zu Nachricht gleich bleiben. Alles andere gehört zur Nachricht
// und wird geleert, damit nichts davon unbemerkt auf dem nächsten Bogen landet.
const BEHALTEN: readonly Schluessel[] = ["weg", "richtung", "absender", "verfasser", "zeichen", "funktion", "titel", "hinweis"];

function naechsterVordruck(rueckfrage: boolean): void {
    const eingabe = maskeLesen();
    if (rueckfrage && (eingabe.inhalt ?? "").trim() && JSON.stringify(eingabe) !== zuletztHeruntergeladen
        && !confirm("Dieser Vordruck wurde seit der letzten Änderung nicht heruntergeladen. Trotzdem zum nächsten wechseln?")) {
        return;
    }
    const neu = Object.fromEntries(SPALTEN.map(spalte => [
        spalte.schluessel,
        BEHALTEN.includes(spalte.schluessel) ? eingabe[spalte.schluessel] ?? "" : vorgaben[spalte.schluessel] ?? ""
    ])) as Eingabe;
    neu.nummer = naechsteNummer(eingabe.nummer ?? "");
    maskeSchreiben(neu);
    entwurfSpeichern();
    weitereZaehlen();
    entwurfHinweis.hidden = true;
    planeVorschau();
    einzelnStatus.textContent = `Neuer Vordruck${neu.nummer ? ` Nr. ${neu.nummer}` : ""}. Absender, Zeichen, Funktion, Übermittlungsweg und Richtung sind übernommen, alles andere ist leer.`;
    (maske.elements.namedItem("empfaenger") as HTMLInputElement).focus();
}

element<HTMLButtonElement>("einzeln-naechster").addEventListener("click", () => naechsterVordruck(true));
element<HTMLButtonElement>("entwurf-naechster").addEventListener("click", () => naechsterVordruck(false));
element<HTMLButtonElement>("entwurf-behalten").addEventListener("click", () => {
    entwurfHinweis.hidden = true;
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
    weitereZaehlen();
    entwurfHinweis.hidden = true;
    einzelnStatus.textContent = "";
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
    // Bis die neue Datei gelesen ist, gibt es nichts herunterzuladen; sonst
    // käme eine leere PDF oder die der vorigen Datei.
    ergebnis = null;
    element<HTMLButtonElement>("tabelle-pdf").disabled = true;
    element<HTMLButtonElement>("tabelle-pdf").textContent = "PDF herunterladen";
    element<HTMLButtonElement>("tabelle-oeffnen").disabled = true;
    element<HTMLElement>("ergebnis-warnung").hidden = true;
    element<HTMLElement>("ergebnis-fehler").hidden = true;
    element<HTMLTableElement>("ergebnis-tabelle").tBodies[0]?.replaceChildren();
    try {
        let tabelle: string[][];
        if (/\.xlsx$/i.test(datei.name)) {
            const { leseExcel } = await import("./excel.js");
            tabelle = await leseExcel(await datei.arrayBuffer());
        } else if (/\.xls$/i.test(datei.name)) {
            throw new Error("Das alte Excel-Format .xls wird nicht gelesen. Bitte in Excel als .xlsx oder CSV speichern.");
        } else {
            tabelle = leseCsv(dekodiereCsv(await datei.arrayBuffer()));
        }
        ergebnis = leseTabelle(tabelle);
    } catch (fehler) {
        ergebnis = null;
        element<HTMLElement>("ergebnis-fehler").hidden = false;
        element<HTMLElement>("ergebnis-fehler").textContent =
            `${datei.name} ließ sich nicht lesen: ${fehler instanceof Error ? fehler.message : String(fehler)}`;
        zusammenfassung.textContent = "";
        element<HTMLElement>("ergebnis-warnung").hidden = true;
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
    const { zeilen, unbekannteSpalten, beispielZeilen } = ergebnis;
    const mitFehler = zeilen.filter(zeile => zeile.fehler.length > 0);
    const { vordruck } = optionen();
    const art = { nachricht: "Nachrichtenvordrucke", meldung: "Meldevordrucke", beide: "Nachrichten- und Meldevordrucke" }[vordruck];

    element<HTMLParagraphElement>("ergebnis-zusammenfassung").textContent = zeilen.length === 0
        ? `In ${dateiName} steht keine ausgefüllte Zeile.`
        : `${dateiName}: ${zeilen.length} ${zeilen.length === 1 ? "Zeile" : "Zeilen"} → ${art}.`;

    const warnung = element<HTMLElement>("ergebnis-warnung");
    const zuLang = zeilen.flatMap(zeile => {
        const laenge = pruefeTextlaenge(zeile.daten.inhalt, vordruck);
        return laenge && laenge.stufe !== "verkleinert" ? [`Zeile ${zeile.zeile}: ${textlaengeMeldung(laenge)}`] : [];
    });
    warnung.replaceChildren();
    if (beispielZeilen.length > 0) {
        const satz = document.createElement("p");
        satz.textContent = `${beispielZeilen.length === 1 ? "Zeile" : "Zeilen"} ${beispielZeilen.join(", ")} ist die unveränderte Beispielzeile aus der Vorlage und wird nicht gedruckt.`;
        warnung.append(satz);
    }
    if (unbekannteSpalten.length > 0) {
        const satz = document.createElement("p");
        satz.textContent = `Diese Spalten sind unbekannt und werden ignoriert: ${unbekannteSpalten.join(", ")}.`;
        warnung.append(satz);
    }
    if (zuLang.length > 0) {
        const liste = document.createElement("ul");
        liste.append(...zuLang.map(text => {
            const punkt = document.createElement("li");
            punkt.textContent = text;
            return punkt;
        }));
        warnung.append(liste);
    }
    warnung.hidden = warnung.childElementCount === 0;

    const fehlerKasten = element<HTMLElement>("ergebnis-fehler");
    fehlerKasten.hidden = mitFehler.length === 0;
    fehlerKasten.replaceChildren();
    if (mitFehler.length > 0) {
        const satz = document.createElement("p");
        satz.textContent = `${mitFehler.length} ${mitFehler.length === 1 ? "Zeile hat" : "Zeilen haben"} Fehler, in der Übersicht mit ⚠ markiert. Ungültige Auswahlwerte bleiben auf dem Vordruck leer, nicht druckbare Zeichen werden ersetzt. Besser in der Datei korrigieren und neu einlesen.`;
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
        // Gelesene Auswahlwerte, damit ein verworfener Vorrang hier als leer auffällt.
        const auswahl = (wert: string | undefined) => wert ? wert.charAt(0).toUpperCase() + wert.slice(1) : "–";
        const zellen = [
            [zeile.fehler.length > 0 ? `${zeile.zeile} ⚠` : String(zeile.zeile), "zahl"],
            [zeile.daten.nummer, "zahl"],
            [auswahl(zeile.daten.vorrang), ""],
            [auswahl(zeile.daten.richtung), ""],
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
    const mitFehler = (ergebnis?.zeilen ?? []).filter(zeile => zeile.fehler.length > 0);
    const erste = mitFehler[0];
    if (erste && !confirm(
        `${mitFehler.length} ${mitFehler.length === 1 ? "Zeile hat" : "Zeilen haben"} Fehler, etwa Zeile ${erste.zeile}: ${erste.fehler[0]}.\n\n`
        + "Betroffene Felder bleiben leer oder werden ersetzt. Trotzdem die PDF erzeugen?"
    )) {
        return;
    }
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

// Nach dem ersten Aufruf startet die Seite aus dem Cache, auch ohne Netz.
// Der Dienst entsteht erst beim Bauen (web/vite.config.ts), im Entwicklungsserver gibt es ihn nicht.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
            element<HTMLElement>("offline-stand").hidden = false;
        })
        .catch(() => {
            // Ohne Dienst läuft die Seite wie bisher, nur nicht ohne Netz.
        });
}
