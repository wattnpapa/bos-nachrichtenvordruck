/// <reference types="vite/client" />

/** Bauzeitpunkt, von web/vite.config.ts eingesetzt. */
declare const __FASSUNG__: string;
import "./seite.js";
import { zeichneBildvorschau } from "./bildvorschau.js";
import { dekodiereCsv, schreibeCsv, leseCsv } from "./csv.js";
import { dateiname, erzeugePdf, type Blattformat, type PdfOptionen, type VordruckWahl } from "./pdf.js";
import { bogenListe, gekuerzteFelderAufBoegen, istKritisch, pruefeTextlaenge, teileInhalt, textlaengeMeldung, verteiltText, type Bogen } from "./textlaenge.js";
import { beiSpeicherZustand, gescheiterteSchluessel, geraeteSpeicher, lesefehler, schreibe, schreibeImTab, speicherPruefen, speicherWarnung, speicherZustand } from "./speicherwache.js";
import { EINSATZ_PAUSE, HOECHSTENS, einsatzBeginn, einsatzFolgen, einsatzVereinen, eintragKennung, fassungen, listenEinsatz, listenEintraege, uebernimmEintraege, verlaufKennung, ladeVerlauf, loescheVerlauf, merkeVordruck, merkeVordrucke, mitNummer, verlaufAlsCsv, type Eintrag, type Einsatzstand } from "./verlauf.js";
import {
    SPALTEN,
    UNMOEGLICH,
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
    return geraeteSpeicher("local");
}

/** Fest oben auf der Seite, solange der Speicher des Geräts gesperrt oder voll ist. */
// Wer die App schon benutzt hat, braucht die Einleitung nicht mehr: Die Maske rückt so ins erste Bild.
if (ladeVerlauf().length > 0) {
    document.querySelector<HTMLElement>(".einleitung")?.setAttribute("hidden", "");
}
const speicherWarnungZeile = element<HTMLParagraphElement>("speicher-warnung");
beiSpeicherZustand(zustand => {
    speicherWarnungZeile.textContent = speicherWarnung(zustand, gescheiterteSchluessel(), lesefehler());
    speicherWarnungZeile.hidden = zustand === "ok";
    obenHinweiseSichtbar();
    // Die Zusage „bleibt zuverlässig gespeichert“ im Kasten darüber widerspräche der Warnung.
    document.documentElement.classList.toggle("speicher-defekt", zustand !== "ok");
    warnhoeheMerken();
});
/**
 * Die Speicherwarnung klebt oben: Was in den Bildschirm gerollt wird (Feld per Tab, Rückmeldung), soll darunter
 * landen, nicht dahinter. Die Höhe geht als Scroll-Abstand an die Seite.
 */
function warnhoeheMerken(): void {
    const container = document.getElementById("oben-hinweise");
    const hoehe = !container || container.hidden ? 0 : Math.ceil(container.getBoundingClientRect().height);
    document.documentElement.style.scrollPaddingTop = hoehe > 0 ? `${hoehe + 8}px` : "";
    document.documentElement.style.setProperty("--warnhoehe", `${hoehe}px`);
}
/** Der Container oben ist sichtbar, solange Speicherwarnung oder Fenster-Hinweis offen ist. */
function obenHinweiseSichtbar(): void {
    const container = document.getElementById("oben-hinweise");
    const fenster = document.getElementById("fenster-hinweis");
    if (container) {
        container.hidden = speicherWarnungZeile.hidden && (fenster?.hidden ?? true);
    }
    warnhoeheMerken();
}
addEventListener("resize", warnhoeheMerken);
speicherPruefen(speicher());

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

/**
 * Rückfrage im Stil der Seite statt des Systemdialogs: folgt dem Anzeigemodus,
 * blendet nachts nicht, und die Knöpfe sagen, was passiert. Vorbelegt ist
 * „Abbrechen“, damit ein versehentliches Enter nichts löscht.
 */
function frage(text: string, ja: string, nein = "Abbrechen"): Promise<boolean> {
    return frageWahl(text, ja, nein).then(wahl => wahl === "ja");
}

/** Wie `frage`, mit einem dritten Knopf `dritte`; ergibt „ja“, „dritte“ oder „nein“. */
function frageWahl(text: string, ja: string, nein = "Abbrechen", dritte = ""): Promise<"ja" | "nein" | "dritte"> {
    const dialog = element<HTMLDialogElement>("frage");
    if (typeof dialog.showModal !== "function") {
        return Promise.resolve(confirm(text) ? "ja" : "nein");
    }
    element<HTMLParagraphElement>("frage-text").textContent = text;
    element<HTMLButtonElement>("frage-ja").textContent = ja;
    element<HTMLButtonElement>("frage-nein").textContent = nein;
    element<HTMLButtonElement>("frage-dritte").textContent = dritte;
    element<HTMLButtonElement>("frage-dritte").hidden = !dritte;
    dialog.returnValue = "";
    const hinweis = element<HTMLParagraphElement>("frage-hinweis");
    hinweis.hidden = true;
    clearTimeout(frageHinweisUhr);
    dialog.showModal();
    frageGeoeffnet = performance.now();
    element<HTMLButtonElement>("frage-nein").focus();
    // Ein Doppeltipp auf den auslösenden Knopf darf die Rückfrage nicht gleich bestätigen:
    // die weiterführenden Knöpfe nehmen erst nach 0,8 s Tipps an, „Abbrechen“ nach 0,7 s (siehe unten).
    // Die Sperre heißt aria-disabled statt disabled: Ein gesperrter Knopf schluckte den Tipp sonst stumm.
    const sperren = [element<HTMLButtonElement>("frage-ja"), element<HTMLButtonElement>("frage-dritte")];
    for (const knopf of sperren) {
        knopf.setAttribute("aria-disabled", "true");
        knopf.classList.add("gesperrt");
    }
    setTimeout(() => {
        for (const knopf of sperren) {
            knopf.removeAttribute("aria-disabled");
            knopf.classList.remove("gesperrt");
        }
        if (dialog.open) {
            element<HTMLButtonElement>("frage-nein").focus();
        }
    }, 800);
    return new Promise(fertig => dialog.addEventListener("close", () => {
        const wert = dialog.returnValue;
        // Der zweite Tipp eines Doppeltipps trifft sonst, was nach dem Schließen unter dem Finger liegt.
        sprungSperreBis = performance.now() + 700;
        // Kurz nach dem Öffnen abgebrochen: eher ein geprellter Tipp. Nicht still, damit
        // niemand glaubt, die Handlung sei ausgeführt.
        if (wert !== "ja" && wert !== "dritte" && performance.now() - frageGeoeffnet < 1_500) {
            zeigeKurzmeldung("Rückfrage abgebrochen; es wurde nichts ausgeführt.", false);
        }
        fertig(wert === "ja" || wert === "dritte" ? wert : "nein");
    }, { once: true }));
}

let frageGeoeffnet = 0;
let frageHinweisUhr: ReturnType<typeof setTimeout> | undefined;
element<HTMLDialogElement>("frage").addEventListener("click", ereignis => {
    const knopf = ereignis.target instanceof HTMLButtonElement ? ereignis.target : null;
    const alt = performance.now() - frageGeoeffnet;
    // „Abbrechen“ nimmt nach 0,7 s Tipps an, „Ja“ und der dritte Knopf nach 0,8 s.
    if (knopf && (alt < 700 || (knopf.getAttribute("aria-disabled") === "true" && alt < 1_500))) {
        ereignis.preventDefault();
        ereignis.stopPropagation();
        // Die Kurzmeldung läge unter der Rückfrage: Das Schlucken sagt die Rückfrage selbst, ohne etwas zu verschieben.
        element<HTMLParagraphElement>("frage-hinweis").hidden = false;
        clearTimeout(frageHinweisUhr);
        frageHinweisUhr = setTimeout(() => { element<HTMLParagraphElement>("frage-hinweis").hidden = true; }, 1_800);
    }
}, true);

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

/**
 * `verlauf`: „neu“ legt einen Eintrag an, damit die Zurück-Taste des Telefons
 * zum vorigen Reiter führt statt aus der App heraus; „ersetzen“ beim Start,
 * „keiner“, wenn der Wechsel selbst aus dem Verlauf kommt.
 */
function zeigeReiter(name: string, fokus = false, verlauf: "neu" | "ersetzen" | "keiner" = "neu"): void {
    for (const reiter of REITER) {
        const aktiv = reiter.name === name;
        reiter.knopf.setAttribute("aria-selected", String(aktiv));
        reiter.knopf.tabIndex = aktiv ? 0 : -1;
        reiter.ansicht.hidden = !aktiv;
        if (aktiv && fokus) {
            reiter.knopf.focus();
        }
    }
    const ziel = name === "einzeln" ? location.pathname + location.search : `#${name}`;
    if (verlauf !== "keiner" && location.hash !== (name === "einzeln" ? "" : `#${name}`)) {
        if (verlauf === "neu") {
            history.pushState(null, "", ziel);
        } else {
            history.replaceState(null, "", ziel);
        }
    }
    if (name === "einzeln") {
        planeVorschau();
    }
    // Eine Kurzmeldung gehört zum Reiter, auf dem sie entstand.
    document.getElementById("kurzmeldung")?.setAttribute("hidden", "");
    einstellungenZeigen();
}

addEventListener("popstate", () => {
    // Zurück-Taste bei offener Rückfrage: wie „Abbrechen“, der Reiter dahinter bleibt.
    const dialog = document.getElementById("frage") as HTMLDialogElement | null;
    if (dialog?.open) {
        const offen = REITER.find(reiter => !reiter.ansicht.hidden)?.name ?? "einzeln";
        history.pushState(null, "", offen === "einzeln" ? location.pathname + location.search : `#${offen}`);
        dialog.close("nein");
        return;
    }
    zeigeReiter(location.hash === "#tabelle" ? "tabelle" : "einzeln", false, "keiner");
});

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
        ohneHintergrund: document.querySelector<HTMLInputElement>('input[name="ohneHintergrund"]')?.checked ?? false,
        versatzX: versatzWert("versatzX"),
        versatzY: versatzWert("versatzY")
    };
}

function versatzWert(name: string): number {
    const zahl = Number(document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value.replace(",", ".") ?? 0);
    return Number.isFinite(zahl) ? Math.max(-20, Math.min(20, zahl)) : 0;
}

/** Zusammenfassung der Einstellungen im zugeklappten Kopf, damit „ohne Formular“ nicht übersehen wird. */
function einstellungenZeigen(): void {
    const gewaehlt = optionen();
    const text = (name: string) =>
        document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.parentElement?.textContent?.trim() ?? "";
    const teile = [text("vordruck"), text("blatt")];
    if (gewaehlt.ohneHintergrund) {
        const versatz = gewaehlt.versatzX || gewaehlt.versatzY
            ? ` (verschoben ${[gewaehlt.versatzX ?? 0, gewaehlt.versatzY ?? 0].map(mm => mm.toLocaleString("de-DE")).join(" / ")} mm)`
            : "";
        teile.push(`ohne Formular${versatz}`);
    }
    element<HTMLSpanElement>("einstellungen-stand").textContent = teile.join(" · ");
    // Wie am Tabellenknopf: eine gemerkte Einstellung soll beim Download nicht überraschen.
    element<HTMLButtonElement>("einzeln-pdf").textContent = gewaehlt.ohneHintergrund ? "PDF herunterladen (ohne Formular)" : "PDF herunterladen";
    element<HTMLDivElement>("versatz").hidden = !gewaehlt.ohneHintergrund;
    // Im Einzelreiter füllt ein Vordruck nur die linke Hälfte von A4 quer.
    element<HTMLParagraphElement>("blatt-hinweis").hidden = !(gewaehlt.blatt === "a4" && gewaehlt.vordruck !== "beide"
        && !element<HTMLElement>("ansicht-einzeln").hidden);
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
    element<HTMLHeadingElement>("spruchkopf-titel").textContent = vordruck === "meldung" ? "Empfänger" : "Spruchkopf";
    richtungPruefen();
}

/** Ohne Übermittlungsweg oder Richtung bleibt dort auf dem Vordruck nichts angekreuzt; das soll auffallen. */
function richtungPruefen(): void {
    // Der Meldevordruck hat keine Richtung, aber auch „Übermittelt“ mit Funk, Kurier, Telefon und Fax.
    const meldung = optionen().vordruck === "meldung";
    const fehlt = [
        (maske.elements.namedItem("weg") as HTMLSelectElement).value ? "" : "Übermittlungsweg",
        meldung || document.querySelector('input[name="richtung"]:checked') ? "" : "Richtung"
    ].filter(Boolean);
    const hinweis = element<HTMLParagraphElement>("richtung-hinweis");
    hinweis.hidden = fehlt.length === 0;
    hinweis.textContent = `${fehlt.join(" und ")} nicht gewählt: Dort wird auf dem Vordruck nichts angekreuzt.`;
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
        for (const name of ["versatzX", "versatzY"] as const) {
            const feld = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
            if (feld && typeof gespeichert[name] === "number") {
                feld.value = String(gespeichert[name]);
            }
        }
    } catch {
        // Kaputter Eintrag: Vorgaben aus dem Markup gelten.
    }
}

document.querySelector(".einstellungen")?.addEventListener("change", ereignis => {
    // Was gedruckt wird, soll auch im Feld stehen: ±20 mm.
    const feld = ereignis.target;
    if (feld instanceof HTMLInputElement && (feld.name === "versatzX" || feld.name === "versatzY")) {
        feld.value = String(versatzWert(feld.name));
    }
    schreibe(speicher(), EINSTELLUNGEN_SCHLUESSEL, JSON.stringify(optionen()));
    einstellungenZeigen();
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
        // Spalte 2 und 3 haben auf dem Bogen daneben ein freies Feld für den Empfänger.
        if (spalte > 1) {
            const text = document.createElement("input");
            text.type = "text";
            text.name = `verteilerS${zeile}Text${spalte}`;
            text.className = "verteiler-text";
            text.setAttribute("aria-label", `Empfänger S${zeile}, Spalte ${spalte}`);
            td.append(text);
            const wort = document.createElement("span");
            wort.className = "verteiler-wort";
            wort.textContent = "zu lang";
            wort.title = "Wird auf dem Bogen gekürzt";
            wort.hidden = true;
            td.append(wort);
        }
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

/**
 * Die Vorgaben der Maske aus dem HTML, nicht aus den aktuellen Feldern: Wer vor
 * dem Start der App schon getippt hat, dessen Text ist keine Vorgabe.
 */
function vorgabenLesen(): Eingabe {
    const vorgabe: Eingabe = {};
    for (const spalte of SPALTEN) {
        const werte: string[] = [];
        const feld = maske.elements.namedItem(spalte.schluessel);
        const felder = feld instanceof RadioNodeList ? Array.from(feld) : feld ? [feld] : [];
        for (const einzeln of felder) {
            if (einzeln instanceof HTMLInputElement && (einzeln.type === "radio" || einzeln.type === "checkbox")) {
                if (einzeln.defaultChecked) {
                    werte.push(einzeln.value);
                }
            } else if (einzeln instanceof HTMLSelectElement) {
                const gewaehlt = Array.from(einzeln.options).find(option => option.defaultSelected) ?? einzeln.options[0];
                werte.push(gewaehlt?.value ?? "");
            } else if (einzeln instanceof HTMLInputElement || einzeln instanceof HTMLTextAreaElement) {
                werte.push(einzeln.defaultValue);
            }
        }
        vorgabe[spalte.schluessel] = werte.join(spalte.schluessel === "verteiler" ? ", " : "");
    }
    return vorgabe;
}
const vorgaben = vorgabenLesen();

// Was „Nächster Vordruck“ stehen lässt: Angaben, die von Nachricht zu Nachricht
// gleich bleiben. Alles andere gehört zur Nachricht und wird geleert, damit
// nichts davon unbemerkt auf dem nächsten Bogen landet. Nach einem Ausgang sind
// Absender, Zeichen und Funktion die eigenen, nach einem Eingang die der Gegenstelle.
const BEHALTEN_AUSGANG: readonly Schluessel[] = ["weg", "richtung", "absender", "zeichen", "funktion", "titel", "hinweis"];
const BEHALTEN_EINGANG: readonly Schluessel[] = ["weg", "richtung", "titel", "hinweis"];

/**
 * Der Entwurf trägt den Zeitpunkt der letzten Änderung und die angefassten
 * Felder mit; maskeSchreiben übergeht beides. Ein zweiter Tab weiß so, was
 * im ersten frisch eingetragen wurde.
 */
type Entwurf = Eingabe & { _geaendert?: string; _angefasst?: string[]; _geleert?: string[]; _fenster?: string };

/** Kennung dieses Fensters im Entwurf: So erkennt ein Fenster, ob ein Entwurf von ihm oder von einem anderen stammt. */
const FENSTER_KENNUNG = Math.random().toString(36).slice(2, 10);
/** Der Entwurf ohne die Stempel (Zeit, Markierungen, Fenster): nur der Inhalt der Maske. */
function ohneStempel(entwurf: Entwurf): Eingabe {
    const { _geaendert: _, _angefasst: __, _geleert: ___, _fenster: ____, ...rest } = entwurf;
    return rest;
}

/** Eigener Stand dieses Tabs: übersteht das Neuladen, ohne dass ein zweiter Tab ihn überschreibt. */
function tabSpeicher(): Storage | null {
    return geraeteSpeicher("session");
}

/** Letzter geschriebener Stand (Inhalt, Markierungen) und ob das Schreiben auf das Gerät glückte: Unverändertes wird nicht noch einmal geschrieben. */
let letzterEntwurfStand = "";
let letzterEntwurfOk = false;
/** Solange ein zweites Fenster einen anderen Entwurf hat und noch nicht gewählt ist, schreibt dieses Fenster nur in den Tab. */
let fensterKonflikt = false;

function entwurfSpeichern(): void {
    const jetzt = new Date();
    const maske = maskeLesen();
    const stand = JSON.stringify([maske, [...angefasst], [...frischGeleert]]);
    konfliktNachfuehren();
    // Unverändert und schon auf dem Gerät: nicht schreiben. Ein Fenster, das nur den Fokus verliert, fasst den Entwurf
    // eines anderen Fensters so nicht an und löst dort keine Rückfrage aus.
    if (stand === letzterEntwurfStand && letzterEntwurfOk && !fensterKonflikt) {
        return;
    }
    const entwurf = JSON.stringify({ ...maske, _geaendert: jetzt.toISOString(), _angefasst: [...angefasst], _geleert: [...frischGeleert], _fenster: FENSTER_KENNUNG } satisfies Entwurf);
    // Ein leeres Fenster überschreibt keinen vorhandenen Entwurf eines anderen Fensters.
    let fremderEntwurf = false;
    try {
        const vorhanden = JSON.parse(speicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Entwurf | null;
        fremderEntwurf = Boolean(vorhanden) && vorhanden?._fenster !== FENSTER_KENNUNG && weichtAb(ohneStempel(vorhanden as Entwurf)) && !weichtAb(maske);
    } catch {
        fremderEntwurf = false;
    }
    // localStorage: für einen neuen Tab oder nach dem Neustart des Browsers.
    const aufGeraet = fensterKonflikt || fremderEntwurf ? false : schreibe(speicher(), ENTWURF_SCHLUESSEL, entwurf);
    const imTab = schreibeImTab(tabSpeicher(), ENTWURF_SCHLUESSEL, entwurf);
    letzterEntwurfStand = stand;
    letzterEntwurfOk = aufGeraet;
    entwurfStand.textContent = fensterKonflikt
        ? "Entwurf nur in diesem Tab: Das andere Fenster hat einen anderen; erst oben wählen."
        : fremderEntwurf
            ? "Leere Maske: Der Entwurf des anderen Fensters bleibt auf dem Gerät."
            : aufGeraet
                ? `Entwurf auf diesem Gerät gespeichert, ${jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr.`
                : imTab
                    ? "Entwurf nicht auf dem Gerät gespeichert (Speicher gesperrt oder voll); er bleibt nur in diesem Tab, bis er geschlossen wird."
                    : "Entwurf nicht gespeichert (Speicher gesperrt oder voll); der Text geht beim Neuladen verloren.";
}

function entwurfEntfernen(): void {
    speicher()?.removeItem(ENTWURF_SCHLUESSEL);
    tabSpeicher()?.removeItem(ENTWURF_SCHLUESSEL);
    entwurfStand.textContent = "";
}

const entwurfStand = element<HTMLParagraphElement>("entwurf-stand");

function weichtAb(eingabe: Eingabe): boolean {
    return SPALTEN.some(spalte => (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? ""));
}

/**
 * Felder, die seit dem letzten Erstellen oder „Nächster Vordruck“ angefasst
 * wurden. Was nicht angefasst wurde und wie beim letzten Vordruck lautet, ist
 * vermutlich stehen geblieben; bewusst gleich Eingetragenes nicht. Ein neuer
 * Tab übernimmt sie aus dem gespeicherten Entwurf.
 */
const ANGEFASST_SCHLUESSEL = "bnv.angefasst.v1";
let angefasst = new Set<string>();
try {
    const imTab = tabSpeicher()?.getItem(ANGEFASST_SCHLUESSEL);
    angefasst = new Set(imTab
        ? JSON.parse(imTab) as string[]
        : (JSON.parse(speicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Entwurf | null)?._angefasst ?? []);
} catch {
    angefasst = new Set();
}
function angefasstZuruecksetzen(): void {
    angefasst.clear();
    tabSpeicher()?.removeItem(ANGEFASST_SCHLUESSEL);
    // Auch im gespeicherten Entwurf: Sonst kommt die Liste nach dem Neuladen zurück, und
    // die Prüfung auf stehen gebliebene Angaben fiele aus.
    for (const ort of [speicher(), tabSpeicher()]) {
        try {
            const roh = ort?.getItem(ENTWURF_SCHLUESSEL);
            if (roh) {
                schreibeImTab(ort ?? null, ENTWURF_SCHLUESSEL, JSON.stringify({ ...JSON.parse(roh) as Entwurf, _angefasst: [] }));
            }
        } catch {
            // Kaputter Entwurf: nichts zu retten.
        }
    }
}

/** Felder, die „Stehen gebliebene leeren“ oder „Gegenstelle ändern“ eben geleert hat, bis dort getippt wird. */
const frischGeleert = new Set<Schluessel>();

// Liegt der Entwurf nur im Tab (der Gerätespeicher war voll oder gesperrt), jetzt noch einmal versuchen: Gelingt das nicht, steht
// die Warnung gleich da, statt dass „wiederhergestellt“ eine Sicherheit vortäuscht, die ein neuer Tab nicht hat.
{
    const imTab = tabSpeicher()?.getItem(ENTWURF_SCHLUESSEL);
    if (imTab && !speicher()?.getItem(ENTWURF_SCHLUESSEL)) {
        schreibe(speicher(), ENTWURF_SCHLUESSEL, imTab);
    }
}
let wiederhergestellt: Entwurf | null = null;
/** Was beim Start mit einem älteren Entwurf geschah, als vor dem Start schon getippt wurde. */
let vorStartText = "";
try {
    const entwurf = JSON.parse(tabSpeicher()?.getItem(ENTWURF_SCHLUESSEL)
        ?? speicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Entwurf | null;
    if ((window as Window & { bnvVorStartGetippt?: boolean }).bnvVorStartGetippt && weichtAb(maskeLesen())) {
        // Vor dem Start Getipptes gilt. Ein älterer Entwurf mit Text kommt in die Ablage
        // statt darunter; einer ohne Text (nur Kopfangaben) füllt die leeren Felder.
        if (entwurf) {
            const alt = ohneStempel(entwurf);
            const getippt = maskeLesen();
            const nummer = alt.nummer?.trim();
            const erstellt = ladeVerlauf().some(eintrag => JSON.stringify(eintrag.eingabe) === JSON.stringify(alt));
            if ((alt.inhalt ?? "").trim() && !erstellt) {
                const ablage = JSON.parse(speicher()?.getItem("bnv.ablage.v1") ?? "[]") as { eingabe?: Eingabe }[];
                const neueAblage = [...ablage, { eingabe: alt, wie: "vor dem Start ersetzt", zeit: new Date().toISOString() }];
                const abgelegt = schreibe(speicher(), "bnv.ablage.v1", JSON.stringify(neueAblage.slice(-10)));
                // Ist die Ablage voll, fällt der älteste heraus; das soll der Hinweis sagen.
                const raus = neueAblage.length > 10 ? neueAblage[0]?.eingabe : undefined;
                vorStartText = `Was vor dem Start getippt wurde, bleibt. Der ältere Entwurf${nummer ? ` Nr. ${nummer}` : ""} ${zeitpunkt(entwurf._geaendert)} ${abgelegt ? "liegt in der Ablage unter den Knöpfen und lässt sich von dort zurückholen." : "konnte nicht abgelegt werden (Speicher gesperrt oder voll) und ist verloren."}`
                    + (raus && abgelegt ? ` Die Ablage fasst 10; dafür ist der älteste abgelegte Vordruck${raus.nummer?.trim() ? ` Nr. ${raus.nummer.trim()}` : ""} herausgefallen.` : "");
            } else if (!(alt.inhalt ?? "").trim()) {
                const ergaenzt = SPALTEN.filter(spalte => (alt[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? "")
                    && (getippt[spalte.schluessel] ?? "") === (vorgaben[spalte.schluessel] ?? ""));
                if (ergaenzt.length > 0) {
                    maskeSchreiben(Object.fromEntries(ergaenzt.map(spalte => [spalte.schluessel, alt[spalte.schluessel] ?? ""])) as Eingabe);
                    vorStartText = `Was vor dem Start getippt wurde, bleibt. Aus dem älteren Entwurf in leere Felder übernommen: ${ergaenzt.map(spalte => spalte.titel).join(", ")}.`;
                }
            }
        }
        entwurfSpeichern();
    } else if (entwurf) {
        maskeSchreiben(entwurf);
        // Die Markierung eben geleerter Felder übersteht das Neuladen, solange sie leer sind.
        for (const name of entwurf._geleert ?? []) {
            if (!(entwurf[name as Schluessel] ?? "").trim() && SPALTEN.some(spalte => spalte.schluessel === name)) {
                frischGeleert.add(name as Schluessel);
                feldRahmen(name)?.classList.add("geleert");
            }
        }
        // Ein leerer Folgevordruck (nur übernommene Angaben, kein Text) braucht keinen Hinweis.
        wiederhergestellt = weichtAb(maskeLesen()) && (entwurf.inhalt ?? "").trim() ? entwurf : null;
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
    // Im Raster ist ein Kreuz in der falschen Zeile leicht übersehen; als Text fällt es auf.
    const verteiler = (eingabe.verteiler ?? "").trim();
    // Auch die Empfänger in den freien Feldern neben den Kästchen: Sonst steht „Nichts angekreuzt“ über eingetragenem Text.
    const empfaengerTexte = SPALTEN.filter(spalte => /^verteilerS\dText[23]$/.test(spalte.schluessel) && (eingabe[spalte.schluessel] ?? "").trim())
        .map(spalte => `${spalte.titel.replace(/^Verteiler /, "")} „${(eingabe[spalte.schluessel] ?? "").trim()}“${maske.querySelector(`input[name="${spalte.schluessel}"].zu-lang-feld`) ? " (zu lang, wird gekürzt)" : ""}`);
    element<HTMLParagraphElement>("verteiler-stand").textContent = [
        verteiler ? `Angekreuzt: ${verteiler.replace(/S(\d)\/(\d)/g, "S$1 Spalte $2")}.` : "Nichts angekreuzt.",
        empfaengerTexte.length > 0 ? `Empfänger eingetragen: ${empfaengerTexte.join(", ")}.` : ""
    ].filter(Boolean).join(" ");
    // Titel und Hinweis bleiben von Vordruck zu Vordruck stehen; zugeklappt sollen sie sichtbar sein.
    const rand = [eingabe.titel, eingabe.hinweis].map(wert => (wert ?? "").trim()).filter(Boolean);
    element<HTMLSpanElement>("blattrand-stand").textContent = rand.length > 0
        ? `Gedruckt wird: ${rand.map(wert => `„${kurz(wert, 40)}“`).join(", ")}`
        : "Titel und Hinweis außerhalb des Formulars";
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
    const stand = JSON.stringify(maskeLesen());
    const erstellt = ladeVerlauf().find(eintrag => JSON.stringify(eintrag.eingabe) === stand);
    const erstelltText = erstellt
        ? `schon als PDF erstellt ${zeitpunkt(erstellt.zeit).replace(/^von /, "").replace(/^vom /, "am ")}`
        : "noch nicht als PDF erstellt";
    // Eine Zeile zum Erfassen, der Rest klein darunter.
    const kopf = document.createElement("strong");
    kopf.textContent = `${nummer ? `Nr. ${nummer}` : "Entwurf"} ${zeitpunkt(wiederhergestellt._geaendert)} wiederhergestellt: ${erstelltText}.`;
    const zusatz = document.createElement("span");
    zusatz.className = "nebentext";
    zusatz.id = "entwurf-zusatz";
    zusatz.textContent = weitereZaehlen() > 0 ? "Gedruckt wird, was hier steht, auch unter „Vermerke, Quittung und Verteiler“." : "";
    element<HTMLParagraphElement>("entwurf-text").replaceChildren(kopf, " ", zusatz);
    // Noch nicht erstellt: Weiterarbeiten ist der sichere Hauptweg, nicht das Leeren.
    if (!erstellt) {
        const behalten = element<HTMLButtonElement>("entwurf-behalten");
        const naechster = element<HTMLButtonElement>("entwurf-naechster");
        behalten.classList.add("primaer");
        naechster.classList.remove("primaer");
        behalten.after(naechster);
    }
    entwurfHinweis.hidden = false;
    if (weitereZaehlen() > 0) {
        weitere.open = true;
    }
    // Sonst springt der Browser an die alte Stelle, und der Hinweis oben bleibt ungesehen.
    // scrollRestoration setzt schon das Skript im Kopf der Seite; das hier ist die Absicherung.
    history.scrollRestoration = "manual";
    scrollTo(0, 0);
    // Im flachen Querformat steht der Hinweis sonst unter dem Kopf außer Sicht.
    if (innerHeight < 480) {
        entwurfHinweis.scrollIntoView({ block: "start" });
    }
}
if (vorStartText) {
    // Bleibt stehen, bis es bestätigt ist: Der Helfer tippt gerade und würde eine Kurzmeldung nicht sehen.
    element<HTMLParagraphElement>("entwurf-text").textContent = vorStartText;
    element<HTMLButtonElement>("entwurf-naechster").hidden = true;
    element<HTMLButtonElement>("entwurf-behalten").textContent = "Verstanden";
    entwurfHinweis.hidden = false;
}
weitereZaehlen();

const vorschau = element<HTMLIFrameElement>("einzeln-vorschau");
const einzelnFehler = element<HTMLParagraphElement>("einzeln-fehler");
const textlaenge = element<HTMLParagraphElement>("textlaenge");
const einzelnHinweise = element<HTMLDivElement>("einzeln-hinweise");
const statusText = element<HTMLSpanElement>("einzeln-status-text");
const rueckgaengig = element<HTMLButtonElement>("einzeln-rueckgaengig");
let verlauf: Eintrag[] = ladeVerlauf();

/**
 * Was der Helfer zur Einsatzgrenze gesagt hat („Neuer Einsatz“, „Einsatz
 * fortsetzen“). Ohne das beginnt ein Einsatz nach zwölf Stunden ohne Vordruck
 * von selbst; auch eine gesetzte Grenze läuft nach zwölf Stunden ohne Vordruck ab.
 */
const EINSATZ_SCHLUESSEL = "bnv.einsatz.v2";
function einsatzStand(): Einsatzstand {
    try {
        const roh = JSON.parse(speicher()?.getItem(EINSATZ_SCHLUESSEL) ?? "null") as Partial<Einsatzstand> | null;
        const zahlen = (liste: unknown) => Array.isArray(liste) ? liste.filter((zahl): zahl is number => typeof zahl === "number") : [];
        return { grenzen: zahlen(roh?.grenzen), bruecken: zahlen(roh?.bruecken) };
    } catch {
        return { grenzen: [], bruecken: [] };
    }
}
/** `false`, wenn das Gerät den Stand nicht festhalten konnte. */
function einsatzSchreiben(stand: Einsatzstand): boolean {
    if (stand.grenzen.length === 0 && stand.bruecken.length === 0) {
        speicher()?.removeItem(EINSATZ_SCHLUESSEL);
        return true;
    }
    return schreibe(speicher(), EINSATZ_SCHLUESSEL, JSON.stringify(stand));
}

/**
 * Wann gearbeitet wurde: erstellte Vordrucke und abgelegte Entwürfe. Wer einen
 * Spruch ablegt, ist im Einsatz, auch wenn noch kein PDF entstanden ist.
 */
function aktivitaet(): { zeit: string }[] {
    let abgelegt: { zeit?: string }[] = [];
    try {
        const roh = JSON.parse(speicher()?.getItem("bnv.ablage.v1") ?? "[]") as unknown;
        abgelegt = Array.isArray(roh) ? roh as { zeit?: string }[] : [];
    } catch {
        abgelegt = [];
    }
    return [...verlauf, ...abgelegt.flatMap(eintrag => eintrag.zeit ? [{ zeit: eintrag.zeit }] : [])];
}

/** Beginn des laufenden Einsatzes (ms). */
function aktuellerEinsatzBeginn(): number {
    return einsatzBeginn(aktivitaet(), einsatzStand());
}

/**
 * Die Einträge des laufenden Einsatzes. Nummern früherer Übungen oder Einsätze
 * auf diesem Gerät sollen weder als doppelt gelten noch übersprungen werden;
 * im selben Einsatz zählen sie, auch über mehrere Tage.
 */
function juengste(): Eintrag[] {
    const beginn = aktuellerEinsatzBeginn();
    return verlauf.filter(eintrag => new Date(eintrag.zeit).getTime() >= beginn);
}

/** Rat für Meldungen über schon erstellte Nummern. */
/** „Nr. 5 liegt in der Ablage“ nur, wenn das Gerät sie behalten konnte. */
function inDerAblage(wer: string): string {
    return speicherZustand() === "ok"
        ? `${wer} liegt in der Ablage.`
        : `${wer} ließ sich nicht ablegen (Speicher des Geräts gesperrt oder voll) und geht beim Neuladen verloren.`;
}

function einsatzRat(mitKnopf = false): string {
    // Mit Knopf endet der Satz auf einen Doppelpunkt: Der Knopf „Neuer Einsatz …“ folgt gleich dahinter.
    return mitKnopf
        ? " Beginnt ein neuer Einsatz oder eine neue Übung:"
        : " Beginnt ein neuer Einsatz oder eine neue Übung: unter „Erstellte Vordrucke“ „Neuer Einsatz“ wählen.";
}

/**
 * Rückmeldung unter den Knöpfen, bei Bedarf mit einem Knopf, der die Aktion
 * zurücknimmt. Er nennt die Aktion und gilt nur, bis wieder getippt wird:
 * danach würde er frisch Geschriebenes verwerfen. Er liegt im Sitzungsspeicher
 * des Tabs und übersteht so ein Neuladen.
 */
interface Zuruecknahme {
    /** Stand der Maske vor der Aktion. */
    stand: Eingabe;
    /** Die Aktion, wie sie auf dem Knopf heißt. */
    aktion: string;
    /** Eigene Beschriftung des Knopfs, sonst „„Aktion“ zurücknehmen (Nr. …)“. */
    beschriftung?: string;
}
const RUECKGAENGIG_SCHLUESSEL = "bnv.rueckgaengig.v2";
let zuruecknahme: Zuruecknahme | null = null;
/** Vorher nimmt der Zurücknehmen-Knopf keine Tipps an (`performance.now()`). */
let zuruecknahmeAb = 0;
try {
    const gespeichert = JSON.parse(tabSpeicher()?.getItem(RUECKGAENGIG_SCHLUESSEL) ?? "null") as Zuruecknahme | null;
    zuruecknahme = gespeichert?.stand && gespeichert.aktion ? gespeichert : null;
} catch {
    zuruecknahme = null;
}
const kurzmeldung = element<HTMLDivElement>("kurzmeldung");
const kurzmeldungRueckgaengig = element<HTMLButtonElement>("kurzmeldung-rueckgaengig");

function zuruecknahmeZeigen(): void {
    const nummer = zuruecknahme?.stand.nummer?.trim();
    const beschriftung = !zuruecknahme
        ? ""
        : zuruecknahme.beschriftung ?? `„${zuruecknahme.aktion}“ zurücknehmen${nummer ? ` (zurück zu Nr. ${nummer})` : ""}`;
    rueckgaengig.hidden = !zuruecknahme || Boolean(document.getElementById("oben-status")?.textContent);
    rueckgaengig.textContent = beschriftung;
    const oben = element<HTMLButtonElement>("oben-rueckgaengig");
    oben.hidden = !zuruecknahme;
    oben.textContent = beschriftung;
    obenZeigen();
    if (zuruecknahme) {
        schreibeImTab(tabSpeicher(), RUECKGAENGIG_SCHLUESSEL, JSON.stringify(zuruecknahme));
    } else {
        tabSpeicher()?.removeItem(RUECKGAENGIG_SCHLUESSEL);
    }
}
/** Die Zurücknehmen-Knöpfe sind in den ersten 1,5 s gesperrt und sehen so aus; ein stummer Tipp ins Leere wäre unehrlich. */
let zuruecknahmeUhr: ReturnType<typeof setTimeout> | undefined;
function zuruecknahmeSperren(): void {
    const knoepfe = [rueckgaengig, element<HTMLButtonElement>("oben-rueckgaengig")];
    // Der Knopf sagt selbst, dass er gleich geht: Ein Tipp ins Leere wäre sonst rätselhaft.
    const texte = knoepfe.map(knopf => knopf.textContent ?? "");
    // aria-disabled statt disabled: Ein gesperrter Knopf schluckt den Tipp sonst stumm, so aber sagt die Kurzmeldung, warum nichts geschah.
    knoepfe.forEach((knopf, index) => {
        knopf.setAttribute("aria-disabled", "true");
        knopf.classList.add("gesperrt");
        knopf.textContent = `${texte[index] ?? ""} (gleich möglich)`;
    });
    clearTimeout(zuruecknahmeUhr);
    zuruecknahmeUhr = setTimeout(() => {
        knoepfe.forEach((knopf, index) => {
            knopf.removeAttribute("aria-disabled");
            knopf.classList.remove("gesperrt");
            // Hat sich der Text inzwischen geändert (neue Aktion), nicht überschreiben.
            if (knopf.textContent === `${texte[index] ?? ""} (gleich möglich)`) {
                knopf.textContent = texte[index] ?? "";
            }
        });
    }, 1_500);
}

/** Der Bereich über der Maske: Rückmeldung nach „Nächster Vordruck“ oder Zurücknehmen und der Weg zurück. */
const obenStatus = element<HTMLSpanElement>("oben-status");
function obenZeigen(): void {
    const bereich = element<HTMLDivElement>("oben-zuruecknahme");
    bereich.hidden = !obenStatus.textContent && !zuruecknahme;
}
zuruecknahmeZeigen();

/** Ob ein Element ganz im sichtbaren Bereich liegt. */
function imBild(knoten: HTMLElement): boolean {
    const rahmen = knoten.getBoundingClientRect();
    return rahmen.height > 0 && rahmen.top >= 0 && rahmen.bottom <= innerHeight;
}

/**
 * Setzt die Rückmeldung. `zurueck`: Stand und Name der Aktion, die sich
 * zurücknehmen lässt; `null` nimmt ein früheres Zurücknehmen weg, „behalten“
 * lässt es stehen. `oben`: Der Blick ist oben über der Maske (nach „Nächster
 * Vordruck“ oder dem Zurücknehmen von dort); die Rückmeldung steht dann
 * zusätzlich dort, und die Seite rollt nicht. Sonst wird sie ins Bild geholt,
 * falls sie knapp darunter liegt.
 */
function meldeStatus(text: string, zurueck: Zuruecknahme | null | "behalten" = null, oben = false): void {
    // Steht die Rückmeldung oben, nicht noch einmal unten: am Telefon stünde sie sonst doppelt.
    statusText.textContent = oben ? "" : text;
    obenStatus.textContent = oben ? text : "";
    if (zurueck !== "behalten") {
        zuruecknahme = zurueck;
        // So lange wie die Sperre gegen Doppeltipp auf den Knöpfen: Der Zurücknehmen-Knopf
        // erscheint oft genau dort, wo eben „Nächster Vordruck“ lag.
        zuruecknahmeAb = zurueck ? performance.now() + 1_500 : 0;
        zuruecknahmeZeigen();
        if (zurueck) {
            zuruecknahmeSperren();
            // Der Knopf darf nicht halb unter dem Bildrand liegen.
            for (const knopf of [rueckgaengig, element<HTMLButtonElement>("oben-rueckgaengig")]) {
                if (!knopf.hidden && !imBild(knopf)) {
                    knopf.scrollIntoView({ block: "nearest" });
                    break;
                }
            }
        }
    }
    obenZeigen();
    if (oben) {
        kurzmeldungSchliessen();
    } else {
        kurzmeldungSchliessen();
        if (text && !imBild(statusText)) {
            statusText.parentElement?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }
}

/**
 * Kurzmeldung am unteren Bildschirmrand, über der Sprungleiste: für kurze
 * Rückmeldungen dort, wo der Blick nicht auf der Statuszeile ist (Wechsel der
 * Richtung, Doppeltipp). Sie schließt beim ersten Tippen in der Maske und beim
 * Reiterwechsel.
 */
let kurzmeldungUhr: ReturnType<typeof setTimeout> | undefined;
// Die Kurzmeldung ist Anzeige: Ein Tipp darauf schließt sie nur und löst nichts darunter aus.
// Nur mit `mitZuruecknahme` trägt sie einen eigenen Knopf (Rücknahme, die sonst weit oben läge);
// der ist die ersten 1,5 s gesperrt, damit der Tipp, der sie ausgelöst hat, ihn nicht trifft.
let kurzmeldungKnopfUhr: ReturnType<typeof setTimeout> | undefined;
function zeigeKurzmeldung(text: string, mitZuruecknahme = false, oben = false): void {
    element<HTMLSpanElement>("kurzmeldung-text").textContent = text;
    clearTimeout(kurzmeldungKnopfUhr);
    kurzmeldungRueckgaengig.hidden = !mitZuruecknahme;
    kurzmeldung.classList.toggle("mit-knopf", mitZuruecknahme);
    // Oben, wenn das Bedienelement, um das es geht, unten im Bild liegt (der Richtungsschalter): Sonst deckte sie es zu.
    kurzmeldung.classList.toggle("oben", oben);
    if (mitZuruecknahme) {
        // Wie bei den anderen Zurücknehmen-Knöpfen: tippbar, aber gesperrt und meldend. Die Beschriftung bleibt
        // gleich lang, damit „OK“ und „Zurücknehmen“ nicht den Platz tauschen, während ein Finger darüber ist.
        kurzmeldungRueckgaengig.setAttribute("aria-disabled", "true");
        kurzmeldungRueckgaengig.classList.add("gesperrt");
        kurzmeldungRueckgaengig.textContent = "Zurücknehmen";
        kurzmeldungKnopfUhr = setTimeout(() => {
            kurzmeldungRueckgaengig.removeAttribute("aria-disabled");
            kurzmeldungRueckgaengig.classList.remove("gesperrt");
            kurzmeldungRueckgaengig.textContent = "Zurücknehmen";
        }, 1_500);
    } else {
        kurzmeldungRueckgaengig.removeAttribute("aria-disabled");
        kurzmeldungRueckgaengig.classList.remove("gesperrt");
    }
    kurzmeldung.hidden = false;
    // Über der Sprungleiste statt auf ihr: Sonst braucht der Sprung zwei Tipps.
    const leiste = document.querySelector<HTMLElement>(".sprungleiste");
    const rahmen = leiste?.getBoundingClientRect();
    const leisteUnten = leiste && rahmen && getComputedStyle(leiste).position === "sticky" && getComputedStyle(leiste).visibility !== "hidden"
        && rahmen.height > 0 && rahmen.bottom >= innerHeight - 2;
    kurzmeldung.style.bottom = leisteUnten && rahmen ? `${Math.round(innerHeight - rahmen.top + 8)}px` : "";
    clearTimeout(kurzmeldungUhr);
    kurzmeldungUhr = setTimeout(kurzmeldungSchliessen, mitZuruecknahme ? 15_000 : 7_000);
}
function kurzmeldungSchliessen(): void {
    clearTimeout(kurzmeldungUhr);
    kurzmeldung.hidden = true;
}
element<HTMLButtonElement>("oben-rueckgaengig").addEventListener("click", () => zuruecknehmen(true));
// Ein Tipp auf den noch gesperrten Knopf wird gemeldet, nicht verschluckt.
for (const knopf of [rueckgaengig, element<HTMLButtonElement>("oben-rueckgaengig")]) {
    knopf.addEventListener("click", ereignis => {
        if (knopf.getAttribute("aria-disabled") === "true") {
            ereignis.stopImmediatePropagation();
            // Am Knopf selbst sagen, nicht in einer Meldung, die woanders im Bild steht.
            const vorher = knopf.textContent;
            knopf.textContent = "Gleich möglich: noch einmal tippen";
            setTimeout(() => { knopf.textContent = vorher; }, 900);
        }
    }, true);
}
// Ein Tipp auf einen gesperrten Zurücknehmen-Knopf nimmt dem Eingabefeld nicht den Fokus (die Tastatur bliebe sonst nicht).
for (const knopf of [rueckgaengig, element<HTMLButtonElement>("oben-rueckgaengig"), kurzmeldungRueckgaengig]) {
    knopf.addEventListener("pointerdown", ereignis => {
        if (knopf.getAttribute("aria-disabled") === "true") {
            ereignis.preventDefault();
        }
    });
}
kurzmeldungRueckgaengig.addEventListener("click", ereignis => {
    // Der Tipp auf den Knopf soll die Meldung nicht über den Container schließen.
    ereignis.stopPropagation();
    if (kurzmeldungRueckgaengig.getAttribute("aria-disabled") === "true") {
        // Der Tipp kam zu früh (er gilt oft dem Knopf, der eben die Meldung ausgelöst hat): am Knopf selbst sagen und
        // die Meldung samt Knopf stehen lassen; ein Ersatz der Meldung nähme den Rückweg weg.
        kurzmeldungRueckgaengig.textContent = "Gleich möglich: noch einmal tippen";
        clearTimeout(kurzmeldungUhr);
        kurzmeldungUhr = setTimeout(kurzmeldungSchliessen, 15_000);
        return;
    }
    kurzmeldungSchliessen();
    rueckgaengig.click();
    // Wohin die Seite auch springt: Die Bestätigung kommt als Kurzmeldung mit.
    const bestaetigung = obenStatus.textContent || statusText.textContent;
    if (bestaetigung) {
        zeigeKurzmeldung(bestaetigung, false);
    }
});
element<HTMLButtonElement>("kurzmeldung-schliessen").addEventListener("click", kurzmeldungSchliessen);
// Ein Tipp auf die Meldung soll den Fokus (und die Tastatur) im Feld lassen.
kurzmeldung.addEventListener("pointerdown", ereignis => ereignis.preventDefault());
kurzmeldung.addEventListener("click", ereignis => {
    ereignis.stopPropagation();
    kurzmeldungSchliessen();
});

rueckgaengig.addEventListener("click", () => zuruecknehmen(false));
/** `oben`: über der Maske getippt; dort bleibt der Blick, die Seite rollt nicht. */
function zuruecknehmen(oben: boolean): void {
    if (!zuruecknahme) {
        return;
    }
    // Der Knopf erscheint oft dort, wo eben getippt wurde: Der zweite Tipp eines
    // Doppeltipps darf die Aktion nicht gleich wieder zurücknehmen.
    // Still: Der Knopf steht weiter da, und der Tipp galt meist einer anderen Handlung.
    if (performance.now() < zuruecknahmeAb) {
        return;
    }
    const { stand, aktion } = zuruecknahme;
    // „Angaben wieder leeren“ macht die Wiederherstellung rückgängig: Das ist kein „Doch wieder Nr. …“.
    const wiederLeeren = aktion === "Zurücknehmen" && Boolean(zuruecknahme.beschriftung?.startsWith("Angaben wieder leeren"));
    const jetzt = maskeLesen();
    // Der zurückgenommene Stand ist wieder in der Maske; als Ablage-Eintrag wäre er doppelt.
    ablageEntfernen(stand);
    // „Doch wieder“ verwirft den eben zurückgeholten Stand ein zweites Mal: Er kommt
    // wie beim ersten Mal in die Ablage, nicht nur in den verfallenden Knopf.
    const abgelegt = aktion === "Zurücknehmen" && !wiederLeeren && Boolean((jetzt.inhalt ?? "").trim()) && !istErstellt(jetzt);
    const heraus = abgelegt ? ablegen(jetzt, "verworfen") : "";
    entwurfHinweis.hidden = true;
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(stand);
    // Die Markierung „geleert“ gehörte zum Stand davor: Nach dem Zurücknehmen sind die Felder wieder gefüllt.
    frischGeleert.clear();
    for (const markiert of maske.querySelectorAll(".geleert")) {
        markiert.classList.remove("geleert");
    }
    // „Angaben wieder leeren“: Die Felder, die wieder leer sind, tragen die Markierung wieder.
    if (wiederLeeren) {
        for (const spalte of SPALTEN) {
            if ((jetzt[spalte.schluessel] ?? "").trim() && !(stand[spalte.schluessel] ?? "").trim()) {
                frischGeleert.add(spalte.schluessel);
                feldRahmen(spalte.schluessel)?.classList.add("geleert");
            }
        }
    }
    entwurfSpeichern();
    weitereZaehlen();
    angefasstZuruecksetzen();
    planeVorschau();
    // Das Zurücknehmen lässt sich seinerseits zurücknehmen: nichts geht verloren.
    const zurueckNr = jetzt.nummer?.trim();
    meldeStatus((wiederLeeren
        ? `Angaben wieder geleert${stand.nummer?.trim() ? ` (Nr. ${stand.nummer.trim()})` : ""}.${abgelegt ? ` ${inDerAblage(zurueckNr ? `Nr. ${zurueckNr}` : "Der vorige Stand")}` : ""}`
        : aktion === "Zurücknehmen"
        ? `Wieder der Stand${stand.nummer?.trim() ? ` mit Nr. ${stand.nummer.trim()}` : ""}.${abgelegt ? ` ${inDerAblage(zurueckNr ? `Nr. ${zurueckNr}` : "Der vorige Stand")}` : ""}`
        : /leeren/i.test(aktion)
            ? `Geleerte Angaben wiederhergestellt${stand.nummer?.trim() ? ` (Nr. ${stand.nummer.trim()})` : ""}.`
            : `„${aktion}“ zurückgenommen, voriger Stand${stand.nummer?.trim() ? ` (Nr. ${stand.nummer.trim()})` : ""} wiederhergestellt.`) + heraus,
        weichtAb(jetzt) ? wiederLeeren ? { stand: jetzt, aktion: "Leeren", beschriftung: "Geleerte Angaben wiederherstellen" } : { stand: jetzt, aktion: "Zurücknehmen", beschriftung: /leeren/i.test(aktion) ? `Angaben wieder leeren${zurueckNr ? ` (zurück zu Nr. ${zurueckNr})` : ""}` : zurueckNr ? `Doch wieder Nr. ${zurueckNr}` : "Doch wieder den Stand davor" } : null, oben);
    if (oben) {
        // Oben weiterschreiben: ins erste Feld, ohne die Seite zu bewegen.
        (maske.elements.namedItem("nummer") as HTMLInputElement | null)?.focus({ preventScroll: true });
    }
}
/**
 * Ablage für nie erstellte Vordrucke, die „Nächster Vordruck“, „Felder leeren“
 * oder ein Zurückholen aus der Maske genommen hat. Bis zu zehn, im
 * Gerätespeicher: Sie überstehen Tippen, Neuladen und einen neuen Tab. Ein
 * Stand verschwindet aus der Ablage, wenn er zurückgeholt oder genau so
 * erstellt wird; ein anderer Spruch mit derselben Nr. lässt ihn liegen.
 */
interface Abgelegt {
    eingabe: Eingabe;
    /** Wie er aus der Maske kam: „verworfen“, „geleert“ oder „getauscht“. */
    wie: string;
    zeit: string;
}
const ABLAGE_SCHLUESSEL = "bnv.ablage.v1";
const ABLAGE_HOECHSTENS = 10;
function ablageLesen(): Abgelegt[] {
    try {
        const daten = JSON.parse(speicher()?.getItem(ABLAGE_SCHLUESSEL) ?? "[]") as unknown;
        return Array.isArray(daten) ? daten as Abgelegt[] : [];
    } catch {
        return [];
    }
}
/** Schreibt die Ablage; ergibt die Einträge, die dafür herausgefallen sind. */
function ablageSchreiben(liste: readonly Abgelegt[]): Abgelegt[] {
    const behalten = liste.slice(-ABLAGE_HOECHSTENS);
    if (behalten.length > 0) {
        schreibe(speicher(), ABLAGE_SCHLUESSEL, JSON.stringify(behalten));
    } else {
        speicher()?.removeItem(ABLAGE_SCHLUESSEL);
    }
    ablageZeigen();
    return liste.slice(0, liste.length - behalten.length);
}
/** „Nr. 40 („Lage Nord …“)“ für Rückfragen und Meldungen. */
function ablageBeschreiben(eintrag: Abgelegt): string {
    const nummer = eintrag.eingabe.nummer?.trim();
    return `${nummer ? `Nr. ${nummer}` : "ohne Nr."} („${kurz(eintrag.eingabe.inhalt ?? "", 30)}“)`;
}
/**
 * Legt einen nicht erstellten Stand mit Text ab; derselbe Stand liegt nur
 * einmal darin. Ergibt einen Satz, wenn dafür der älteste Eintrag herausfällt.
 */
function ablegen(eingabe: Eingabe, wie: string): string {
    if (!(eingabe.inhalt ?? "").trim() || istErstellt(eingabe)) {
        return "";
    }
    const kennung = verlaufKennung(eingabe);
    const raus = ablageSchreiben([...ablageLesen().filter(eintrag => verlaufKennung(eintrag.eingabe) !== kennung),
        { eingabe, wie, zeit: new Date().toISOString() }]);
    return raus[0] ? ` Die Ablage fasst ${ABLAGE_HOECHSTENS}; dafür ist der älteste abgelegte Vordruck ${ablageBeschreiben(raus[0])} herausgefallen.` : "";
}
/** Für Rückfragen vor dem Ablegen: was dabei herausfiele; leer, wenn Platz ist. */
function ablageVollSatz(eingabe: Eingabe): string {
    const kennung = verlaufKennung(eingabe);
    const liste = ablageLesen().filter(eintrag => verlaufKennung(eintrag.eingabe) !== kennung);
    return liste.length >= ABLAGE_HOECHSTENS && liste[0]
        ? ` Die Ablage ist voll: Der älteste abgelegte Vordruck ${ablageBeschreiben(liste[0])} fällt dafür heraus.`
        : "";
}
/**
 * Nimmt genau diesen Stand aus der Ablage. Andere Stände mit derselben Nr.
 * bleiben: Sie können ein ganz anderer Spruch sein.
 */
function ablageEntfernen(eingabe: Eingabe): void {
    const kennung = verlaufKennung(eingabe);
    const vorher = ablageLesen();
    const nachher = vorher.filter(eintrag => verlaufKennung(eintrag.eingabe) !== kennung);
    if (nachher.length !== vorher.length) {
        ablageSchreiben(nachher);
    }
}
const ablageBereich = element<HTMLDivElement>("verworfen");
function ablageZeigen(): void {
    const liste = ablageLesen();
    ablageBereich.hidden = liste.length === 0;
    const WIE: Record<string, string> = {
        verworfen: "mit „Nächster Vordruck“ abgelegt",
        geleert: "mit „Felder leeren“ abgelegt",
        getauscht: "beim Zurückholen abgelegt",
        "anderes Fenster": "beim Konflikt zweier Fenster abgelegt"
    };
    const heute = new Date().toDateString();
    const knoepfe = [...liste].reverse().map(eintrag => {
        const zeit = new Date(eintrag.zeit);
        // Ein Eintrag von gestern soll nicht wie einer von eben aussehen.
        const wann = `${zeit.toDateString() === heute ? "" : `${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, `}${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
        const knopf = document.createElement("button");
        knopf.type = "button";
        knopf.className = "link";
        // Ist die Nr. inzwischen mit einem anderen Stand erstellt, soll der Eintrag nicht wie offen aussehen.
        const nummer = (eintrag.eingabe.nummer ?? "").trim();
        const anders = nummer && mitNummer(juengste(), nummer).length > 0 ? " (diese Nr. ist inzwischen mit anderem Stand erstellt)" : "";
        knopf.textContent = `${ablageBeschreiben(eintrag)} zurückholen; ${WIE[eintrag.wie] ?? eintrag.wie} ${wann}${anders}`;
        // Am Stand erkannt, nicht an der Stelle: Ein anderes Fenster kann die Ablage inzwischen geändert haben.
        const kennung = verlaufKennung(eintrag.eingabe);
        knopf.addEventListener("click", () => void zurueckholen(kennung));
        const zeile = document.createElement("li");
        zeile.append(knopf);
        return zeile;
    });
    const titel = `Ablage: ${liste.length} nicht ${liste.length === 1 ? "erstellter Vordruck" : "erstellte Vordrucke"}, zurückholbar`;
    const punkte = document.createElement("ul");
    punkte.append(...knoepfe);
    // Ab vier Einträgen zugeklappt: Zehn Links würden die Seite um einen Bildschirm verlängern.
    if (liste.length > 3) {
        const klappe = document.createElement("details");
        klappe.open = ablageBereich.querySelector("details")?.open ?? false;
        const kopf = document.createElement("summary");
        kopf.textContent = titel;
        klappe.append(kopf, punkte);
        ablageBereich.replaceChildren(klappe);
    } else {
        const kopf = document.createElement("p");
        kopf.className = "nebentext";
        kopf.textContent = `${titel}:`;
        ablageBereich.replaceChildren(kopf, punkte);
    }
    // Oben über der Maske ein Verweis: Die Ablage selbst liegt unter den Knöpfen.
    // Nur für Einträge des laufenden Einsatzes; Reste einer früheren Übung schieben die Maske nicht nach unten.
    const oben = element<HTMLButtonElement>("oben-ablage");
    const beginn = aktuellerEinsatzBeginn();
    const aktuell = liste.filter(eintrag => new Date(eintrag.zeit).getTime() >= beginn).length;
    if (oben.parentElement) {
        oben.parentElement.hidden = aktuell === 0;
    }
    oben.textContent = `${titel} ↓`;
}
element<HTMLButtonElement>("oben-ablage").addEventListener("click", () => {
    ablageBereich.querySelector("details")?.setAttribute("open", "");
    ablageBereich.scrollIntoView({ block: "center", behavior: "smooth" });
    ablageBereich.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
});
ablageZeigen();
/** Stand des anderen Fensters (ohne Stempel), den dieses Fenster mit „Hier weiterarbeiten“ angenommen hat: Er löst keinen neuen Hinweis aus. */
let fremdAkzeptiert = "";
/** Stand von hier, der beim Konflikt schon in die Ablage gelegt wurde; er wird beim Weitertippen nachgeführt. */
let konfliktAbgelegt: Eingabe | null = null;
/** Der Entwurf des anderen Fensters, wie er zuletzt auf dem Gerät lag. */
let konfliktFremd: Entwurf | null = null;
const fensterHinweis = element<HTMLDivElement>("fenster-hinweis");
/** Kurz für den Hinweis: „Nr. 12, „Lage ruhig …““ oder „leer“. */
function entwurfKurz(eingabe: Eingabe): string {
    const nummer = eingabe.nummer?.trim();
    const text = (eingabe.inhalt ?? "").trim();
    return nummer || text ? `${nummer ? `Nr. ${nummer}` : "ohne Nr."}${text ? `, „${kurz(text, 28)}“` : ", ohne Text"}` : "leer";
}
function obenHinweiseAktualisieren(): void {
    obenHinweiseSichtbar();
}
/** Text des Hinweises und Stand von hier in der Ablage, nachgeführt bei jeder Änderung hier oder im anderen Fenster. */
function konfliktNachfuehren(): void {
    if (!fensterKonflikt || !konfliktFremd) {
        return;
    }
    const hier = maskeLesen();
    const sichern = Boolean((hier.inhalt ?? "").trim()) && !istErstellt(hier);
    if (sichern && JSON.stringify(konfliktAbgelegt) !== JSON.stringify(hier)) {
        // Derselbe Stand liegt nur einmal in der Ablage: der vorige Zwischenstand von hier wird ersetzt, nicht ergänzt.
        if (konfliktAbgelegt) {
            ablageEntfernen(konfliktAbgelegt);
        }
        ablegen(hier, "anderes Fenster");
        konfliktAbgelegt = hier;
    }
    element<HTMLParagraphElement>("fenster-text").textContent = `Anderes Fenster: ${entwurfKurz(ohneStempel(konfliktFremd))}. Hier: ${entwurfKurz(hier)}.${sichern ? " Der Stand von hier liegt in der Ablage." : ""}`;
}
/** Ein anderes Fenster hat den Entwurf geändert: nicht modal, damit nichts getippt Eingegebenes in einen Dialog läuft. */
function fensterGeaendert(fremd: Entwurf): void {
    konfliktFremd = fremd;
    fensterKonflikt = true;
    konfliktNachfuehren();
    fensterHinweis.hidden = false;
    obenHinweiseAktualisieren();
    entwurfSpeichern();
}
function fensterEntscheiden(laden: boolean): void {
    fensterKonflikt = false;
    fensterHinweis.hidden = true;
    obenHinweiseAktualisieren();
    let fremd: Entwurf | null = null;
    try {
        fremd = JSON.parse(speicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Entwurf | null;
    } catch {
        fremd = null;
    }
    const abgelegtHier = konfliktAbgelegt;
    konfliktAbgelegt = null;
    konfliktFremd = null;
    if (!laden) {
        // Der überschriebene Stand des anderen Fensters bleibt in der Ablage, bevor dieses Fenster wieder schreibt.
        let heraus = "";
        if (fremd && weichtAb(ohneStempel(fremd)) && (ohneStempel(fremd).inhalt ?? "").trim()) {
            heraus = ablegen(ohneStempel(fremd), "anderes Fenster");
            fremdAkzeptiert = JSON.stringify(ohneStempel(fremd));
        }
        letzterEntwurfStand = "";
        entwurfSpeichern();
        meldeStatus("", null, true);
        zeigeKurzmeldung(`Dieses Fenster schreibt wieder.${heraus || (fremdAkzeptiert ? " Der Stand des anderen Fensters liegt in der Ablage." : "")}`, false);
        return;
    }
    if (!fremd) {
        return;
    }
    // Was hier steht und nicht erstellt ist, geht in die Ablage (beim Konflikt schon geschehen): nichts geht verloren.
    const hier = maskeLesen();
    const abgelegt = Boolean((hier.inhalt ?? "").trim()) && !istErstellt(hier);
    if (abgelegt && JSON.stringify(abgelegtHier) !== JSON.stringify(hier)) {
        if (abgelegtHier) {
            ablageEntfernen(abgelegtHier);
        }
        ablegen(hier, "getauscht");
    }
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(ohneStempel(fremd));
    letzterEntwurfStand = "";
    entwurfSpeichern();
    weitereZaehlen();
    planeVorschau();
    // Am Bildrand: Die Zeile oben in der Maske liegt außer Sicht, wenn weiter unten getippt wird.
    meldeStatus("", null, true);
    zeigeKurzmeldung(`Entwurf des anderen Fensters geladen.${abgelegt ? ` ${inDerAblage(hier.nummer?.trim() ? `Nr. ${hier.nummer.trim()} von hier` : "Der Stand von hier")}` : ""}`, false);
}
element<HTMLButtonElement>("fenster-laden").addEventListener("click", () => fensterEntscheiden(true));
element<HTMLButtonElement>("fenster-bleiben").addEventListener("click", () => fensterEntscheiden(false));
// Andere Fenster mit derselben App ändern Ablage und Liste mit.
addEventListener("storage", ereignis => {
    if (ereignis.key === ABLAGE_SCHLUESSEL || ereignis.key === null) {
        ablageZeigen();
    }
    if (ereignis.key === EINSATZ_SCHLUESSEL || ereignis.key === "bnv.verlauf.v1" || ereignis.key === null) {
        verlauf = ladeVerlauf();
        verlaufZeigen();
    }
    // Zwei offene Fenster überschreiben sich: Hat dieses Fenster etwas stehen und ein anderes schreibt einen anderen Entwurf,
    // kommt ein Hinweis mit Wahl (nicht modal). Ein bloßes Neuschreiben desselben Inhalts zählt nicht.
    if (ereignis.key === ENTWURF_SCHLUESSEL && ereignis.newValue) {
        try {
            const fremd = JSON.parse(ereignis.newValue) as Entwurf;
            if (fensterKonflikt) {
                // Der andere tippt weiter: Der Hinweis zeigt den neuen Stand, nicht den vom ersten Mal.
                if (fremd._fenster !== FENSTER_KENNUNG) {
                    konfliktFremd = fremd;
                    konfliktNachfuehren();
                }
            } else if (fremd._fenster !== FENSTER_KENNUNG && weichtAb(maskeLesen())
                && JSON.stringify(ohneStempel(fremd)) !== JSON.stringify(maskeLesen())
                && JSON.stringify(ohneStempel(fremd)) !== fremdAkzeptiert) {
                fensterGeaendert(fremd);
            }
        } catch {
            // Kaputter Entwurf: kein Hinweis.
        }
    }
    // „Einsatz fortsetzen“ in einem anderen Fenster hat die Nr. zurückgegeben: Dieses Fenster zieht nach, solange noch kein Text darin steht.
    if (ereignis.key === EINSATZ_NUMMER_SCHLUESSEL && ereignis.newValue === null && ereignis.oldValue) {
        try {
            const gemerkt = JSON.parse(ereignis.oldValue) as { gesetzt?: string; vorher?: string };
            const jetzt = maskeLesen();
            if (gemerkt.gesetzt && gemerkt.vorher && (jetzt.nummer ?? "").trim() === gemerkt.gesetzt && !(jetzt.inhalt ?? "").trim()) {
                setzeFeld("nummer", gemerkt.vorher);
                zeigeKurzmeldung(`Der Einsatz wurde in einem anderen Fenster fortgesetzt: Die Maske steht wieder auf Nr. ${gemerkt.vorher}.`, false);
            }
        } catch {
            // Kaputter Merker: nichts zurückgeben.
        }
    }
});

/**
 * Holt einen abgelegten Stand in die Maske. Was dort stand und nicht erstellt
 * ist, kommt seinerseits in die Ablage: nichts geht verloren, auch nicht beim
 * Weitertippen.
 */
async function zurueckholen(kennung: string): Promise<void> {
    const eintrag = ablageLesen().find(abgelegt => verlaufKennung(abgelegt.eingabe) === kennung);
    if (!eintrag) {
        ablageZeigen();
        meldeStatus("Dieser Vordruck liegt nicht mehr in der Ablage; vermutlich wurde er in einem anderen Fenster zurückgeholt oder erstellt.", "behalten");
        return;
    }
    const geholt = eintrag.eingabe;
    const jetzt = maskeLesen();
    const jetztNr = jetzt.nummer?.trim();
    const jetztAblegen = Boolean((jetzt.inhalt ?? "").trim()) && !istErstellt(jetzt);
    if (jetztAblegen && !await frage(`Vordruck${geholt.nummer?.trim() ? ` Nr. ${geholt.nummer.trim()}` : ""} zurückholen? Die jetzigen Eingaben${jetztNr ? ` (Nr. ${jetztNr})` : ""} kommen dafür in die Ablage und lassen sich ebenso zurückholen.`, "Zurückholen")) {
        return;
    }
    // Während der Rückfrage kann ein anderes Fenster ihn genommen haben.
    if (!ablageLesen().some(abgelegt => verlaufKennung(abgelegt.eingabe) === kennung)) {
        ablageZeigen();
        meldeStatus("Dieser Vordruck liegt nicht mehr in der Ablage; vermutlich wurde er in einem anderen Fenster zurückgeholt oder erstellt.", "behalten");
        return;
    }
    ablageEntfernen(geholt);
    const heraus = jetztAblegen ? ablegen(jetzt, "getauscht") : "";
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(geholt);
    entwurfSpeichern();
    weitereZaehlen();
    angefasstZuruecksetzen();
    planeVorschau();
    entwurfHinweis.hidden = true;
    meldeStatus(`Vordruck${geholt.nummer?.trim() ? ` Nr. ${geholt.nummer.trim()}` : ""} zurückgeholt.${jetztAblegen ? ` ${jetztNr ? `Nr. ${jetztNr}` : "Der vorige Stand"} liegt jetzt in der Ablage.` : ""}${heraus}`);
}

let vorschauUrl = "";
let vorschauTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Angaben, die nach einer neuen Nr. noch unverändert vom zuletzt erstellten
 * Vordruck stehen und seitdem nicht angefasst wurden, als Satz mit Werten;
 * leer, wenn es keine gibt. Was von Nachricht zu Nachricht gleich bleibt,
 * zählt nicht.
 */
function altwerte(eingabe: Eingabe): string {
    const felder = altFelder(eingabe);
    if (felder.length === 0) {
        return "";
    }
    // Die ersten vier mit Wert, der Rest nur mit Namen: so bleibt der Satz lesbar und nennt doch alle.
    const werte = felder.slice(0, 4).map(spalte => `${spalte.titel} „${kurz(eingabe[spalte.schluessel] ?? "", 20)}“`);
    const liste = felder.length > 4 ? `${werte.join(", ")} sowie ${aufzaehlen(felder.slice(4).map(spalte => spalte.titel))}` : aufzaehlen(werte);
    return `Von Nr. ${verlauf.at(-1)?.eingabe.nummer?.trim() ?? ""} stehen geblieben: ${liste}. Bitte prüfen; beim Erzeugen lassen sie sich leeren`;
}

/**
 * Die Felder hinter `altwerte`. Bei einem Eingang zählen auch Absender, Zeichen
 * und Funktion: Sie gehören der sendenden Stelle und wechseln mit jedem Spruch.
 * Die Gegenstelle zählt in beiden Richtungen.
 */
function altFelder(eingabe: Eingabe): typeof SPALTEN[number][] {
    const zuletzt = verlauf.at(-1)?.eingabe;
    const nummer = eingabe.nummer?.trim() ?? "";
    if (!zuletzt || !nummer || !zuletzt.nummer?.trim() || nummer === zuletzt.nummer.trim()) {
        return [];
    }
    // Dieselbe Gegenstelle bei einem Eingang: Absender, Zeichen und Funktion
    // dürfen gleich sein, es sendet dieselbe Stelle noch einmal.
    const gleicheStelle = (eingabe.empfaenger ?? "").trim() === (zuletzt.empfaenger ?? "").trim();
    const behalten = eingabe.richtung === "Eingang" && !gleicheStelle ? BEHALTEN_EINGANG : BEHALTEN_AUSGANG;
    return SPALTEN.filter(spalte => !behalten.includes(spalte.schluessel)
        // Die Gegenstelle hat eine eigene Rückfrage (gleicheStelle); die Anschrift zählt
        // nur, wenn die Gegenstelle gewechselt hat. Der Betreff gehört zum Spruch:
        // Steht er unverändert, ist er meist stehen geblieben. Ein Datum von heute
        // ist beim nächsten Spruch desselben Tages richtig.
        && !["nummer", "inhalt", "empfaenger"].includes(spalte.schluessel)
        && !(spalte.schluessel === "anschrift" && gleicheStelle)
        && !(spalte.schluessel.endsWith("Datum") && eingabe[spalte.schluessel]?.trim() === heuteDatum())
        && !angefasst.has(spalte.schluessel)
        && (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? "")
        && eingabe[spalte.schluessel] === zuletzt[spalte.schluessel]);
}

/** Vermerke, die nicht zur gewählten Richtung passen, als Sätze; auch für die Rückfrage. */
function vermerkWiderspruch(eingabe: Eingabe): string[] {
    if (optionen().vordruck === "meldung") {
        return [];
    }
    const vermerk = (gruppe: string) => ["Datum", "Uhrzeit", "Hdz"].some(teil => (eingabe[`${gruppe}${teil}` as Schluessel] ?? "").trim());
    return [
        eingabe.richtung === "Eingang" && (vermerk("annahme") || vermerk("befoerderung")) ? "Richtung Eingang, aber Annahme- oder Beförderungsvermerk ausgefüllt; die gehören zum Ausgang" : "",
        eingabe.richtung === "Ausgang" && vermerk("aufnahme") ? "Richtung Ausgang, aber Aufnahmevermerk ausgefüllt; der gehört zum Eingang" : ""
    ].filter(Boolean);
}

/** Heute als „TT.MM.“, wie es „Jetzt“ bei den Vermerken einträgt. */
function heuteDatum(): string {
    const jetzt = new Date();
    return `${String(jetzt.getDate()).padStart(2, "0")}.${String(jetzt.getMonth() + 1).padStart(2, "0")}.`;
}

/** Liest die Maske und hält Fehler- und Längenhinweise aktuell. */
function einzelPruefen() {
    const eingabe = maskeLesen();
    const { daten, fehler, hinweise } = zuVordruckDaten(eingabe);
    richtungPruefen();
    const sichtbareFehler = eigeneFehler(fehler, optionen().vordruck);
    einzelnFehler.hidden = sichtbareFehler.length === 0;
    einzelnFehler.textContent = sichtbareFehler.join(" · ");
    // Bei Eingang den Aufnahmevermerk hervorheben, bei Ausgang Annahme und Beförderung.
    weitere.dataset["richtung"] = eingabe.richtung ?? "";
    maske.classList.toggle("ohne-text", !daten.inhalt);
    // Oben, was falsch gedruckt würde; unten, was nur noch fehlt.
    const wichtig: string[] = [];
    const fehlt: string[] = [];
    const frueher = mitNummer(juengste(), daten.nummer).filter(eintrag => JSON.stringify(eintrag.eingabe) !== JSON.stringify(eingabe));
    const letzter = frueher.at(-1);
    if (letzter) {
        const zeit = new Date(letzter.zeit);
        const tag = zeit.toDateString() === new Date().toDateString()
            ? "heute"
            : `am ${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
        const uhrzeit = zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        // Gleiche Nr. und Gegenstelle: eher eine Korrektur derselben Nachricht als eine doppelte Nummer.
        (letzter.eingabe.empfaenger ?? "") === (eingabe.empfaenger ?? "")
            ? hinweise.push(`Korrektur von Nr. ${daten.nummer}? Die Nummer wurde schon ${tag} um ${uhrzeit} Uhr erstellt.${einsatzRat(true)}`)
            : wichtig.push(`Nr. ${daten.nummer} wurde schon ${tag} um ${uhrzeit} Uhr erstellt, ${letzter.eingabe.empfaenger ? `mit Gegenstelle ${letzter.eingabe.empfaenger}` : "ohne Gegenstelle"}.${einsatzRat(true)}`.replace(/\.$/, ""));
    }
    const alt = altwerte(eingabe);
    if (alt) {
        wichtig.push(alt);
    }
    const stelle = gleicheStelle(eingabe);
    if (stelle) {
        hinweise.push(stelle.replace(/\?$/, "? Beim Erzeugen kommt dazu eine Rückfrage"));
    }
    // Ein Ausgang mit fremdem Absender fällt sonst erst beim Empfänger auf.
    const station = eigeneStation();
    const absender = (eingabe.absender ?? "").trim();
    if (eingabe.richtung === "Ausgang" && absender && (station?.absender ?? "").trim() && absender !== station?.absender?.trim()) {
        hinweise.push(`Absender „${kurz(absender, 40)}“ ist nicht die eigene Station („${kurz(station?.absender ?? "", 40)}“, gemerkt beim letzten Ausgang)`);
    }
    const gekuerzteNamen = gekuerzteEinzeln(daten, fehler);
    const gekuerzt = gekuerztSatz(gekuerzteNamen);
    if (gekuerzt) {
        wichtig.push(gekuerzt);
    }
    // Ein Empfängerfeld im Verteiler, das auf dem Bogen gekürzt würde, schon beim Tippen kennzeichnen.
    let zuLangGeaendert = false;
    for (const feld of maske.querySelectorAll<HTMLInputElement>("input.verteiler-text")) {
        const titel = SPALTEN.find(spalte => spalte.schluessel === feld.name)?.titel ?? "";
        const zuLang = gekuerzteNamen.includes(titel);
        feld.classList.toggle("zu-lang-feld", zuLang);
        const wort = feld.nextElementSibling;
        if (wort instanceof HTMLElement && wort.classList.contains("verteiler-wort")) {
            wort.classList.toggle("aus", !zuLang);
        }
        zuLangGeaendert ||= zuLang !== (wort instanceof HTMLElement && wort.dataset["war"] === "1");
        if (wort instanceof HTMLElement) {
            wort.dataset["war"] = zuLang ? "1" : "0";
        }
    }
    // Die Zeile „Empfänger eingetragen“ nennt die Kürzung mit.
    if (zuLangGeaendert) {
        weitereZaehlen();
    }
    // Dieselbe Nr. in einem früheren Einsatz: kein Fehler, aber sichtbar, falls der Einsatz weiterläuft.
    if (daten.nummer && !letzter) {
        const beginn = aktuellerEinsatzBeginn();
        const frueherer = mitNummer(verlauf.filter(eintrag => new Date(eintrag.zeit).getTime() < beginn), daten.nummer).at(-1);
        if (frueherer) {
            // Der Knopf setzt den vorigen Einsatz fort; er gehört nur zum Satz, wenn die Nr. dort lag.
            const vorigerEins = vorigerEinsatz();
            const frueh = new Date(frueherer.zeit).getTime();
            const imVorigen = Boolean(vorigerEins) && frueh >= (vorigerEins?.beginn ?? 0) && frueh <= (vorigerEins?.ende ?? 0);
            hinweise.push(`Nr. ${daten.nummer} gab es schon ${zeitText(frueherer.zeit)} in einem früheren Einsatz${frueherer.eingabe.empfaenger?.trim() ? `, an „${kurz(frueherer.eingabe.empfaenger, 30)}“${(frueherer.eingabe.empfaenger ?? "").trim() !== (eingabe.empfaenger ?? "").trim() ? " (andere Gegenstelle)" : ""}` : ""}; sie zählt nicht als doppelt.${imVorigen ? " Läuft dieser Einsatz noch:" : ""}`);
        }
    }
    // Unter derselben Nr. liegt ein anderer, nicht erstellter Spruch in der Ablage.
    const abgelegt = daten.nummer ? ablageLesen().filter(eintrag => (eintrag.eingabe.nummer ?? "").trim() === daten.nummer && verlaufKennung(eintrag.eingabe) !== verlaufKennung(eingabe)) : [];
    if (abgelegt[0]) {
        hinweise.push(`Unter Nr. ${daten.nummer} liegt ein anderer, nicht erstellter Vordruck in der Ablage: ${ablageBeschreiben(abgelegt[0])}`);
    }
    // Die Längenwarnung auch dort, wo vor dem Download die übrigen Hinweise stehen.
    const laengeVorab = pruefeTextlaenge(daten.inhalt, optionen().vordruck);
    if (istKritisch(laengeVorab)) {
        wichtig.push(textlaengeMeldung(laengeVorab).replace(/\.$/, ""));
    }
    if (daten.nummer && !/\d/.test(daten.nummer)) {
        hinweise.push(`Nr. „${daten.nummer}“ enthält keine Ziffer; „Nächster Vordruck“ kann sie nicht hochzählen`);
    } else if (/\d[^\d\s/-]+\d/.test(daten.nummer)) {
        hinweise.push(`Nr. „${daten.nummer}“ mischt Ziffern und Buchstaben; „Nächster Vordruck“ zählt nur die Ziffern am Ende hoch`);
    }
    // Vermerke passen zur Richtung: Aufnahme beim Eingang, Annahme und Beförderung beim Ausgang.
    const vermerk = (gruppe: string) => ["Datum", "Uhrzeit", "Hdz"].some(teil => (eingabe[`${gruppe}${teil}` as Schluessel] ?? "").trim());
    wichtig.push(...vermerkWiderspruch(eingabe));
    // Der Meldevordruck druckt unter „Ausgang“ die Beförderung, sonst die Annahme: beides gefüllt, fällt die Annahme weg.
    if (optionen().vordruck === "meldung" && vermerk("annahme") && vermerk("befoerderung")) {
        hinweise.push("Der Annahmevermerk wird nicht gedruckt: Der Meldevordruck zeigt die Beförderung, und die ist gefüllt");
    }
    if (optionen().vordruck !== "meldung") {
        if (eingabe.richtung === "Eingang" && daten.inhalt && !vermerk("aufnahme")) {
            fehlt.push("Aufnahmevermerk (Datum, Uhrzeit, Hdz.)");
        }
    }
    // Beim Eingang trägt man die Abfassungszeit der sendenden Stelle ein, falls übermittelt; „Jetzt“ wäre falsch.
    if (daten.inhalt && eingabe.richtung !== "Eingang" && !(eingabe.abfassungszeit ?? "").trim()) {
        fehlt.push("Abfassungszeit („Jetzt“ trägt sie ein)");
    }
    if (daten.inhalt && !daten.nummer) {
        fehlt.push("Nr.");
    }
    if (daten.inhalt && !(eingabe.empfaenger ?? "").trim()) {
        fehlt.push(optionen().vordruck === "meldung" ? "Empfänger" : "Gegenstelle");
    }
    if (daten.inhalt && (optionen().vordruck === "meldung" || eingabe.richtung === "Ausgang" || eingabe.richtung === "Eingang") && !(eingabe.absender ?? "").trim()) {
        fehlt.push("Absender");
    }
    // Angaben, die der gewählte Vordruck nicht hat: sie bleiben erhalten, das soll man wissen.
    const ausgeblendet = SPALTEN.filter(spalte => {
        const feld = maske.elements.namedItem(spalte.schluessel);
        const ziel = feld instanceof RadioNodeList ? feld[0] : feld;
        return ziel instanceof HTMLElement && ziel.closest("[data-nur][hidden]")
            && (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? "");
    });
    if (ausgeblendet.length > 0) {
        hinweise.push(`${aufzaehlen(ausgeblendet.map(spalte => spalte.titel))} ${ausgeblendet.length === 1 ? `gehört nur zum ${optionen().vordruck === "meldung" ? "Nachrichtenvordruck" : "Meldevordruck"}; das Feld ist ausgeblendet und bleibt gespeichert` : `gehören nur zum ${optionen().vordruck === "meldung" ? "Nachrichtenvordruck" : "Meldevordruck"}; die Felder sind ausgeblendet und bleiben gespeichert`}`);
    }
    if (verlauf.length >= HOECHSTENS && daten.inhalt) {
        hinweise.push(`Die Liste erstellter Vordrucke ist voll (${HOECHSTENS}); mit diesem PDF fällt der älteste Eintrag heraus. Vorher „Liste als CSV“ sichern`);
    }
    const zeilen = [
        ...wichtig.map(text => ({ text, wichtig: true })),
        ...hinweise.map(text => ({ text, wichtig: false })),
        ...(fehlt.length > 0 ? [{ text: `Noch leer: ${aufzaehlen(fehlt)}`, wichtig: false }] : [])
    ];
    einzelnHinweise.hidden = zeilen.length === 0;
    const liste = document.createElement("ul");
    liste.replaceChildren(...zeilen.map(zeile => {
        const li = document.createElement("li");
        li.textContent = zeile.text;
        li.classList.toggle("wichtig", zeile.wichtig);
        // Die Hinweise auf den Einsatz bieten den Knopf gleich an: Er liegt sonst in der zugeklappten Liste, weit unten.
        const knopf = /Läuft dieser Einsatz noch:$/.test(zeile.text) ? ["Einsatz fortsetzen …", "einsatz-fortsetzen"]
            : /Beginnt ein neuer Einsatz oder eine neue Übung:$/.test(zeile.text) ? ["Neuer Einsatz …", "einsatz-neu"] : null;
        if (knopf && !element<HTMLButtonElement>(knopf[1] ?? "").hidden) {
            const aktion = document.createElement("button");
            aktion.type = "button";
            aktion.className = "link";
            aktion.textContent = knopf[0] ?? "";
            aktion.addEventListener("click", () => element<HTMLButtonElement>(knopf[1] ?? "").click());
            li.append(" ", aktion);
        }
        return li;
    }));
    einzelnHinweise.replaceChildren(liste);
    const laenge = pruefeTextlaenge(daten.inhalt, optionen().vordruck);
    textlaenge.hidden = !laenge;
    textlaenge.textContent = laenge ? textlaengeMeldung(laenge) : "";
    textlaenge.className = `textlaenge ${istKritisch(laenge) ? "warnung" : "hinweis"}`;
    return daten;
}

// Die Vorschau ist immer ein Bild: Ein eingebetteter PDF-Betrachter bringt je nach
// Browser eine eigene Werkzeugleiste mit (Firefox übergeht #toolbar=0), Telefone
// zeigen ihn oft gar nicht, und in Dunkel und Nacht wäre er die hellste Fläche.
// Der Rahmen bleibt unsichtbar geladen, wo der Browser PDFs einbettet: daraus wird gedruckt.
const eingebettet = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
const bildvorschau = element<HTMLCanvasElement>("einzeln-bild");
vorschau.hidden = !eingebettet;
vorschau.classList.add("nur-zum-drucken");
bildvorschau.hidden = false;
element<HTMLElement>("vorschau-ersatz").hidden = false;

/** Lädt die PDF in den unsichtbaren Rahmen, aus dem gedruckt wird. */
function pdfInRahmenLaden(verteilen: boolean): void {
    const pdf = erzeugePdf(einzelDaten(verteilen), optionen());
    const alt = vorschauUrl;
    vorschauUrl = URL.createObjectURL(pdf.output("blob"));
    vorschau.src = vorschauUrl;
    if (alt) {
        setTimeout(() => URL.revokeObjectURL(alt), 1_000);
    }
}

// Ausblendbar: Ohne Vorschau steht die Maske über die ganze Breite, die Textfelder
// werden breiter und die Seite beim Tippen kürzer. Gedruckt wird weiter aus dem Rahmen.
const VORSCHAU_SCHLUESSEL = "bnv.vorschau.v1";
let vorschauSichtbar = speicher()?.getItem(VORSCHAU_SCHLUESSEL) !== "aus";

function zeigeVorschauSchalter(): void {
    element<HTMLElement>("ansicht-einzeln").querySelector(".arbeitsflaeche")?.classList.toggle("ohne-vorschau", !vorschauSichtbar);
    element<HTMLElement>("vorschau-inhalt").hidden = !vorschauSichtbar;
    const schalter = element<HTMLButtonElement>("vorschau-schalter");
    schalter.textContent = vorschauSichtbar ? "Vorschau ausblenden" : "Vorschau einblenden";
    schalter.setAttribute("aria-expanded", String(vorschauSichtbar));
}

element<HTMLButtonElement>("vorschau-schalter").addEventListener("click", () => {
    vorschauSichtbar = !vorschauSichtbar;
    if (vorschauSichtbar) {
        speicher()?.removeItem(VORSCHAU_SCHLUESSEL);
    } else {
        schreibe(speicher(), VORSCHAU_SCHLUESSEL, "aus");
    }
    zeigeVorschauSchalter();
    vorschauAktualisieren();
});
zeigeVorschauSchalter();

function vorschauAktualisieren(): void {
    if (element<HTMLElement>("ansicht-einzeln").hidden || !vorschauSichtbar) {
        return;
    }
    // Langer Text wie auf dem vorgeschlagenen Weg: verteilt, das Bild zeigt Blatt 1.
    const verteilen = istKritisch(pruefeTextlaenge(maskeLesen().inhalt ?? "", optionen().vordruck));
    const boegen = einzelDaten(verteilen);
    const erster = boegen[0] ?? einzelPruefen();
    void zeichneBildvorschau(bildvorschau, erster, optionen(), boegen.find(bogen => bogen.nur === "meldung") ?? erster);
}

function planeVorschau(): void {
    clearTimeout(vorschauTimer);
    vorschauTimer = setTimeout(vorschauAktualisieren, 350);
}

/**
 * Absender, Zeichen und Funktion der eigenen Station: gemerkt beim Erstellen
 * eines Ausgangs. Beim Umstellen auf Eingang werden sie geleert, beim Umstellen
 * auf Ausgang in leere Felder wieder eingesetzt, auch nach einem Eingang.
 */
const STATION_SCHLUESSEL = "bnv.eigene-station.v1";
const STATION_FELDER = ["absender", "zeichen", "funktion"] as const;
function eigeneStation(): Eingabe | null {
    try {
        return JSON.parse(speicher()?.getItem(STATION_SCHLUESSEL) ?? "null") as Eingabe | null;
    } catch {
        return null;
    }
}
function eigeneStationMerken(eingabe: Eingabe): void {
    if (eingabe.richtung === "Ausgang" && STATION_FELDER.some(feld => (eingabe[feld] ?? "").trim())) {
        schreibe(speicher(), STATION_SCHLUESSEL, JSON.stringify(Object.fromEntries(STATION_FELDER.map(feld => [feld, eingabe[feld] ?? ""]))));
    }
}

function maskeGeaendert(ereignis: Event): void {
    const ziel = ereignis.target;
    const name = ziel instanceof HTMLInputElement || ziel instanceof HTMLTextAreaElement || ziel instanceof HTMLSelectElement ? ziel.name : "";
    if (name) {
        // Tippt jemand selbst eine andere Nr., gilt die von „Neuer Einsatz“ gesetzte nicht mehr: „Fortsetzen“ gibt nichts zurück.
        if (name === "nummer" && ereignis.isTrusted) {
            speicher()?.removeItem(EINSATZ_NUMMER_SCHLUESSEL);
            // „Die Maske behält Nr. 3 …“ stimmt nach einer anderen Nr. nicht mehr.
            const einsatzMeldung = element<HTMLParagraphElement>("einsatz-meldung");
            einsatzMeldung.hidden = true;
            einsatzMeldung.textContent = "";
        }
        angefasst.add(name);
        schreibeImTab(tabSpeicher(), ANGEFASST_SCHLUESSEL, JSON.stringify([...angefasst]));
        feldRahmen(name)?.classList.remove("geleert");
        // Angefasst und leer gelassen ist eine Entscheidung, kein Versehen mehr.
        frischGeleert.delete(name as Schluessel);
    }
    const meldung = ziel instanceof HTMLInputElement && ziel.name === "richtung" && ereignis.type === "change"
        ? richtungGewechselt(ziel.value)
        : "";
    entwurfSpeichern();
    weitereZaehlen();
    // Wer tippt, arbeitet am neuen Stand weiter: ein Zurücknehmen würde ihn verwerfen.
    if (zuruecknahme || statusText.textContent || obenStatus.textContent) {
        meldeStatus("", null);
    }
    // Die Meldung zum Richtungswechsel steht unter der Richtung und bleibt bis zur nächsten Eingabe.
    const richtungMeldung = element<HTMLParagraphElement>("richtung-meldung");
    richtungMeldung.textContent = meldung;
    richtungMeldung.hidden = !meldung;
    kurzmeldungSchliessen();
    // Liegt die Meldung unter dem Bildrand (die Richtung steht oft weit unten), kommt sie zusätzlich als Kurzmeldung.
    if (meldung && !imBild(richtungMeldung)) {
        zeigeKurzmeldung(meldung, false, true);
    }
    planeVorschau();
}

/**
 * Bei einem Eingang gehören Absender, Zeichen und Funktion der sendenden
 * Stelle. Stehen dort die eigenen, werden sie geleert; beim Wechsel auf Ausgang
 * kommen sie in leere Felder wieder. Bereits Getipptes bleibt unangetastet.
 */
function richtungGewechselt(richtung: string): string {
    const eingabe = maskeLesen();
    const eigene = eigeneStation() ?? uebernommen;
    if (!eigene) {
        if (richtung === "Eingang") {
            weitere.open = true;
        }
        return "";
    }
    if (richtung === "Eingang") {
        // Bei einem Eingang gehört der Aufnahmevermerk dazu; er steht im zugeklappten Bereich.
        weitere.open = true;
        const gleich = STATION_FELDER.filter(feld => (eingabe[feld] ?? "").trim() && eingabe[feld] === eigene[feld]);
        if (gleich.length > 0) {
            maskeSchreiben(Object.fromEntries(gleich.map(feld => [feld, ""])) as Eingabe);
            return "Eingang: Angaben der eigenen Station geleert. Hier gehören Absender, Zeichen und Funktion der sendenden Stelle hin; bei „Ausgang“ kommen sie in leere Felder zurück.";
        }
    } else if (richtung === "Ausgang") {
        const leer = STATION_FELDER.filter(feld => !(eingabe[feld] ?? "").trim() && (eigene[feld] ?? "").trim());
        if (leer.length > 0 && STATION_FELDER.every(feld => !(eingabe[feld] ?? "").trim())) {
            maskeSchreiben(Object.fromEntries(leer.map(feld => [feld, eigene[feld] ?? ""])) as Eingabe);
            return "Ausgang: Absender, Zeichen und Funktion der eigenen Station eingesetzt.";
        }
        if (leer.length > 0) {
            return "Ausgang: Absender, Zeichen oder Funktion sind schon belegt; die eigene Station wurde nicht eingesetzt.";
        }
    }
    return "";
}

// Wer in die Maske tippt oder klickt, braucht die Kurzmeldung nicht mehr.
maske.addEventListener("pointerdown", () => kurzmeldungSchliessen());
maske.addEventListener("input", maskeGeaendert);
maske.addEventListener("change", maskeGeaendert);

function setzeFeld(name: string, wert: string): void {
    const feld = maske.elements.namedItem(name) as HTMLInputElement | null;
    if (feld) {
        feld.value = wert;
        feld.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

element<HTMLButtonElement>("jetzt").addEventListener("click", () => setzeFeld("abfassungszeit", datumZeitGruppe(new Date())));

// „Jetzt“ nimmt die Uhr des Geräts; zum Abgleich mit der Uhr der Stelle steht sie daneben.
function geraetezeitZeigen(): void {
    const jetzt = new Date();
    element<HTMLParagraphElement>("geraetezeit").textContent =
        `Datum-Zeit-Gruppe: Tag, Stunde, Minute, Monat, Jahr. „Jetzt“ nimmt die Uhr dieses Geräts: ${datumZeitGruppe(jetzt)} `
        + `(${jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr).`;
}
geraetezeitZeigen();
setInterval(geraetezeitZeigen, 30_000);

// „Jetzt“ bei den Vermerken: Datum TT.MM. und Uhrzeit HH:MM wie auf dem Bogen üblich.
for (const knopf of document.querySelectorAll<HTMLButtonElement>("button[data-jetzt]")) {
    knopf.addEventListener("click", () => {
        const jetzt = new Date();
        const zwei = (zahl: number) => String(zahl).padStart(2, "0");
        const gruppe = knopf.dataset["jetzt"] ?? "";
        setzeFeld(`${gruppe}Uhrzeit`, `${zwei(jetzt.getHours())}:${zwei(jetzt.getMinutes())}`);
        if (gruppe !== "quittung") {
            setzeFeld(`${gruppe}Datum`, `${zwei(jetzt.getDate())}.${zwei(jetzt.getMonth() + 1)}.`);
        }
    });
}

/** Sperrt einen Knopf kurz, damit ein Doppeltipp nicht zweimal herunterlädt. */
function kurzSperren(knopf: HTMLButtonElement): boolean {
    if (knopf.dataset["gesperrt"]) {
        zeigeKurzmeldung("Doppelter Tipp erkannt; der zweite Tipp wurde nicht ausgeführt.", false);
        return false;
    }
    knopf.dataset["gesperrt"] = "1";
    setTimeout(() => delete knopf.dataset["gesperrt"], 1_500);
    return true;
}

/**
 * Ob dieser Stand schon als PDF erstellt, gedruckt oder geöffnet wurde. Die
 * Liste steht im Gerätespeicher, das übersteht also auch ein Neuladen.
 */
function istErstellt(eingabe: Eingabe): boolean {
    const stand = JSON.stringify(eingabe);
    return verlauf.some(eintrag => JSON.stringify(eintrag.eingabe) === stand);
}

/**
 * Trägt den Stand in die Liste ein, außer die Maske ist leer. Derselbe Stand
 * als anderer Vordruck (Nachricht, dann Meldung) bekommt einen eigenen Eintrag.
 */
function alsErstelltMerken(eingabe: Eingabe, jetzt: Date, zusatz = ""): void {
    if (!((eingabe.inhalt ?? "").trim() || (eingabe.nummer ?? "").trim())) {
        return;
    }
    // Die Meldung zum Einsatzwechsel hat ihren Dienst getan, sobald der nächste Vordruck entsteht; ebenso der
    // Merker der Nr.: „Fortsetzen“ darf sie später nicht mehr zurückgeben.
    element<HTMLParagraphElement>("einsatz-meldung").hidden = true;
    element<HTMLParagraphElement>("einsatz-meldung").textContent = "";
    speicher()?.removeItem(EINSATZ_NUMMER_SCHLUESSEL);
    // Genau dieser Stand ist jetzt erstellt. Andere abgelegte Stände mit derselben
    // Nr. bleiben: Das kann ein ganz anderer, nie gesendeter Spruch sein.
    ablageEntfernen(eingabe);
    const gemerkt = merkeVordruck(eingabe, jetzt, optionen().vordruck, zusatz, aktuellerEinsatzBeginn());
    verlauf = gemerkt.liste;
    if (gemerkt.verdraengt > 0) {
        statusText.textContent += ` Die Liste erstellter Vordrucke ist voll (${HOECHSTENS}); der älteste Eintrag ist herausgefallen.`;
    }
    if (!gemerkt.gespeichert) {
        statusText.textContent += ` Nicht in die Liste erstellter Vordrucke eingetragen: ${speicherZustand() === "voll" ? "Der Speicher des Geräts ist voll" : "Das Gerät speichert nichts"}; der Eintrag gilt nur bis zum Neuladen, danach fällt eine doppelte Nr. nicht mehr auf.`;
    }
    verlaufZeigen();
}

/**
 * Gegenstelle (bei einem Eingang auch der Absender), die nach einer neuen Nr.
 * unverändert vom zuletzt erstellten Vordruck steht und nicht angefasst wurde,
 * als Frage; leer, wenn nicht. Oft richtig (dieselbe Stelle funkt noch einmal),
 * aber auch der häufigste Fehler beim Überschreiben: Nr. und Text neu, Stelle
 * vergessen.
 */
function gleicheStelle(eingabe: Eingabe): string {
    const zuletzt = verlauf.at(-1)?.eingabe;
    const nummer = eingabe.nummer?.trim() ?? "";
    const gegenstelle = (eingabe.empfaenger ?? "").trim();
    if (!zuletzt || !nummer || !gegenstelle || !zuletzt.nummer?.trim() || nummer === zuletzt.nummer.trim()
        || angefasst.has("empfaenger") || gegenstelle !== (zuletzt.empfaenger ?? "").trim()) {
        return "";
    }
    const absender = (eingabe.absender ?? "").trim();
    const mitAbsender = eingabe.richtung === "Eingang" && absender && !angefasst.has("absender") && absender === (zuletzt.absender ?? "").trim();
    const titel = optionen().vordruck === "meldung" ? "Empfänger" : "Gegenstelle";
    const wohin = eingabe.richtung === "Eingang" ? "von derselben Stelle" : "an dieselbe Stelle";
    return `${titel} „${kurz(gegenstelle, 40)}“${mitAbsender ? ` und Absender „${kurz(absender, 40)}“ stehen` : " steht"} unverändert wie bei Nr. ${zuletzt.nummer.trim()}. Ist Nr. ${nummer} ${wohin}?`;
}

/** Felder, die „Stehen gebliebene leeren“ zuletzt geleert hat; bis zum nächsten Erstellen. */

/**
 * Bei Problemen vor dem Erzeugen nachfragen. Ergibt `false` bei Abbruch, sonst
 * ob langer Text auf Folgebögen verteilt wird. Kann die Maske ändern (etwa
 * „Jetzt“ eintragen); danach neu lesen.
 */
async function einzelBestaetigt(eingabe: Eingabe): Promise<false | { verteilen: boolean }> {
    // Eigene, kurze Rückfrage, nicht mit den stehen gebliebenen Angaben vermischt.
    const stelle = gleicheStelle(eingabe);
    if (stelle) {
        const titel = optionen().vordruck === "meldung" ? "Empfänger" : "Gegenstelle";
        const wahl = await frageWahl(stelle, "Gleiche Stelle", "Abbrechen", `${titel} ändern`);
        if (wahl === "dritte") {
            // Beim Eingang gehören Absender, Zeichen und Funktion der sendenden Stelle:
            // stehen sie noch wie beim vorigen Spruch, mit leeren und markieren.
            const zuletzt = verlauf.at(-1)?.eingabe;
            const mit = eingabe.richtung === "Eingang" && zuletzt
                ? (["absender", "zeichen", "funktion"] as const).filter(feld => (eingabe[feld] ?? "").trim() && eingabe[feld] === zuletzt[feld] && !angefasst.has(feld))
                : [];
            if (mit.length > 0) {
                maskeSchreiben(Object.fromEntries(mit.map(feld => [feld, ""])) as Eingabe);
                for (const feld of mit) {
                    frischGeleert.add(feld);
                    feldRahmen(feld)?.classList.add("geleert");
                }
                entwurfSpeichern();
                planeVorschau();
                meldeStatus(`Vom vorigen Spruch geleert: ${aufzaehlen(mit.map(titelVon))}. Die Felder sind markiert.`, { stand: eingabe, aktion: "Leeren", beschriftung: "Geleerte Angaben wiederherstellen" }, true);
            }
            const feld = maske.elements.namedItem("empfaenger") as HTMLInputElement;
            feld.focus();
            feld.select();
            feld.scrollIntoView({ block: "center" });
            return false;
        }
        if (wahl !== "ja") {
            return false;
        }
        // Bestätigt: Bis zum nächsten Erstellen gilt die Stelle als bewusst gewählt.
        angefasst.add("empfaenger");
        angefasst.add("absender");
        schreibeImTab(tabSpeicher(), ANGEFASST_SCHLUESSEL, JSON.stringify([...angefasst]));
    }
    // Ohne Abfassungszeit: eigene Frage mit „Jetzt“, in jedem Weg, auch bei langem Text. Beim
    // Meldevordruck unabhängig von der Richtung, die er nicht hat; bei einem Widerspruch zwischen
    // Richtung und Vermerk zuerst dieser: Mit falscher Richtung wäre „Jetzt“ womöglich falsch.
    const ohneZeit = (eingabe.inhalt ?? "").trim() && !(eingabe.abfassungszeit ?? "").trim() && vermerkWiderspruch(eingabe).length === 0
        && (optionen().vordruck !== "nachricht" || eingabe.richtung === "Ausgang");
    if (ohneZeit) {
        const wahl = await frageWahl("Der Vordruck hat keine Abfassungszeit.", "„Jetzt“ eintragen und weiter", "Abbrechen", "Ohne Abfassungszeit weiter");
        if (wahl === "nein") {
            return false;
        }
        if (wahl === "ja") {
            setzeFeld("abfassungszeit", datumZeitGruppe(new Date()));
            eingabe = maskeLesen();
        }
    }
    const { daten, fehler, hinweise } = zuVordruckDaten(eingabe);
    const { vordruck } = optionen();
    const laenge = pruefeTextlaenge(daten.inhalt, vordruck);
    const frueher = mitNummer(juengste(), daten.nummer).filter(eintrag => JSON.stringify(eintrag.eingabe) !== JSON.stringify(eingabe));
    const andereStelle = frueher.filter(eintrag => (eintrag.eingabe.empfaenger ?? "") !== (eingabe.empfaenger ?? "")).at(-1);
    // Gleiche Nr. und Gegenstelle, aber anderer Text: eher ein neuer Spruch als eine Korrektur.
    const andererText = !andereStelle && frueher
        .some(eintrag => (eintrag.eingabe.empfaenger ?? "") === (eingabe.empfaenger ?? "")
            && (eintrag.eingabe.inhalt ?? "").trim() !== (eingabe.inhalt ?? "").trim());
    const gekuerzt = gekuerztSatz(gekuerzteEinzeln(daten, fehler));
    const nochLeer = [...frischGeleert].filter(schluessel => !(eingabe[schluessel] ?? "").trim());
    const probleme = [
        istKritisch(laenge) ? textlaengeMeldung(laenge) : "",
        gekuerzt ? `${gekuerzt}.` : "",
        eigeneFehler(fehler, vordruck)[0] ? `${eigeneFehler(fehler, vordruck)[0]}.` : "",
        ...hinweise.filter(text => text.includes(UNMOEGLICH)).map(text => `${text}.`),
        ...vermerkWiderspruch(eingabe).map(text => `${text}.`),
        andereStelle ? `Nr. ${daten.nummer} wurde schon ${zeitText(andereStelle.zeit)} an ${andereStelle.eingabe.empfaenger?.trim() ? `„${kurz(andereStelle.eingabe.empfaenger, 40)}“` : "eine Gegenstelle ohne Namen"} erstellt.` : "",
        andererText ? `Nr. ${daten.nummer} an diese Gegenstelle wurde schon mit anderem Text erstellt. Korrektur? Für einen neuen Spruch „Nächster Vordruck“ nutzen.` : "",
        altwerte(eingabe) ? `${altwerte(eingabe)}.` : "",
        nochLeer.length > 0 ? `Eben geleert und noch leer: ${aufzaehlen(nochLeer.map(titelVon))}.` : "",
        !daten.inhalt ? "Der Vordruck hat keinen Text." : "",
        // Ohne Gegenstelle oder Absender ist ein Spruch auf Papier nicht zuzuordnen.
        daten.inhalt && !(eingabe.empfaenger ?? "").trim() ? `Der Vordruck hat keine${vordruck === "meldung" ? "n Empfänger" : " Gegenstelle"}.` : "",
        daten.inhalt && !(eingabe.absender ?? "").trim() && vordruck === "meldung" ? "Der Vordruck hat keinen Absender." : "",
        daten.inhalt && vordruck !== "meldung" && eingabe.richtung === "Ausgang" && !(eingabe.absender ?? "").trim() ? "Der Vordruck hat keinen Absender." : "",
        daten.inhalt && vordruck !== "meldung" && eingabe.richtung === "Eingang" && !(eingabe.absender ?? "").trim() ? "Der Vordruck hat keinen Absender (die sendende Stelle)." : ""
    ].filter(Boolean);
    if (probleme.length === 0) {
        return { verteilen: false };
    }
    // Zu langer Text lässt sich wie auf Papier auf Folgebögen verteilen; das ist
    // die Hauptwahl, Kürzen nur die Ausnahme.
    const lang = istKritisch(laenge);
    // Stehen gebliebene Angaben: gezielt leeren statt „Nächster Vordruck“, der den Text verwerfen würde.
    // Zuerst gefragt, auch bei langem Text; danach kommt die Frage nach dem Verteilen.
    const alt = altFelder(eingabe);
    if (alt.length > 0) {
        const ja = lang ? "Weiter" : gekuerzt ? "Gekürzt erzeugen" : "Trotzdem erzeugen";
        const fragen = lang ? [`${altwerte(eingabe)}.`] : probleme;
        const wahl = await frageWahl(`${fragen.join("\n")}\n\n${ja}?`, ja, "Abbrechen", "Stehen gebliebene leeren");
        if (wahl === "dritte") {
            stehenGebliebeneLeeren(eingabe, alt);
            return false;
        }
        if (wahl !== "ja") {
            return false;
        }
        if (!lang) {
            return { verteilen: false };
        }
        // Bestätigt: Die folgende Frage nennt die stehen gebliebenen Angaben nicht noch einmal.
        const satz = `${altwerte(eingabe)}.`;
        probleme.splice(0, probleme.length, ...probleme.filter(text => text !== satz));
    }
    if (lang) {
        const verteilt = verteiltText(daten.inhalt, vordruck);
        const wahl = await frageWahl(`${probleme.join("\n")}\n\nAuf ${verteilt} verteilen?`, `Auf ${verteilt} verteilen`, "Abbrechen", "Gekürzt erzeugen (Text fehlt)");
        return wahl === "nein" ? false : { verteilen: wahl === "ja" };
    }
    const ja = gekuerzt ? "Gekürzt erzeugen" : "Trotzdem erzeugen";
    // Fehlt die Gegenstelle oder der Absender, führt ein Knopf ins leere Feld statt nur zurück zum PDF-Knopf.
    const luecke = !daten.inhalt ? ""
        : !(eingabe.empfaenger ?? "").trim() ? "empfaenger"
            : (eingabe.richtung === "Ausgang" || eingabe.richtung === "Eingang" || vordruck === "meldung") && !(eingabe.absender ?? "").trim() ? "absender" : "";
    const antwort = await frageWahl(`${probleme.join("\n")}\n\n${ja}?`, ja, "Abbrechen",
        luecke === "empfaenger" ? `${vordruck === "meldung" ? "Empfänger" : "Gegenstelle"} eintragen` : luecke === "absender" ? "Absender eintragen" : "");
    if (antwort === "dritte") {
        const feld = maske.elements.namedItem(luecke) as HTMLInputElement;
        feld.closest("details")?.setAttribute("open", "");
        feld.focus();
        feld.scrollIntoView({ block: "center" });
        return false;
    }
    return antwort === "ja" ? { verteilen: false } : false;
}

/** Fehler, die den gewählten Vordruck betreffen: Der Meldevordruck hat Vorrang, Art und weitere Felder nicht. */
function eigeneFehler(fehler: readonly string[], vordruck: VordruckWahl): string[] {
    if (vordruck !== "meldung") {
        return [...fehler];
    }
    const nurNachricht = SPALTEN.filter(spalte => spalte.nurNachricht).map(spalte => spalte.titel);
    return fehler.filter(text => !nurNachricht.some(titel => text.startsWith(`${titel}:`)));
}

/** Titel einer Spalte für Meldungen. */
function titelVon(schluessel: Schluessel): string {
    return SPALTEN.find(spalte => spalte.schluessel === schluessel)?.titel ?? schluessel;
}

/** „heute um 09:37 Uhr“ oder „am 04.10. um 09:37 Uhr“. */
function zeitText(iso: string): string {
    const zeit = new Date(iso);
    const tag = zeit.toDateString() === new Date().toDateString()
        ? "heute"
        : `am ${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
    return `${tag} um ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

/**
 * Leert die stehen gebliebenen Angaben und markiert die Felder, bis dort
 * getippt wird: Sonst ist nur das erste im Blick, und ein zweiter Tipp auf
 * „PDF“ erzeugt mit Lücken.
 */
function stehenGebliebeneLeeren(eingabe: Eingabe, alt: readonly typeof SPALTEN[number][]): void {
    maskeSchreiben(Object.fromEntries(alt.map(spalte => [spalte.schluessel, vorgaben[spalte.schluessel] ?? ""])) as Eingabe);
    entwurfSpeichern();
    weitereZaehlen();
    planeVorschau();
    for (const spalte of alt) {
        frischGeleert.add(spalte.schluessel);
        feldRahmen(spalte.schluessel)?.classList.add("geleert");
    }
    // Erst jetzt speichern: Mit der Markierung im Entwurf übersteht sie ein sofortiges Neuladen.
    entwurfSpeichern();
    const text = `Geleert: ${aufzaehlen(alt.map(spalte => spalte.titel))}. Die Felder sind markiert; bitte prüfen und erneut erzeugen.`;
    meldeStatus(text, { stand: eingabe, aktion: "Leeren", beschriftung: "Geleerte Angaben wiederherstellen" }, true);
    // Die Seite rollt gleich zum ersten geleerten Feld, weg von der Meldung oben: Sie kommt deshalb auch als Kurzmeldung.
    zeigeKurzmeldung(text, true);
    // Zum ersten geleerten Feld, damit ein zweiter Tipp auf „PDF“ nicht ungeprüft erzeugt.
    const erstes = maske.elements.namedItem(alt[0]?.schluessel ?? "");
    const ziel = erstes instanceof RadioNodeList ? erstes[0] : erstes;
    if (ziel instanceof HTMLElement) {
        ziel.closest("details")?.setAttribute("open", "");
        ziel.focus();
        ziel.scrollIntoView({ block: "center" });
    }
}

/** Das Feld oder die Auswahlgruppe eines Schlüssels, zum Markieren. */
function feldRahmen(schluessel: string): HTMLElement | null {
    const feld = maske.elements.namedItem(schluessel);
    const ziel = feld instanceof RadioNodeList ? feld[0] : feld;
    return ziel instanceof HTMLElement ? ziel.closest<HTMLElement>("fieldset, .feld") ?? ziel : null;
}

/**
 * Felder, die auf den Bögen gekürzt würden, beim vorgeschlagenen Weg (langer
 * Text verteilt): Dort teilt sich der Betreff die Zeile mit Vermerk und Blatt.
 */
function gekuerzteEinzeln(daten: ReturnType<typeof zuVordruckDaten>["daten"], fehler: readonly string[],
    verteilen = istKritisch(pruefeTextlaenge(daten.inhalt, optionen().vordruck))): string[] {
    return gekuerzteFelderAufBoegen(bogenListe(daten, optionen().vordruck, fehler, verteilen), optionen().vordruck);
}

/** Satz zu gekürzten Feldern; leer, wenn keine. */
function gekuerztSatz(namen: readonly string[]): string {
    return namen.length > 0 ? `Zu lang für den Vordruck, wird mit „…“ gekürzt gedruckt: ${namen.join(", ")}` : "";
}

/**
 * Die Bögen für den aktuellen Stand: je Vordruckart einer, oder mit
 * `verteilen` langer Text auf Folgebögen, jeder mit „Blatt n von m“.
 */
function einzelDaten(verteilen = false): Bogen[] {
    const daten = einzelPruefen();
    const { fehler } = zuVordruckDaten(maskeLesen());
    // Was auf dem Bogen anders steht als eingegeben, sagt der Bogen selbst.
    return bogenListe(daten, optionen().vordruck, fehler, verteilen);
}

/** Was in der Liste über die Druckfassung steht: verteilt, gekürzt, mit Fehlern. */
function erstellungText(eingabe: Eingabe, verteilen: boolean, wie: string): string {
    const { daten, fehler } = zuVordruckDaten(eingabe);
    const { vordruck } = optionen();
    const lang = istKritisch(pruefeTextlaenge(daten.inhalt, vordruck));
    const felder = gekuerzteEinzeln(daten, fehler, verteilen);
    return [
        wie === "drucken" ? "zum Drucken geöffnet" : "",
        fehler.length > 0 ? "mit Fehlern gedruckt" : "",
        lang && verteilen ? `auf ${verteiltText(daten.inhalt, vordruck)} verteilt` : lang ? "Text gekürzt gedruckt" : "",
        felder.length > 0 ? `${felder.join(", ")} gekürzt gedruckt` : ""
    ].filter(Boolean).join(", ");
}

/** Erzeugt den Einzelvordruck für Download, Druck oder neuen Tab und merkt ihn sich. */
async function einzelErstellen(knopf: HTMLButtonElement, wie: "herunterladen" | "drucken" | "oeffnen"): Promise<void> {
    if (!kurzSperren(knopf)) {
        return;
    }
    // Ansehen im neuen Tab erzeugt nichts für die Ablage: keine Rückfrage, kein Eintrag.
    // Zum Ansehen wie gedruckt: langer Text auf Folgebögen, wie es die Rückfrage anbieten würde.
    const bestaetigt = wie === "oeffnen"
        ? { verteilen: istKritisch(pruefeTextlaenge(maskeLesen().inhalt ?? "", optionen().vordruck)) }
        : await einzelBestaetigt(maskeLesen());
    if (bestaetigt === false) {
        return;
    }
    // Neu lesen: Die Rückfrage kann „Jetzt“ eingetragen haben.
    const eingabe = maskeLesen();
    const { verteilen } = bestaetigt;
    const { vordruck } = optionen();
    const zusatz = erstellungText(eingabe, verteilen, wie);
    // Dieselbe PDF kurz nacheinander noch einmal: eher ein versehentlicher zweiter Tipp.
    // Nur derselbe Vordruck zählt; als andere Art ist es ein neuer Bogen.
    const kennung = verlaufKennung(eingabe);
    const eben = juengste().filter(eintrag => verlaufKennung(eintrag.eingabe) === kennung && (eintrag.vordruck ?? "") === vordruck
        && Date.now() - new Date(eintrag.zeit).getTime() < 120_000).at(-1);
    if (wie === "herunterladen" && eben) {
        const sekunden = Math.max(1, Math.round((Date.now() - new Date(eben.zeit).getTime()) / 1000));
        const gleich = (eben.zusatz ?? "").replace(/^zum Drucken geöffnet(, )?/, "") === zusatz;
        const text = gleich
            ? `Dieser Vordruck wurde vor ${sekunden} Sekunden schon genau so als PDF erstellt. Noch einmal herunterladen?`
            : `Dieser Vordruck wurde vor ${sekunden} Sekunden schon erstellt (${eben.zusatz || "vollständig auf einem Vordruck"}). Jetzt ${zusatz || "vollständig auf einem Vordruck"} herunterladen?`;
        if (!await frage(text, gleich ? "Noch einmal herunterladen" : "Herunterladen")) {
            return;
        }
    }
    const boegen = einzelDaten(verteilen);
    const jetzt = new Date();
    const uhr = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const nummer = eingabe.nummer?.trim() ?? "";
    const { daten } = zuVordruckDaten(eingabe);
    const verteilt = verteilen && istKritisch(pruefeTextlaenge(daten.inhalt, vordruck)) ? `, Text auf ${verteiltText(daten.inhalt, vordruck)} verteilt` : "";
    const vermerke = [...new Set(boegen.map(bogen => bogen.pruefvermerk).filter(Boolean))];
    const vermerkText = vermerke.length > 0 ? `; auf dem Bogen steht „${vermerke.join("“ bzw. „")}“` : "";
    if (wie === "herunterladen") {
        const name = dateiname(optionen(), 1, jetzt, nummer);
        herunterladen(erzeugePdf(boegen, optionen()).output("blob"), name);
        meldeStatus(`${beschreibe(eingabe)} um ${uhr} Uhr als PDF erstellt${verteilt}${vermerkText}. Für den nächsten Vordruck „Nächster Vordruck“ wählen.`);
    } else if (wie === "drucken") {
        // Die Vorschau ist dieselbe PDF; ihr Druckdialog druckt sie ohne Umweg über den Download.
        clearTimeout(vorschauTimer);
        pdfInRahmenLaden(verteilen);
        vorschau.addEventListener("load", () => vorschau.contentWindow?.print(), { once: true });
        meldeStatus(`${beschreibe(eingabe)} um ${uhr} Uhr zum Drucken geöffnet${verteilt}${vermerkText}; in der Liste als „zum Drucken geöffnet“ geführt, auch wenn der Druck abgebrochen wird.`);
    } else {
        window.open(URL.createObjectURL(erzeugePdf(boegen, optionen()).output("blob")), "_blank", "noopener");
        meldeStatus(`${beschreibe(eingabe)} um ${uhr} Uhr zur Ansicht in einem neuen Tab geöffnet; das zählt nicht als erstellt.`);
        return;
    }
    eigeneStationMerken(eingabe);
    alsErstelltMerken(eingabe, jetzt, zusatz);
    angefasstZuruecksetzen();
    frischGeleert.clear();
}

element<HTMLButtonElement>("einzeln-pdf").addEventListener("click", ereignis =>
    void einzelErstellen(ereignis.currentTarget as HTMLButtonElement, "herunterladen"));
element<HTMLButtonElement>("einzeln-drucken").hidden = !eingebettet;
element<HTMLButtonElement>("einzeln-drucken").addEventListener("click", ereignis =>
    void einzelErstellen(ereignis.currentTarget as HTMLButtonElement, "drucken"));

element<HTMLButtonElement>("leere-vordrucke").addEventListener("click", ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    // Ohne Vorab-Kreuze: zuVordruckDaten lässt bei leerer Eingabe alles leer.
    // Immer mit Formular: ohne wäre ein Leerbogen ein weißes Blatt.
    const gewaehlt = { ...optionen(), ohneHintergrund: false };
    const anzahl = gewaehlt.blatt === "a4" && gewaehlt.vordruck !== "beide" ? 2 : 1;
    const leer = Array.from({ length: anzahl }, () => zuVordruckDaten({}).daten);
    const name = dateiname(gewaehlt, anzahl).replace(".pdf", "_leer.pdf");
    herunterladen(erzeugePdf(leer, gewaehlt).output("blob"), name);
    meldeStatus(`${name} erstellt: ein Blatt. Mehr Exemplare im Druckdialog unter „Kopien“ einstellen.`);
});

// Probeblatt für vorgedruckte Bögen: alle Felder mit Beispielwerten, ohne
// Formular, mit dem eingestellten Versatz. Gegen das Licht auf einen Bogen legen.
element<HTMLButtonElement>("probeblatt").addEventListener("click", ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    const beispiel = Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, spalte.beispiel || "X"])) as Eingabe;
    beispiel.verteiler = "Leiter, S1/1, S2/2, S3/3, S4/1, S6/2";
    beispiel.gespraechsnotiz = "ja";
    beispiel.richtung = "Ausgang";
    const gewaehlt = { ...optionen(), ohneHintergrund: true };
    herunterladen(erzeugePdf([zuVordruckDaten(beispiel).daten], gewaehlt).output("blob"), dateiname(gewaehlt, 1).replace(".pdf", "_probeblatt.pdf"));
    meldeStatus("Probeblatt erstellt: auf Normalpapier drucken, gegen das Licht auf einen Bogen legen, Versatz anpassen.");
});

// ---- Liste erstellter Vordrucke ----------------------------------------

const verlaufBereich = element<HTMLDetailsElement>("verlauf");

/** Eine Kopfzeile in der Liste, solange der laufende Einsatz noch keinen Eintrag hat. */
function laufenderEinsatzLeer(): HTMLTableRowElement[] {
    if (verlauf.length === 0 || juengste().length > 0) {
        return [];
    }
    const tr = document.createElement("tr");
    tr.className = "einsatz-trenner";
    const zelle = document.createElement("td");
    zelle.colSpan = 7;
    // Ohne Eintrag beginnt der Einsatz „jetzt“ und die Uhrzeit wanderte bei jedem Aufruf: nur nennen, wenn er von Hand begonnen wurde.
    const vonHand = einsatzStand().grenzen.includes(aktuellerEinsatzBeginn());
    zelle.textContent = `Laufender Einsatz${vonHand ? ` seit ${tagUhr(new Date(aktuellerEinsatzBeginn()))}` : ""}: noch kein Eintrag. Darunter stehen frühere Einsätze.`;
    tr.append(zelle);
    return [tr];
}

/** Der Hinweis „wiederhergestellt: noch nicht als PDF erstellt“ soll nach dem Erstellen nicht widersprechen. */
function entwurfHinweisAktualisieren(): void {
    const kopf = document.querySelector<HTMLElement>("#entwurf-text strong");
    if (kopf && !entwurfHinweis.hidden && kopf.textContent?.includes("noch nicht als PDF erstellt") && istErstellt(maskeLesen())) {
        kopf.textContent = kopf.textContent.replace("noch nicht als PDF erstellt", "inzwischen als PDF erstellt");
    }
}
function verlaufZeigen(): void {
    entwurfHinweisAktualisieren();
    verlaufBereich.hidden = verlauf.length === 0;
    element<HTMLSpanElement>("verlauf-zahl").textContent = String(verlauf.length);
    // Eine spätere Fassung derselben Nr. an dieselbe Gegenstelle im selben Einsatz:
    // mit anderem Stand eine Korrektur, mit gleichem nur erneut gedruckt.
    const stand = einsatzStand();
    // Auch abgelegte Entwürfe zählen als Arbeit: Trennzeilen, „(Korrektur)“ und CSV folgen derselben Regel wie die Nummernprüfung.
    const arbeit = aktivitaet().map(eintrag => new Date(eintrag.zeit).getTime());
    const fassung = fassungen(verlauf, stand, arbeit);
    einsatzZeigen();
    // Die Ablage kennzeichnet Einträge, deren Nr. inzwischen anders erstellt wurde.
    ablageZeigen();
    const folgen = einsatzFolgen(verlauf, stand, arbeit);
    const VORDRUCK_NAME: Record<string, string> = { nachricht: "Nachricht", meldung: "Meldung", beide: "Beide" };
    element<HTMLTableSectionElement>("verlauf-liste").replaceChildren(...laufenderEinsatzLeer(), ...[...verlauf].map((eintrag, index) => ({ eintrag, index })).reverse().flatMap(({ eintrag, index }) => {
        const tr = document.createElement("tr");
        // Unter dem ältesten Eintrag eines Einsatzes eine Trennzeile: darunter beginnt ein früherer.
        const zeilen: HTMLTableRowElement[] = [tr];
        const aelter = verlauf[index - 1];
        if (aelter && folgen[index] !== folgen[index - 1]) {
            const trenner = document.createElement("tr");
            trenner.className = "einsatz-trenner";
            const zelle = document.createElement("td");
            zelle.colSpan = 7;
            zelle.textContent = `Früherer Einsatz, bis ${tagUhr(new Date(aelter.zeit))}`;
            trenner.append(zelle);
            zeilen.push(trenner);
        }
        const zeit = new Date(eintrag.zeit);
        // Gedruckt wird nur ein gültiger Vorrang; ein verworfener Wert aus der Datei soll das nicht verschleiern.
        const vorrang = (eintrag.eingabe.vorrang ?? "").trim();
        const gueltig = !vorrang || /^(sofort|blitz)$/i.test(vorrang);
        for (const [beschriftung, text] of [
            ["Zeit", `${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`],
            ["Vordruck", VORDRUCK_NAME[eintrag.vordruck ?? ""] ?? ""],
            ["Nr.", `${eintrag.eingabe.nummer ?? ""}${fassung[index] === "Korrektur" ? " (Korrektur)" : fassung[index] === "erneut" ? " (erneut gedruckt)" : ""}`],
            // Der Meldevordruck hat keine Richtung; die Liste soll keine vortäuschen.
            ["Richtung", eintrag.vordruck === "meldung" ? "" : eintrag.eingabe.richtung ?? ""],
            ["Vorrang", gueltig ? vorrang : `${vorrang} (ungültig, nicht gedruckt)`],
            ["Gegenstelle", eintrag.eingabe.empfaenger ?? ""],
            // Wie gedruckt: nicht druckbare Zeichen als „?“, wie auf dem Bogen.
            ["Inhalt", kurz(zuVordruckDaten({ inhalt: eintrag.eingabe.inhalt ?? "" }).daten.inhalt, 60) + (eintrag.zusatz ? ` (${eintrag.zusatz})` : "")]
        ] as const) {
            const td = document.createElement("td");
            td.textContent = text;
            td.dataset["beschriftung"] = beschriftung;
            tr.append(td);
        }
        return zeilen;
    }));
}

/** „04.10., 08:00 Uhr“. */
function tagUhr(zeit: Date): string {
    return `${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

/** „04.10., 08:00 bis 09:30 Uhr“ oder bei gleicher Minute „am 04.10. um 08:00 Uhr“. */
function zeitraum(von: number, bis: number): string {
    const a = tagUhr(new Date(von));
    const b = tagUhr(new Date(bis));
    return a === b ? `am ${a.replace(", ", " um ")}` : `vom ${a} bis ${b}`;
}

/**
 * Der jüngste Einsatz vor dem laufenden, in dem Vordrucke erstellt wurden: Beginn, Ende und Zahl dieser
 * Vordrucke; `null`, wenn es keinen gibt. Abgelegte Entwürfe zählen als Arbeit (sie bestimmen Beginn und
 * Ende und tragen Pausen), ein Einsatz nur aus Entwürfen aber nicht: er wird übersprungen. `bruecken`:
 * die Zeitpunkte, an denen eine Pause bis zum laufenden Einsatz zu überbrücken wäre.
 */
function vorigerEinsatz(): { beginn: number; ende: number; anzahl: number; bruecken: number[] } | null {
    const stand = einsatzStand();
    const laufend = aktuellerEinsatzBeginn();
    let rest = aktivitaet().map(eintrag => new Date(eintrag.zeit).getTime()).filter(zeit => !Number.isNaN(zeit) && zeit < laufend).sort((x, y) => x - y);
    while (rest.length > 0) {
        const ende = rest.at(-1) ?? 0;
        const start = einsatzBeginn(rest.map(zeit => ({ zeit: new Date(zeit).toISOString() })),
            { grenzen: stand.grenzen.filter(grenze => grenze <= ende), bruecken: stand.bruecken }, ende);
        const anzahl = verlauf.filter(eintrag => {
            const zeit = new Date(eintrag.zeit).getTime();
            return zeit >= start && zeit <= ende;
        }).length;
        if (anzahl > 0) {
            const punkte = [...new Set(aktivitaet().map(eintrag => new Date(eintrag.zeit).getTime()).filter(zeit => zeit >= ende && zeit < laufend))].sort((x, y) => x - y);
            const bruecken = punkte.filter((zeit, index) => (punkte[index + 1] ?? laufend) - zeit > EINSATZ_PAUSE);
            return { beginn: start, ende, anzahl, bruecken };
        }
        rest = rest.filter(zeit => zeit < start);
    }
    return null;
}

/** Ab wann Nummern geprüft werden, und die Knöpfe für die Einsatzgrenze. */
function einsatzZeigen(): void {
    const stand = einsatzStand();
    const beginn = aktuellerEinsatzBeginn();
    const anzahl = juengste().length;
    const eintraege = anzahl === 0 ? "noch kein Eintrag" : anzahl === 1 ? "1 Eintrag" : `${anzahl} Einträge`;
    const vonHand = stand.grenzen.includes(beginn);
    // Ohne Arbeit und ohne Grenze beginnt der Einsatz „jetzt“, und das wandert: dann keine Uhrzeit nennen.
    const seit = anzahl === 0 && !vonHand ? "Laufender Einsatz" : `Laufender Einsatz seit ${tagUhr(new Date(beginn))}${vonHand ? " (von Hand begonnen)" : ""}`;
    element<HTMLParagraphElement>("einsatz-text").textContent = `${seit}, ${eintraege}. `
        + "Nummern zählen nur im laufenden Einsatz; nach 12 Stunden ohne Vordruck beginnt ein neuer.";
    const vorher = vorigerEinsatz();
    const fortsetzen = element<HTMLButtonElement>("einsatz-fortsetzen");
    fortsetzen.hidden = !vorher && !vonHand;
    fortsetzen.textContent = vorher ? `Einsatz vom ${tagUhr(new Date(vorher.beginn))} fortsetzen` : "Neuen Einsatz zurücknehmen";
}

/**
 * Speichert den Stand, zeigt Liste und Hinweise neu und sagt dort, wo getippt wurde, was geschah.
 * Die Meldung als Funktion läuft erst nach dem Speichern: Sie darf die Maske ändern und lesen, was
 * dann gilt. Ergibt `false`, wenn das Gerät den Stand nicht festhalten konnte (nichts hat sich geändert).
 */
function einsatzSetzen(stand: Einsatzstand, meldung: string | (() => string)): boolean {
    const zeile = element<HTMLParagraphElement>("einsatz-meldung");
    if (!einsatzSchreiben(stand)) {
        zeile.textContent = `Nicht gespeichert: Das Gerät kann nichts mehr speichern (${speicherZustand() === "voll" ? "Speicher voll" : "Speicher gesperrt"}). Der Einsatz bleibt unverändert.`;
        zeile.hidden = false;
        return false;
    }
    const text = typeof meldung === "function" ? meldung() : meldung;
    verlaufZeigen();
    einzelPruefen();
    zeile.textContent = text;
    zeile.hidden = false;
    // Wurde der Wechsel aus einem Hinweis angestoßen, liegt die Meldung in der zugeklappten Liste außerhalb des Bildes.
    if (!imBild(zeile)) {
        zeigeKurzmeldung(text, false);
    }
    return true;
}

/** Was „Neuer Einsatz“ an der Nr. der Maske geändert hat, damit „Fortsetzen“ es zurückgeben kann. */
const EINSATZ_NUMMER_SCHLUESSEL = "bnv.einsatz.nummer.v1";

/** Die Nr. nach `nummer`, die im laufenden Einsatz noch nicht erstellt oder abgelegt ist. */
function freieNummerNach(nummer: string): string {
    const abgelegt = new Set(ablageLesen().filter(eintrag => new Date(eintrag.zeit).getTime() >= aktuellerEinsatzBeginn())
        .map(eintrag => (eintrag.eingabe.nummer ?? "").trim()));
    let naechste = naechsteNummer(nummer);
    for (let versuch = 0; versuch < 1000 && naechste && (mitNummer(juengste(), naechste).length > 0 || abgelegt.has(naechste)); versuch++) {
        naechste = naechsteNummer(naechste);
    }
    return naechste;
}

element<HTMLButtonElement>("einsatz-neu").addEventListener("click", async () => {
    const ablage = ablageLesen().length;
    const letzter = verlauf.at(-1);
    const letzteNr = letzter?.eingabe.nummer?.trim();
    const beginnVorher = aktuellerEinsatzBeginn();
    const leer = einsatzStand().grenzen.includes(beginnVorher) && juengste().length === 0;
    // Lässt sich der Einsatzwechsel nicht festhalten, gar nicht erst fragen.
    if (!speicherPruefen(speicher())) {
        element<HTMLParagraphElement>("einsatz-meldung").textContent = `Nicht gespeichert: Das Gerät kann nichts mehr speichern (${speicherZustand() === "voll" ? "Speicher voll" : "Speicher gesperrt"}). Der Einsatz bleibt unverändert.`;
        element<HTMLParagraphElement>("einsatz-meldung").hidden = false;
        zeigeKurzmeldung("Neuer Einsatz nicht möglich: Das Gerät kann nichts speichern.", false);
        return;
    }
    // Ein zweiter Wechsel in einem leeren Einsatz ändert nichts: gleich sagen, ohne Rückfrage.
    if (leer) {
        einsatzSetzen(einsatzStand(), "Der laufende Einsatz ist von Hand begonnen und noch leer; ein weiterer Wechsel ändert nichts.");
        return;
    }
    // „Ab dem letzten Vordruck“ nur, wenn er jung ist und nicht ohnehin den Einsatz eröffnet: sonst trennte es nichts.
    const letzteZeit = letzter ? new Date(letzter.zeit).getTime() : 0;
    const dritteMoeglich = Boolean(letzter) && letzteZeit > beginnVorher && Date.now() - letzteZeit < 2 * 60 * 60 * 1000;
    const maskeJetzt = maskeLesen();
    const leerMaske = !(maskeJetzt.inhalt ?? "").trim();
    const nrVorher = maskeJetzt.nummer?.trim() ?? "";
    const neueNr = `${/^(.*?)\d*$/.exec(nrVorher)?.[1] ?? ""}1`;
    const wahl = await frageWahl([
        `Neuen Einsatz beginnen? Frühere Nummern gelten dann nicht mehr als doppelt; die Liste bleibt.${ablage > 0 ? ` Die Ablage (${ablage}) bleibt, ihre Nummern zählen im neuen Einsatz nicht.` : ""}`,
        `„Neuen Einsatz beginnen“: ab jetzt zählen nur neue Vordrucke${leerMaske ? (neueNr === nrVorher ? `; die Maske bleibt bei Nr. ${nrVorher}.` : `; die Maske beginnt dann mit Nr. ${neueNr} (${nrVorher ? `vorher ${nrVorher}` : "bisher keine Nr. eingetragen"}).`) : "."}`,
        ...dritteMoeglich && letzter ? [`„Ab dem letzten Vordruck“: Nr. ${letzteNr || "ohne Nr."} vom ${tagUhr(new Date(letzter.zeit))} gehört schon zum neuen Einsatz.`] : [],
        "Zurücknehmen: „Einsatz … fortsetzen“ unter „Erstellte Vordrucke“."
    ].join("\n"),
        "Neuen Einsatz beginnen", "Abbrechen", dritteMoeglich ? "Ab dem letzten Vordruck" : "");
    if (wahl === "nein") {
        return;
    }
    const stand = einsatzStand();
    const eingabe = maskeLesen();
    // Ein älterer Merker einer früheren Wahl gilt nicht mehr, auch wenn die Nr. diesmal gleich bleibt.
    speicher()?.removeItem(EINSATZ_NUMMER_SCHLUESSEL);
    const leerText = !(eingabe.inhalt ?? "").trim();
    // Ohne begonnenen Text fängt die Nummerierung neu an (mit dem Vorsatz der bisherigen Nr.), nach
    // „Ab dem letzten Vordruck“ mit der Nr. nach diesem Vordruck; „Fortsetzen“ gibt sie zurück.
    const nummerAendern = (ziel: () => string): string => {
        const vorher = eingabe.nummer?.trim() ?? "";
        if (!leerText) {
            return ` Die Maske behält Nr. ${vorher || "(ohne)"} mit ihrem Text; gehört der Spruch in den neuen Einsatz, jetzt die Nr. prüfen.`;
        }
        const nummer = ziel();
        if (!nummer || nummer === vorher) {
            return nummer ? ` Die Maske bleibt bei Nr. ${nummer}.` : "";
        }
        setzeFeld("nummer", nummer);
        schreibe(speicher(), EINSATZ_NUMMER_SCHLUESSEL, JSON.stringify({ gesetzt: nummer, vorher }));
        return ` Die Maske beginnt mit Nr. ${nummer}${vorher ? ` (vorher ${vorher})` : ""}.`;
    };
    if (wahl === "dritte" && letzter) {
        stand.grenzen.push(letzteZeit);
        stand.grenzen.sort((x, y) => x - y);
        einsatzSetzen(stand, () => `Neuer Einsatz beginnt mit dem letzten Vordruck${letzteNr ? ` (Nr. ${letzteNr})` : ""}; frühere Nummern zählen beim Prüfen nicht mehr.`
            + nummerAendern(() => letzteNr ? freieNummerNach(letzteNr) : ""));
        return;
    }
    stand.grenzen.push(Date.now());
    einsatzSetzen(stand, () => "Neuer Einsatz begonnen: Frühere Nummern zählen beim Prüfen nicht mehr."
        + nummerAendern(() => `${/^(.*?)\d*$/.exec(eingabe.nummer?.trim() ?? "")?.[1] ?? ""}1`));
});
element<HTMLButtonElement>("einsatz-fortsetzen").addEventListener("click", async () => {
    const vorher = vorigerEinsatz();
    const stand = einsatzStand();
    // Ein fester Zeitpunkt für alle Vergleiche: Ohne Arbeit in den letzten zwölf Stunden beginnt der Einsatz „jetzt“, und das wandert.
    const jetzt = Date.now();
    const beginn = einsatzBeginn(aktivitaet(), stand, jetzt);
    const handgesetzt = stand.grenzen.includes(beginn);
    const imEinsatz = juengste().length;
    const folge = imEinsatz > 0
        ? ` ${imEinsatz === 1 ? `Die schon erstellte Nr. ${juengste()[0]?.eingabe.nummer?.trim() || "(ohne Nr.)"} des laufenden Einsatzes gehört` : `Die ${imEinsatz} schon erstellten Nummern des laufenden Einsatzes gehören`} dann zum selben Nummernkreis; gleiche Nummern erscheinen in der Liste als „(Korrektur)“ oder „(erneut gedruckt)“.`
        : "";
    const frageText = vorher
        ? `Den Einsatz ${zeitraum(vorher.beginn, vorher.ende)} fortsetzen? ${vorher.anzahl === 1 ? "Sein einziger Eintrag zählt" : `Seine ${vorher.anzahl} Einträge zählen`} dann wieder beim Prüfen und Hochzählen der Nummern${handgesetzt ? "" : ", auch über die Pause hinweg"}.${folge}`
        : `Den von Hand begonnenen Einsatz zurücknehmen? Es zählen dann wieder alle Einträge seit der letzten Pause von zwölf Stunden.${folge}`;
    if (!await frage(frageText, vorher ? "Einsatz fortsetzen" : "Zurücknehmen")) {
        return;
    }
    const neu: Einsatzstand = { grenzen: [...stand.grenzen], bruecken: [...stand.bruecken] };
    if (handgesetzt) {
        // Genau die zuletzt gesetzte Grenze zurück: so führt der Weg dorthin, wo man vorher war.
        neu.grenzen.splice(neu.grenzen.lastIndexOf(beginn), 1);
    }
    // Beginnt der Einsatz auch ohne Grenze mit dieser Pause, überbrückt „Fortsetzen“ sie. Die Brücke liegt
    // am letzten Eintrag vor der Pause, gleich ob erstellt oder abgelegt.
    if (vorher && einsatzBeginn(aktivitaet(), neu, jetzt) > vorher.ende) {
        neu.bruecken = [...new Set([...neu.bruecken, ...vorher.bruecken])].sort((x, y) => x - y);
    }
    // Nichts vortäuschen: Hat sich der Beginn nicht geändert, sagen.
    if (einsatzBeginn(aktivitaet(), neu, jetzt) === beginn) {
        einsatzSetzen(stand, "Es ließ sich nichts zurücknehmen; der laufende Einsatz beginnt unverändert.");
        return;
    }
    einsatzSetzen(neu, () => {
        // Hat „Neuer Einsatz“ die Nr. der Maske geändert, gibt „Fortsetzen“ sie zurück, solange noch kein Text darin steht.
        let nummerText = "";
        try {
            const gemerkt = JSON.parse(speicher()?.getItem(EINSATZ_NUMMER_SCHLUESSEL) ?? "null") as { gesetzt?: string; vorher?: string } | null;
            const jetzt = maskeLesen();
            if (gemerkt?.gesetzt && (jetzt.nummer ?? "").trim() === gemerkt.gesetzt) {
                if (!(jetzt.inhalt ?? "").trim()) {
                    // Hatte die Maske vorher keine Nr., geht es hinter der letzten des fortgesetzten Einsatzes weiter.
                    const letzteNr = juengste().at(-1)?.eingabe.nummer?.trim();
                    const ziel = gemerkt.vorher || (letzteNr ? freieNummerNach(letzteNr) : "");
                    if (ziel && ziel !== gemerkt.gesetzt) {
                        setzeFeld("nummer", ziel);
                        nummerText = ` Die Maske steht ${gemerkt.vorher ? "wieder " : ""}auf Nr. ${ziel}.`;
                    }
                } else if (gemerkt.vorher) {
                    nummerText = ` Die Maske hat Text und bleibt bei Nr. ${gemerkt.gesetzt}; vor „Neuer Einsatz“ war es Nr. ${gemerkt.vorher}.`;
                }
            }
            speicher()?.removeItem(EINSATZ_NUMMER_SCHLUESSEL);
        } catch {
            // Kaputter Merker: nichts zurückgeben.
        }
        return (vorher ? `Einsatz ${zeitraum(vorher.beginn, vorher.ende)} fortgesetzt; seine Nummern zählen wieder. Wieder trennen: „Neuer Einsatz“.` : "Neuer Einsatz zurückgenommen; die Nummern zählen wieder wie vorher.") + nummerText;
    });
});

element<HTMLButtonElement>("verlauf-csv").addEventListener("click", () => {
    herunterladen(new Blob([verlaufAlsCsv(verlauf, einsatzStand(), aktivitaet().map(eintrag => new Date(eintrag.zeit).getTime()))], { type: "text/csv;charset=utf-8" }), "erstellte-vordrucke.csv");
});
// Die gelöschte Liste bleibt im Gerätespeicher, bis sie wiederhergestellt oder
// von einem weiteren Löschen ergänzt wird: Wiederherstellen übersteht ein Neuladen.
const GELOESCHT_SCHLUESSEL = "bnv.verlauf.geloescht.v1";
function geloeschteListe(): Eintrag[] {
    try {
        const daten = JSON.parse(speicher()?.getItem(GELOESCHT_SCHLUESSEL) ?? "[]") as unknown;
        return Array.isArray(daten) ? daten as Eintrag[] : [];
    } catch {
        return [];
    }
}
function geloeschtZeigen(): void {
    const anzahl = geloeschteListe().length;
    element<HTMLParagraphElement>("verlauf-geloescht").hidden = anzahl === 0;
    // Der Zeitraum der Einträge selbst: Nach mehrfachem Löschen stammen sie aus mehreren Einsätzen.
    const zeiten = geloeschteListe().map(eintrag => new Date(eintrag.zeit)).filter(zeit => !Number.isNaN(zeit.getTime())).sort((a, b) => a.getTime() - b.getTime());
    const tag = (zeit: Date) => zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    const erste = zeiten[0];
    const letzte = zeiten.at(-1);
    const wann = erste && letzte ? (tag(erste) === tag(letzte) ? ` vom ${tag(erste)}` : ` vom ${tag(erste)} bis ${tag(letzte)}`) : "";
    element<HTMLSpanElement>("verlauf-geloescht-text").textContent = `Gelöschte Liste mit ${anzahl} ${anzahl === 1 ? "Eintrag" : "Einträgen"}${wann} liegt noch bereit; „Wiederherstellen“ sortiert sie zeitlich zu den heutigen Einträgen.`;
}
geloeschtZeigen();
element<HTMLButtonElement>("verlauf-verwerfen").addEventListener("click", async () => {
    if (!await frage(`Die gelöschte Liste mit ${geloeschteListe().length} ${geloeschteListe().length === 1 ? "Eintrag" : "Einträgen"} endgültig verwerfen? Das lässt sich nicht zurücknehmen.`, "Endgültig verwerfen")) {
        return;
    }
    speicher()?.removeItem(GELOESCHT_SCHLUESSEL);
    geloeschtZeigen();
});
element<HTMLButtonElement>("verlauf-loeschen").addEventListener("click", async () => {
    // Ohne Platz für die Sicherung lässt sich die Liste nicht löschen: nicht erst fragen.
    if (!speicherPruefen(speicher())) {
        zeigeKurzmeldung("Die Liste lässt sich nicht löschen: Das Gerät kann die Sicherung dafür nicht speichern. Erst „Liste als CSV“ sichern.", false);
        return;
    }
    if (!await frage(`Die Liste mit ${verlauf.length} ${verlauf.length === 1 ? "erstelltem Vordruck" : "erstellten Vordrucken"} von diesem Gerät löschen? Die PDF-Dateien bleiben erhalten. Danach prüft die App diese Nummern nicht mehr auf Doppel. „Wiederherstellen“ holt die Liste zurück, auch nach einem Neuladen.`, "Liste löschen")) {
        return;
    }
    // Ein zweites Löschen verwirft das erste nicht: beide kommen zusammen zurück.
    // Lässt sich die Sicherung nicht schreiben, bleibt die Liste: sonst wäre sie ohne Weg zurück weg.
    if (!schreibe(speicher(), GELOESCHT_SCHLUESSEL, JSON.stringify([...geloeschteListe(), ...verlauf]))) {
        zeigeKurzmeldung("Die Liste wurde nicht gelöscht: Das Gerät kann die Sicherung dafür nicht speichern. Erst „Liste als CSV“ sichern.");
        return;
    }
    schreibe(speicher(), `${GELOESCHT_SCHLUESSEL}.zeit`, new Date().toISOString());
    loescheVerlauf();
    verlauf = [];
    verlaufZeigen();
    geloeschtZeigen();
    kurzmeldungSchliessen();
    // Die Seite wird kürzer: „Wiederherstellen“ soll im Bild bleiben, nicht die Fußzeile.
    element<HTMLParagraphElement>("verlauf-geloescht").scrollIntoView({ block: "center" });
});
element<HTMLButtonElement>("verlauf-wiederherstellen").addEventListener("click", () => {
    // Zeitlich einsortiert; derselbe Eintrag kommt nicht doppelt hinein.
    const gemerkt = uebernimmEintraege(geloeschteListe());
    verlauf = gemerkt.liste;
    if (!gemerkt.gespeichert) {
        // Die Sicherung bleibt liegen: Mit ihr entfernt wäre die Liste nach dem Neuladen endgültig weg.
        verlaufZeigen();
        zeigeKurzmeldung(`Nicht dauerhaft wiederhergestellt: ${speicherZustand() === "voll" ? "Der Speicher des Geräts ist voll" : "Das Gerät speichert nichts"}. Die Liste gilt nur bis zum Neuladen; die gelöschte Liste bleibt als Sicherung liegen („Liste als CSV“ sichern).`, false);
        return;
    }
    speicher()?.removeItem(GELOESCHT_SCHLUESSEL);
    element<HTMLParagraphElement>("verlauf-geloescht").hidden = true;
    verlaufZeigen();
    // Eine ältere Warnung („gilt nur bis zum Neuladen“) ist damit erledigt; die Rückmeldung bestätigt, was geschah.
    zeigeKurzmeldung(`Liste wiederhergestellt: ${verlauf.length} ${verlauf.length === 1 ? "Eintrag" : "Einträge"}.`, false);
});

/**
 * Angaben der eigenen Station, die „Nächster Vordruck“ nach einem Ausgang
 * stehen gelassen hat. Wird danach auf Eingang gestellt, gehören dort die
 * Angaben der sendenden Stelle hin; ein Hinweis sagt das.
 */
let uebernommen: Eingabe | null = null;

async function naechsterVordruck(knopf: HTMLButtonElement): Promise<void> {
    // Ein Doppeltipp soll nicht die eigene Rückfrage bestätigen.
    if (!kurzSperren(knopf)) {
        return;
    }
    const eingabe = maskeLesen();
    const ablegbar = Boolean((eingabe.inhalt ?? "").trim()) && !istErstellt(eingabe);
    if (ablegbar && !await frage(`Dieser Vordruck${eingabe.nummer?.trim() ? ` Nr. ${eingabe.nummer.trim()}` : ""} wurde noch nicht als PDF erstellt. ${speicherZustand() === "ok" ? "Er kommt in die Ablage unter den Knöpfen und lässt sich von dort zurückholen." : "Das Gerät kann nichts speichern: Er geht verloren und lässt sich nicht zurückholen; wer ihn braucht, erzeugt vorher das PDF."}${ablageVollSatz(eingabe)} Zum nächsten Vordruck wechseln?`, "Zum nächsten Vordruck")) {
        return;
    }
    // Ein nie erstellter Vordruck mit Text bleibt zurückholbar.
    const heraus = ablegbar ? ablegen(eingabe, "verworfen") : "";
    // Bei einem Eingang sind Absender, Zeichen und Funktion die der Gegenstelle: nicht behalten.
    const eingang = eingabe.richtung === "Eingang";
    const behalten = eingang ? BEHALTEN_EINGANG : BEHALTEN_AUSGANG;
    const neu = Object.fromEntries(SPALTEN.map(spalte => [
        spalte.schluessel,
        behalten.includes(spalte.schluessel) ? eingabe[spalte.schluessel] ?? "" : vorgaben[spalte.schluessel] ?? ""
    ])) as Eingabe;
    // Schon erstellte Nummern überspringen, etwa nach einem Tabellenlauf; ebenso
    // Nummern, unter denen ein nicht erstellter Spruch in der Ablage liegt.
    // Ohne Nr. in der Maske (etwa nach einem Tabellenlauf) an die höchste erstellte anschließen.
    const hoechsteErstellte = [...juengste()].reverse().map(eintrag => (eintrag.eingabe.nummer ?? "").trim())
        .filter(nummer => /\d$/.test(nummer))
        .sort((a, b) => Number(/(\d+)$/.exec(b)?.[1] ?? 0) - Number(/(\d+)$/.exec(a)?.[1] ?? 0))[0];
    neu.nummer = naechsteNummer((eingabe.nummer ?? "").trim() || hoechsteErstellte || "");
    // Nur Ablage-Einträge des laufenden Einsatzes: Reste einer früheren Übung sollen nicht verschieben.
    const beginn = aktuellerEinsatzBeginn();
    const abgelegteNummern = new Set(ablageLesen().filter(eintrag => new Date(eintrag.zeit).getTime() >= beginn)
        .map(eintrag => (eintrag.eingabe.nummer ?? "").trim()).filter(Boolean));
    const erstellt = (nummer: string) => mitNummer(juengste(), nummer).length > 0;
    const uebersprungenErstellt: string[] = [];
    const uebersprungenAbgelegt: string[] = [];
    for (let versuch = 0; versuch < 1000 && neu.nummer && (erstellt(neu.nummer) || abgelegteNummern.has(neu.nummer)); versuch++) {
        (erstellt(neu.nummer) ? uebersprungenErstellt : uebersprungenAbgelegt).push(neu.nummer);
        neu.nummer = naechsteNummer(neu.nummer);
    }
    // Rat zum neuen Einsatz nur, wenn die übersprungenen Nummern schon älter sind, nicht nach dem eigenen Tabellenlauf eben.
    const alt = juengste().some(eintrag => uebersprungenErstellt.includes((eintrag.eingabe.nummer ?? "").trim()) && Date.now() - new Date(eintrag.zeit).getTime() > 2 * 60 * 60 * 1000);
    const uebersprungen = [
        uebersprungenErstellt.length > 0 ? ` ${nummernListe(uebersprungenErstellt)} schon erstellt.` : "",
        uebersprungenAbgelegt.length > 0 ? ` ${nummernListe(uebersprungenAbgelegt)} in der Ablage.` : "",
        uebersprungenErstellt.length > 0 && alt ? einsatzRat() : ""
    ].join("");
    // Füllt die neue Nr. eine Lücke, soll das eine Entscheidung sein: die höchste schon erstellte nennen.
    const vorsatz = /^(.*?)(\d+)$/.exec(neu.nummer ?? "");
    const hoechste = vorsatz ? Math.max(...juengste().map(eintrag => {
        const teile = /^(.*?)(\d+)$/.exec((eintrag.eingabe.nummer ?? "").trim());
        return teile && teile[1] === vorsatz[1] ? Number(teile[2]) : 0;
    }), 0) : 0;
    const luecke = vorsatz && hoechste > Number(vorsatz[2])
        ? ` Nr. ${neu.nummer} füllt eine Lücke; Nr. ${vorsatz[1]}${hoechste} ist schon erstellt, am Ende ginge es mit ${naechsteNummer(`${vorsatz[1]}${hoechste}`)} weiter.`
        : "";
    uebernommen = eingang ? null : { absender: neu.absender ?? "", zeichen: neu.zeichen ?? "", funktion: neu.funktion ?? "" };
    maskeSchreiben(neu);
    angefasstZuruecksetzen();
    entwurfSpeichern();
    weitereZaehlen();
    planeVorschau();
    // Die Richtung ausdrücklich nennen: sie bleibt stehen und muss bei Bedarf umgestellt werden.
    // Nur nennen, was tatsächlich übernommen wurde.
    const richtung = neu.richtung ? `Richtung „${neu.richtung}“` : "keine Richtung gewählt";
    const uebernommenNamen = behalten
        .filter(schluessel => !["titel", "hinweis", "richtung"].includes(schluessel) && (neu[schluessel] ?? "").trim())
        .map(schluessel => SPALTEN.find(spalte => spalte.schluessel === schluessel)?.titel ?? schluessel);
    const text = `Neuer Vordruck${neu.nummer ? ` Nr. ${neu.nummer}` : ""}, ${richtung}.${uebersprungen}${luecke} `
        + (uebernommenNamen.length > 0
            ? `Übernommen: ${aufzaehlen(uebernommenNamen)}; alles andere ist leer.`
            : "Alles andere ist leer.")
        + (ablegbar ? ` ${inDerAblage(eingabe.nummer?.trim() ? `Nr. ${eingabe.nummer.trim()}` : "Der vorige Vordruck ohne Nr.")}` : "")
        + heraus;
    // Der Hinweis nach dem Neuladen hat seinen Zweck erfüllt; Rückmeldung und
    // Zurücknehmen stehen oben über der Maske, an einer Stelle für beide Wege.
    entwurfHinweis.hidden = true;
    meldeStatus(text, { stand: eingabe, aktion: "Nächster Vordruck" }, true);
    // Der Rat „Neuer Einsatz wählen“ liegt sonst in der zugeklappten Liste: den Knopf gleich dazu.
    if (text.includes(einsatzRat())) {
        const aktion = document.createElement("button");
        aktion.type = "button";
        aktion.className = "link";
        aktion.textContent = "Neuer Einsatz …";
        aktion.addEventListener("click", () => element<HTMLButtonElement>("einsatz-neu").click());
        obenStatus.append(" ", aktion);
    }
    // Rückmeldung und erstes Feld zusammen ins Bild, ohne Kurzmeldung über den Feldern.
    // Der zweite Tipp eines Doppeltipps landet sonst im hochgerollten Formular.
    maskeSperreBis = performance.now() + 1_200;
    element<HTMLDivElement>("oben-zuruecknahme").scrollIntoView({ block: "start" });
    const gegenstelle = maske.elements.namedItem("empfaenger") as HTMLInputElement;
    gegenstelle.focus({ preventScroll: true });
    if (!imBild(gegenstelle)) {
        gegenstelle.scrollIntoView({ block: "nearest" });
    }
}

/** Bis dahin nimmt die Maske keine Tipps an (`performance.now()`), etwa gleich nach dem Hochrollen. */
let maskeSperreBis = 0;
for (const art of ["pointerdown", "mousedown", "touchstart", "click"] as const) {
    maske.addEventListener(art, ereignis => {
        if (ereignis.isTrusted && performance.now() < maskeSperreBis) {
            ereignis.preventDefault();
            ereignis.stopPropagation();
            // Nicht stumm: Ein bewusster Tipp soll wissen, dass er wiederholt werden muss.
            if (art === "pointerdown") {
                zeigeKurzmeldung("Neuer Vordruck geöffnet: Dieser Tipp wurde nicht ausgeführt (Schutz vor Doppeltipp). Bitte noch einmal tippen.", false);
            }
        }
    }, { capture: true, passive: false });
}

/** „Nr. 5 ist“, „Nr. 19 und 20 sind“, „Nr. 2 bis 40 sind“; nicht fortlaufende einzeln. */
function nummernListe(nummern: readonly string[]): string {
    const erste = nummern[0] ?? "";
    const letzte = nummern.at(-1) ?? "";
    const fortlaufend = nummern.every((nummer, index) => index === 0 || naechsteNummer(nummern[index - 1] ?? "") === nummer);
    if (nummern.length === 1) {
        return `Nr. ${erste} ist`;
    }
    if (fortlaufend && nummern.length > 2) {
        return `Nr. ${erste} bis ${letzte} sind`;
    }
    return `Nr. ${aufzaehlen(nummern.slice(0, 6))}${nummern.length > 6 ? " u. a." : ""} sind`;
}


element<HTMLButtonElement>("einzeln-naechster").addEventListener("click", ereignis =>
    void naechsterVordruck(ereignis.currentTarget as HTMLButtonElement));
element<HTMLButtonElement>("entwurf-naechster").addEventListener("click", ereignis =>
    void naechsterVordruck(ereignis.currentTarget as HTMLButtonElement));
element<HTMLButtonElement>("entwurf-behalten").addEventListener("click", () => {
    entwurfHinweis.hidden = true;
    // Weiter bearbeiten heißt: zur Maske, ins erste leere Feld von Nr., Gegenstelle und Text.
    const ziel = (["nummer", "empfaenger", "inhalt"] as const)
        .map(name => maske.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)
        .find(feld => feld && !feld.value.trim()) ?? maske.elements.namedItem("inhalt") as HTMLTextAreaElement | null;
    ziel?.focus();
});

element<HTMLButtonElement>("einzeln-oeffnen").addEventListener("click", ereignis =>
    void einzelErstellen(ereignis.currentTarget as HTMLButtonElement, "oeffnen"));

element<HTMLButtonElement>("einzeln-leeren").addEventListener("click", async () => {
    const eingabe = maskeLesen();
    const belegt = SPALTEN.filter(spalte => (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? ""));
    // Was gerade nicht zu sehen ist, zählt mit; das soll die Rückfrage sagen.
    const verborgen = belegt.filter(spalte => {
        const feld = maske.elements.namedItem(spalte.schluessel);
        const ziel = feld instanceof RadioNodeList ? feld[0] : feld;
        return ziel instanceof HTMLElement && Boolean(ziel.closest("[hidden], details:not([open])"));
    });
    const zusatz = verborgen.length > 0 ? ` (davon ${verborgen.length} in zugeklappten oder ausgeblendeten Bereichen)` : "";
    // Schon leer: nichts tun. Ein zweiter Tipp daneben soll das „Rückgängig“ nicht wegnehmen.
    if (belegt.length === 0) {
        return;
    }
    if (!await frage(`Alle Felder leeren? ${belegt.length} ausgefüllte ${belegt.length === 1 ? "Angabe" : "Angaben"}${zusatz} ${belegt.length === 1 ? "wird" : "werden"} geleert. ${speicherZustand() === "ok" ? "Ein nicht erstellter Vordruck kommt in die Ablage unter den Knöpfen und lässt sich von dort zurückholen, auch nach weiterem Tippen." : "Das Gerät kann nichts speichern: Ein nicht erstellter Vordruck geht verloren und lässt sich nicht zurückholen."}${ablageVollSatz(eingabe)}`, "Felder leeren")) {
        return;
    }
    const wirdAbgelegt = Boolean((eingabe.inhalt ?? "").trim()) && !istErstellt(eingabe);
    const heraus = wirdAbgelegt ? ablegen(eingabe, "geleert") : "";
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(vorgaben);
    entwurfEntfernen();
    weitereZaehlen();
    entwurfHinweis.hidden = true;
    angefasstZuruecksetzen();
    meldeStatus(`Alle Felder geleert.${wirdAbgelegt ? ` ${inDerAblage(eingabe.nummer?.trim() ? `Nr. ${eingabe.nummer.trim()}` : "Der Vordruck ohne Nr.")}` : ""}${heraus}`, { stand: eingabe, aktion: "Felder leeren", beschriftung: "Alle geleerten Felder wiederherstellen" });
    planeVorschau();
});

// ---- Tabelle -------------------------------------------------------------

let ergebnis: TabellenErgebnis | null = null;
/** Hinweise des Lesens selbst, etwa Formeln ohne Wert. */
let leseHinweise: string[] = [];
let dateiName = "";
/** „Ersetzt alt.csv (3 Zeilen).“, wenn eine geladene Tabelle ausgetauscht wurde. */
let ersetztText = "";

/**
 * Der Excel-Teil wird erst bei Bedarf geladen. Fehlt er (alter Tab über zwei
 * Auslieferungen, kein Offline-Speicher), eine deutsche Meldung mit Ausweg.
 */
async function excelTeil(): Promise<typeof import("./excel.js")> {
    try {
        const teil = await import("./excel.js");
        // Auch die Bibliothek selbst ist ein eigener Teil; fehlt sie, dieselbe Meldung.
        await teil.excelBereit();
        return teil;
    } catch {
        throw new Error("Der Excel-Teil ist auf diesem Gerät gerade nicht verfügbar. Seite neu laden oder die Tabelle als CSV speichern und einlesen; „CSV-Vorlage“ geht immer.");
    }
}

element<HTMLButtonElement>("vorlage-xlsx").addEventListener("click", ereignis => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    void mitArbeit(knopf, "Vorlage wird erstellt…", async () => {
        try {
            const { erzeugeVorlage } = await excelTeil();
            herunterladen(await erzeugeVorlage(), "nachrichtenvordruck-vorlage.xlsx");
        } catch (fehler) {
            meldeStatus("", "behalten");
            zeigeKurzmeldung(fehler instanceof Error ? fehler.message : String(fehler), false);
        }
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
    // Lässt sich die neue Datei nicht lesen, bleibt die zuvor geprüfte geladen.
    const vorher = ergebnis ? { ergebnis, dateiName, leseHinweise } : null;
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
            const { leseExcel } = await excelTeil();
            const hinweise: string[] = [];
            tabelle = await leseExcel(await datei.arrayBuffer(), hinweise);
            leseHinweise = hinweise;
        } else if (/\.xls$/i.test(datei.name)) {
            throw new Error("Das alte Excel-Format .xls wird nicht gelesen. Bitte in Excel als .xlsx oder CSV speichern.");
        } else if (/\.(csv|tsv|txt)$/i.test(datei.name)) {
            const text = dekodiereCsv(await datei.arrayBuffer());
            // Nullbytes kommen in Text nicht vor, wohl aber in PDF, Bildern oder umbenannten Excel-Dateien.
            if (text.includes("\u0000") || text.startsWith("PK\u0003\u0004") || text.startsWith("%PDF")) {
                throw new Error("Das ist keine Text- oder CSV-Datei. Gelesen werden Excel (.xlsx) und CSV.");
            }
            const hinweise: string[] = [];
            tabelle = leseCsv(text, undefined, hinweise);
            leseHinweise = hinweise;
        } else {
            throw new Error("Gelesen werden nur Excel (.xlsx) und CSV (.csv, .tsv, .txt).");
        }
        const neu = leseTabelle(tabelle);
        // Eine leere oder fremde Datei soll eine geprüfte Tabelle nicht verdrängen.
        if (vorher && (neu.zeilen.length === 0 || neu.bekannteSpalten === 0)) {
            throw new Error(neu.bekannteSpalten === 0
                ? "In der ersten Zeile steht kein bekannter Spaltenkopf (z. B. „Nr“, „Empfänger“, „Inhalt“)."
                : "Unter der Kopfzeile steht keine ausgefüllte Zeile.");
        }
        ergebnis = neu;
        // Ein Austausch soll nicht unbemerkt bleiben.
        ersetztText = vorher ? ` Ersetzt ${vorher.dateiName} (${vorher.ergebnis.zeilen.length} ${vorher.ergebnis.zeilen.length === 1 ? "Zeile" : "Zeilen"}).` : "";
        dateiName = datei.name;
        // Nur der Name, nicht der Inhalt: nach dem Neuladen sagt die Seite, was zuvor geladen war.
        schreibeImTab(tabSpeicher(), "bnv.tabelle.v1", datei.name);
    } catch (fehler) {
        const meldung = `${datei.name} ließ sich nicht lesen: ${fehler instanceof Error ? fehler.message : String(fehler)}`;
        ergebnis = vorher?.ergebnis ?? null;
        if (vorher) {
            dateiName = vorher.dateiName;
            leseHinweise = vorher.leseHinweise;
            tabelleAnzeigen();
        } else {
            zusammenfassung.textContent = "";
        }
        const kasten = element<HTMLElement>("ergebnis-fehler");
        const satz = document.createElement("p");
        satz.textContent = vorher ? `${meldung} Weiter geladen ist ${vorher.dateiName}.` : meldung;
        kasten.prepend(satz);
        kasten.hidden = false;
        return;
    }
    tabelleAnzeigen();
    element<HTMLElement>("ergebnis").scrollIntoView({ block: "start" });
}

/** „Nr. 18 (Eingang von Heros Jever 21/10)“ für Rückmeldungen statt des Dateinamens. */
function beschreibe(eingabe: Eingabe): string {
    const nummer = eingabe.nummer?.trim();
    const gegenstelle = eingabe.empfaenger?.trim();
    // Der Meldevordruck hat keine Richtung; was nicht auf dem Bogen steht, soll auch die Meldung nicht nennen.
    const meldung = optionen().vordruck === "meldung";
    const richtung = meldung ? "an" : eingabe.richtung === "Eingang" ? "Eingang von" : eingabe.richtung === "Ausgang" ? "Ausgang an" : "Gegenstelle";
    const zusatz = gegenstelle ? ` (${richtung} ${kurz(gegenstelle, 30)})` : eingabe.richtung && !meldung ? ` (${eingabe.richtung})` : "";
    return `${nummer ? `Nr. ${nummer}` : "Vordruck ohne Nr."}${zusatz}`;
}

/** „a“, „a und b“, „a, b und c“. */
function aufzaehlen(teile: readonly string[]): string {
    return teile.length <= 1 ? teile.join("") : `${teile.slice(0, -1).join(", ")} und ${teile.at(-1)}`;
}

function kurz(text: string, laenge: number): string {
    const einzeilig = text.replace(/\s+/g, " ").trim();
    return einzeilig.length > laenge ? `${einzeilig.slice(0, laenge - 1)}…` : einzeilig;
}

/** „In 5 von 20 Zeilen fehlt …: Zeilen 3, 4, 9 …“; leer, wenn in keiner Zeile. */
function fehltIn(betroffen: readonly TabellenErgebnis["zeilen"][number][], was: string, basis?: number, bezug?: readonly [string, string]): string {
    const alle = ergebnis?.zeilen.length ?? 0;
    // `basis`: Zahl der Zeilen, für die das Feld überhaupt gilt (etwa nur die Ausgänge). Sonst alle.
    const gesamt = basis ?? alle;
    if (betroffen.length === 0 || gesamt === 0) {
        return "";
    }
    if (betroffen.length === gesamt && gesamt === alle) {
        return `In keiner Zeile steht ${was}.`;
    }
    const nummern = betroffen.slice(0, 8).map(zeile => zeile.zeile).join(", ") + (betroffen.length > 8 ? " …" : "");
    // `bezug`: Einzahl und Mehrzahl der Zeilenart („Ausgang“, „Ausgängen“): „In 1 von 2 Ausgängen (Zeile 3) fehlt der Absender.“
    if (bezug) {
        return `In ${betroffen.length} von ${gesamt} ${gesamt === 1 ? bezug[0] : bezug[1]} (${betroffen.length === 1 ? "Zeile" : "Zeilen"} ${nummern}) fehlt ${was}.`;
    }
    return betroffen.length === gesamt
        ? `In ${gesamt === 1 ? "der einzigen betroffenen Zeile" : `allen ${gesamt} betroffenen Zeilen`} (${betroffen.length === 1 ? "Zeile" : "Zeilen"} ${nummern}) fehlt ${was}.`
        : `In ${betroffen.length} von ${gesamt} Zeilen (${betroffen.length === 1 ? "Zeile" : "Zeilen"} ${nummern}) fehlt ${was}.`;
}

/** Zeilen, die genau so schon erstellt wurden, etwa beim erneuten Einlesen derselben Tabelle. */
function schonGleichErstellt(zeilen: readonly { zeile: number; eingabe: Eingabe }[]): string {
    // Nur dieselbe Vordruckart zählt: als Meldevordruck ist derselbe Stand ein neuer Bogen.
    const { vordruck } = optionen();
    const erstellt = new Map<string, Eintrag>();
    for (const eintrag of verlauf.filter(eintrag => !eintrag.vordruck || eintrag.vordruck === vordruck)) {
        const kennung = verlaufKennung(eintrag.eingabe);
        if (!erstellt.has(kennung)) {
            erstellt.set(kennung, eintrag);
        }
    }
    const gleich = zeilen.filter(zeile => erstellt.has(verlaufKennung(zeile.eingabe)));
    if (gleich.length === 0) {
        return "";
    }
    const erster = erstellt.get(verlaufKennung(gleich[0]?.eingabe ?? {}));
    const zeit = new Date(erster?.zeit ?? "");
    // Auch die Druckfassung nennen, von allen gleichen Zeilen: Wurde eine beim ersten Mal gekürzt oder verteilt gedruckt, ist ihr voller Text nicht gedruckt.
    const gekuerzteNr = gleich.filter(zeile => /gekürzt|verteilt/.test(erstellt.get(verlaufKennung(zeile.eingabe))?.zusatz ?? ""));
    const fassung = gekuerzteNr.length > 0
        ? `${gekuerzteNr.length === 1 ? "Zeile" : "Zeilen"} ${aufzaehlen(gekuerzteNr.slice(0, 6).map(zeile => String(zeile.zeile)))} gekürzt oder verteilt gedruckt`
        : "";
    const wann = Number.isNaN(zeit.getTime()) ? "" : ` (zuerst ${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr${fassung ? `; ${fassung}` : ""})`;
    return gleich.length === zeilen.length
        ? `Alle Zeilen wurden auf diesem Gerät schon mit gleichem Inhalt als PDF erstellt${wann}.`
        : `${gleich.length} von ${zeilen.length} Zeilen ${gleich.length === 1 ? "wurde" : "wurden"} auf diesem Gerät schon mit gleichem Inhalt als PDF erstellt${wann}.`;
}

/**
 * Nummern der Tabelle, die es auf diesem Gerät nur in einem früheren Einsatz gab: Sie gelten nicht
 * als doppelt, aber läuft der Einsatz noch, soll das auffallen.
 */
function fruehereEinsaetzeSatz(zeilen: readonly { daten: { nummer: string }; eingabe: Eingabe }[]): string {
    if (ergebnis?.istListe) {
        return "";
    }
    const beginn = aktuellerEinsatzBeginn();
    const alte = verlauf.filter(eintrag => new Date(eintrag.zeit).getTime() < beginn);
    const treffer = new Map<string, Eintrag>();
    for (const zeile of zeilen) {
        const frueher = mitNummer(alte, zeile.daten.nummer).at(-1);
        if (frueher && mitNummer(juengste(), zeile.daten.nummer).length === 0 && verlaufKennung(frueher.eingabe) !== verlaufKennung(zeile.eingabe)) {
            treffer.set(zeile.daten.nummer, frueher);
        }
    }
    if (treffer.size === 0) {
        return "";
    }
    const liste = [...treffer].slice(0, 4).map(([nummer, eintrag]) => `Nr. ${nummer} (${zeitText(eintrag.zeit).replace(/ um .*/, "")})`);
    return `${aufzaehlen(liste)}${treffer.size > 4 ? " u. a." : ""} gab es auf diesem Gerät schon in einem früheren Einsatz; ${treffer.size === 1 ? "sie zählt" : "sie zählen"} nicht als doppelt. Läuft dieser Einsatz noch, unter „Erstellte Vordrucke“ „Einsatz … fortsetzen“ wählen.`;
}

/** Ausgefüllte Spalten, die der Meldevordruck nicht hat, als Satz; leer, wenn keine. */
function nichtGedruckt(zeilen: readonly { eingabe: Eingabe }[], vordruck: VordruckWahl): string {
    if (vordruck !== "meldung") {
        return "";
    }
    const spalten = SPALTEN.filter(spalte => spalte.nurNachricht && zeilen.some(zeile => (zeile.eingabe[spalte.schluessel] ?? "").trim()));
    return spalten.length > 0
        ? `Der Meldevordruck hat keine Felder für ${aufzaehlen(spalten.map(spalte => spalte.titel))}; diese Spalten werden nicht gedruckt.`
        : "";
}

/** Lücken in fortlaufenden Nummern, etwa „Nr. 105 bis 107 fehlen“; einzeln erstellte Nummern zählen nicht als Lücke. */
function nummernluecken(nummern: readonly string[]): string {
    const zahlen = [...new Set(nummern.map(nummer => /^\D*(\d+)$/.exec(nummer.trim())?.[1]).filter(Boolean).map(Number))].sort((a, b) => a - b);
    if (zahlen.length < 3) {
        return "";
    }
    const erstellt = new Set(juengste().map(eintrag => Number(/^\D*(\d+)$/.exec((eintrag.eingabe.nummer ?? "").trim())?.[1] ?? NaN)));
    const fehlend: number[] = [];
    for (let i = 1; i < zahlen.length; i++) {
        const vorher = zahlen[i - 1] ?? 0;
        const jetzt = zahlen[i] ?? 0;
        if (jetzt - vorher > 1 && jetzt - vorher <= 50) {
            for (let nummer = vorher + 1; nummer < jetzt; nummer++) {
                if (!erstellt.has(nummer)) {
                    fehlend.push(nummer);
                }
            }
        }
    }
    if (fehlend.length === 0) {
        return "";
    }
    // Aufeinanderfolgende zu Bereichen zusammenfassen: „19 bis 21, 25“.
    const bereiche: string[] = [];
    for (let i = 0; i < fehlend.length; i++) {
        const anfang = fehlend[i] ?? 0;
        let ende = anfang;
        while (fehlend[i + 1] === ende + 1) {
            ende = fehlend[++i] ?? ende;
        }
        bereiche.push(ende === anfang ? `${anfang}` : ende === anfang + 1 ? `${anfang}, ${ende}` : `${anfang} bis ${ende}`);
    }
    return `In der Nummernfolge ${fehlend.length === 1 ? "fehlt" : "fehlen"} Nr. ${bereiche.slice(0, 5).join(", ")}${bereiche.length > 5 ? " u. a." : ""}.`;
}

function tabelleAnzeigen(): void {
    if (!ergebnis) {
        return;
    }
    const { zeilen, unbekannteSpalten, beispielZeilen } = ergebnis;
    const mitFehler = zeilen.filter(zeile => eigeneFehler(zeile.fehler, optionen().vordruck).length > 0);
    const { vordruck } = optionen();
    const art = { nachricht: "Nachrichtenvordrucke", meldung: "Meldevordrucke", beide: "Nachrichten- und Meldevordrucke" }[vordruck];

    element<HTMLParagraphElement>("ergebnis-zusammenfassung").textContent = ergebnis.bekannteSpalten === 0
        ? `In der ersten Zeile von ${dateiName} steht kein bekannter Spaltenkopf (z. B. „Nr“, „Empfänger“, „Inhalt“). Am einfachsten die Vorlage holen und die Daten dort einfügen.`
        : zeilen.length === 0
            ? `In ${dateiName} steht unter der Kopfzeile keine ausgefüllte Zeile.`
            : `${dateiName}: ${zeilen.length} ${zeilen.length === 1 ? "Zeile" : "Zeilen"} → ${art}.${ersetztText}`;
    element<HTMLParagraphElement>("tabelle-erstellt").hidden = true;
    listeUebernahmeZeigen();

    const warnung = element<HTMLElement>("ergebnis-warnung");
    // Gedruckt wird trotzdem; das soll vor dem Download auffallen.
    // „Gelesen wurde das Blatt …“ ist keine Warnung; es steht in der Zusammenfassung.
    const auffaellig = [...leseHinweise.filter(hinweis => !hinweis.startsWith("Gelesen wurde")), ...zeilen.flatMap(zeile => {
        const laenge = pruefeTextlaenge(zeile.daten.inhalt, vordruck);
        const gekuerzt = gekuerztSatz(zeileGekuerzt(zeile));
        // Eine wieder eingelesene eigene Liste enthält Korrekturen; dort zählt nur „genau so erstellt“.
        const frueher = ergebnis?.istListe ? undefined : frueherErstellt(zeile.daten.nummer, zeile.eingabe);
        const punkte = [
            ...zeile.hinweise,
            ...istKritisch(laenge) ? [textlaengeMeldung(laenge)] : [],
            ...gekuerzt ? [gekuerzt] : [],
            ...frueher ? [`Nr. ${zeile.daten.nummer} wurde ${zeitText(frueher.zeit)} schon ${(frueher.eingabe.inhalt ?? "").trim() !== (zeile.eingabe.inhalt ?? "").trim() ? "mit anderem Inhalt" : "an eine andere Gegenstelle"} erstellt, an „${kurz(frueher.eingabe.empfaenger ?? "", 30) || "keine Gegenstelle"}“`] : []
        ];
        return punkte.length > 0 ? [`Zeile ${zeile.zeile}: ${punkte.join("; ")}`] : [];
    })];
    warnung.replaceChildren();
    if (beispielZeilen.length > 0) {
        const satz = document.createElement("p");
        satz.textContent = `${beispielZeilen.length === 1 ? "Zeile" : "Zeilen"} ${beispielZeilen.join(", ")} ist die unveränderte Beispielzeile aus der Vorlage und wird nicht gedruckt.`;
        warnung.append(satz);
    }
    if (unbekannteSpalten.length > 0) {
        const satz = document.createElement("p");
        // Die Spalte „Verfasser“ gibt es nicht mehr: Der Absender ist der Verfasser, das soll hier stehen.
        const verfasser = unbekannteSpalten.some(name => name.trim().toLowerCase() === "verfasser");
        satz.textContent = `Diese Spalten sind unbekannt und werden ignoriert: ${unbekannteSpalten.join(", ")}.${verfasser ? " „Verfasser“ gibt es nicht mehr: Der Bogen nennt den Verfasser „Absender“. Bitte die Spalte in „Absender“ umbenennen." : ""}`;
        warnung.append(satz);
    }
    const zusatz = [
        ergebnis.kopfZeile > 1 ? `Die Spaltenköpfe stehen in Zeile ${ergebnis.kopfZeile}; die Zeilen davor werden übergangen.` : "",
        ergebnis.uebergangen.length > 0 ? `Die ${ergebnis.uebergangen.length === 1 ? "Spalte" : "Spalten"} ${aufzaehlen(ergebnis.uebergangen.map(name => `„${name}“`))} ${ergebnis.uebergangen.length === 1 ? "wird" : "werden"} nicht ausgewertet${ergebnis.uebergangen.some(name => name.toLowerCase() === "vordruck") ? "; gedruckt wird der oben unter „Vordruck und Blatt“ eingestellte Vordruck" : ""}.` : "",
        ...ergebnis.doppelteSpalten.map(paar => `Die Spalten ${paar} meinen dasselbe Feld; genommen wird die rechte.`),
        // Wie im Einzelweg: fehlt ein Kennzeichen überall, wird es auf keinem Bogen angekreuzt.
        vordruck !== "meldung" ? fehltIn(zeilen.filter(zeile => !zeile.daten.richtung),
            "eine Richtung; im Betriebsbuch wird dort weder Eingang noch Ausgang angekreuzt") : "",
        fehltIn(zeilen.filter(zeile => !zeile.daten.uebermittlungsweg), "ein Übermittlungsweg; dort wird keiner angekreuzt"),
        vordruck !== "meldung" ? fehltIn(zeilen.filter(zeile => zeile.daten.richtung === "eingang" && zeile.daten.inhalt
            && !Object.values(zeile.daten.aufnahmevermerk).some(wert => (wert ?? "").trim())), "bei einem Eingang der Aufnahmevermerk") : "",
        // Wie im Einzelweg: Abfassungszeit (nicht bei Eingängen) und Absender eines Ausgangs.
        fehltIn(zeilen.filter(zeile => zeile.daten.inhalt && zeile.daten.richtung !== "eingang" && !zeile.daten.abfassungszeit), "die Abfassungszeit"),
        fehltIn(zeilen.filter(zeile => zeile.daten.richtung === "ausgang" && !zeile.daten.absender), "der Absender", zeilen.filter(zeile => zeile.daten.richtung === "ausgang").length, ["Ausgang", "Ausgängen"]),
        nummernluecken(zeilen.map(zeile => zeile.daten.nummer)),
        nichtGedruckt(zeilen, vordruck),
        schonGleichErstellt(zeilen),
        fruehereEinsaetzeSatz(zeilen),
        listeVollSatz(zeilen.length)
    ].filter(Boolean);
    for (const text of zusatz) {
        const satz = document.createElement("p");
        satz.textContent = text;
        warnung.append(satz);
    }
    if (auffaellig.length > 0) {
        const liste = document.createElement("ul");
        const zeigen = [...auffaellig.slice(0, 20), ...auffaellig.length > 20 ? [`… und ${auffaellig.length - 20} weitere`] : []];
        liste.append(...zeigen.map(text => {
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
            punkt.textContent = `Zeile ${zeile.zeile}: ${eigeneFehler(zeile.fehler, vordruck).join("; ")}`;
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
        // Gelesene Auswahlwerte, damit ein verworfener Wert hier als „leer“ auffällt.
        const auswahl = (wert: string | undefined) => wert ? wert.charAt(0).toUpperCase() + wert.slice(1) : "leer";
        const WEGE_TEXT: Record<string, string> = { dfue: "DFÜ" };
        const weg = zeile.daten.uebermittlungsweg;
        // ⚠ Fehler (Wert fehlt auf dem Vordruck), ! Hinweis (wird gedruckt, wie es dasteht).
        const zuLang = istKritisch(pruefeTextlaenge(zeile.daten.inhalt, vordruck)) || zeileGekuerzt(zeile).length > 0;
        const marke = zeile.fehler.length > 0 ? " ⚠ Fehler" : zeile.hinweise.length > 0 || zuLang ? " ! Hinweis" : "";
        // Leer heißt beim Vorrang „ohne“; „leer“ nur, wenn ein Wert in der Datei verworfen wurde.
        const verworfen = (feld: string) => zeile.fehler.some(text => text.startsWith(`${feld}:`));
        const vorrang = zeile.daten.vorrang;
        const vorrangZelle = vorrang === "blitz"
            ? ["Vorrang", "⚡ BLITZ", "vorrang-blitz"]
            : vorrang
                ? ["Vorrang", auswahl(vorrang), "vorrang-hoch"]
                : verworfen("Vorrang") ? ["Vorrang", `leer („${(zeile.eingabe.vorrang ?? "").trim()}“ verworfen)`, "leer"] : ["Vorrang", "ohne", "ohne"];
        const zellen = [
            ["Zeile", `${zeile.zeile}${marke}`, "zahl"],
            ["Nr.", zeile.daten.nummer, "zahl"],
            vorrangZelle,
            ["Art", auswahl(zeile.daten.art), zeile.daten.art ? "" : "leer"],
            ["Weg", weg ? WEGE_TEXT[weg] ?? auswahl(weg) : verworfen("Übermittlungsweg") ? `leer („${(zeile.eingabe.weg ?? "").trim()}“ verworfen)` : "leer", weg ? "" : "leer"],
            ["Richtung", auswahl(zeile.daten.richtung), zeile.daten.richtung ? "" : "leer"],
            ["Zeit", zeile.daten.abfassungszeit, "zahl"],
            ["Gegenstelle", zeile.daten.empfaenger.join(", "), ""],
            ["Inhalt", kurz(zeile.daten.inhalt, 90), zuLang ? "inhalt zu-lang" : "inhalt"],
            ["Absender", zeile.daten.absender, ""]
        ] as const;
        // Auffällige Zeilen bleiben mobil auch in der verkürzten Übersicht sichtbar.
        tr.classList.toggle("auffaellig", Boolean(marke) || zuLang || vorrang === "blitz");
        for (const [beschriftung, text, klasse] of zellen as readonly (readonly [string, string, string])[]) {
            const td = document.createElement("td");
            td.textContent = text;
            // Am Telefon wird jede Zeile zur Karte, die Spaltenköpfe stehen dann vor den Werten.
            td.dataset["beschriftung"] = beschriftung;
            if (klasse) {
                td.className = klasse;
            }
            // Der Meldevordruck hat weder Vorrang noch Art noch Richtung.
            if (["Vorrang", "Art", "Richtung"].includes(beschriftung)) {
                td.classList.add("nur-nachricht");
            }
            if (beschriftung === "Gegenstelle" && vordruck === "meldung") {
                td.dataset["beschriftung"] = "Empfänger";
            }
            tr.append(td);
        }
        return tr;
    }));

    const tabelle = element<HTMLTableElement>("ergebnis-tabelle");
    tabelle.classList.toggle("meldung", vordruck === "meldung");
    element<HTMLTableCellElement>("uebersicht-gegenstelle").textContent = vordruck === "meldung" ? "Empfänger" : "Gegenstelle";
    // Am Telefon: bei vielen Zeilen zunächst nur die auffälligen, alle auf Wunsch.
    const auffaelligeZeilen = tabelle.tBodies[0]?.querySelectorAll("tr.auffaellig").length ?? 0;
    const alleKnopf = element<HTMLButtonElement>("uebersicht-alle");
    // Ohne auffällige Zeile bliebe die Übersicht leer; dann alle zeigen.
    const kuerzen = zeilen.length > 8 && auffaelligeZeilen > 0 && auffaelligeZeilen < zeilen.length;
    tabelle.classList.toggle("nur-auffaellige", kuerzen);
    alleKnopf.hidden = !kuerzen;
    alleKnopf.textContent = `Alle ${zeilen.length} Zeilen zeigen (jetzt ${auffaelligeZeilen} auffällige)`;

    const pdfKnopf = element<HTMLButtonElement>("tabelle-pdf");
    pdfKnopf.disabled = zeilen.length === 0;
    // „Ohne Formular“ ist eine gemerkte Einstellung; am Knopf soll sie nicht überraschen.
    const ohne = optionen().ohneHintergrund ? ", ohne Formular" : "";
    // Mit langen Texten: wie viele Vordrucke es beim Verteilen werden; mit „Beide“ je Zeile zwei.
    const { gekuerzt: anzahl, verteilt } = tabellenAnzahl();
    pdfKnopf.textContent = verteilt > anzahl
        ? `PDF herunterladen (${zeilen.length} ${zeilen.length === 1 ? "Zeile" : "Zeilen"}, ${verteilt} Vordrucke mit verteilten Texten${ohne})`
        : `PDF herunterladen (${anzahl} ${anzahl === 1 ? "Vordruck" : "Vordrucke"}${ohne})`;
    element<HTMLButtonElement>("tabelle-oeffnen").disabled = zeilen.length === 0;
}

/**
 * Die PDF der Tabelle. Zeilen mit gekürztem Text oder verworfenen Werten tragen
 * den Prüfvermerk im Formular, je Vordruckart; Einzelheiten zeigt die Übersicht.
 */
function tabellenPdf(verteilen = false) {
    const { vordruck } = optionen();
    return erzeugePdf((ergebnis?.zeilen ?? []).flatMap(zeile => bogenListe(zeile.daten, vordruck, zeile.fehler, verteilen)), optionen());
}

/**
 * Eine gesicherte Liste erstellter Vordrucke: anbieten, sie in die Liste dieses
 * Geräts zu übernehmen, und sagen, wenn darin andere Vordruckarten stehen als
 * eingestellt.
 */
function listeUebernahmeZeigen(): void {
    const kasten = element<HTMLDivElement>("liste-uebernahme");
    const zeilen = ergebnis?.zeilen ?? [];
    kasten.hidden = !ergebnis?.istListe || zeilen.length === 0;
    const pdfKnopf = element<HTMLButtonElement>("tabelle-pdf");
    if (kasten.hidden) {
        pdfKnopf.classList.add("primaer");
        return;
    }
    const fehlend = fehlendeListenEintraege();
    const fehlen = fehlend.length;
    // Wie viele davon zum laufenden Einsatz gehören: nur die zählen beim Prüfen der Nummern.
    const beginn = einsatzBeginn([...aktivitaet(), ...fehlend], einsatzVereinen(einsatzStand(), listenEinsatz(zeilen)));
    const imEinsatz = fehlend.filter(eintrag => new Date(eintrag.zeit).getTime() >= beginn).length;
    const NAME: Record<string, string> = { nachricht: "Nachrichtenvordrucke", meldung: "Meldevordrucke", beide: "beide Vordrucke" };
    const { vordruck } = optionen();
    const andere = zeilen.filter(zeile => {
        const art = (zeile.liste?.vordruck ?? "").toLowerCase();
        return art && !art.startsWith(vordruck === "nachricht" ? "nachricht" : vordruck === "meldung" ? "melde" : "beide");
    });
    const andereNummern = [...new Set(andere.map(zeile => zeile.daten.nummer || `Zeile ${zeile.zeile}`))];
    // Ältere Sicherungen haben die Zeit ohne Sekunden: Ein Einsatzwechsel innerhalb einer Minute ist darin nicht mehr zu erkennen.
    const jeMinute = new Map<string, Set<string>>();
    for (const zeile of zeilen) {
        const erstellt = zeile.liste?.erstellt.trim() ?? "";
        if (/\d{1,2}:\d{2}$/.test(erstellt) && !/\d{1,2}:\d{2}:\d{2}$/.test(erstellt)) {
            jeMinute.set(erstellt, (jeMinute.get(erstellt) ?? new Set<string>()).add(zeile.liste?.einsatz?.trim() ?? ""));
        }
    }
    const minutenWechsel = [...jeMinute.values()].some(einsaetze => einsaetze.size > 1);
    element<HTMLParagraphElement>("liste-text").textContent = [
        `${dateiName} ist eine gesicherte Liste erstellter Vordrucke.`,
        fehlen === 0
            ? "Alle Einträge stehen schon in der Liste dieses Geräts."
            : `${fehlen} ${fehlen === 1 ? "Eintrag fehlt" : "Einträge fehlen"} in der Liste dieses Geräts.`
                + (imEinsatz === fehlen
                    ? ` Übernommen ${fehlen === 1 ? "zählt er" : "zählen sie"} wieder beim Prüfen der Nummern.`
                    : imEinsatz > 0
                        ? ` Übernommen zählen ${imEinsatz} davon beim Prüfen der Nummern; die übrigen gehören zu einem früheren Einsatz (unter „Erstellte Vordrucke“ fortsetzbar).`
                        : " Sie gehören zu einem früheren Einsatz; beim Prüfen der Nummern zählen sie erst, wenn er unter „Erstellte Vordrucke“ fortgesetzt wird."),
        minutenWechsel ? "Die Zeiten dieser Datei haben keine Sekunden: Ein Einsatzwechsel innerhalb einer Minute ist darin nicht erkennbar, die betroffenen Einsätze können hier zusammengefasst sein." : "",
        "„PDF herunterladen“ druckt die Zeilen neu und übernimmt sie dabei.",
        andere.length > 0 ? `${andere.length === 1 ? "Eine Zeile war" : `${andere.length} Zeilen waren`} ein anderer Vordruck als eingestellt (${andereNummern.slice(0, 6).map(nummer => /^Zeile/.test(nummer) ? nummer : `Nr. ${nummer}`).join(", ")}); gedruckt wird alles als ${NAME[vordruck]}.` : ""
    ].filter(Boolean).join(" ");
    const knopf = element<HTMLButtonElement>("liste-uebernehmen");
    knopf.disabled = fehlen === 0;
    knopf.textContent = fehlen > 0 ? `${fehlen} ${fehlen === 1 ? "Eintrag" : "Einträge"} in die Liste übernehmen` : "Schon in der Liste";
    // Wiederherstellen ist hier der Hauptweg, der Neudruck nicht.
    pdfKnopf.classList.toggle("primaer", fehlen === 0);
}

/** Einträge der eingelesenen Liste, die in der Liste dieses Geräts noch fehlen; ohne Doppel. */
function fehlendeListenEintraege(): Eintrag[] {
    const schon = new Set(verlauf.map(eintragKennung));
    return listenEintraege(ergebnis?.zeilen ?? []).filter(eintrag => {
        const kennung = eintragKennung(eintrag);
        if (schon.has(kennung)) {
            return false;
        }
        schon.add(kennung);
        return true;
    });
}

/** Übernimmt die eingelesene Liste; ergibt einen Satz für die Rückmeldung. */
function listeUebernehmen(): string {
    const gemerkt = uebernimmEintraege(fehlendeListenEintraege());
    verlauf = gemerkt.liste;
    // Die Einsatzgrenzen der Liste gehören dazu: Sonst zählt auf dem Ersatzgerät alles zu einem Einsatz.
    const vorher = einsatzStand();
    const vereint = einsatzVereinen(vorher, listenEinsatz(ergebnis?.zeilen ?? []));
    const grenzenNeu = vereint.grenzen.length + vereint.bruecken.length > vorher.grenzen.length + vorher.bruecken.length;
    if (grenzenNeu) {
        einsatzSchreiben(vereint);
    }
    verlaufZeigen();
    const teile = [
        !gemerkt.gespeichert ? `Nicht dauerhaft übernommen: ${speicherZustand() === "voll" ? "Der Speicher des Geräts ist voll" : "Das Gerät speichert nichts"}; die Liste gilt nur bis zum Neuladen (danach die CSV noch einmal einlesen).` : "",
        gemerkt.neu === 0 ? "" : `${gemerkt.neu} ${gemerkt.neu === 1 ? "Eintrag" : "Einträge"} der gesicherten Liste übernommen${gemerkt.verdraengt > 0 ? `; dafür sind die ältesten ${gemerkt.verdraengt} herausgefallen` : ""}.`,
        grenzenNeu ? "Die Einsatzgrenzen der Liste gelten jetzt auch hier." : ""
    ];
    return teile.filter(Boolean).join(" ");
}
element<HTMLButtonElement>("liste-uebernehmen").addEventListener("click", () => {
    const text = listeUebernehmen();
    tabelleAnzeigen();
    element<HTMLParagraphElement>("tabelle-erstellt").textContent = text;
    element<HTMLParagraphElement>("tabelle-erstellt").hidden = false;
});

/** Gekürzte Felder einer Tabellenzeile auf den fertigen Bögen; ohne Angabe beim Verteilen langer Texte. */
function zeileGekuerzt(zeile: TabellenErgebnis["zeilen"][number], verteilen = true): string[] {
    const { vordruck } = optionen();
    return gekuerzteFelderAufBoegen(bogenListe(zeile.daten, vordruck, zeile.fehler, verteilen), vordruck);
}

/** Wie viele Vordrucke die Tabelle ergibt, gekürzt und mit verteilten Texten. */
function tabellenAnzahl(): { gekuerzt: number; verteilt: number } {
    const { vordruck } = optionen();
    const arten: ("nachricht" | "meldung")[] = vordruck === "beide" ? ["nachricht", "meldung"] : [vordruck];
    const zeilen = ergebnis?.zeilen ?? [];
    return {
        gekuerzt: zeilen.length * arten.length,
        verteilt: zeilen.reduce((summe, zeile) => summe + arten.reduce((teil: number, art) => teil
            + (istKritisch(pruefeTextlaenge(zeile.daten.inhalt, art)) ? teileInhalt(zeile.daten.inhalt, art).length : 1), 0), 0)
    };
}

/** Nummernbereich für den Dateinamen, z. B. „17-24“. */
function nummernbereich(zeilen: readonly { daten: { nummer: string } }[]): string {
    const nummern = zeilen.map(zeile => zeile.daten.nummer).filter(Boolean);
    const erste = nummern[0];
    const letzte = nummern.at(-1);
    return erste && letzte ? (erste === letzte ? erste : `${erste}-${letzte}`) : "";
}

element<HTMLButtonElement>("tabelle-pdf").addEventListener("click", async ereignis => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    if (!kurzSperren(knopf)) {
        return;
    }
    const zeilen = ergebnis?.zeilen ?? [];
    const { vordruck } = optionen();
    const wahl = await tabellenFrage("erzeugen");
    if (wahl === "nein") {
        return;
    }
    const verteilen = wahl === "verteilen";
    void mitArbeit(knopf, "PDF wird erstellt…", async () => {
        // Einen Takt warten, damit der Knopf seinen Arbeitszustand zeigt, bevor jsPDF rechnet.
        await new Promise(fertig => setTimeout(fertig, 30));
        const jetzt = new Date();
        herunterladen(tabellenPdf(verteilen).output("blob"), dateiname(optionen(), zeilen.length, jetzt, nummernbereich(zeilen)));
        // Auch Tabellen-Vordrucke in die Liste: zum Abgleich und gegen doppelte Nummern.
        // Ein zweiter Download derselben Tabelle trägt nichts doppelt ein.
        // Eine wieder eingelesene eigene Liste: erst ihre früheren Einträge übernehmen,
        // sonst stünden sie nach einem späteren Übernehmen doppelt da. Zeilen, die mit
        // diesem Vordruck schon darin stehen, kommen nicht ein zweites Mal hinein.
        const uebernommen = ergebnis?.istListe ? listeUebernehmen() : "";
        // Was in der Liste über die Druckfassung steht, je Zeile.
        const zusatzFuer = (zeile: TabellenErgebnis["zeilen"][number]): string => {
            const lang = istKritisch(pruefeTextlaenge(zeile.daten.inhalt, vordruck));
            const felder = zeileGekuerzt(zeile, verteilen);
            return [
                `aus ${dateiName}`,
                zeile.fehler.length > 0 ? "mit Fehlern gedruckt" : "",
                lang && verteilen ? `auf ${verteiltText(zeile.daten.inhalt, vordruck)} verteilt` : lang ? "Text gekürzt gedruckt" : "",
                felder.length > 0 ? `${felder.join(", ")} gekürzt gedruckt` : ""
            ].filter(Boolean).join(", ");
        };
        // Nur die Druckfassung zählt beim Vergleich: Derselbe Stand in anderer Fassung (etwa gekürzt statt verteilt) ist ein weiterer Druck.
        const fassungsteil = (zusatz: string) => zusatz.split(", ").filter(teil => /gekürzt|verteilt|Fehlern/.test(teil)).join(", ");
        const schonInListe = new Set(verlauf.map(eintrag => `${eintrag.vordruck ?? ""}|${verlaufKennung(eintrag.eingabe)}|${fassungsteil(eintrag.zusatz ?? "")}`));
        const neueZeilen = ergebnis?.istListe
            ? zeilen.filter(zeile => !schonInListe.has(`${vordruck}|${verlaufKennung(zeile.eingabe)}|${fassungsteil(zusatzFuer(zeile))}`))
            : zeilen;
        const gemerkt = merkeVordrucke(neueZeilen.map(zeile => zeile.eingabe), jetzt, vordruck, index => {
            const zeile = neueZeilen[index];
            return zeile ? zusatzFuer(zeile) : "";
        }, aktuellerEinsatzBeginn());
        verlauf = gemerkt.liste;
        verlaufZeigen();
        const uhr = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        const { gekuerzt: anzahl, verteilt } = tabellenAnzahl();
        const vordrucke = verteilen ? verteilt : anzahl;
        const liste = !gemerkt.gespeichert
            ? `Nicht in die Liste erstellter Vordrucke eingetragen: ${speicherZustand() === "voll" ? "Der Speicher des Geräts ist voll" : "Das Gerät speichert nichts"}.`
            : gemerkt.neu === 0
                // Nach einer Übernahme der gesicherten Liste stehen die Zeilen schon darin: kein zweiter, widersprüchlicher Satz.
                ? uebernommen ? "" : "Die Liste erstellter Vordrucke enthielt diese Zeilen schon."
                : `${gemerkt.neu} ${gemerkt.neu === 1 ? "Zeile" : "Zeilen"} (Nr. ${aufzaehlen(gemerkt.liste.slice(-gemerkt.neu).slice(0, 6).map(eintrag => (eintrag.eingabe.nummer ?? "").trim() || "ohne Nr."))}${gemerkt.neu > 6 ? " u. a." : ""}) in die Liste erstellter Vordrucke neu eingetragen${zeilen.length - gemerkt.neu > 0 ? `, ${zeilen.length - gemerkt.neu} schon vorhanden` : ""}${gemerkt.verdraengt > 0 ? `; dafür sind die ältesten ${gemerkt.verdraengt} herausgefallen (Liste fasst ${HOECHSTENS})` : ""}.`;
        element<HTMLParagraphElement>("tabelle-erstellt").textContent = `PDF mit ${vordrucke} ${vordrucke === 1 ? "Vordruck" : "Vordrucken"} um ${uhr} Uhr erstellt.${uebernommen ? ` ${uebernommen}` : ""} ${liste}`.trim();
        listeUebernahmeZeigen();
        element<HTMLParagraphElement>("tabelle-erstellt").hidden = false;
    });
});

/**
 * Die Rückfrage vor dem Erzeugen oder Öffnen, mit der Zahl der Vordrucke an
 * den Knöpfen. Ohne Probleme gleich „gekuerzt“ (dann ist nichts zu kürzen).
 */
async function tabellenFrage(was: "erzeugen" | "öffnen"): Promise<"verteilen" | "gekuerzt" | "nein"> {
    const { probleme, zuLang } = tabellenProbleme();
    if (probleme.length === 0) {
        return "gekuerzt";
    }
    const verb = was === "erzeugen" ? "Erzeugen" : "Öffnen";
    if (zuLang.length > 0) {
        const { gekuerzt, verteilt } = tabellenAnzahl();
        const wahl = await frageWahl(`${probleme.join("\n")}\n\nTrotzdem ${was}? Lange Texte lassen sich auf weitere Vordrucke verteilen oder kürzen.`,
            `${verb}, lange Texte verteilen (${verteilt} Vordrucke)`, "Abbrechen", `${verb}, lange Texte gekürzt (${gekuerzt} Vordrucke, Text fehlt)`);
        return wahl === "ja" ? "verteilen" : wahl === "dritte" ? "gekuerzt" : "nein";
    }
    const ja = gekuerzteZeilen() ? `Gekürzt ${was}` : `Trotzdem ${was}`;
    return await frage(`${probleme.join("\n")}\n\n${ja}?`, ja) ? "gekuerzt" : "nein";
}

/** Was vor dem Erzeugen aus der Tabelle nachgefragt wird, für Download und Vorschau gleich. */
function tabellenProbleme(): { probleme: string[]; zuLang: TabellenErgebnis["zeilen"] } {
    const zeilen = ergebnis?.zeilen ?? [];
    const mitFehler = zeilen.filter(zeile => eigeneFehler(zeile.fehler, optionen().vordruck).length > 0);
    const erste = mitFehler[0];
    const { vordruck } = optionen();
    const zuLang = zeilen.filter(zeile => istKritisch(pruefeTextlaenge(zeile.daten.inhalt, vordruck)));
    const doppelt = zeilen.filter(zeile => zeile.hinweise.some(hinweis => hinweis.includes("steht auch in Zeile")));
    const schonErstellt = ergebnis?.istListe ? [] : zeilen.filter(zeile => frueherErstellt(zeile.daten.nummer, zeile.eingabe));
    const gekuerzt = zeilen.filter(zeile => zeileGekuerzt(zeile).length > 0);
    const unmoeglich = zeilen.filter(zeile => zeile.hinweise.some(hinweis => hinweis.includes(UNMOEGLICH)));
    const leere = zeilen.filter(zeile => !(zeile.daten.inhalt ?? "").trim() && !(zeile.eingabe.empfaenger ?? "").trim());
    const probleme = [
        erste ? `${mitFehler.length} ${mitFehler.length === 1 ? "Zeile hat" : "Zeilen haben"} Fehler, etwa Zeile ${erste.zeile}: ${eigeneFehler(erste.fehler, vordruck)[0]}. Betroffene Felder bleiben leer oder werden ersetzt.` : "",
        zuLang.length > 0 ? `In ${zuLang.length === 1 ? "Zeile" : "den Zeilen"} ${zeilenListe(zuLang)} ist der Text länger als ein Vordruck.` : "",
        gekuerzt.length > 0 ? `In ${gekuerzt.length === 1 ? "Zeile" : "den Zeilen"} ${zeilenListe(gekuerzt)}: ${gekuerztSatz(gekuerzt[0] ? zeileGekuerzt(gekuerzt[0]) : [])}${gekuerzt.length > 1 ? " (in Zeile " + gekuerzt[0]?.zeile + ")" : ""}.` : "",
        unmoeglich.length > 0 ? `In ${unmoeglich.length === 1 ? "Zeile" : "den Zeilen"} ${zeilenListe(unmoeglich)} steht eine unmögliche Uhrzeit oder ein unmögliches Datum.` : "",
        leere.length > 0 ? `${leere.length === 1 ? "Zeile" : "Die Zeilen"} ${zeilenListe(leere)} ${leere.length === 1 ? "hat" : "haben"} weder Text noch ${vordruck === "meldung" ? "Empfänger" : "Gegenstelle"} und ${leere.length === 1 ? "wird" : "werden"} als leerer Bogen gedruckt.` : "",
        // Der Meldevordruck hat keine Richtung: Ohne Absender fragt er in jeder Zeile, nicht nur bei einem „Ausgang“.
        vordruck === "meldung"
            ? fehltIn(zeilen.filter(zeile => zeile.daten.inhalt && !(zeile.eingabe.absender ?? "").trim() && !zeile.fehler.some(text => text.startsWith("Absender"))), "der Absender", zeilen.filter(zeile => zeile.daten.inhalt).length)
            : fehltIn(zeilen.filter(zeile => zeile.daten.richtung === "ausgang" && zeile.daten.inhalt && !zeile.daten.absender), "der Absender", zeilen.filter(zeile => zeile.daten.richtung === "ausgang" && zeile.daten.inhalt).length, ["Ausgang", "Ausgängen"]),
        doppelt.length > 0 ? `Die Zeilen ${zeilenListe(doppelt)} haben doppelte Nummern.` : "",
        // Mit früherer Gegenstelle, Zeit und Fassung: Wer prüft, soll nicht selbst suchen müssen.
        schonErstellt.length > 0 ? `Auf diesem Gerät schon mit anderem Inhalt oder an eine andere Gegenstelle erstellt: ${[...new Map(schonErstellt.map(zeile => [zeile.daten.nummer, zeile])).values()].slice(0, 4).map(zeile => {
            const frueher = frueherErstellt(zeile.daten.nummer, zeile.eingabe);
            return frueher ? `Nr. ${zeile.daten.nummer} (${zeitText(frueher.zeit)} an „${kurz(frueher.eingabe.empfaenger ?? "", 25) || "keine Gegenstelle"}“${frueher.zusatz ? `, ${frueher.zusatz}` : ""})` : `Nr. ${zeile.daten.nummer}`;
        }).join("; ")}${new Set(schonErstellt.map(zeile => zeile.daten.nummer)).size > 4 ? " u. a." : ""}.` : "",
        // Was die Übersicht meldet, fragt auch die Rückfrage: auch beim zweiten Download.
        schonGleichErstellt(zeilen),
        nummernluecken(zeilen.map(zeile => zeile.daten.nummer)),
        vordruck !== "meldung" ? fehltIn(zeilen.filter(zeile => zeile.daten.richtung === "eingang" && zeile.daten.inhalt
            && !Object.values(zeile.daten.aufnahmevermerk).some(wert => (wert ?? "").trim())), "bei einem Eingang der Aufnahmevermerk") : "",
        leseHinweise.find(hinweis => !hinweis.startsWith("Gelesen wurde")) ?? "",
        listeVollSatz(zeilen.length)
    ].filter(Boolean);
    return { probleme, zuLang };
}

/** Ob beim Eintragen von `dazu` Zeilen die ältesten Einträge der Liste herausfallen, als Satz. */
function listeVollSatz(dazu: number): string {
    const raus = verlauf.length + dazu - HOECHSTENS;
    return raus > 0
        ? `Die Liste erstellter Vordrucke fasst ${HOECHSTENS}; mit diesem PDF ${raus === 1 ? "fällt der älteste Eintrag" : `fallen die ältesten ${raus} Einträge`} heraus. Vorher „Liste als CSV“ sichern.`
        : "";
}

/** Ob in der Tabelle ein Feld gekürzt gedruckt würde. */
function gekuerzteZeilen(): boolean {
    return (ergebnis?.zeilen ?? []).some(zeile => zeileGekuerzt(zeile).length > 0);
}

/** „3, 7 und 9“, höchstens acht Zeilennummern. */
function zeilenListe(zeilen: readonly { zeile: number }[]): string {
    return aufzaehlen(zeilen.slice(0, 8).map(zeile => String(zeile.zeile))) + (zeilen.length > 8 ? " u. a." : "");
}

/**
 * Ob die Nr. auf diesem Gerät schon mit anderem Inhalt erstellt wurde. Der
 * gleiche Stand zählt nicht, ebenso wenig eine andere Zeile derselben Datei:
 * Die doppelte Nr. darin meldet die Übersicht schon.
 */
function frueherErstellt(nummer: string, eingabe: Eingabe): Eintrag | undefined {
    const stand = verlaufKennung(eingabe);
    const inDatei = new Set((ergebnis?.zeilen ?? []).map(zeile => verlaufKennung(zeile.eingabe)));
    return mitNummer(juengste(), nummer).find(eintrag => verlaufKennung(eintrag.eingabe) !== stand && !inDatei.has(verlaufKennung(eintrag.eingabe))
        && ((eintrag.eingabe.inhalt ?? "").trim() !== (eingabe.inhalt ?? "").trim()
            || (eintrag.eingabe.empfaenger ?? "").trim() !== (eingabe.empfaenger ?? "").trim()));
}

// Auch die Vorschau fragt bei Fehlern nach: aus dem neuen Tab wird oft direkt gedruckt.
element<HTMLButtonElement>("tabelle-oeffnen").addEventListener("click", async ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    // Dieselben Rückfragen wie beim Download: aus dem neuen Tab wird oft direkt gedruckt.
    const wahl = await tabellenFrage("öffnen");
    if (wahl === "nein") {
        return;
    }
    window.open(URL.createObjectURL(tabellenPdf(wahl === "verteilen").output("blob")), "_blank", "noopener");
});

element<HTMLButtonElement>("uebersicht-alle").addEventListener("click", ereignis => {
    element<HTMLTableElement>("ergebnis-tabelle").classList.remove("nur-auffaellige");
    (ereignis.currentTarget as HTMLButtonElement).hidden = true;
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
// Eine Datei, die neben der Ablagefläche landet, würde der Browser selbst öffnen
// und die App verlassen. Im Tabellenreiter gilt deshalb die ganze Seite als
// Ablage, im Einzelreiter wird der Fehlwurf nur abgefangen.
addEventListener("dragover", ereignis => {
    if (ereignis.dataTransfer?.types.includes("Files")) {
        ereignis.preventDefault();
    }
});
addEventListener("drop", ereignis => {
    if (!ereignis.dataTransfer?.types.includes("Files")) {
        return;
    }
    ereignis.preventDefault();
    dateiZiel.classList.remove("ueber");
    const datei = ereignis.dataTransfer.files[0];
    if (!datei) {
        return;
    }
    if (element<HTMLElement>("ansicht-tabelle").hidden) {
        meldeStatus(`${datei.name} wurde nicht eingelesen. Tabellen im Reiter „Aus Excel oder CSV“ ablegen.`, "behalten");
        return;
    }
    // Neben der Ablagefläche gelandet und schon eine Tabelle geladen: eher ein Versehen.
    const aufFlaeche = ereignis.target instanceof Node && dateiZiel.contains(ereignis.target);
    if (ergebnis && !aufFlaeche) {
        void frage(`${datei.name} einlesen? Die geladene Tabelle ${dateiName} wird ersetzt.`, "Einlesen").then(ja => {
            if (ja) {
                void dateiEinlesen(datei);
            }
        });
        return;
    }
    void dateiEinlesen(datei);
});

// Eine eingelesene Tabelle wird nicht gespeichert; vor dem Neuladen fragt der Browser nach.
addEventListener("beforeunload", ereignis => {
    // Im Konflikt zweier Fenster liegt der Entwurf nur in diesem Tab: Der Browser fragt vor dem Schließen nach.
    if (fensterKonflikt || (ergebnis && ergebnis.zeilen.length > 0)) {
        ereignis.preventDefault();
    }
});

// ---- Start ---------------------------------------------------------------

einstellungenLaden();
einstellungenZeigen();
felderFuerVordruckZeigen();
verlaufZeigen();
// Neuladen mitten im Konflikt: Der Tab-Stand ist älter als der Entwurf des anderen Fensters auf dem Gerät. Der Hinweis kommt wieder.
try {
    const imTab = JSON.parse(tabSpeicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Entwurf | null;
    const aufGeraet = JSON.parse(speicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Entwurf | null;
    if (imTab && aufGeraet && aufGeraet._fenster !== imTab._fenster && (imTab.inhalt ?? "").trim()
        && JSON.stringify(ohneStempel(imTab)) !== JSON.stringify(ohneStempel(aufGeraet)) && weichtAb(ohneStempel(aufGeraet))) {
        fensterGeaendert(aufGeraet);
    }
} catch {
    // Kaputter Entwurf: kein Hinweis.
}
element<HTMLParagraphElement>("laedt").hidden = true;
let spaeterStart = false;
{
    // Gestartet: die Ladefrist abbrechen und eine schon gezeigte Meldung wieder entfernen
    // (bei sehr langsamem Netz startet die App auch nach den 12 s noch).
    const fenster = window as Window & { bnvGestartet?: boolean; bnvLadeUhr?: number };
    fenster.bnvGestartet = true;
    clearTimeout(fenster.bnvLadeUhr);
    const meldung = document.getElementById("laedt-nicht");
    if (meldung) {
        meldung.remove();
        // Stand die Meldung schon da, soll auch der späte Start auffallen. Erst nach
        // dem Wechsel auf den Reiter zeigen: Der schließt jede Kurzmeldung.
        spaeterStart = true;
    }
}
if (wiederhergestellt || verlauf.length > 0) {
    document.documentElement.classList.add("wiederkehrend");
}

// Zugeklappt; der Kopf zeigt die Wahl. So beginnt die Maske auch am Rechner weiter oben.
element<HTMLDetailsElement>("einstellungen").open = false;

// Sprung zum Abschluss: die Knöpfe unten im Bild, darüber Hinweise und so viel Vorschau wie Platz ist.
for (const knopf of document.querySelectorAll<HTMLButtonElement>("button[data-sprung]")) {
    knopf.addEventListener("click", () => {
        (document.activeElement as HTMLElement | null)?.blur();
        const aktionen = element<HTMLButtonElement>("einzeln-pdf").parentElement ?? element<HTMLElement>("abschluss");
        // Die Knöpfe etwas über dem unteren Rand: Wo eben die Leiste war, liegt dann die
        // Statuszeile, nicht „Felder leeren“.
        const rahmen = aktionen.getBoundingClientRect();
        scrollTo({ top: scrollY + rahmen.bottom - innerHeight + 96, behavior: "smooth" });
        // Der zweite Tipp eines Doppeltipps landet sonst auf dem Knopf, der jetzt
        // dort liegt, wo eben die Leiste war: kurz keine Tipps im Abschluss.
        sprungSperreBis = performance.now() + 700;
    });
}
let sprungSperreBis = 0;
// Für die ganze Seite außer der Sprungleiste: Auch „In neuem Tab öffnen“ kann nach dem Sprung unter dem Finger liegen.
document.addEventListener("click", ereignis => {
    // Nur echte Tipps: Die App löst selbst Klicks aus (Download-Verweis, Knöpfe im Hinweis), und die gehören nicht dazu.
    if (ereignis.isTrusted && performance.now() < sprungSperreBis && ereignis.target instanceof Element && ereignis.target.closest("button, input, select, summary, a")
        && !ereignis.target.closest("[data-sprung]")) {
        ereignis.preventDefault();
        ereignis.stopPropagation();
        // Ein Tipp auf den Knopf der Kurzmeldung ersetzt die Meldung nicht: Der Knopf sagt es selbst.
        if (ereignis.target.closest("#kurzmeldung")) {
            const knopf = ereignis.target.closest("button");
            if (knopf) {
                const vorher = knopf.textContent;
                knopf.textContent = "Gleich möglich: noch einmal tippen";
                setTimeout(() => { knopf.textContent = vorher; }, 900);
            }
            return;
        }
        // Nicht stumm: Wer bewusst schnell getippt hat, soll wissen, warum nichts geschah.
        zeigeKurzmeldung("Tipp direkt nach dem vorigen nicht ausgeführt (Schutz vor Doppeltipp). Bitte noch einmal tippen.", false);
    }
}, true);

// Ohne Netz geht alles weiter; das soll man sehen, statt es zu vermuten. Den
// Excel-Weg nur zusagen, wenn der Offline-Speicher die Seite steuert.
function netzZeigen(): void {
    element<HTMLParagraphElement>("netz-stand").hidden = navigator.onLine;
    const excel = element<HTMLSpanElement>("netz-excel");
    excel.hidden = true;
    // Den Excel-Weg nur zusagen, wenn er sich ohne Netz wirklich laden lässt:
    // genau die Teile dieser Fassung, nicht irgendeine gespeicherte.
    // Nachgesehen wird im Offline-Speicher, nicht durch Laden: Ein gescheiterter
    // Ladeversuch bliebe sonst bis zum Neuladen gemerkt, auch wenn das Netz zurückkommt.
    if (!navigator.onLine) {
        void excelGespeichert().then(da => {
            excel.hidden = navigator.onLine || !da;
        });
        const hinweis = element<HTMLParagraphElement>("speicher-stand");
        if (!hinweis.hidden) {
            hinweis.textContent = `Kein Netz: Es läuft die auf diesem Gerät gespeicherte Fassung ${__FASSUNG__}.`;
        }
    }
    // Netz da: Läuft die gespeicherte Fassung, prüfen, ob der Server wieder antwortet.
    // Der Text sagt immer, was die letzte Prüfung ergab.
    if (navigator.onLine && !element<HTMLParagraphElement>("speicher-stand").hidden) {
        const hinweis = element<HTMLParagraphElement>("speicher-stand");
        const fehlt = () => {
            hinweis.textContent = `Server antwortet nicht: Es läuft die auf diesem Gerät gespeicherte Fassung ${__FASSUNG__}.`;
        };
        // HEAD geht am Offline-Dienst vorbei (er bedient nur GET) und fragt wirklich den Server.
        // Die Startseite selbst: Liefert der Server dafür noch einen Fehler, ist er nicht zurück.
        const start = performance.now();
        void fetch("./", { method: "HEAD", cache: "no-store" })
            .then(antwort => {
                const dauer = (performance.now() - start) / 1000;
                if (antwort.ok && dauer > 3) {
                    // Antwortet er so langsam, fällt ein Neuladen wieder auf die gespeicherte Fassung zurück: nicht dazu raten.
                    hinweis.textContent = `Der Server antwortet, aber langsam (${Math.round(dauer)} s): Es läuft die auf diesem Gerät gespeicherte Fassung ${__FASSUNG__}. Neu laden holt die aktuelle erst, wenn er schneller antwortet.`;
                } else if (antwort.ok) {
                    hinweis.textContent = "Der Server ist wieder erreichbar. Neu laden holt die aktuelle Fassung.";
                } else {
                    hinweis.textContent = `Der Server meldet einen Fehler (${antwort.status}): Es läuft die auf diesem Gerät gespeicherte Fassung ${__FASSUNG__}.`;
                }
            })
            .catch(fehlt);
    }
}

/** Ob der Offline-Speicher genau diese Fassung vollständig hat, samt Excel-Teil. */
async function excelGespeichert(): Promise<boolean> {
    try {
        for (const name of await caches.keys()) {
            const marke = await (await caches.open(name)).match("./__vollstaendig__");
            if (marke && await marke.text() === __FASSUNG__) {
                return true;
            }
        }
    } catch {
        // Ohne Speicherzugriff keine Zusage.
    }
    return false;
}

/**
 * Hing beim Laden ein Stylesheet, hat der Kopf der Seite es entfernt, damit
 * wenigstens die Grundform erscheint. Jetzt erneut einsetzen; klappt es nicht,
 * sagen, warum die Seite so schlicht aussieht, und bei Netz erneut versuchen.
 */
function gestaltungNachholen(): void {
    const entfernt = (window as Window & { bnvEntfernteBlaetter?: string[] }).bnvEntfernteBlaetter ?? [];
    // Ein Abruf, der länger als 30 s hängt, wird verworfen und neu versucht: Sonst bliebe es bei einer einzigen Anfrage.
    for (const hing of document.querySelectorAll<HTMLLinkElement>("link[data-nachgeholt]:not([data-fertig])")) {
        if (Date.now() - Number(hing.dataset["start"] ?? Date.now()) > 30_000) {
            entfernt.push(hing.dataset["adresse"] ?? hing.href);
            hing.remove();
        }
    }
    if (entfernt.length === 0) {
        return;
    }
    const hinweis = element<HTMLParagraphElement>("grundform");
    // Bis die Gestaltung da ist: Hinweis zeigen und die Kurzmeldung wenigstens ins Bild setzen.
    hinweis.hidden = false;
    if (!document.getElementById("grundform-stil")) {
        const stil = document.createElement("style");
        stil.id = "grundform-stil";
        // Lage immer; Farben nur im Standardmodus, die dunklen Modi färbt `bnv-notstil` im Kopf der Seite.
        stil.textContent = ".kurzmeldung:not([hidden]){position:fixed;left:8px;right:8px;bottom:8px;z-index:6;padding:8px;border:2px solid currentColor}"
            + "html:not(.nacht-modus):not(.dunkel-modus) .kurzmeldung{background:Canvas;color:CanvasText}";
        document.head.append(stil);
    }
    for (const adresse of entfernt.splice(0)) {
        const blatt = document.createElement("link");
        blatt.rel = "stylesheet";
        blatt.dataset["nachgeholt"] = "1";
        blatt.dataset["start"] = String(Date.now());
        blatt.dataset["adresse"] = adresse;
        // Eigene Adresse: Unter der alten hängt der Browser sich an den nie beendeten ersten Abruf.
        const neu = new URL(adresse, location.href);
        neu.searchParams.set("neu", String(Date.now()));
        blatt.href = neu.href;
        blatt.addEventListener("load", () => {
            blatt.dataset["fertig"] = "1";
            hinweis.hidden = true;
            document.getElementById("grundform-stil")?.remove();
            document.getElementById("bnv-notstil")?.remove();
        });
        blatt.addEventListener("error", () => {
            blatt.remove();
            entfernt.push(adresse);
            hinweis.hidden = false;
        });
        document.head.append(blatt);
    }
}
(window as Window & { bnvNachholen?: () => void }).bnvNachholen = gestaltungNachholen;
gestaltungNachholen();
addEventListener("online", gestaltungNachholen);
addEventListener("online", netzZeigen);
// Auch ohne Netzwechsel kann der Server zurückkommen: einmal pro Minute nachsehen.
setInterval(() => {
    // Die Gestaltung auch ohne Netzwechsel wieder versuchen (ein Serverfehler löst kein „online“ aus).
    gestaltungNachholen();
    if (!element<HTMLParagraphElement>("speicher-stand").hidden) {
        netzZeigen();
    }
}, 60_000);
addEventListener("offline", netzZeigen);
netzZeigen();
zeigeReiter(location.hash === "#tabelle" ? "tabelle" : "einzeln", false, "ersetzen");
if (spaeterStart) {
    zeigeKurzmeldung(`Die App ist jetzt bereit; Eingaben werden gespeichert.${vorStartText ? " Zum älteren Entwurf steht oben ein Hinweis." : ""}`, false);
}

// Nach dem Neuladen ist die Tabelle weg (sie wird nicht gespeichert); wenigstens sagen, welche es war.
const vorigeTabelle = tabSpeicher()?.getItem("bnv.tabelle.v1");
if (vorigeTabelle && !ergebnis) {
    const hinweis = element<HTMLParagraphElement>("tabelle-vorher");
    hinweis.textContent = `Vor dem Neuladen war ${vorigeTabelle} geladen. Tabellen werden nicht gespeichert; bitte erneut einlesen.`;
    hinweis.hidden = false;
}

// Ein zweiter offener Tab arbeitet mit demselben gespeicherten Entwurf; der Hinweis soll das sagen.
try {
    const kanal = new BroadcastChannel("bnv");
    kanal.addEventListener("message", nachricht => {
        if (nachricht.data === "wer-ist-da") {
            kanal.postMessage("hier");
        } else if (nachricht.data === "hier" && !entwurfHinweis.hidden && wiederhergestellt) {
            const zusatz = document.getElementById("entwurf-zusatz");
            if (zusatz && !zusatz.textContent?.includes("anderen Tab")) {
                zusatz.textContent += " Die App ist noch in einem anderen Tab offen; dieser Entwurf stammt vermutlich von dort.";
            }
        }
    });
    kanal.postMessage("wer-ist-da");
} catch {
    // Ohne BroadcastChannel kein Hinweis.
}

// Fassung im Fuß, damit bei Rückfragen klar ist, welcher Stand läuft.
element<HTMLSpanElement>("fassung").textContent = `Fassung ${__FASSUNG__}`;

// Nach dem ersten Aufruf startet die Seite aus dem Cache, auch ohne Netz.
// Der Dienst entsteht erst beim Bauen (web/vite.config.ts), im Entwicklungsserver gibt es ihn nicht.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    // Eine neue Fassung übernimmt sofort; die offene Seite läuft bis zum Neuladen mit der alten.
    const hatteDienst = Boolean(navigator.serviceWorker.controller);
    let nachWechsel = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        netzZeigen();
        // Nur melden, wenn der neue Dienst wirklich eine andere Fassung hat als diese Seite.
        if (hatteDienst) {
            nachWechsel = true;
            navigator.serviceWorker.controller?.postMessage("stand?");
        }
    });
    navigator.serviceWorker.addEventListener("message", ereignis => {
        const stand = ereignis.data as { art?: string; fassung?: string; ausSpeicher?: boolean } | null;
        if (stand?.art !== "stand") {
            return;
        }
        if (nachWechsel) {
            nachWechsel = false;
            if (stand.fassung && stand.fassung !== __FASSUNG__) {
                zeigeKurzmeldung(`Neue Fassung ${stand.fassung} ist geladen; sie gilt ab dem nächsten Neuladen. Eingaben bleiben erhalten.`, false);
            }
            return;
        }
        if (stand.ausSpeicher) {
            const hinweis = element<HTMLParagraphElement>("speicher-stand");
            hinweis.textContent = navigator.onLine
                ? `Server antwortet nicht oder zu langsam: Es läuft die auf diesem Gerät gespeicherte Fassung ${__FASSUNG__}.`
                : `Kein Netz: Es läuft die auf diesem Gerät gespeicherte Fassung ${__FASSUNG__}.`;
            hinweis.hidden = false;
            // Bei bloß langsamem Netz bald nachsehen, nicht erst nach einer Minute.
            setTimeout(netzZeigen, 10_000);
        }
    });
    navigator.serviceWorker.controller?.postMessage("stand?");
    // Steuert schon ein Dienst die Seite (etwa beim Start ohne Netz), gilt die Zusage sofort.
    if (navigator.serviceWorker.controller) {
        element<HTMLElement>("offline-stand").hidden = false;
    }
    navigator.serviceWorker.register("./sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
            element<HTMLElement>("offline-stand").hidden = false;
            // Bitten, den Offline-Stand nicht bei Platzmangel zu räumen; der Browser entscheidet.
            void navigator.storage?.persist?.().catch(() => false);
        })
        .catch(() => {
            // Ohne Dienst läuft die Seite wie bisher, nur nicht ohne Netz.
        });
}
