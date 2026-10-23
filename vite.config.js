/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

// Version (package.json) and build time on the first line of every built file, so a copy taken into
// an OutSystems app shows which build it is.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const builtAt     = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

// npm run dev         → playground (index.html)
// npm run build       → library in dist/: weavle.iife.js (script tag, global "Weavle"),
//                       weavle.es.js (ES module) and weavle.css
// npm run build:demo  → static build of the playground in dist-demo/
export default defineConfig(({ mode }) => {
    if (mode === "demo") {
        // Both pages: the playground and the embedding tests.
        return {
            build: {
                outDir: "dist-demo",
                rollupOptions: { input: { main: "index.html", embed: "embed-test.html" } }
            }
        };
    }

    return {
        build: {
            outDir: "dist",
            sourcemap: true,
            lib: {
                entry: "src/index.js",
                name: "Weavle",
                formats: ["iife", "es"],
                fileName: format => (format === "iife" ? "weavle.iife.js" : "weavle.es.js"),
                cssFileName: "weavle"
            },
            // Keep the version, build time and copyright notice at the top of the built files (also in the
            // minified IIFE).
            rollupOptions: {
                output: { postBanner: `/*! WeavleJS v${version} | built ${builtAt} | (c) 2026 Micha Sulman | MIT License */` }
            }
        }
    };
});
