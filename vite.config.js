/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

import { defineConfig } from "vite";

// npm run dev         → playground (index.html)
// npm run build       → library in dist/: weavle.iife.js (script tag, global "Weavle"),
//                       weavle.es.js (ES module) and weavle.css
// npm run build:demo  → static build of the playground in dist-demo/
export default defineConfig(({ mode }) => {
    if (mode === "demo") {
        return { build: { outDir: "dist-demo" } };
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
            // Keep the copyright notice at the top of the built files (also in the minified IIFE).
            rollupOptions: {
                output: { postBanner: "/*! WeavleJS | (c) 2026 Micha Sulman | MIT License */" }
            }
        }
    };
});
