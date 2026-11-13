// Shared helpers for the regression tests. Every test starts from the playground; the editor is `window.weavle`.
import { test as base, expect } from "@playwright/test";

export { expect };

/** Diagram types of the playground (select #selDiagram). */
export const DIAGRAM_TYPES = ["flowchart", "bpmn", "ishikawa", "fta", "causetree", "orgchart", "pedigree", "nodeeditor"];

/** Types where the user draws edges and places nodes (the others arrange themselves). */
export const DRAWN_TYPES = ["flowchart", "bpmn"];

/** `test` that fails when the page logs a console error or throws. */
export const test = base.extend({
    errors: [async ({ page }, use) => {
        const errors = [];
        page.on("pageerror", error => errors.push(String(error)));
        page.on("console", message => {
            if (message.type() === "error" && !/favicon/i.test(message.text())) errors.push(message.text());
        });
        await use(errors);
        expect(errors, "console errors").toEqual([]);
    }, { auto: true }]
});

/**
 * Opens the playground with the given diagram type. Custom styles are on by default (the edge style menu
 * needs `allowCustomStyles`); the checkbox rebuilds the editor, so it is ticked before the type is chosen.
 */
export async function openPlayground(page, type = "flowchart", { customStyles = true } = {}) {
    await page.goto("/");
    await page.waitForFunction(() => !!window.weavle);

    const checkbox = page.locator("#chkCustomStyles");
    if ((await checkbox.isChecked()) !== customStyles) await checkbox.setChecked(customStyles);

    await switchType(page, type);
}

export async function switchType(page, type) {
    await page.selectOption("#selDiagram", type);
    await page.waitForFunction(t => window.weavle?.diagram?.id === t, type);
}

/** Clicks one of the playground's sample buttons ("Load sample" or "Load complex sample (BPMN)"). */
export async function loadSample(page, complex = false) {
    await page.getByRole("button", { name: complex ? /complex sample/i : /^Load sample$/ }).click();
    await page.waitForFunction(() => window.weavle.model.nodes.length > 0);
}

/** The node type used for plain steps: the flowchart's "process", BPMN's first task type. */
export async function stepType(page) {
    return page.evaluate(() => {
        const types = Object.keys(window.weavle.diagram.nodeTypes);
        return types.includes("process") ? "process" : types.find(t => /task/i.test(t)) || types[0];
    });
}

/**
 * Loads the small test diagram used by the edge tests:
 *
 *   a (300,40)        a → b   e1 bottom → top
 *   b (100,200)  c    a → c   e2 bottom → top
 *   d (300,360)       a → d   e3 left → left, label "Terug": a long edge with a vertical segment at x = 280
 *                     b → c   e4 right → left, label "Tussen": crosses that vertical segment
 */
export async function loadSmallDiagram(page) {
    const type = await stepType(page);
    await page.evaluate(t => {
        const node = (id, x, y, label) => ({ id, type: t, x, y, width: 140, height: 60, label });
        const edge = (id, s, sh, g, gh, label) => ({ id, sourceNodeId: s, sourceHandle: sh, targetNodeId: g, targetHandle: gh, ...(label ? { label } : {}) });

        window.weavle.load({
            nodes: [node("a", 300, 40, "Start"), node("b", 100, 200, "Links"), node("c", 500, 200, "Rechts"), node("d", 300, 360, "Einde")],
            edges: [
                edge("e1", "a", "bottom", "b", "top"),
                edge("e2", "a", "bottom", "c", "top"),
                edge("e3", "a", "left", "d", "left", "Terug"),
                edge("e4", "b", "right", "c", "left", "Tussen")
            ]
        });
    }, type);
}

/** Model data of the editor (a deep copy). */
export const getData = page => page.evaluate(() => window.weavle.getData());

/** The model edge with this id. */
export const getEdge = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(window.weavle.model.edges.find(e => e.id === i) || null)), id);

/** Client coordinates of a model point. */
export function modelToClient(page, x, y) {
    return page.evaluate(([px, py]) => {
        const e = window.weavle;
        const ctm = e.svg.getScreenCTM();
        const sx = px * e.state.zoom + e.state.panX;
        const sy = py * e.state.zoom + e.state.panY;
        return { x: ctm.a * sx + ctm.c * sy + ctm.e, y: ctm.b * sx + ctm.d * sy + ctm.f };
    }, [x, y]);
}

/** Client coordinates of a point on a drawn edge, as a fraction (0..1) of its length. */
export function edgePoint(page, edgeId, fraction = 0.5) {
    return page.evaluate(([id, f]) => {
        const path = document.querySelector(`.weavle-edge-hit[data-edge-id="${id}"]`);
        const point = path.getPointAtLength(path.getTotalLength() * f);
        const ctm = path.getScreenCTM();
        return { x: ctm.a * point.x + ctm.c * point.y + ctm.e, y: ctm.b * point.x + ctm.d * point.y + ctm.f };
    }, [edgeId, fraction]);
}

/** Two clicks on the same item within 350 ms are a double-click (label editor): leave a gap between our clicks. */
const CLICK_GAP = 400;

/**
 * Clicks the centre of a node (selects it and gives the editor keyboard focus).
 * `modifiers: ["Control"]` holds those keys during the click (page.mouse.click has no such option).
 */
export async function clickNode(page, id, { modifiers = [] } = {}) {
    await page.waitForTimeout(CLICK_GAP);
    const p = await page.evaluate(i => {
        const n = window.weavle.getNode(i);
        return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
    }, id);
    const c = await modelToClient(page, p.x, p.y);

    for (const key of modifiers) await page.keyboard.down(key);
    await page.mouse.click(c.x, c.y);
    for (const key of modifiers) await page.keyboard.up(key);
}

/**
 * Clicks a drawn edge (selects it) at a fraction of its length. Edges that leave one port share their first
 * segment: pick a fraction on the part that belongs to this edge alone (e1 and e2: near the target, 0.9).
 */
export async function clickEdge(page, id, fraction = 0.35) {
    await page.waitForTimeout(CLICK_GAP);
    const p = await edgePoint(page, id, fraction);
    await page.mouse.click(p.x, p.y);
}

/** Drags with the real mouse from one client point to another. */
export async function drag(page, from, to) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
}

/** Centre of an element in client coordinates. */
export async function centreOf(locator) {
    const box = await locator.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The attributes of the drawn path of an edge. */
export function edgePathAttrs(page, id) {
    return page.evaluate(i => {
        const p = document.querySelector(`path.weavle-edge[data-edge-id="${i}"]`);
        return p && {
            d: p.getAttribute("d"),
            stroke: p.getAttribute("stroke"),
            width: p.getAttribute("stroke-width"),
            dash: p.getAttribute("stroke-dasharray"),
            markerStart: p.getAttribute("marker-start"),
            markerEnd: p.getAttribute("marker-end")
        };
    }, id);
}

/** Opens the "Stijl" menu of the edge tools and picks a row by its text. */
export async function chooseEdgeStyle(page, label) {
    await page.locator('.weavle-tool-surface [title="Stijl"]').click();
    await page.locator(".weavle-tool-submenu .weavle-tool-menu-item", { hasText: new RegExp(`^${label}$`) }).click();
}
