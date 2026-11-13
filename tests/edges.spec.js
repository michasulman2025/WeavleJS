// Edge features on the types where the user draws edges: manual routes, labels, styles, line jumps.
import { test, expect, openPlayground, loadSample, loadSmallDiagram, getData, getEdge, clickEdge, drag, centreOf,
         edgePathAttrs, chooseEdgeStyle, DRAWN_TYPES } from "./helpers.js";

for (const type of DRAWN_TYPES) {
    test.describe(type, () => {
        test.beforeEach(async ({ page }) => {
            await openPlayground(page, type);
            await loadSmallDiagram(page);
        });

        test("a selected edge shows its tools", async ({ page }) => {
            await clickEdge(page, "e1", 0.9);
            const tools = await page.locator(".weavle-tool-surface .weavle-tool-button").evaluateAll(b => b.map(x => x.title));
            expect(tools).toEqual(["Stijl", "Verwijderen"]);
        });

        test("dragging the vertical segment makes the route manual and it survives a reload and a node move", async ({ page }) => {
            await clickEdge(page, "e3");
            const handle = page.locator(".weavle-edge-handle--segment");
            await expect(handle).toHaveCount(1);

            const from = await centreOf(handle);
            await drag(page, from, { x: from.x - 220, y: from.y });

            const edge = await getEdge(page, "e3");
            expect(edge.isAutoRoute).toBe(false);
            const x = edge.routePoints[1].x;
            expect(x).toBeLessThan(100);                       // left of "Links" (x 100..240)
            expect(edge.routePoints[2].x).toBe(x);             // still one vertical segment

            // Load the saved model again: the route is kept.
            await page.evaluate(() => window.weavle.load(window.weavle.getData()));
            expect((await getEdge(page, "e3")).routePoints.map(p => p.x)).toEqual(edge.routePoints.map(p => p.x));

            // Move the target: only the ends follow the ports, the dragged segment stays.
            await page.evaluate(() => {
                const e = window.weavle;
                e.getNode("d").y += 60;
                e.rerouteEdgesForNodes(["d"]);
            });
            const moved = await getEdge(page, "e3");
            expect(moved.isAutoRoute).toBe(false);
            expect(moved.routePoints[1].x).toBe(x);
            const end = moved.routePoints.at(-1);
            const port = await page.evaluate(() => window.weavle.getHandlePoint(window.weavle.getNode("d"), "left"));
            expect(end).toEqual({ x: port.x, y: port.y });
        });

        test("'Automatisch routeren' gives a manual route back to the router", async ({ page }) => {
            await clickEdge(page, "e3");
            const from = await centreOf(page.locator(".weavle-edge-handle--segment"));
            await drag(page, from, { x: from.x - 220, y: from.y });
            expect((await getEdge(page, "e3")).isAutoRoute).toBe(false);

            await clickEdge(page, "e3", 0.1);   // the edge is still selected: a second click within 350 ms would be a double-click
            await page.locator('.weavle-tool-surface [title="Automatisch routeren"]').click();

            const edge = await getEdge(page, "e3");
            expect(edge.isAutoRoute).toBe(true);
            expect(edge.routePoints[1].x).toBeGreaterThan(200);   // back next to the nodes
        });

        test("a click on a segment handle without moving changes nothing", async ({ page }) => {
            await clickEdge(page, "e3");
            const history = await page.evaluate(() => window.weavle.historyIndex);
            await page.mouse.click(...Object.values(await centreOf(page.locator(".weavle-edge-handle--segment"))));
            expect((await getEdge(page, "e3")).isAutoRoute).not.toBe(false);   // still automatic
            expect(await page.evaluate(() => window.weavle.historyIndex)).toBe(history);
        });

        test("a label can be dragged, undone and reset", async ({ page }) => {
            const label = page.locator('[data-edge-label-id="e4"]');
            await expect(label.locator(".weavle-edge-label-bg")).toHaveCount(1);   // semi-transparent background

            const from = await centreOf(label);
            await drag(page, from, { x: from.x + 20, y: from.y + 32 });

            const offset = (await getEdge(page, "e4")).labelOffset;
            expect(offset.x).toBeGreaterThan(10);
            expect(offset.y).toBeGreaterThan(20);

            await page.keyboard.press("Control+z");
            expect((await getEdge(page, "e4")).labelOffset).toBeUndefined();
            await page.keyboard.press("Control+y");
            expect((await getEdge(page, "e4")).labelOffset).toEqual(offset);

            // Undo / redo close the tools: clicking the label selects the edge again.
            await page.waitForTimeout(400);
            await page.mouse.click(...Object.values(await centreOf(label)));
            await page.locator('.weavle-tool-surface [title="Label terugzetten"]').click();
            expect((await getEdge(page, "e4")).labelOffset).toBeUndefined();
        });

        test("a label that is only clicked does not move", async ({ page }) => {
            await page.mouse.click(...Object.values(await centreOf(page.locator('[data-edge-label-id="e4"]'))));
            expect((await getEdge(page, "e4")).labelOffset).toBeUndefined();
        });

        test("the style menu sets line style, width and colour", async ({ page }) => {
            await clickEdge(page, "e1", 0.9);

            await chooseEdgeStyle(page, "Gestreept");
            await chooseEdgeStyle(page, "Dik");
            await page.locator('.weavle-tool-surface [title="Stijl"]').click();
            await page.locator('.weavle-tool-submenu input[type="color"]').first().fill("#cc0000");

            expect((await getEdge(page, "e1")).style).toEqual({ dash: "8,5", strokeWidth: 3, stroke: "#cc0000" });

            await page.mouse.click(900, 700);   // deselect: the line is drawn in its own colour
            const attrs = await edgePathAttrs(page, "e1");
            expect(attrs).toMatchObject({ stroke: "#cc0000", width: "3", dash: "8,5" });
            expect(attrs.markerEnd).toContain("cc0000");

            // "Standaard" removes the own style again.
            await clickEdge(page, "e1", 0.9);
            await chooseEdgeStyle(page, "Standaard");
            expect((await getEdge(page, "e1")).style).toBeUndefined();
        });

        test("without custom styles the menu offers presets only", async ({ page }) => {
            await openPlayground(page, type, { customStyles: false });
            await loadSmallDiagram(page);
            await clickEdge(page, "e1", 0.9);
            // Only "Verwijderen" (and "Stijl" if the theme has presets, which the default theme does not).
            const tools = await page.locator(".weavle-tool-surface .weavle-tool-button").evaluateAll(b => b.map(x => x.title));
            expect(tools).not.toContain("Automatisch routeren");
            if (tools.includes("Stijl")) {
                await page.locator('.weavle-tool-surface [title="Stijl"]').click();
                await expect(page.locator(".weavle-tool-submenu", { hasText: "Gestreept" })).toHaveCount(0);
            }
        });

        test("the delete tool removes the edge in one undo step", async ({ page }) => {
            await clickEdge(page, "e1", 0.9);
            await page.locator('.weavle-tool-surface [title="Verwijderen"]').click();
            expect(await getEdge(page, "e1")).toBeNull();

            // The clicked tool is gone, so the editor lost the keyboard focus: click the canvas first.
            await page.mouse.click(900, 700);
            await page.keyboard.press("Control+z");
            expect(await getEdge(page, "e1")).not.toBeNull();
        });

        test("a horizontal line hops over a vertical line it crosses", async ({ page }) => {
            // e4 (b → c, straight) crosses the vertical segment of e3 at x = 280.
            expect((await edgePathAttrs(page, "e4")).d).toMatch(/ A /);
            // The vertical line itself stays plain.
            expect((await edgePathAttrs(page, "e3")).d).not.toMatch(/ A /);

            await page.evaluate(() => { window.weavle.options.lineJumps = false; window.weavle.render(); });
            expect((await edgePathAttrs(page, "e4")).d).not.toMatch(/ A /);
        });
    });
}

test("message flow between pools: a solid style overrides the dashed type, markers follow the colour", async ({ page }) => {
    await openPlayground(page, "bpmn");
    await loadSample(page, true);

    expect((await edgePathAttrs(page, "m_1")).dash).toBe("6,4");   // dashed by type

    await clickEdge(page, "m_1", 0.5);
    await chooseEdgeStyle(page, "Doorlopend");
    await page.locator('.weavle-tool-surface [title="Stijl"]').click();
    await page.locator('.weavle-tool-submenu input[type="color"]').first().fill("#0066cc");

    // Selected: the selection colour for line and markers.
    let attrs = await edgePathAttrs(page, "m_1");
    expect(attrs.dash).toBe("none");
    expect(attrs.stroke).toBe("#F57100");
    expect(attrs.markerStart).toContain("eb6c4c");
    expect(attrs.markerEnd).toContain("eb6c4c");

    // Deselected: its own colour, also on the start circle and the arrowhead.
    await page.evaluate(() => { window.weavle.clearSelection(); window.weavle.clearNodeToolSurface(); window.weavle.render(); });
    attrs = await edgePathAttrs(page, "m_1");
    expect(attrs.stroke).toBe("#0066cc");
    expect(attrs.markerStart).toContain("0066cc");
    expect(attrs.markerEnd).toContain("0066cc");
});

test("every edge of the complex BPMN sample takes a style", async ({ page }) => {
    await openPlayground(page, "bpmn");
    await loadSample(page, true);

    const ids = (await getData(page)).edges.map(e => e.id);
    const bad = await page.evaluate(edgeIds => edgeIds.filter(id => {
        const e = window.weavle;
        e.setEdgeStyle(id, { dash: "2,4", strokeWidth: 3, stroke: "#0066cc" });
        const p = document.querySelector(`path.weavle-edge[data-edge-id="${id}"]`);
        return !p || p.getAttribute("stroke") !== "#0066cc" || p.getAttribute("stroke-dasharray") !== "2,4";
    }), ids);
    expect(bad).toEqual([]);
});
