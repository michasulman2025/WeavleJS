/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — Org chart (organogram) diagram definition.

  The diagram is a tree (or a few side by side), stored as ordinary nodes and edges, drawn top-down:

      person        a card: name (node.label) and job title (node.role)
      vacancy       an open position: the same card, dashed, label "Vacature"

  Edges go from report to manager. "reportsTo" edges make the tree; "dottedLine" edges are extra
  (functional / matrix) reporting lines that the layout ignores — they are routed around the cards.

  The definition owns the layout: layoutDiagram() positions every card on each change.
  - A manager whose reports have no reports of their own (and who has at least STACK_MIN of them) gets
    them stacked below each other ("hanging" layout), otherwise they sit in a row under a shared bus —
    so wide teams don't make the chart wide.
  - Assistants (node.assistant on a report without reports of its own) sit beside the line under their
    manager, alternately right and left, above the row of reports.
  - A collapsed card (node.collapsed) hides everything below it and shows a "+n" button on its bottom
    edge; an open team gets a "−" button there while hovered (getNodeButtons). The engine skips hidden
    nodes (isNodeHidden).
  - Cards get a style variant from the structure (getNodeVariant): "top" for a person without a manager,
    "manager" for a person with reports — coloured by nodeVariants in the (default) theme.

  Dragging a card drags it with its team; dropping it onto another card makes that card its manager
  (with Alt: adds a dotted line instead). Everything else goes through the node tools. Sibling order is
  the order of the nodes in model.nodes.

  Host apps usually keep people as a flat list (id, managerId, name, role, ...): modelFromList() /
  modelToList() convert between that list and the model. Diagram events (weavle:orgchart:<name>),
  each after the weavle:modelchanged of the same action:
      managerchanged     { nodeId, oldManagerId, newManagerId }
      dottedlineadded    { nodeId, managerId }
      dottedlineremoved  { nodeId, managerId }
*/

const NS = "http://www.w3.org/2000/svg";

// ── Layout constants ────────────────────────────────────────

const CARD_WIDTH    = 180;
const CARD_MIN_H    = 52;
const ACCENT        = 4;     // coloured bar along the top of a card
const PAD_X         = 10;
const PAD_Y         = 8;
const NAME_ROLE_GAP = 2;

const SIBLING_GAP   = 20;    // horizontal gap between neighbouring subtrees
const LEVEL_GAP     = 40;    // vertical distance between a manager (or its assistants) and a row of reports
const TREE_GAP      = 60;    // horizontal gap between separate trees

const STACK_MIN     = 3;     // this many leaf reports or more are stacked below each other
const STACK_INDENT  = 24;    // stacked reports sit this far right of their manager's left edge
const STACK_GAP     = 10;    // vertical gap between stacked reports
const STACK_TOP     = 16;    // gap between a manager and its first stacked report

const ASSIST_GAP_X  = 20;    // horizontal gap between the line under a manager and an assistant
const ASSIST_GAP_Y  = 14;    // vertical gap above each row of assistants

// The name is the engine-drawn label (so double-click edits it); the role is drawn by the shape.
const NAME_FONT   = { fontSize: 13, maxLines: 2 };
const ROLE_FONT   = { fontSize: 11, maxLines: 2 };
const LINE_HEIGHT = 1.25;   // the engine's default label line height

const CARD_TYPES = ["person", "vacancy"];

const isReportsEdge = edge => !edge.type || edge.type === "reportsTo";
const isDottedEdge  = edge => edge.type === "dottedLine";

// ── Shapes ──────────────────────────────────────────────────

function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

/** The role's wrapped lines and where they go, from the last layout's metrics (see layoutOrgChart). */
function roleBox(engine, node, metrics) {
    const m          = metrics.get(node.id);
    const nameH      = m ? m.nameH : NAME_FONT.fontSize * LINE_HEIGHT;
    const lineHeight = ROLE_FONT.fontSize * LINE_HEIGHT;
    const width      = node.width - 2 * PAD_X;
    const font       = engine.getNodeStyle(node);
    const { lines }  = engine.wrapLabel(node.role || "", width, ROLE_FONT.maxLines, ROLE_FONT.fontSize,
                                        { ...font, fontWeight: "normal" });
    const top    = node.y + ACCENT + PAD_Y + nameH + NAME_ROLE_GAP;
    const height = Math.max(1, lines.length) * lineHeight;

    return {
        lines, lineHeight, width, height, fontSize: ROLE_FONT.fontSize,
        centerX: node.x + node.width / 2,
        centerY: top + height / 2
    };
}

function createShapes(metrics) {
    const card = (node, engine) => {
        const { x, y, width: w, height: h } = node;
        const style = engine.getNodeStyle(node);
        const group = svgEl("g", {});

        const rect = svgEl("rect", { x, y, width: w, height: h, rx: 6 });
        engine.applyNodeStyle(rect, node);
        group.appendChild(rect);

        // Accent bar in the line colour, clipped to the rounded top by its own small radius.
        group.appendChild(svgEl("rect", {
            x: x + 1, y: y + 1, width: Math.max(0, w - 2), height: ACCENT, rx: 3,
            fill: style.stroke, "pointer-events": "none", class: "weavle-orgchart-accent"
        }));

        if (node.role && engine.getNode(node.id)) {
            const box  = roleBox(engine, node, metrics);
            const text = svgEl("text", {
                "text-anchor": "middle", "font-size": box.fontSize, fill: style.textColor || style.stroke,
                "fill-opacity": "0.75", "pointer-events": "none", class: "weavle-orgchart-role"
            });
            const first = box.centerY - box.height / 2 + box.lineHeight / 2 + box.fontSize * 0.35;
            box.lines.forEach((line, i) => {
                const tspan = svgEl("tspan", { x: box.centerX, y: first + i * box.lineHeight });
                tspan.textContent = line;
                text.appendChild(tspan);
            });
            group.appendChild(text);
        }

        return group;
    };

    return { person: card, vacancy: card };
}

// ── Tree helpers ────────────────────────────────────────────

/**
 * The forest as stored in the model: manager per node (via its reportsTo edge), reports in model
 * order, roots, assistants (node.assistant on a report without reports of its own).
 */
function readTree(engine) {
    const nodes     = engine.model.nodes;
    const byId      = new Map(nodes.map(n => [n.id, n]));
    const managerOf = new Map();

    for (const edge of engine.model.edges) {
        if (!isReportsEdge(edge)) continue;
        const report  = byId.get(edge.sourceNodeId);
        const manager = byId.get(edge.targetNodeId);
        if (report && manager && report !== manager && !managerOf.has(report.id)) managerOf.set(report.id, manager);
    }

    // A cycle (only possible in hand-made data) would hang the layout: cut it at the first node found.
    for (const node of nodes) {
        const seen = new Set([node]);
        for (let m = managerOf.get(node.id); m; m = managerOf.get(m.id)) {
            if (seen.has(m)) { managerOf.delete(node.id); break; }
            seen.add(m);
        }
    }

    const reportsOf = new Map(nodes.map(n => [n, []]));
    for (const node of nodes) {
        const manager = managerOf.get(node.id);
        if (manager) reportsOf.get(manager).push(node);
    }

    const reports     = node => reportsOf.get(node) || [];
    const isAssistant = node => !!node.assistant && managerOf.has(node.id) && reports(node).length === 0;
    const descendants = node => reports(node).flatMap(r => [r, ...descendants(r)]);

    return {
        roots:       nodes.filter(n => !managerOf.has(n.id)),
        managerOf:   node => managerOf.get(node.id) || null,
        reports,
        isAssistant,
        assistants:  node => reports(node).filter(isAssistant),
        team:        node => reports(node).filter(r => !isAssistant(r)),
        descendants,
        dottedOf:    node => engine.model.edges
            .filter(e => isDottedEdge(e) && e.sourceNodeId === node.id)
            .map(e => byId.get(e.targetNodeId)).filter(Boolean)
    };
}

function makeEdge(engine, report, manager, type = "reportsTo") {
    return {
        id: engine.generateId(),
        sourceNodeId: report.id,
        targetNodeId: manager.id,
        sourceHandle: type === "reportsTo" ? "top" : "right",
        targetHandle: type === "reportsTo" ? "bottom" : "left",
        type
    };
}

/** Points the report's reportsTo edge at another manager (null = it becomes a root). */
function setManager(engine, report, manager) {
    engine.model.edges = engine.model.edges.filter(e => {
        if (e.sourceNodeId !== report.id) return true;
        if (isReportsEdge(e)) return false;
        // A dotted line to the new manager is now the solid line.
        return !(manager && isDottedEdge(e) && e.targetNodeId === manager.id);
    });
    if (manager) engine.model.edges.push(makeEdge(engine, report, manager));
}

/** Whether a manager's team is stacked: open, no assistants, enough reports and none has reports of its own. */
function isStacked(tree, node) {
    if (node.collapsed) return false;
    const team = tree.team(node);
    return tree.assistants(node).length === 0 &&
           team.length >= STACK_MIN && team.every(r => tree.reports(r).length === 0);
}

/** Sizes a card to its name and role; returns the name block height (for the label offset). */
function fitCard(engine, node) {
    const font  = engine.getNodeStyle(node);   // the name is bold: measured as such
    const width = CARD_WIDTH - 2 * PAD_X;
    const name  = engine.wrapLabel(node.label || "", width, NAME_FONT.maxLines, NAME_FONT.fontSize, font);
    const role  = node.role
        ? engine.wrapLabel(node.role, width, ROLE_FONT.maxLines, ROLE_FONT.fontSize, { ...font, fontWeight: "normal" })
        : { lines: [] };

    const nameH = Math.max(1, name.lines.length) * NAME_FONT.fontSize * LINE_HEIGHT;
    const roleH = role.lines.length * ROLE_FONT.fontSize * LINE_HEIGHT;

    node.width  = CARD_WIDTH;
    node.height = Math.max(CARD_MIN_H, Math.ceil(ACCENT + 2 * PAD_Y + nameH + (roleH ? NAME_ROLE_GAP + roleH : 0)));
    return { nameH, hiddenCount: 0 };
}

// ── Layout ──────────────────────────────────────────────────

/**
 * Positions every tree: the first root keeps its place, further trees follow to the right of it.
 * Fills `routes` (edge id → { points, at }) for routeEdge, `metrics` (node id → { nameH, hiddenCount })
 * for the label position and the "+n" badge, and `hidden` (ids under collapsed cards). `at` is where the
 * edge's report was placed, so routeEdge can shift the line along while a team is dragged.
 */
function layoutOrgChart(engine, routes, metrics, hidden, variants) {
    routes.clear();
    metrics.clear();
    hidden.clear();
    variants.clear();

    const tree = readTree(engine);
    if (!tree.roots.length) return;

    // Style variants from the structure (before sizing: a theme may give a variant another font).
    // Vacancies keep their own look.
    for (const node of engine.model.nodes) {
        if (node.type !== "person") continue;
        if (!tree.managerOf(node)) variants.set(node.id, "top");
        else if (tree.reports(node).length) variants.set(node.id, "manager");
    }

    for (const node of engine.model.nodes) {
        metrics.set(node.id, { ...fitCard(engine, node), hasReports: tree.reports(node).length > 0 });
    }

    // Room the assistants of a manager need on both sides of the line under it (kept symmetric, so the
    // manager stays centred above its team).
    const assistantsWidth = node => tree.assistants(node).length ? 2 * (ASSIST_GAP_X + CARD_WIDTH) : 0;

    // Subtree widths, bottom-up.
    const widths = new Map();
    const measure = node => {
        const team = tree.team(node);
        let width  = node.width;

        if (node.collapsed) {
            // Nothing below it is shown.
        } else if (isStacked(tree, node)) {
            team.forEach(measure);
            width = Math.max(node.width, STACK_INDENT + CARD_WIDTH);
        } else {
            const row = team.reduce((sum, r) => sum + measure(r), 0) + SIBLING_GAP * Math.max(0, team.length - 1);
            width = Math.max(node.width, row, assistantsWidth(node));
        }
        widths.set(node, width);
        return width;
    };

    const byReport = new Map();   // report id → route points

    const collapse = node => {
        const below = tree.descendants(node);
        for (const d of below) {
            d.x = node.x;   // kept under the card, so they travel along when it is dragged
            d.y = node.y;
            hidden.add(d.id);
        }
        metrics.get(node.id).hiddenCount = below.length;
    };

    const place = (node, left, top) => {
        const span   = widths.get(node);
        const team   = tree.team(node);
        const bottom = { x: 0, y: top + node.height };

        if (node.collapsed && tree.reports(node).length) {
            node.x = left + span / 2 - node.width / 2;
            node.y = top;
            collapse(node);
            return;
        }

        if (isStacked(tree, node)) {
            // Manager on the left of its column, reports below it, joined by a spine on the left.
            node.x = left;
            node.y = top;

            const spineX = left + STACK_INDENT / 2;
            let y = top + node.height + STACK_TOP;
            for (const report of team) {
                place(report, left + STACK_INDENT, y);
                const midY = report.y + report.height / 2;
                byReport.set(report.id, [{ x: report.x, y: midY }, { x: spineX, y: midY }, { x: spineX, y: node.y + node.height }]);
                y += report.height + STACK_GAP;
            }
            return;
        }

        node.x = left + span / 2 - node.width / 2;
        node.y = top;
        bottom.x = node.x + node.width / 2;

        // Assistants in rows of two, right then left of the line down from the manager.
        let below = bottom.y;
        const assistants = tree.assistants(node);
        for (let i = 0; i < assistants.length; i += 2) {
            const pair   = assistants.slice(i, i + 2);
            const rowTop = below + ASSIST_GAP_Y;
            pair.forEach((assistant, j) => {
                const right = j === 0;
                assistant.x = right ? bottom.x + ASSIST_GAP_X : bottom.x - ASSIST_GAP_X - assistant.width;
                assistant.y = rowTop;
                const midY  = rowTop + assistant.height / 2;
                const side  = right ? assistant.x : assistant.x + assistant.width;
                byReport.set(assistant.id, [{ x: side, y: midY }, { x: bottom.x, y: midY }, bottom]);
            });
            below = rowTop + Math.max(...pair.map(a => a.height));
        }

        if (!team.length) return;

        const childTop = below + LEVEL_GAP;
        const busY     = below + LEVEL_GAP / 2;
        const row      = team.reduce((sum, r) => sum + widths.get(r), 0) + SIBLING_GAP * (team.length - 1);
        let x          = left + (span - row) / 2;

        for (const report of team) {
            place(report, x, childTop);
            x += widths.get(report) + SIBLING_GAP;

            const out = { x: report.x + report.width / 2, y: report.y };
            byReport.set(report.id, out.x === bottom.x
                ? [out, bottom]
                : [out, { x: out.x, y: busY }, { x: bottom.x, y: busY }, bottom]);
        }
    };

    // The first root keeps its top and its anchor (left edge when stacked, else its centre).
    const first = tree.roots[0];
    measure(first);
    let left = isStacked(tree, first) ? first.x : first.x + first.width / 2 - widths.get(first) / 2;
    const top = first.y;

    for (const root of tree.roots) {
        if (root !== first) measure(root);
        place(root, left, top);
        left += widths.get(root) + TREE_GAP;
    }

    for (const edge of engine.model.edges) {
        const report = engine.getNode(edge.sourceNodeId);
        if (!report) continue;

        if (isDottedEdge(edge)) {
            pickDottedHandles(edge, report, engine.getNode(edge.targetNodeId));
            continue;
        }

        const points = byReport.get(edge.sourceNodeId);
        if (points) routes.set(edge.id, { points, at: { x: report.x, y: report.y } });
    }
}

/** Dotted lines leave and enter at the sides facing each other (the top and bottom carry the tree). */
function pickDottedHandles(edge, report, manager) {
    if (!manager) return;
    const dx = (manager.x + manager.width / 2) - (report.x + report.width / 2);

    if (Math.abs(dx) < CARD_WIDTH) {
        edge.sourceHandle = "right";
        edge.targetHandle = "right";
    } else {
        edge.sourceHandle = dx > 0 ? "right" : "left";
        edge.targetHandle = dx > 0 ? "left" : "right";
    }
}

// The definition's own colours (ARCHITECTURE.md 7.4): the bottom layer under any theme. Variants come from
// the structure (getNodeVariant): "top" = a person without a manager, "manager" = a person with reports.
// Kept subtle on purpose: the top stands out, managers are only tinted. A theme overrides them through
// nodeVariants (or makes them plain again with the person colours).
const ORGCHART_THEME = {
    nodeTypes: {
        person:  { fill: "#FFFFFF", stroke: "#1B5278", textColor: "#1F2933", fontWeight: "600" },
        vacancy: { fill: "#F7F8FA", stroke: "#8A94A3", textColor: "#5B6573", fontWeight: "600", dash: "5,4" }
    },
    nodeVariants: {
        top:     { fill: "#1B5278", stroke: "#0E3A57", textColor: "#FFFFFF" },
        manager: { fill: "#EAF2F8", stroke: "#1B5278" }
    },
    edgeTypes: {
        reportsTo:  { stroke: "#8A94A3" },
        dottedLine: { stroke: "#7A5AB8" }
    }
};

// ── Flat list ───────────────────────────────────────────────

/** A list field that may be an array or a comma-separated string ("a, b"). */
function idList(value) {
    if (Array.isArray(value)) return value.map(String);
    if (value == null || value === "") return [];
    return String(value).split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Builds an org chart model from a flat list, as host apps keep people:
 *   [{ id, managerId?, name, role?, vacancy?, assistant?, dottedManagerIds?, style? }]
 * (also accepted: label for name, title for role, type "vacancy"; dottedManagerIds as an array or a
 * comma-separated string). Unknown managers make a root. Positions don't matter — the layout runs on load.
 */
export function orgChartFromList(list) {
    const items = Array.isArray(list) ? list : [];
    const ids   = new Set(items.map(item => String(item.id)));

    const nodes = items.map(item => {
        const vacancy = item.vacancy === true || item.type === "vacancy";
        const node = {
            id:     String(item.id),
            type:   vacancy ? "vacancy" : "person",
            label:  item.name ?? item.label ?? (vacancy ? "Vacature" : ""),
            x: 0, y: 0, width: CARD_WIDTH, height: CARD_MIN_H
        };
        const role = item.role ?? item.title;
        if (role) node.role = String(role);
        if (item.assistant === true) node.assistant = true;
        if (item.style) node.style = item.style;
        return node;
    });

    const edge = (id, source, target, type) => ({
        id, sourceNodeId: source, targetNodeId: target, type,
        sourceHandle: type === "reportsTo" ? "top" : "right",
        targetHandle: type === "reportsTo" ? "bottom" : "left"
    });

    const edges = [];
    for (const item of items) {
        const id      = String(item.id);
        const manager = item.managerId != null && item.managerId !== "" ? String(item.managerId) : null;
        if (manager && ids.has(manager)) edges.push(edge(`reportsTo-${id}`, id, manager, "reportsTo"));

        for (const dotted of idList(item.dottedManagerIds)) {
            if (dotted !== id && dotted !== manager && ids.has(dotted)) {
                edges.push(edge(`dottedLine-${id}-${dotted}`, id, dotted, "dottedLine"));
            }
        }
    }

    return { nodes, edges };
}

/**
 * The model as a flat list in model order: [{ id, managerId, name, role, vacancy, assistant,
 * dottedManagerIds }] (managerId "" for a top). Collapsing is view state and not part of the list.
 */
export function orgChartToList(model) {
    const nodes     = model?.nodes || [];
    const managerOf = new Map();
    const dotted    = new Map(nodes.map(n => [n.id, []]));

    for (const edge of model?.edges || []) {
        if (isDottedEdge(edge)) dotted.get(edge.sourceNodeId)?.push(edge.targetNodeId);
        else if (isReportsEdge(edge) && !managerOf.has(edge.sourceNodeId)) managerOf.set(edge.sourceNodeId, edge.targetNodeId);
    }

    return nodes.map(node => ({
        id:               node.id,
        managerId:        managerOf.get(node.id) || "",
        name:             node.label || "",
        role:             node.role || "",
        vacancy:          node.type === "vacancy",
        assistant:        !!node.assistant,
        dottedManagerIds: dotted.get(node.id) || []
    }));
}

// ── Definition ──────────────────────────────────────────────

/**
 * Org chart (organogram): people and vacancies in a reporting tree, laid out automatically top-down.
 * A new (empty) diagram starts with a manager and two reports.
 */
export function createOrgChartDefinition() {
    // From the last layout: lines per edge id, per card its name block height and hidden count, and
    // the ids hidden under collapsed cards.
    const routes   = new Map();
    const metrics  = new Map();
    const hidden   = new Set();
    const variants = new Map();   // node id → "top" | "manager"

    // Diagram events of the running action, dispatched once its weavle:modelchanged has gone out.
    const report = (engine, events) => {
        if (!events.length) return;
        queueMicrotask(() => events.forEach(([name, detail]) => engine.emitDiagramEvent(name, detail)));
    };

    const moveTo = (engine, tree, node, manager, events) => {
        const old = tree.managerOf(node);
        setManager(engine, node, manager);
        events.push(["managerchanged", { nodeId: node.id, oldManagerId: old?.id || "", newManagerId: manager?.id || "" }]);
    };

    /** Whether a dotted line from node to target may be added. */
    const canAddDotted = (tree, node, target) =>
        target !== node && target !== tree.managerOf(node) && !tree.dottedOf(node).includes(target);

    const addDotted = (engine, node, target, events) => {
        engine.model.edges.push(makeEdge(engine, node, target, "dottedLine"));
        events.push(["dottedlineadded", { nodeId: node.id, managerId: target.id }]);
    };

    /** Moves `node` to the end of `manager`'s reports in model order (so it shows up last). */
    const placeLast = (engine, tree, node, manager) => {
        const nodes = engine.model.nodes;
        const after = tree.reports(manager).filter(r => r !== node).pop() || manager;
        nodes.splice(nodes.indexOf(node), 1);
        nodes.splice(nodes.indexOf(after) + 1, 0, node);
    };

    return {
        id: "orgchart",
        shapes: createShapes(metrics),
        defaultTheme: ORGCHART_THEME,

        nodeTypes: {
            person:  { defaultLabel: "Naam",     title: "Persoon",  shape: "person" },
            vacancy: { defaultLabel: "Vacature", title: "Vacature", shape: "vacancy" }
        },

        // Nothing to place freely: the node tools build the chart.
        palette: [],

        interaction: { connect: false, selectEdges: false },

        defaultEdgeType: "reportsTo",

        edgeTypes: {
            reportsTo:  { router: "straight",   marker: "none", strokeWidth: 1.5 },
            // fixed: the engine keeps this type instead of re-deriving it from the endpoints.
            dottedLine: { router: "orthogonal", marker: "none", strokeWidth: 1.5, dash: "5,4", fixed: true }
        },

        getEdgeTypeForConnection() {
            return "reportsTo";
        },

        modelFromList: orgChartFromList,
        modelToList:   orgChartToList,

        createInitialModel() {
            return orgChartFromList([
                { id: "manager",  name: "Naam", role: "Directeur" },
                { id: "report-1", managerId: "manager", name: "Naam", role: "Functie" },
                { id: "report-2", managerId: "manager", name: "Naam", role: "Functie" }
            ]);
        },

        layoutDiagram(engine) {
            layoutOrgChart(engine, routes, metrics, hidden, variants);
        },

        isNodeHidden(node) {
            return hidden.has(node.id);
        },

        // Style variant from the last layout: "top" (no manager) or "manager" (has reports); see ORGCHART_THEME.
        getNodeVariant(node) {
            return variants.get(node.id) || null;
        },

        // On the bottom edge of a card with a team: "+n" to expand a collapsed team (always shown, also in
        // the export), "−" to collapse an open one (while hovered or selected). Both work in read-only mode.
        getNodeButtons(node) {
            const m      = metrics.get(node.id);
            const at     = { x: node.x + node.width / 2, y: node.y + node.height };
            const action = { type: "ocToggleCollapse" };

            if (m?.hiddenCount) {
                return [{ ...at, action, text: `+${m.hiddenCount}`, title: `Team uitklappen (${m.hiddenCount})`,
                          readOnly: true, keepInExport: true }];
            }
            if (m?.hasReports) {
                return [{ ...at, action, icon: "minus", title: "Team inklappen", show: "hover", readOnly: true }];
            }
            return [];
        },

        // Tree lines: the line from the last layout, shifted by how far its report moved since (a team
        // moves as one while dragged; the layout runs again on the drop). The line of the card being
        // dragged itself previews where it would go: to the highlighted drop target, or nowhere.
        // Dotted lines: the engine's orthogonal router, around the cards.
        routeEdge({ sourcePoint, targetPoint, sourceHandle, targetHandle, edge, engine }) {
            if (edge && isDottedEdge(edge)) {
                return engine.buildRoutedEdgePoints(sourcePoint, targetPoint, sourceHandle, targetHandle, edge);
            }

            const report = edge && engine.getNode(edge.sourceNodeId);
            if (report && isDraggedAway(engine, edge)) return dragPreview(engine, report);

            const route = routes.get(edge?.id);
            if (!route || !report) return [sourcePoint, targetPoint];

            const dx = report.x - route.at.x;
            const dy = report.y - route.at.y;
            return route.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        },

        // Dragging a card takes its team along; deleting it does too ("Alleen deze persoon" keeps the team).
        getDependentNodes(node, engine) {
            return readTree(engine).reports(node);
        },

        // While dragging: the card under the mouse (not one being dragged) becomes the drop target.
        getDropTarget(node, engine, { pos, draggedIds }) {
            const dragged = new Set(draggedIds);
            return engine.getRenderOrder().reverse().find(n =>
                !dragged.has(n.id) &&
                pos.x >= n.x && pos.x <= n.x + n.width && pos.y >= n.y && pos.y <= n.y + n.height
            ) || null;
        },

        // Dropped onto a card: it becomes the new manager (Alt: a dotted line to it instead). Dropped
        // elsewhere: nothing changes, the layout puts the card back.
        onNodeDrop(node, target, engine, { altKey }) {
            if (!target) return;
            const tree   = readTree(engine);
            const events = [];

            if (altKey) {
                if (canAddDotted(tree, node, target)) addDotted(engine, node, target, events);
            } else if (target !== tree.managerOf(node)) {
                delete node.assistant;
                delete target.collapsed;   // show where it went
                placeLast(engine, tree, node, target);
                moveTo(engine, tree, node, target, events);
            }
            report(engine, events);
        },

        // The last remaining tree's top can't go (the chart would be empty).
        canDeleteNode(node, engine) {
            const tree = readTree(engine);
            return !(tree.roots.length === 1 && tree.roots[0] === node);
        },

        getCanvasActions() {
            return [];
        },

        getContextActions(node, engine) {
            const tree    = readTree(engine);
            const manager = tree.managerOf(node);
            const reports = tree.reports(node);
            const title   = type => engine.getTypeTitle(type);
            const cards   = action => CARD_TYPES.map(t => ({ type: action, nodeType: t, label: title(t) }));

            const actions = [{
                type: "group", label: "Medewerker toevoegen", icon: "branch",
                children: [...cards("ocAddReport"), { type: "ocAddAssistant", nodeType: "person", label: "Assistent" }]
            }];

            if (manager) actions.push({ type: "group", label: "Collega toevoegen", icon: "plus", children: cards("ocAddColleague") });

            if (reports.length) {
                actions.push(node.collapsed
                    ? { type: "ocToggleCollapse", label: `Team uitklappen (${tree.descendants(node).length})`, icon: "expand" }
                    : { type: "ocToggleCollapse", label: "Team inklappen", icon: "collapse" });
            }

            actions.push({ type: "ocEditRole", label: "Functie wijzigen", icon: "edit" });

            actions.push(node.type === "vacancy"
                ? { type: "changeType", nodeType: "person", label: "Vacature invullen" }
                : { type: "changeType", nodeType: "vacancy", label: "Vacature maken" });

            if (manager && !reports.length) {
                actions.push(node.assistant
                    ? { type: "ocToggleAssistant", label: "Geen assistent meer", icon: "wrench" }
                    : { type: "ocToggleAssistant", label: "Assistent maken", icon: "wrench" });
            }

            actions.push({ type: "ocAddManager", label: "Manager erboven invoegen", nodeType: "person" });
            if (manager && tree.managerOf(manager)) {
                actions.push({ type: "ocPromote", label: "Een niveau hoger", icon: "moveUpLevel" });
            }

            // Dotted lines: add one (pick the other card), or remove one of them.
            actions.push({ type: "ocAddDotted", label: "Stippellijn toevoegen (klik daarna op een kaart)", icon: "dottedLine" });
            const dotted = tree.dottedOf(node);
            if (dotted.length) {
                actions.push({
                    type: "group", label: "Stippellijn verwijderen", icon: "detach",
                    children: dotted.map(t => ({ type: "ocRemoveDotted", targetId: t.id, label: t.label || title(t.type), nodeType: t.type }))
                });
            }

            // Reorder among the visible siblings of the same kind (team or assistants).
            const siblings = !manager ? tree.roots
                : tree.isAssistant(node) ? tree.assistants(manager) : tree.team(manager);
            const index    = siblings.indexOf(node);
            const stacked  = manager && !tree.isAssistant(node) && isStacked(tree, manager);
            if (index > 0) {
                actions.push({ type: "ocMove", direction: -1, label: stacked ? "Omhoog" : "Naar links", icon: stacked ? "moveUp" : "moveLeft" });
            }
            if (index < siblings.length - 1) {
                actions.push({ type: "ocMove", direction: 1, label: stacked ? "Omlaag" : "Naar rechts", icon: stacked ? "moveDown" : "moveRight" });
            }

            if (reports.length) {
                actions.push({ type: "ocRemoveOnly", label: "Alleen deze persoon verwijderen", icon: "detach" });
            }
            if (this.canDeleteNode(node, engine)) {
                actions.push({ type: "deleteNode", label: reports.length ? "Verwijderen (met team)" : "Verwijderen" });
            }
            return actions;
        },

        handleAction(action, node, engine) {
            const tree   = readTree(engine);
            const events = [];

            switch (action.type) {
                case "ocAddReport":
                case "ocAddAssistant": {
                    delete node.collapsed;   // the new card must be visible
                    const card = addCard(engine, node, action.nodeType, tree.reports(node).at(-1) || null);
                    if (action.type === "ocAddAssistant") card.assistant = true;
                    editLabel(engine, card);
                    return true;
                }

                case "ocAddColleague": {
                    const manager = tree.managerOf(node);
                    if (!manager) return false;
                    editLabel(engine, addCard(engine, manager, action.nodeType, node));
                    return true;
                }

                case "ocToggleCollapse":
                    if (!tree.reports(node).length) return false;
                    if (node.collapsed) delete node.collapsed;
                    else node.collapsed = true;
                    return true;

                case "ocToggleAssistant":
                    if (!tree.managerOf(node) || tree.reports(node).length) return false;
                    if (node.assistant) delete node.assistant;
                    else node.assistant = true;
                    return true;

                case "ocEditRole":
                    // Not a model change by itself: committing the edit records the undo step.
                    engine.startInlineLabelEdit("node", node.id, { field: "role", box: roleBox(engine, node, metrics) });
                    return false;

                case "ocAddDotted":
                    // Not a model change yet: the pick that follows records the undo step.
                    engine.startNodePick({
                        filter: target => canAddDotted(readTree(engine), node, target),
                        onPick: target => {
                            const picked = [];
                            addDotted(engine, node, target, picked);
                            engine.pushHistory();
                            engine.emitModelChanged();
                            engine.render();
                            report(engine, picked);
                        }
                    });
                    return false;

                case "ocRemoveDotted": {
                    const edges = engine.model.edges;
                    const edge  = edges.find(e => isDottedEdge(e) && e.sourceNodeId === node.id && e.targetNodeId === action.targetId);
                    if (!edge) return false;
                    engine.model.edges = edges.filter(e => e !== edge);
                    events.push(["dottedlineremoved", { nodeId: node.id, managerId: action.targetId }]);
                    report(engine, events);
                    return true;
                }

                case "ocAddManager": {
                    // The new card takes this card's place (and order) under its old manager.
                    const old   = tree.managerOf(node);
                    const card  = addCard(engine, old, "person", null);
                    const nodes = engine.model.nodes;
                    nodes.splice(nodes.indexOf(card), 1);
                    nodes.splice(nodes.indexOf(node), 0, card);
                    if (!old) Object.assign(card, { x: node.x, y: node.y });   // a new root keeps the chart in place
                    if (node.assistant) { card.assistant = true; delete node.assistant; }
                    moveTo(engine, tree, node, card, events);
                    report(engine, events);
                    editLabel(engine, card);
                    return true;
                }

                case "ocPromote": {
                    const manager = tree.managerOf(node);
                    const above   = manager && tree.managerOf(manager);
                    if (!above) return false;
                    // Placed right after its old manager among its new colleagues.
                    const nodes = engine.model.nodes;
                    nodes.splice(nodes.indexOf(node), 1);
                    nodes.splice(nodes.indexOf(manager) + 1, 0, node);
                    delete node.assistant;
                    moveTo(engine, tree, node, above, events);
                    report(engine, events);
                    return true;
                }

                case "ocMove": {
                    const manager  = tree.managerOf(node);
                    const siblings = !manager ? tree.roots
                        : tree.isAssistant(node) ? tree.assistants(manager) : tree.team(manager);
                    const other    = siblings[siblings.indexOf(node) + action.direction];
                    if (!other) return false;

                    // Sibling order is model order: swap the two nodes in model.nodes.
                    const nodes = engine.model.nodes;
                    const a = nodes.indexOf(node);
                    const b = nodes.indexOf(other);
                    [nodes[a], nodes[b]] = [nodes[b], nodes[a]];
                    return true;
                }

                case "ocRemoveOnly": {
                    // The team moves up to this card's manager; without one, the reports become tops.
                    const manager = tree.managerOf(node);
                    const reports = tree.reports(node);
                    if (!reports.length) return false;
                    if (!manager) Object.assign(reports[0], { x: node.x, y: node.y });

                    // The reports take the removed card's place in model order (so also among its colleagues).
                    const rest = engine.model.nodes.filter(n => !reports.includes(n));
                    rest.splice(rest.indexOf(node), 1, ...reports);
                    engine.model.nodes = rest;

                    reports.forEach(r => { delete r.assistant; moveTo(engine, tree, r, manager, events); });
                    engine.model.edges = engine.model.edges.filter(e => e.sourceNodeId !== node.id && e.targetNodeId !== node.id);
                    engine.clearSelection?.();
                    engine.clearNodeToolSurface?.();
                    engine.emitSelectionChanged();
                    report(engine, events);
                    return true;
                }

                case "changeType": {
                    if (!CARD_TYPES.includes(action.nodeType) || action.nodeType === node.type) return false;

                    // Keep a custom label; replace the default label of the old type.
                    const oldDefault = this.nodeTypes[node.type]?.defaultLabel;
                    node.type = action.nodeType;
                    if (!node.label || node.label === oldDefault) node.label = this.nodeTypes[node.type].defaultLabel;
                    return true;
                }

                default:
                    return false;
            }
        },

        getDefaultSize() {
            return { width: CARD_WIDTH, height: CARD_MIN_H };
        },

        getNodeInteractionMode() {
            return "action-surface";
        },

        // The name sits in the top part of the card, under the accent bar; the role below it.
        getLabelLayout(node) {
            const nameH = metrics.get(node.id)?.nameH ?? NAME_FONT.fontSize * LINE_HEIGHT;
            const nameCenter = ACCENT + PAD_Y + nameH / 2;
            return {
                placement: "inside", fontSize: NAME_FONT.fontSize, maxLines: NAME_FONT.maxLines,
                paddingX: PAD_X, paddingY: 0, offsetY: nameCenter - (node.height || CARD_MIN_H) / 2
            };
        },

        // Everything is sized by the layout.
        getResizeRules() {
            return false;
        }
    };
}

/** Whether the edge's report is being dragged while its manager is not (its line is being pulled loose). */
function isDraggedAway(engine, edge) {
    const dragged = engine.state.draggingNodeIds || (engine.state.draggingNodeId ? [engine.state.draggingNodeId] : null);
    return !!dragged && dragged.includes(edge.sourceNodeId) && !dragged.includes(edge.targetNodeId);
}

/**
 * The line of a card being dragged: an elbow from its top to the card it would be dropped onto, or no
 * line at all (a zero-length route) while it is over empty space.
 */
function dragPreview(engine, report) {
    const out    = { x: report.x + report.width / 2, y: report.y };
    const target = engine.getNode(engine.state.dropTargetId);
    if (!target) return [out, out];

    const to   = { x: target.x + target.width / 2, y: target.y + target.height };
    const midY = (out.y + to.y) / 2;
    return [out, { x: out.x, y: midY }, { x: to.x, y: midY }, to];
}

/**
 * Adds a card of `type` under `manager` (null = a new root), right after `after` in model order (or at
 * the end); the layout places and sizes it. Returns the new node.
 */
function addCard(engine, manager, type, after) {
    const node = {
        id: engine.generateId(),
        type,
        label: engine.getDefaultLabelForType(type),
        x: manager?.x ?? 0, y: manager?.y ?? 0, width: CARD_WIDTH, height: CARD_MIN_H
    };

    const nodes = engine.model.nodes;
    const index = after ? nodes.indexOf(after) : -1;
    if (index >= 0) nodes.splice(index + 1, 0, node);
    else nodes.push(node);

    if (manager) engine.model.edges.push(makeEdge(engine, node, manager));
    return node;
}

/** Selects a new card and opens its name for editing once the engine has laid it out and drawn it. */
function editLabel(engine, node) {
    engine.selectSingleNode(node.id);
    engine.emitSelectionChanged();

    setTimeout(() => {
        if (engine.getNode(node.id) && !engine.state.editingLabel) {
            engine.startInlineLabelEdit("node", node.id);
        }
    }, 0);
}
