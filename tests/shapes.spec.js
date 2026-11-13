// Every flowchart shape: drawing, connecting, copy / paste, edge style, and the four ports of each.
import { test, expect, openPlayground } from "./helpers.js";

test.describe("flowchart shapes", () => {
    test.beforeEach(async ({ page }) => {
        await openPlayground(page, "flowchart");
    });

    test("all shapes and their edges draw", async ({ page }) => {
        const result = await page.evaluate(() => {
            const e = window.weavle;
            const types = Object.keys(e.diagram.nodeTypes);
            const cols = 7;
            const nodes = types.map((t, i) => {
                const size = e.getDefaultNodeSize(t);
                return { id: "n" + i, type: t, x: 40 + (i % cols) * 190, y: 40 + Math.floor(i / cols) * 130, width: size.width, height: size.height, label: e.diagram.nodeTypes[t].defaultLabel ?? t };
            });
            const edges = [];
            types.forEach((_, i) => {
                if (i < types.length - 1 && i % cols !== cols - 1) edges.push({ id: "h" + i, sourceNodeId: "n" + i, sourceHandle: "right", targetNodeId: "n" + (i + 1), targetHandle: "left", label: i % 3 === 0 ? "ja" : undefined });
                if (i + cols < types.length) edges.push({ id: "v" + i, sourceNodeId: "n" + i, sourceHandle: "bottom", targetNodeId: "n" + (i + cols), targetHandle: "top" });
            });
            e.load({ nodes, edges });

            const drawn = new Set([...e.container.querySelectorAll("path.weavle-edge[data-edge-id]")].map(p => p.getAttribute("data-edge-id")));
            return {
                shapes: types.length,
                nodeGroups: e.container.querySelectorAll("g.weavle-node").length,
                undrawn: e.model.edges.filter(x => !drawn.has(x.id)).map(x => x.id),
                noRoute: e.model.edges.filter(x => !x.routePoints || x.routePoints.length < 2).map(x => x.id)
            };
        });

        expect(result.shapes).toBe(26);
        expect(result.nodeGroups).toBe(26);
        expect(result.undrawn).toEqual([]);
        expect(result.noRoute).toEqual([]);
    });

    test("copy / paste keeps type, size and label of every shape; a whole diagram doubles", async ({ page }) => {
        const result = await page.evaluate(() => {
            const e = window.weavle;
            const types = Object.keys(e.diagram.nodeTypes);
            const nodes = types.map((t, i) => {
                const size = e.getDefaultNodeSize(t);
                return { id: "n" + i, type: t, x: 40 + (i % 7) * 190, y: 40 + Math.floor(i / 7) * 130, width: size.width, height: size.height, label: t };
            });
            const edges = types.slice(1).map((_, i) => ({ id: "x" + i, sourceNodeId: "n" + i, sourceHandle: "right", targetNodeId: "n" + (i + 1), targetHandle: "left" }));
            const expectedEdges = edges.length;   // load() keeps the array: pasting would grow it
            e.load({ nodes, edges });

            const bad = [];
            for (const n of [...e.model.nodes]) {
                e.state.selectedNodeIds = [n.id];
                e.state.primarySelectedNodeId = n.id;
                const before = e.model.nodes.length;
                const ok = e.copySelection() && e.pasteClipboard();
                const copy = e.model.nodes.at(-1);
                if (!(ok && e.model.nodes.length === before + 1 && copy.type === n.type && copy.width === n.width && copy.height === n.height && copy.label === n.label && copy.id !== n.id)) bad.push(n.type);
            }

            const originals = e.model.nodes.slice(0, types.length);
            e.state.selectedNodeIds = originals.map(n => n.id);
            e.state.primarySelectedNodeId = originals[0].id;
            const n0 = e.model.nodes.length;
            const e0 = e.model.edges.length;
            e.copySelection();
            e.pasteClipboard();
            return { bad, nodes: e.model.nodes.length - n0, edges: e.model.edges.length - e0, expectedEdges };
        });

        expect(result.bad).toEqual([]);
        expect(result.nodes).toBe(26);
        expect(result.edges).toBe(result.expectedEdges);
    });

    test("every edge of every shape takes a line style", async ({ page }) => {
        const bad = await page.evaluate(() => {
            const e = window.weavle;
            const types = Object.keys(e.diagram.nodeTypes);
            const nodes = types.map((t, i) => {
                const size = e.getDefaultNodeSize(t);
                return { id: "n" + i, type: t, x: 40 + (i % 7) * 190, y: 40 + Math.floor(i / 7) * 130, width: size.width, height: size.height, label: t };
            });
            const edges = types.slice(1).map((_, i) => ({ id: "x" + i, sourceNodeId: "n" + i, sourceHandle: "right", targetNodeId: "n" + (i + 1), targetHandle: "left" }));
            e.load({ nodes, edges });

            return e.model.edges.filter(edge => {
                e.setEdgeStyle(edge.id, { dash: "8,5", strokeWidth: 3, stroke: "#aa0000" });
                const p = e.container.querySelector(`path.weavle-edge[data-edge-id="${edge.id}"]`);
                return !p || p.getAttribute("stroke") !== "#aa0000" || p.getAttribute("stroke-dasharray") !== "8,5";
            }).map(edge => edge.id);
        });
        expect(bad).toEqual([]);
    });

    test("every port of every shape ends the line on the port, also after a manual route and a node move", async ({ page }) => {
        const problems = await page.evaluate(() => {
            const e = window.weavle;
            const opposite = { left: "right", right: "left", top: "bottom", bottom: "top" };
            const away = { left: [-300, 0], right: [300, 0], top: [0, -200], bottom: [0, 200] };
            const near = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
            const problems = [];
            let checked = 0;

            for (const type of Object.keys(e.diagram.nodeTypes)) {
                const size = e.getDefaultNodeSize(type);
                const target = { id: "T", type, x: 400, y: 300, width: size.width, height: size.height, label: "T" };

                for (const handle of Object.keys(e.getPorts(target))) {
                    const side = e.getPortSide(target, handle);
                    const [dx, dy] = away[side] || [300, 0];
                    const helper = { id: "H", type: "process", x: 400 + dx, y: 300 + dy, width: 100, height: 50, label: "H" };
                    const helperHandle = Object.keys(e.getPorts(helper)).find(n => e.getPortSide(helper, n) === opposite[side]) || "left";

                    e.model.nodes = [target, helper];
                    const edge = { id: "E", sourceNodeId: "H", sourceHandle: helperHandle, targetNodeId: "T", targetHandle: handle };
                    e.model.edges = [edge];
                    e.assignEdgeType(edge);
                    e.updateEdgeRoute(edge);
                    e.render();

                    const where = `${type}/${handle}`;
                    checked++;
                    if (!edge.routePoints || edge.routePoints.length < 2) { problems.push(`${where}: no route`); continue; }
                    if (!near(edge.routePoints.at(-1), e.getHandlePoint(target, handle))) problems.push(`${where}: route does not end on the port`);

                    edge.isAutoRoute = false;
                    target.x += 40;
                    target.y += 30;
                    e.updateEdgeRoute(edge);
                    if (!near(edge.routePoints.at(-1), e.getHandlePoint(target, handle))) problems.push(`${where}: manual route does not follow the port`);
                    target.x -= 40;
                    target.y -= 30;
                }
            }
            return { checked, problems };
        });

        expect(problems.checked).toBe(26 * 4);
        expect(problems.problems).toEqual([]);
    });

    test("ports lie on the shape outline: the slanted shapes at the middle of their slanted side", async ({ page }) => {
        // Guards against changes to the port geometry (manualInput top, merge / extract / collate sides).
        const ports = await page.evaluate(() => {
            const e = window.weavle;
            const out = {};
            for (const type of ["manualInput", "merge", "extract", "collate"]) {
                const size = e.getDefaultNodeSize(type);
                const node = { id: "T", type, x: 0, y: 0, width: size.width, height: size.height, label: "" };
                out[type] = Object.fromEntries(Object.entries(e.getPorts(node)).map(([h, p]) => [h, [Math.round(p.x), Math.round(p.y)]]));
                out[type].size = [size.width, size.height];
            }
            return out;
        });

        expect(ports.manualInput.size).toEqual([140, 70]);
        expect(ports.manualInput.top).toEqual([70, 11]);
        expect(ports.manualInput.left).toEqual([0, 46]);
        expect(ports.merge).toMatchObject({ top: [30, 0], right: [45, 25], bottom: [30, 50], left: [15, 25] });
        expect(ports.extract).toMatchObject({ top: [30, 0], right: [45, 25], bottom: [30, 50], left: [15, 25] });
        expect(ports.collate).toMatchObject({ top: [25, 0], right: [38, 15], bottom: [25, 60], left: [13, 15] });
    });
});
