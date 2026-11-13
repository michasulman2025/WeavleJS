// Copy / paste (Ctrl+C, Ctrl+V) of nodes and the edges between them.
import { test, expect, openPlayground, loadSample, loadSmallDiagram, getData, clickNode, clickEdge, drag, modelToClient,
         DIAGRAM_TYPES, DRAWN_TYPES } from "./helpers.js";

for (const type of DRAWN_TYPES) {
    test.describe(type, () => {
        test.beforeEach(async ({ page }) => {
            await openPlayground(page, type);
            await loadSmallDiagram(page);
        });

        test("one node: Ctrl+C / Ctrl+V adds a selected copy, repeated pastes move on, undo and redo", async ({ page }) => {
            await clickNode(page, "b");
            await page.keyboard.press("Control+c");
            await page.keyboard.press("Control+v");

            let data = await getData(page);
            expect(data.nodes).toHaveLength(5);
            const copy = data.nodes.at(-1);
            expect(copy).toMatchObject({ type: data.nodes[1].type, label: "Links", width: 140, height: 60 });
            expect(copy.id).not.toBe("b");
            expect([copy.x, copy.y]).toEqual([140, 240]);       // two grid cells right and down
            expect(await page.evaluate(() => window.weavle.state.selectedNodeIds)).toEqual([copy.id]);

            await page.keyboard.press("Control+v");
            data = await getData(page);
            expect([data.nodes.at(-1).x, data.nodes.at(-1).y]).toEqual([180, 280]);   // one step further

            await page.keyboard.press("Control+z");
            expect((await getData(page)).nodes).toHaveLength(5);
            await page.keyboard.press("Control+y");
            expect((await getData(page)).nodes).toHaveLength(6);
        });

        test("several nodes: the edges between them are copied with new ids, style and label offset", async ({ page }) => {
            await page.evaluate(() => {
                const e = window.weavle;
                e.setEdgeStyle("e4", { dash: "2,4" });
                e.model.edges.find(x => x.id === "e4").labelOffset = { x: 10, y: 30 };
                e.render();
            });
            await clickNode(page, "b");
            await clickNode(page, "c", { modifiers: ["Control"] });   // Ctrl+click adds to the selection
            expect((await page.evaluate(() => window.weavle.state.selectedNodeIds)).sort()).toEqual(["b", "c"]);

            await page.keyboard.press("Control+c");
            await page.keyboard.press("Control+v");

            const data = await getData(page);
            expect(data.nodes).toHaveLength(6);
            expect(data.edges).toHaveLength(5);
            const [bCopy, cCopy] = data.nodes.slice(-2);
            const edgeCopy = data.edges.at(-1);
            expect(edgeCopy.id).not.toBe("e4");
            expect([edgeCopy.sourceNodeId, edgeCopy.targetNodeId]).toEqual([bCopy.id, cCopy.id]);
            expect(edgeCopy.style).toEqual({ dash: "2,4" });
            expect(edgeCopy.labelOffset).toEqual({ x: 10, y: 30 });
            expect(edgeCopy.label).toBe("Tussen");
        });

        test("nothing selected, or only an edge: Ctrl+C / Ctrl+V do nothing", async ({ page }) => {
            await clickEdge(page, "e1", 0.9);
            await page.keyboard.press("Control+c");
            await page.keyboard.press("Control+v");
            expect((await getData(page)).nodes).toHaveLength(4);
        });

        test("a copy can be moved like any other node", async ({ page }) => {
            await clickNode(page, "d");
            await page.keyboard.press("Control+c");
            await page.keyboard.press("Control+v");
            const id = (await getData(page)).nodes.at(-1).id;

            const start = await page.evaluate(i => window.weavle.getNode(i), id);
            const centre = await modelToClient(page, start.x + start.width / 2, start.y + start.height / 2);
            await drag(page, centre, { x: centre.x + 100, y: centre.y });
            const moved = await page.evaluate(i => window.weavle.getNode(i), id);
            expect(moved.x).toBeGreaterThan(start.x + 50);
        });
    });
}

test("copy and paste between two editors of the same type, but not of different types", async ({ page }) => {
    await openPlayground(page, "flowchart");
    await loadSmallDiagram(page);

    const result = await page.evaluate(async () => {
        const { WeavleJS } = await import("/src/weavle.js");
        const { createFlowchartDefinition } = await import("/src/weavle-flowchart.js");
        const { createBpmnDefinition } = await import("/src/weavle-bpmn.js");
        const host = id => {
            const el = document.createElement("div");
            el.id = id;
            el.style.cssText = "position:fixed;left:-9999px;width:600px;height:400px";
            document.body.appendChild(el);
            return "#" + id;
        };
        const options = { width: 600, height: 400, toolbar: false };
        const other = new WeavleJS(host("hostB"), options, createFlowchartDefinition());
        const bpmn  = new WeavleJS(host("hostC"), options, createBpmnDefinition());
        other.load({ nodes: [], edges: [] });
        bpmn.load({ nodes: [], edges: [] });

        const e = window.weavle;
        e.state.selectedNodeIds = ["b", "c"];
        e.state.primarySelectedNodeId = "c";
        const copied = e.copySelection();

        return {
            copied,
            pastedSame: other.pasteClipboard(),
            sameNodes: other.model.nodes.length,
            sameEdges: other.model.edges.length,
            edgeEnds: other.model.edges[0] && [other.getNode(other.model.edges[0].sourceNodeId)?.label, other.getNode(other.model.edges[0].targetNodeId)?.label],
            pastedOther: bpmn.pasteClipboard(),
            otherNodes: bpmn.model.nodes.length,
            original: e.model.nodes.length
        };
    });

    expect(result).toMatchObject({ copied: true, pastedSame: true, sameNodes: 2, sameEdges: 1, pastedOther: false, otherNodes: 0, original: 4 });
    expect(result.edgeEnds).toEqual(["Links", "Rechts"]);
});

test("BPMN: copying a pool takes its lanes and contents along", async ({ page }) => {
    await openPlayground(page, "bpmn");
    await loadSample(page, true);

    const result = await page.evaluate(() => {
        const e = window.weavle;
        const pool = e.model.nodes.find(n => e.isContainer(n) && !n.parentId);
        const before = { nodes: e.model.nodes.length, edges: e.model.edges.length };
        const inside = e.withDescendants([pool]).length;
        e.state.selectedNodeIds = [pool.id];
        e.state.primarySelectedNodeId = pool.id;
        const copied = e.copySelection();
        const pasted = e.pasteClipboard();
        const copies = e.model.nodes.slice(before.nodes);
        const ids = new Set(copies.map(n => n.id));
        return {
            copied, pasted, inside,
            addedNodes: copies.length,
            addedEdges: e.model.edges.length - before.edges,
            parentsInsideCopy: copies.filter(n => n.parentId).every(n => ids.has(n.parentId)),
            edgesInsideCopy: e.model.edges.slice(before.edges).every(x => ids.has(x.sourceNodeId) && ids.has(x.targetNodeId))
        };
    });

    expect(result).toMatchObject({ copied: true, pasted: true, parentsInsideCopy: true, edgesInsideCopy: true });
    expect(result.addedNodes).toBe(result.inside);
    expect(result.addedNodes).toBeGreaterThan(2);
});

test("BPMN: a lane without its pool and a boundary event without its host are not copied", async ({ page }) => {
    await openPlayground(page, "bpmn");
    await loadSample(page, true);

    const result = await page.evaluate(() => {
        const e = window.weavle;
        const lane = e.model.nodes.find(n => e.isContainer(n) && n.parentId);
        const boundary = e.model.nodes.find(n => n.attachedToId);
        return {
            lane: lane ? (e.state.selectedNodeIds = [lane.id], e.copySelection()) : "no lane in sample",
            boundary: boundary ? (e.state.selectedNodeIds = [boundary.id], e.copySelection()) : "no boundary event in sample"
        };
    });

    expect(result.lane).toBe(false);
    expect([false, "no boundary event in sample"]).toContain(result.boundary);
});

test("types that arrange themselves have no copy / paste", async ({ page }) => {
    for (const type of DIAGRAM_TYPES.filter(t => !DRAWN_TYPES.includes(t) && t !== "nodeeditor")) {
        await openPlayground(page, type);
        await loadSample(page);
        const copied = await page.evaluate(() => {
            const e = window.weavle;
            e.state.selectedNodeIds = [e.model.nodes.at(-1).id];
            return e.copySelection();
        });
        expect(copied, type).toBe(false);
    }
});

test("node editor: copy and paste works", async ({ page }) => {
    await openPlayground(page, "nodeeditor");
    await loadSample(page);
    const added = await page.evaluate(() => {
        const e = window.weavle;
        const n0 = e.model.nodes.length;
        e.state.selectedNodeIds = [e.model.nodes.at(-1).id];
        return e.copySelection() && e.pasteClipboard() ? e.model.nodes.length - n0 : -1;
    });
    expect(added).toBe(1);
});
