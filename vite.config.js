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
            }
        }
    };
});
