/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — Org chart (organogram) diagram definition.

  The diagram is a tree (or a few side by side), stored as ordinary nodes and edges (edge = report →
  manager, type "reportsTo"), drawn top-down:

      person        a card: name (node.label) and job title (node.role)
      vacancy       an open position: the same card, dashed, label "Vacature"

  The definition owns the layout: layoutDiagram() positions every card on each change. A manager whose
  reports have no reports of their own (and who has at least STACK_MIN of them) gets them stacked below
  each other ("hanging" layout), otherwise they sit in a row under a shared bus — so wide teams don't
  make the chart wide. Users don't connect; they add, reorder, promote and remove through the node tools.
  Dragging any part moves the whole chart. Sibling order is the order of the nodes in model.nodes.

  Host apps usually keep people as a flat list (id, managerId, name, role): modelFromList() /
  modelToList() convert between that list and the model. Changing someone's manager through the node
  tools dispatches weavle:orgchart:managerchanged { nodeId, oldManagerId, newManagerId } after the
  weavle:modelchanged of the same action.
*/

const NS = "http://www.w3.org/2000/svg";

// ── Layout constants ────────────────────────────────────────

const CARD_WIDTH   = 180;
const CARD_MIN_H   = 52;
const ACCENT       = 4;     // coloured bar along the top of a card
const PAD_X        = 10;
const PAD_Y        = 8;
const NAME_ROLE_GAP = 2;

const SIBLING_GAP  = 20;    // horizontal gap between neighbouring subtrees
const LEVEL_GAP    = 40;    // vertical distance between a manager and a row of reports
const TREE_GAP     = 60;    // horizontal gap between separate trees

const STACK_MIN    = 3;     // this many leaf reports or more are stacked below each other
const STACK_INDENT = 24;    // stacked reports sit this far right of their manager's left edge
const STACK_GAP    = 10;    // vertical gap between stacked reports
const STACK_TOP    = 16;    // gap between a manager and its first stacked report

// The name is the engine-drawn label (so double-click edits it); the role is drawn by the shape.
const NAME_FONT  = { fontSize: 13, maxLines: 2 };
const ROLE_FONT  = { fontSize: 11, maxLines: 2 };
const LINE_HEIGHT = 1.25;   // the engine's default label line height

const CARD_TYPES = ["person", "vacancy"];

// ── Shapes ──────────────────────────────────────────────────

function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

/** The role's wrapped lines and where they go, from the last layout's metrics (see layoutOrgChart). */
function roleBox(engine, node, metrics) {
    const m = metrics.get(node.id);
    const nameH = m ? m.nameH : NAME_FONT.fontSize * LINE_HEIGHT;
    const lineHeight = ROLE_FONT.fontSize * LINE_HEIGHT;
    const width = node.width - 2 * PAD_X;
    const font  = engine.getNodeStyle(node);
    const { lines } = engine.wrapLabel(node.role || "", width, ROLE_FONT.maxLines, ROLE_FONT.fontSize,
                                       { ...font, fontWeight: "normal" });
    const top = node.y + ACCENT + PAD_Y + nameH + NAME_ROLE_GAP;
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

/** The forest as stored in the model: manager per node (via its edge), reports in model order, roots. */
function readTree(engine) {
    const nodes     = engine.model.nodes;
    const byId      = new Map(nodes.map(n => [n.id, n]));
    const managerOf = new Map();

    for (const edge of engine.model.edges) {
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

    const reports = node => nodes.filter(n => managerOf.get(n.id) === node);

    return {
        roots:     nodes.filter(n => !managerOf.has(n.id)),
        managerOf: node => managerOf.get(node.id) || null,
        reports,
        rootOf:    node => { let n = node; while (managerOf.has(n.id)) n = managerOf.get(n.id); return n; }
    };
}

function makeEdge(engine, report, manager) {
    return {
        id: engine.generateId(),
        sourceNodeId: report.id,
        targetNodeId: manager.id,
        sourceHandle: "top",
        targetHandle: "bottom",
        type: "reportsTo"
    };
}

/** Points the report's edge at another manager (null = it becomes a root). */
function setManager(engine, report, manager) {
    const edges = engine.model.edges;
    engine.model.edges = edges.filter(e => e.sourceNodeId !== report.id);
    if (manager) engine.model.edges.push(makeEdge(engine, report, manager));
}

/** Whether a manager's reports are stacked: enough of them, and none has reports of its own. */
function isStacked(tree, node) {
    const reports = tree.reports(node);
    return reports.length >= STACK_MIN && reports.every(r => tree.reports(r).length === 0);
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
    return { nameH };
}

// ── Layout ──────────────────────────────────────────────────

/**
 * Positions every tree: the first root keeps its place, further trees follow to the right of it.
 * Fills `routes` (edge id → { points, at }) for routeEdge and `metrics` (node id → { nameH }) for
 * the label position; `at` is where the edge's report was placed, so routeEdge can shift the line
 * along while the chart is dragged.
 */
function layoutOrgChart(engine, routes, metrics) {
    routes.clear();
    metrics.clear();

    const tree = readTree(engine);
    if (!tree.roots.length) return;

    for (const node of engine.model.nodes) metrics.set(node.id, fitCard(engine, node));

    // Subtree widths, bottom-up.
    const widths = new Map();
    const measure = node => {
        const reports = tree.reports(node);
        let width = node.width;
        if (isStacked(tree, node)) {
            reports.forEach(measure);
            width = Math.max(node.width, STACK_INDENT + CARD_WIDTH);
        } else if (reports.length) {
            const row = reports.reduce((sum, r) => sum + measure(r), 0) + SIBLING_GAP * (reports.length - 1);
            width = Math.max(node.width, row);
        }
        widths.set(node, width);
        return width;
    };

    const byReport = new Map();   // report id → route points

    const place = (node, left, top) => {
        const span    = widths.get(node);
        const reports = tree.reports(node);
        const bottom  = { x: 0, y: top + node.height };

        if (isStacked(tree, node)) {
            // Manager on the left of its column, reports below it, joined by a spine on the left.
            node.x = left;
            node.y = top;

            const spineX = left + STACK_INDENT / 2;
            let y = top + node.height + STACK_TOP;
            for (const report of reports) {
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

        if (!reports.length) return;

        const childTop = top + node.height + LEVEL_GAP;
        const busY     = top + node.height + LEVEL_GAP / 2;
        const row      = reports.reduce((sum, r) => sum + widths.get(r), 0) + SIBLING_GAP * (reports.length - 1);
        let x          = left + (span - row) / 2;

        for (const report of reports) {
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
        const points = byReport.get(edge.sourceNodeId);
        const report = engine.getNode(edge.sourceNodeId);
        if (points && report) routes.set(edge.id, { points, at: { x: report.x, y: report.y } });
    }
}

// The definition's own colours (ARCHITECTURE.md 7.4): the bottom layer under any theme.
const ORGCHART_THEME = {
    nodeTypes: {
        person:  { fill: "#FFFFFF", stroke: "#1B5278", textColor: "#1F2933", fontWeight: "600" },
        vacancy: { fill: "#F7F8FA", stroke: "#8A94A3", textColor: "#5B6573", fontWeight: "600", dash: "5,4" }
    },
    edgeTypes: {
        reportsTo: { stroke: "#8A94A3" }
    }
};

// ── Flat list ───────────────────────────────────────────────

/**
 * Builds an org chart model from a flat list, as host apps keep people:
 *   [{ id, managerId?, name, role?, vacancy?, style? }]
 * (also accepted: label for name, title for role, type "vacancy"). Unknown managers make a root.
 * Positions don't matter — the layout runs on load.
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
        if (item.style) node.style = item.style;
        return node;
    });

    const edges = items
        .filter(item => item.managerId != null && item.managerId !== "" && ids.has(String(item.managerId)))
        .map(item => ({
            id: `reportsTo-${item.id}`,
            sourceNodeId: String(item.id),
            targetNodeId: String(item.managerId),
            sourceHandle: "top",
            targetHandle: "bottom",
            type: "reportsTo"
        }));

    return { nodes, edges };
}

/** The model as a flat list: [{ id, managerId, name, role, vacancy }] in model order (managerId "" for roots). */
export function orgChartToList(model) {
    const nodes = model?.nodes || [];
    const managerOf = new Map();
    for (const edge of model?.edges || []) {
        if (!managerOf.has(edge.sourceNodeId)) managerOf.set(edge.sourceNodeId, edge.targetNodeId);
    }

    return nodes.map(node => ({
        id:        node.id,
        managerId: managerOf.get(node.id) || "",
        name:      node.label || "",
        role:      node.role || "",
        vacancy:   node.type === "vacancy"
    }));
}

// ── Definition ──────────────────────────────────────────────

/**
 * Org chart (organogram): people and vacancies in a reporting tree, laid out automatically top-down.
 * A new (empty) diagram starts with a manager and two reports.
 */
export function createOrgChartDefinition() {
    // From the last layout: lines per edge id, and per card the height of its name block.
    const routes  = new Map();
    const metrics = new Map();

    // Manager changes of the running action, reported once its weavle:modelchanged has gone out.
    const reportManagerChanges = (engine, changes) => {
        if (!changes.length) return;
        queueMicrotask(() => changes.forEach(c => engine.emitDiagramEvent("managerchanged", c)));
    };

    const moveTo = (engine, tree, report, manager, changes) => {
        const old = tree.managerOf(report);
        setManager(engine, report, manager);
        changes.push({ nodeId: report.id, oldManagerId: old?.id || "", newManagerId: manager?.id || "" });
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
            reportsTo: { router: "straight", marker: "none", strokeWidth: 1.5 }
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
            layoutOrgChart(engine, routes, metrics);
        },

        // The line from the last layout, shifted by how far its report moved since (the whole chart
        // moves as one while dragged; the layout runs again on the drop).
        routeEdge({ sourcePoint, targetPoint, edge, engine }) {
            const route  = routes.get(edge?.id);
            const report = route && engine.getNode(edge.sourceNodeId);
            if (!report) return [sourcePoint, targetPoint];

            const dx = report.x - route.at.x;
            const dy = report.y - route.at.y;
            return route.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        },

        // Grabbing any card drags the whole chart: the first root, which takes its tree along (other
        // trees follow it on the drop).
        getDragTarget(node, engine) {
            return readTree(engine).roots[0] || null;
        },

        // Deleting a card takes its whole team along ("Alleen deze persoon" keeps the team).
        getDependentNodes(node, engine) {
            return readTree(engine).reports(node);
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
            const title   = type => engine.getTypeTitle(type);
            const menu    = (label, action, extra = {}) => ({
                type: "group", label, ...extra,
                children: CARD_TYPES.map(t => ({ type: action, nodeType: t, label: title(t) }))
            });

            const actions = [
                menu("Medewerker toevoegen", "ocAddReport", { icon: "branch" })
            ];

            if (manager) actions.push(menu("Collega toevoegen", "ocAddColleague", { icon: "plus" }));

            actions.push({ type: "ocEditRole", label: "Functie wijzigen", icon: "edit" });

            actions.push(node.type === "vacancy"
                ? { type: "changeType", nodeType: "person", label: "Vacature invullen" }
                : { type: "changeType", nodeType: "vacancy", label: "Vacature maken" });

            actions.push({ type: "ocAddManager", label: "Manager erboven invoegen", nodeType: "person" });
            if (manager && tree.managerOf(manager)) {
                actions.push({ type: "ocPromote", label: "Een niveau hoger", icon: "moveUpLevel" });
            }

            const siblings = manager ? tree.reports(manager) : tree.roots;
            const index    = siblings.indexOf(node);
            const stacked  = manager && isStacked(tree, manager);
            if (index > 0) {
                actions.push({ type: "ocMove", direction: -1, label: stacked ? "Omhoog" : "Naar links", icon: stacked ? "moveUp" : "moveLeft" });
            }
            if (index < siblings.length - 1) {
                actions.push({ type: "ocMove", direction: 1, label: stacked ? "Omlaag" : "Naar rechts", icon: stacked ? "moveDown" : "moveRight" });
            }

            if (tree.reports(node).length) {
                actions.push({ type: "ocRemoveOnly", label: "Alleen deze persoon verwijderen", icon: "detach" });
            }
            if (this.canDeleteNode(node, engine)) {
                actions.push({ type: "deleteNode", label: tree.reports(node).length ? "Verwijderen (met team)" : "Verwijderen" });
            }
            return actions;
        },

        handleAction(action, node, engine) {
            const tree    = readTree(engine);
            const changes = [];

            switch (action.type) {
                case "ocAddReport":
                    editLabel(engine, addCard(engine, node, action.nodeType, lastReport(tree, node)));
                    return true;

                case "ocAddColleague": {
                    const manager = tree.managerOf(node);
                    if (!manager) return false;
                    editLabel(engine, addCard(engine, manager, action.nodeType, node));
                    return true;
                }

                case "ocEditRole": {
                    // Not a model change by itself: committing the edit records the undo step.
                    engine.startInlineLabelEdit("node", node.id, { field: "role", box: roleBox(engine, node, metrics) });
                    return false;
                }

                case "ocAddManager": {
                    // The new card takes this card's place (and order) under its old manager.
                    const old   = tree.managerOf(node);
                    const card  = addCard(engine, old, "person", null);
                    const nodes = engine.model.nodes;
                    nodes.splice(nodes.indexOf(card), 1);
                    nodes.splice(nodes.indexOf(node), 0, card);
                    if (!old) Object.assign(card, { x: node.x, y: node.y });   // a new root keeps the chart in place
                    moveTo(engine, tree, node, card, changes);
                    reportManagerChanges(engine, changes);
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
                    moveTo(engine, tree, node, above, changes);
                    reportManagerChanges(engine, changes);
                    return true;
                }

                case "ocMove": {
                    const manager  = tree.managerOf(node);
                    const siblings = manager ? tree.reports(manager) : tree.roots;
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

                    reports.forEach(r => moveTo(engine, tree, r, manager, changes));
                    engine.model.edges = engine.model.edges.filter(e => e.sourceNodeId !== node.id && e.targetNodeId !== node.id);
                    engine.clearSelection?.();
                    engine.clearNodeToolSurface?.();
                    engine.emitSelectionChanged();
                    reportManagerChanges(engine, changes);
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

/** The last report of a manager in model order (new reports go after it, so they appear last). */
function lastReport(tree, manager) {
    const reports = tree.reports(manager);
    return reports[reports.length - 1] || null;
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
