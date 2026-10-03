import { defineConfig } from "vite";

// Die Web-App liegt in web/ und nutzt die Bibliothek direkt aus src/.
// Relative Basis: läuft unter einer eigenen Domain genauso wie unter
// <name>.github.io/bos-nachrichtenvordruck/.
export default defineConfig({
    root: "web",
    base: "./",
    build: {
        outDir: "../dist-web",
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500
    }
});
