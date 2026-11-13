// Every diagram type loads its sample without errors and offers the right interactions.
import { test, expect, openPlayground, loadSample, DIAGRAM_TYPES } from "./helpers.js";

// What the user may do on the canvas per type (diagram.interaction, engine defaults: everything on).
const INTERACTION = {
    flowchart:  { dragNodes: true,  connect: true,  selectEdges: true },
    bpmn:       { dragNodes: true,  connect: true,  selectEdges: true },
    nodeeditor: { dragNodes: true,  connect: true,  selectEdges: true },
    ishikawa:   { connect: false, selectEdges: false },
    fta:        { connect: false, selectEdges: false },
    causetree:  { connect: false, selectEdges: false },
    orgchart:   { connect: false, selectEdges: false },
    pedigree:   { dragNodes: false, connect: false, selectEdges: false }
};

for (const type of DIAGRAM_TYPES) {
    test.describe(type, () => {
        test("the sample loads and draws every node and edge", async ({ page }) => {
            await openPlayground(page, type);
            await loadSample(page);

            const result = await page.evaluate(() => {
                const e = window.weavle;
                return {
                    nodes: e.model.nodes.length,
                    edges: e.model.edges.length,
                    nodeGroups: e.container.querySelectorAll("g.weavle-node").length,
                    paths: e.container.querySelectorAll("path.weavle-edge[data-edge-id]").length,
                    interaction: e.getInteraction()
                };
            });

            expect(result.nodes).toBeGreaterThan(0);
            expect(result.nodeGroups).toBeGreaterThan(0);
            // Hidden items (collapsed org chart branches, pedigree outside the range) are not drawn: never more than the model.
            expect(result.paths).toBeLessThanOrEqual(result.edges);
            expect(result.interaction).toMatchObject(INTERACTION[type]);
        });

        test("the edge tools appear only where edges can be selected", async ({ page }) => {
            await openPlayground(page, type);
            await loadSample(page);

            const tools = await page.evaluate(() => {
                const e = window.weavle;
                const edge = e.model.edges[0];
                if (!edge) return null;
                e.selectSingleEdge(edge.id);
                e.render();
                e.renderEdgeToolSurface(edge);
                return {
                    buttons: [...e.container.querySelectorAll(".weavle-tool-surface .weavle-tool-button")].map(b => b.title),
                    handles: e.container.querySelectorAll(".weavle-edge-handle--segment").length
                };
            });

            if (INTERACTION[type].selectEdges) {
                expect(tools.buttons).toContain("Verwijderen");
                expect(tools.buttons).toContain("Stijl");
            } else {
                expect(tools.buttons).toEqual([]);
            }
        });
    });
}

test("a bezier edge (node editor) has no route handles and no line jumps", async ({ page }) => {
    await openPlayground(page, "nodeeditor");
    await loadSample(page);

    const result = await page.evaluate(() => {
        const e = window.weavle;
        const edge = e.model.edges[0];
        e.selectSingleEdge(edge.id);
        e.render();
        return {
            handles: e.container.querySelectorAll(".weavle-edge-handle--segment").length,
            canEdit: e.canEditEdgeRoute(edge),
            arcs: [...e.container.querySelectorAll("path.weavle-edge")].filter(p => / A /.test(p.getAttribute("d"))).length
        };
    });
    expect(result).toEqual({ handles: 0, canEdit: false, arcs: 0 });
});

test("the BPMN complex sample (pools, lanes, message flows) loads", async ({ page }) => {
    await openPlayground(page, "bpmn");
    await loadSample(page, true);
    const counts = await page.evaluate(() => ({
        pools: window.weavle.model.nodes.filter(n => n.type === "pool").length,
        edges: window.weavle.model.edges.length
    }));
    expect(counts.pools).toBeGreaterThanOrEqual(3);
    expect(counts.edges).toBeGreaterThan(10);
});
