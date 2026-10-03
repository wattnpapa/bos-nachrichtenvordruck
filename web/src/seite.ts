import "@fontsource-variable/archivo";
import "./stil.css";

// Gemeinsam für App und Rechtsseiten: Schrift, Gestaltung, Anzeigemodus und
// Sprungmarke. Die Rechtsseiten laden nur dieses Modul.

function speicher(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
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

document.getElementById("sprungmarke")?.addEventListener("click", () => {
    const inhalt = document.getElementById("inhalt");
    if (!inhalt) {
        return;
    }
    inhalt.focus();
    inhalt.scrollIntoView();
});


// ---- Widerspruch gegen die Reichweitenmessung ----------------------------

// GoatCounter zählt nicht, solange localStorage „skipgc" auf „t" steht.
const nichtZaehlen = document.getElementById("nicht-zaehlen");
if (nichtZaehlen instanceof HTMLInputElement) {
    nichtZaehlen.checked = speicher()?.getItem("skipgc") === "t";
    nichtZaehlen.addEventListener("change", () => {
        if (nichtZaehlen.checked) {
            speicher()?.setItem("skipgc", "t");
        } else {
            speicher()?.removeItem("skipgc");
        }
    });
}
