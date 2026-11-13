// Regression tests: Playwright drives the playground (src/demo.js) in a real Chromium, with the real mouse and keyboard.
//   npm test                 run everything (starts the dev server on port 5199 if it is not running)
//   npx playwright test tests/edges.spec.js     one file
//   npx playwright test --headed                watch it
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "tests",
    timeout: 60000,
    expect: { timeout: 5000 },
    reporter: [["list"]],
    use: {
        baseURL: "http://localhost:5199",
        viewport: { width: 1500, height: 850 },
        trace: "retain-on-failure"
    },
    webServer: {
        command: "npm run dev -- --port 5199 --strictPort",
        url: "http://localhost:5199",
        reuseExistingServer: true,
        timeout: 60000
    }
});
