/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — Fault Tree Analysis (foutenboom) diagram definition.

  The diagram is a tree, stored as ordinary nodes and edges (edge = child → parent), drawn top-down:

      topEvent (the undesired event)
        └ gate        (AND, OR, XOR, priority AND, k-out-of-n, inhibit)
            ├ event       (intermediate event: a box with its own gate below it)
            ├ basicEvent / undevelopedEvent / houseEvent / transfer   (leaves, label below the symbol)
            └ conditionEvent   (only under an inhibit gate: drawn to the right of the gate)

  An event has at most one gate; a gate has its inputs as children. The definition owns the layout:
  layoutDiagram() positions every node from the tree on each change (a simple tidy tree: every subtree
  gets a column as wide as its widest row, parents centred above it), and routeEdge() returns the
  elbow lines drawn by that layout — the lines from one gate's inputs meet in a shared bus.
  Users don't connect; they add, change, reorder and delete through the node tools. Dragging any part
  moves the whole tree. Sibling order is the order of the nodes in model.nodes.
*/

const NS = "http://www.w3.org/2000/svg";

// ── Layout constants ────────────────────────────────────────

const SIBLING_GAP    = 24;    // horizontal gap between neighbouring subtrees
const EVENT_GATE_GAP = 16;    // vertical line between an event box and its gate
const GATE_INPUT_GAP = 44;    // vertical distance between a gate's input point and the tops of its inputs
const CONDITION_GAP  = 28;    // horizontal line between an inhibit gate and its condition

const EVENT_WIDTH     = 150;  // event boxes have a fixed width and grow in height with their text
const EVENT_MIN_H     = 46;
const CONDITION_WIDTH = 120;
const CONDITION_MIN_H = 40;

// Label layout per type; also used to size the event boxes, so they must match what the engine draws.
const BOX_LABEL       = { placement: "inside", fontSize: 13, paddingX: 8, paddingY: 7, maxLines: 5 };
const LEAF_LABEL      = { placement: "below", fontSize: 12, belowWidth: 120, belowGap: 5, maxLines: 4 };
const CONDITION_LABEL = { placement: "inside", fontSize: 12, paddingX: 6, paddingY: 6, widthFactor: 0.78, maxLines: 3 };
const GATE_LABEL      = { placement: "inside", fontSize: 10, paddingX: 2, paddingY: 2, maxLines: 1 };

const LINE_HEIGHT = 1.25;   // the engine's default label line height

// Gate depth of the concave bottom of OR-like gates, as a share of the gate height.
const OR_CURVE = 0.18;

const GATE_TYPES  = ["orGate", "andGate", "xorGate", "priorityAndGate", "votingGate", "inhibitGate"];
const BOX_TYPES   = ["topEvent", "event"];                                // can have a gate
const LEAF_TYPES  = ["basicEvent", "undevelopedEvent", "houseEvent", "transfer"];
const INPUT_TYPES = ["event", ...LEAF_TYPES];                             // what a gate takes as input

const isGate = node => GATE_TYPES.includes(node?.type);
const isBox  = node => BOX_TYPES.includes(node?.type);

// ── Shapes ──────────────────────────────────────────────────

function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

function polygon(points, node, engine) {
    const el = svgEl("polygon", { points: points.map(p => `${p[0]},${p[1]}`).join(" ") });
    engine.applyNodeStyle(el, node);
    return el;
}

/** Outline of an OR gate: pointed top, concave bottom. `bottom` is where the sides end. */
function orPath(x, y, w, h, bottom) {
    const cx = x + w / 2;
    const d  = h * OR_CURVE;
    return `M ${x} ${bottom} Q ${cx} ${bottom - 2 * d} ${x + w} ${bottom} ` +
           `Q ${x + w} ${y + h * 0.35} ${cx} ${y} Q ${x} ${y + h * 0.35} ${x} ${bottom} Z`;
}

/** Outline of an AND gate: flat bottom, round top. */
function andPath(x, y, w, h) {
    const r = h * 0.5;
    return `M ${x} ${y + h} L ${x} ${y + r} A ${w / 2} ${r} 0 0 1 ${x + w} ${y + r} L ${x + w} ${y + h} Z`;
}

function pathShape(d, node, engine) {
    const el = svgEl("path", { d });
    engine.applyNodeStyle(el, node);
    return el;
}

/** A detail line in the node's line colour (XOR's second curve, priority AND's bar). */
function detailLine(d, node, engine) {
    const style = engine.getNodeStyle(node);
    return svgEl("path", { d, fill: "none", stroke: style.stroke, "stroke-width": String(style.strokeWidth ?? 1.5) });
}

const ftaShapes = {
    eventBox(node, engine) {
        const rect = svgEl("rect", { x: node.x, y: node.y, width: node.width, height: node.height, rx: 2 });
        engine.applyNodeStyle(rect, node);
        return rect;
    },

    basicEvent(node, engine) {
        const r  = Math.min(node.width, node.height) / 2;
        const el = svgEl("circle", { cx: node.x + node.width / 2, cy: node.y + node.height / 2, r });
        engine.applyNodeStyle(el, node);
        return el;
    },

    undevelopedEvent(node, engine) {
        const { x, y, width: w, height: h } = node;
        return polygon([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]], node, engine);
    },

    houseEvent(node, engine) {
        const { x, y, width: w, height: h } = node;
        return polygon([[x + w / 2, y], [x + w, y + h * 0.38], [x + w, y + h], [x, y + h], [x, y + h * 0.38]], node, engine);
    },

    transfer(node, engine) {
        const { x, y, width: w, height: h } = node;
        return polygon([[x + w / 2, y], [x + w, y + h], [x, y + h]], node, engine);
    },

    conditionEvent(node, engine) {
        const el = svgEl("ellipse", {
            cx: node.x + node.width / 2, cy: node.y + node.height / 2, rx: node.width / 2, ry: node.height / 2
        });
        engine.applyNodeStyle(el, node);
        return el;
    },

    orGate(node, engine) {
        const { x, y, width: w, height: h } = node;
        return pathShape(orPath(x, y, w, h, y + h), node, engine);
    },

    // OR with a second curve under it.
    xorGate(node, engine) {
        const { x, y, width: w, height: h } = node;
        const group = svgEl("g", {});
        group.appendChild(pathShape(orPath(x, y, w, h - 6, y + h - 6), node, engine));
        group.appendChild(detailLine(`M ${x} ${y + h} Q ${x + w / 2} ${y + h - 2 * h * OR_CURVE} ${x + w} ${y + h}`, node, engine));
        return group;
    },

    // OR with "k/n" inside: at least k of the n inputs.
    votingGate(node, engine) {
        const { x, y, width: w, height: h } = node;
        const group = svgEl("g", {});
        group.appendChild(pathShape(orPath(x, y, w, h, y + h), node, engine));

        const { k, n } = engine.getNode(node.id) ? votingRatio(engine, node) : { k: "k", n: "n" };
        const style    = engine.getNodeStyle(node);
        const text     = svgEl("text", {
            x: x + w / 2, y: y + h * 0.6, "text-anchor": "middle", "dominant-baseline": "middle",
            "font-size": Math.max(8, Math.round(h * 0.22)), fill: style.textColor || style.stroke,
            "pointer-events": "none", class: "weavle-fta-vote"
        });
        text.textContent = `${k}/${n}`;
        group.appendChild(text);
        return group;
    },

    andGate(node, engine) {
        const { x, y, width: w, height: h } = node;
        return pathShape(andPath(x, y, w, h), node, engine);
    },

    // AND with a bar near the bottom: the inputs must fail in order (left to right).
    priorityAndGate(node, engine) {
        const { x, y, width: w, height: h } = node;
        const group = svgEl("g", {});
        group.appendChild(pathShape(andPath(x, y, w, h), node, engine));
        group.appendChild(detailLine(`M ${x} ${y + h * 0.8} L ${x + w} ${y + h * 0.8}`, node, engine));
        return group;
    },

    inhibitGate(node, engine) {
        const { x, y, width: w, height: h } = node;
        return polygon([
            [x + w / 2, y], [x + w, y + h / 4], [x + w, y + h * 3 / 4],
            [x + w / 2, y + h], [x, y + h * 3 / 4], [x, y + h / 4]
        ], node, engine);
    }
};

// ── Tree helpers ────────────────────────────────────────────

/** The tree as stored in the model: parent per node (via its edge) and children in model order. */
function readTree(engine) {
    const nodes    = engine.model.nodes;
    const byId     = new Map(nodes.map(n => [n.id, n]));
    const parentOf = new Map();

    for (const edge of engine.model.edges) {
        const child  = byId.get(edge.sourceNodeId);
        const parent = byId.get(edge.targetNodeId);
        if (child && parent && !parentOf.has(child.id)) parentOf.set(child.id, parent);
    }

    const children = node => nodes.filter(n => parentOf.get(n.id) === node);

    return {
        top:       nodes.find(n => n.type === "topEvent") || null,
        parentOf:  node => parentOf.get(node.id) || null,
        children,
        // A gate's inputs (without the condition of an inhibit gate); an event's gate.
        inputs:    node => children(node).filter(n => n.type !== "conditionEvent"),
        condition: node => children(node).find(n => n.type === "conditionEvent") || null,
        gateOf:    node => children(node).find(isGate) || null
    };
}

/** k and n of a k-out-of-n gate: n = its number of inputs, k = node.k (default 2) within 1..n. */
function votingRatio(engine, gate) {
    const n = readTree(engine).inputs(gate).length;
    const k = Math.max(1, Math.min(n || 1, Number(gate.k) || 2));
    return { k, n };
}

function makeEdge(engine, child, parent) {
    return {
        id: engine.generateId(),
        sourceNodeId: child.id,
        targetNodeId: parent.id,
        sourceHandle: "top",
        targetHandle: "bottom",
        type: "link"
    };
}

/** Sizes an event box or condition to its (wrapped) label, using the layout the engine draws it with. */
function fitToLabel(engine, node) {
    const condition = node.type === "conditionEvent";
    const layout    = condition ? CONDITION_LABEL : BOX_LABEL;
    const width     = condition ? CONDITION_WIDTH : EVENT_WIDTH;
    const font      = engine.getNodeStyle(node);   // a bold preset makes the text taller when it wraps more
    const wrapWidth = width * (layout.widthFactor ?? 1) - 2 * layout.paddingX;
    const { lines } = engine.wrapLabel(node.label || "", wrapWidth, layout.maxLines, layout.fontSize, font);
    const textH     = Math.max(1, lines.length) * layout.fontSize * LINE_HEIGHT;

    node.width  = width;
    node.height = Math.max(condition ? CONDITION_MIN_H : EVENT_MIN_H,
                           Math.ceil((textH + 2 * layout.paddingY) / (condition ? 0.8 : 1)));
}

/** Where lines leave a node upward (top centre) and where its children's lines arrive (bottom). */
function outputPoint(node) {
    return { x: node.x + node.width / 2, y: node.y };
}

function inputPoint(node) {
    const bottom = node.y + node.height;
    const depth  = ["orGate", "xorGate", "votingGate"].includes(node.type) ? node.height * OR_CURVE : 0;
    return { x: node.x + node.width / 2, y: bottom - depth };
}

/** Width a node takes up on its own: leaves carry their label below, inhibit gates their condition. */
function ownWidth(engine, tree, node) {
    if (LEAF_TYPES.includes(node.type)) return Math.max(node.width, LEAF_LABEL.belowWidth);

    const condition = node.type === "inhibitGate" && tree.condition(node);
    // Kept symmetric, so the gate stays centred above its inputs.
    return condition ? node.width + 2 * (CONDITION_GAP + condition.width) : node.width;
}

// ── Layout ──────────────────────────────────────────────────

/**
 * Positions the whole tree under the top event (which keeps its centre and top). Fills `routes`
 * (edge id → { points, at }) for routeEdge; `at` is where the edge's child node was placed, so
 * routeEdge can shift the line along while the tree is dragged.
 */
function layoutFaultTree(engine, routes) {
    routes.clear();

    const tree = readTree(engine);
    const top  = tree.top;
    if (!top) return;

    const size = engine.diagram.getDefaultSize;
    for (const node of engine.model.nodes) {
        if (isBox(node) || node.type === "conditionEvent") fitToLabel(engine, node);
        else if (!node.width || !node.height) Object.assign(node, size(node.type));
    }

    // Subtree widths, bottom-up.
    const widths = new Map();
    const measure = node => {
        const inputs = tree.inputs(node);
        const row    = inputs.reduce((sum, child) => sum + measure(child), 0) + SIBLING_GAP * Math.max(0, inputs.length - 1);
        const width  = Math.max(ownWidth(engine, tree, node), row);
        widths.set(node, width);
        return width;
    };

    const byChild = new Map();   // child id → route points

    const place = (node, left, topY) => {
        const span = widths.get(node);
        const cx   = left + span / 2;

        node.x = cx - node.width / 2;
        node.y = topY;

        const inputs = tree.inputs(node);
        if (inputs.length) {
            const from     = inputPoint(node);
            const childTop = from.y + (isGate(node) ? GATE_INPUT_GAP : EVENT_GATE_GAP);
            const busY     = (from.y + childTop) / 2;
            const row      = inputs.reduce((sum, c) => sum + widths.get(c), 0) + SIBLING_GAP * (inputs.length - 1);
            let x          = left + (span - row) / 2;

            for (const child of inputs) {
                place(child, x, childTop);
                x += widths.get(child) + SIBLING_GAP;

                const out = outputPoint(child);
                byChild.set(child.id, out.x === from.x
                    ? [out, from]
                    : [out, { x: out.x, y: busY }, { x: from.x, y: busY }, from]);
            }
        }

        const condition = node.type === "inhibitGate" && tree.condition(node);
        if (condition) {
            const midY = node.y + node.height / 2;
            condition.x = node.x + node.width + CONDITION_GAP;
            condition.y = midY - condition.height / 2;
            byChild.set(condition.id, [{ x: condition.x, y: midY }, { x: node.x + node.width, y: midY }]);
        }
    };

    measure(top);
    place(top, top.x + top.width / 2 - widths.get(top) / 2, top.y);

    // Routes are stored per child node; translate to edge ids.
    for (const edge of engine.model.edges) {
        const points = byChild.get(edge.sourceNodeId);
        const child  = engine.getNode(edge.sourceNodeId);
        if (points && child) routes.set(edge.id, { points, at: { x: child.x, y: child.y } });
    }
}

// The definition's own colours (ARCHITECTURE.md 7.4): the bottom layer under any theme. Same shape as
// options.theme; an organisation's theme overrides what it names. getDefaultTheme() returns it.
const GATE_STYLE = { fill: "#EEF0F3", stroke: "#3A4451" };

const FTA_THEME = {
    nodeTypes: {
        topEvent:         { fill: "#FDE8E7", stroke: "#B42318", strokeWidth: 2 },
        event:            { fill: "#FFFFFF", stroke: "#3A4451" },
        basicEvent:       { fill: "#EAF4FB", stroke: "#1B5278" },
        undevelopedEvent: { fill: "#FFF4E0", stroke: "#B54708" },
        houseEvent:       { fill: "#EDF7EE", stroke: "#2E7D32" },
        transfer:         { fill: "#F3EEFB", stroke: "#5B3E96" },
        conditionEvent:   { fill: "#FFFFFF", stroke: "#3A4451", dash: "4,3" },
        orGate:           GATE_STYLE,
        andGate:          GATE_STYLE,
        xorGate:          GATE_STYLE,
        priorityAndGate:  GATE_STYLE,
        votingGate:       GATE_STYLE,
        inhibitGate:      GATE_STYLE
    }
};

// ── Definition ──────────────────────────────────────────────

/**
 * Fault tree (FTA): a top event broken down through logic gates into intermediate and basic events,
 * laid out automatically top-down. A new (empty) diagram starts with a top event, an OR gate and two
 * basic events.
 */
export function createFtaDefinition() {
    // Lines from the last layout, per edge id (see layoutFaultTree / routeEdge).
    const routes = new Map();

    return {
        id: "fta",
        shapes: ftaShapes,
        defaultTheme: FTA_THEME,

        nodeTypes: {
            topEvent:         { defaultLabel: "Topgebeurtenis",            shape: "eventBox" },
            event:            { defaultLabel: "Tussengebeurtenis",         shape: "eventBox" },
            basicEvent:       { defaultLabel: "Basisgebeurtenis",          shape: "basicEvent" },
            undevelopedEvent: { defaultLabel: "Onontwikkelde gebeurtenis", shape: "undevelopedEvent" },
            houseEvent:       { defaultLabel: "Huisgebeurtenis",           title: "Huisgebeurtenis (aan / uit)", shape: "houseEvent" },
            transfer:         { defaultLabel: "Overdracht",                title: "Overdracht (elders uitgewerkt)", shape: "transfer" },
            conditionEvent:   { defaultLabel: "Voorwaarde",                shape: "conditionEvent" },

            // Gates carry no text of their own (a short id such as "G1" fits if wanted).
            orGate:           { defaultLabel: "", title: "OF-poort",                shape: "orGate" },
            andGate:          { defaultLabel: "", title: "EN-poort",                shape: "andGate" },
            xorGate:          { defaultLabel: "", title: "Exclusieve OF-poort",     shape: "xorGate" },
            priorityAndGate:  { defaultLabel: "", title: "Prioriteits-EN-poort",    shape: "priorityAndGate" },
            votingGate:       { defaultLabel: "", title: "k-uit-n-poort",           shape: "votingGate" },
            inhibitGate:      { defaultLabel: "", title: "Inhibit-poort",           shape: "inhibitGate" }
        },

        // Nothing to place freely: the node tools build the tree.
        palette: [],

        interaction: { connect: false, selectEdges: false },

        defaultEdgeType: "link",

        edgeTypes: {
            link: { router: "straight", marker: "none", strokeWidth: 1.5 }
        },

        getEdgeTypeForConnection() {
            return "link";
        },

        createInitialModel() {
            const nodes = [
                { id: "top",    type: "topEvent",   label: "Topgebeurtenis",   x: 400, y: 80, width: EVENT_WIDTH, height: EVENT_MIN_H },
                { id: "gate-1", type: "orGate",     label: "",                 x: 0, y: 0, width: 44, height: 52 },
                { id: "basic-1", type: "basicEvent", label: "Basisgebeurtenis", x: 0, y: 0, width: 44, height: 44 },
                { id: "basic-2", type: "basicEvent", label: "Basisgebeurtenis", x: 0, y: 0, width: 44, height: 44 }
            ];
            const link = (id, source, target) => ({ id, sourceNodeId: source, targetNodeId: target,
                                                    sourceHandle: "top", targetHandle: "bottom", type: "link" });
            return {
                nodes,
                edges: [link("link-1", "gate-1", "top"), link("link-2", "basic-1", "gate-1"), link("link-3", "basic-2", "gate-1")]
            };
        },

        layoutDiagram(engine) {
            layoutFaultTree(engine, routes);
        },

        // The line from the last layout, shifted by how far its child node moved since (the whole tree
        // moves as one while dragged; the layout runs again on the drop).
        routeEdge({ sourcePoint, targetPoint, edge, engine }) {
            const route = routes.get(edge?.id);
            const child = route && engine.getNode(edge.sourceNodeId);
            if (!child) return [sourcePoint, targetPoint];

            const dx = child.x - route.at.x;
            const dy = child.y - route.at.y;
            return route.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        },

        // Grabbing any part drags the whole tree: the top event, which takes everything under it along.
        getDragTarget(node, engine) {
            return readTree(engine).top || null;
        },

        // Deleting an event or gate takes everything under it along; the top event itself stays.
        getDependentNodes(node, engine) {
            return readTree(engine).children(node);
        },

        canDeleteNode(node) {
            return node.type !== "topEvent";
        },

        getCanvasActions() {
            return [];
        },

        getContextActions(node, engine) {
            const tree   = readTree(engine);
            const parent = tree.parentOf(node);
            const title  = type => engine.getTypeTitle(type);
            const menu   = (label, action, types, extra = {}) => ({
                type: "group", label, ...extra,
                children: types.map(t => ({ type: action, nodeType: t, label: title(t), active: extra.current === t }))
            });

            const actions = [];

            if (isBox(node)) {
                const gate = tree.gateOf(node);
                if (gate) {
                    actions.push(menu("Oorzaak toevoegen", "ftaAddInput", INPUT_TYPES, { icon: "branch" }));
                    actions.push(menu("Poort wijzigen", "ftaChangeGate", GATE_TYPES, { nodeType: gate.type, current: gate.type }));
                } else {
                    actions.push(menu("Poort toevoegen", "ftaAddGate", GATE_TYPES, { icon: "branch" }));
                }
            }

            if (isGate(node)) {
                actions.push(menu("Invoer toevoegen", "ftaAddInput", INPUT_TYPES, { icon: "branch" }));
                actions.push(menu("Type wijzigen", "ftaChangeGate", GATE_TYPES, { icon: "wrench", current: node.type }));

                if (node.type === "votingGate") {
                    const { k, n } = votingRatio(engine, node);
                    actions.push({
                        type: "group", label: "Drempel (k uit n)", nodeType: "votingGate",
                        children: Array.from({ length: Math.max(1, n) }, (_, i) => ({
                            type: "ftaSetK", value: i + 1, label: `${i + 1} uit ${n}`, active: i + 1 === k
                        }))
                    });
                }

                if (node.type === "inhibitGate" && !tree.condition(node)) {
                    actions.push({ type: "ftaAddCondition", label: "Voorwaarde toevoegen", nodeType: "conditionEvent" });
                }
            }

            // Inputs of a gate: switch type (a box with a gate stays a box), add a neighbour, reorder.
            if (INPUT_TYPES.includes(node.type) && isGate(parent)) {
                const types = tree.children(node).length ? ["event"] : INPUT_TYPES;
                if (types.length > 1) {
                    actions.push(menu("Type wijzigen", "changeType", types, { icon: "wrench", current: node.type }));
                }

                actions.push(menu("Ernaast toevoegen", "ftaAddSibling", INPUT_TYPES, { icon: "plus" }));

                const siblings = tree.inputs(parent);
                const index    = siblings.indexOf(node);
                if (index > 0) {
                    actions.push({ type: "ftaMove", direction: -1, label: "Naar links", icon: "moveLeft" });
                }
                if (index < siblings.length - 1) {
                    actions.push({ type: "ftaMove", direction: 1, label: "Naar rechts", icon: "moveRight" });
                }
            }

            if (node.type !== "topEvent") actions.push({ type: "deleteNode", label: "Verwijderen" });
            return actions;
        },

        handleAction(action, node, engine) {
            const tree = readTree(engine);

            switch (action.type) {
                case "ftaAddGate": {
                    if (!isBox(node) || tree.gateOf(node)) return false;
                    const gate = addChild(engine, node, action.nodeType, null);
                    // A gate needs inputs: start with two basic events (inhibit: one, plus its condition).
                    const first = addChild(engine, gate, "basicEvent", null);
                    if (gate.type === "inhibitGate") addChild(engine, gate, "conditionEvent", null);
                    else addChild(engine, gate, "basicEvent", null);
                    editLabel(engine, first);
                    return true;
                }

                case "ftaAddInput": {
                    // On an event: add under its gate (an OR gate is added when there is none yet).
                    let gate = isGate(node) ? node : tree.gateOf(node);
                    if (!gate && isBox(node)) gate = addChild(engine, node, "orGate", null);
                    if (!gate) return false;
                    editLabel(engine, addChild(engine, gate, action.nodeType, lastInput(engine, gate)));
                    return true;
                }

                case "ftaAddSibling": {
                    const parent = tree.parentOf(node);
                    if (!isGate(parent)) return false;
                    editLabel(engine, addChild(engine, parent, action.nodeType, node));
                    return true;
                }

                case "ftaAddCondition":
                    if (node.type !== "inhibitGate" || tree.condition(node)) return false;
                    editLabel(engine, addChild(engine, node, "conditionEvent", null));
                    return true;

                case "ftaChangeGate": {
                    const gate = isGate(node) ? node : tree.gateOf(node);
                    if (!gate || !GATE_TYPES.includes(action.nodeType) || gate.type === action.nodeType) return false;

                    // Only an inhibit gate has a condition; under another gate it becomes an ordinary input.
                    const condition = tree.condition(gate);
                    if (condition && action.nodeType !== "inhibitGate") {
                        condition.type  = "basicEvent";
                        condition.width = condition.height = 0;   // sized by the layout
                    }

                    gate.type = action.nodeType;
                    if (gate.type !== "votingGate") delete gate.k;
                    return true;
                }

                case "ftaSetK":
                    if (node.type !== "votingGate") return false;
                    node.k = action.value;
                    return true;

                case "ftaMove": {
                    const parent   = tree.parentOf(node);
                    const siblings = parent ? tree.inputs(parent) : [];
                    const other    = siblings[siblings.indexOf(node) + action.direction];
                    if (!other) return false;

                    // Sibling order is model order: swap the two nodes in model.nodes.
                    const nodes = engine.model.nodes;
                    const a = nodes.indexOf(node);
                    const b = nodes.indexOf(other);
                    [nodes[a], nodes[b]] = [nodes[b], nodes[a]];
                    return true;
                }

                case "changeType": {
                    if (!INPUT_TYPES.includes(action.nodeType) || action.nodeType === node.type) return false;
                    if (tree.children(node).length && action.nodeType !== "event") return false;

                    // Keep a custom label; replace the default label of the old type.
                    const oldDefault = this.nodeTypes[node.type]?.defaultLabel;
                    node.type = action.nodeType;
                    if (!node.label || node.label === oldDefault) node.label = this.nodeTypes[node.type].defaultLabel;

                    // Sized by the layout from the new type.
                    node.width = node.height = 0;
                    return true;
                }

                default:
                    return false;
            }
        },

        getDefaultSize(nodeType) {
            return {
                topEvent:         { width: EVENT_WIDTH, height: EVENT_MIN_H },
                event:            { width: EVENT_WIDTH, height: EVENT_MIN_H },
                basicEvent:       { width: 44, height: 44 },
                undevelopedEvent: { width: 52, height: 40 },
                houseEvent:       { width: 42, height: 44 },
                transfer:         { width: 46, height: 40 },
                conditionEvent:   { width: CONDITION_WIDTH, height: CONDITION_MIN_H }
            }[nodeType] || { width: 44, height: 52 };   // gates
        },

        getNodeInteractionMode() {
            return "action-surface";
        },

        getLabelLayout(node) {
            if (isBox(node))                     return BOX_LABEL;
            if (node.type === "conditionEvent")  return CONDITION_LABEL;
            if (isGate(node))                    return GATE_LABEL;
            return LEAF_LABEL;
        },

        // Everything is sized by the layout.
        getResizeRules() {
            return false;
        }
    };
}

/** The last input of a gate in model order (new inputs go after it, so they appear on the right). */
function lastInput(engine, gate) {
    const inputs = readTree(engine).inputs(gate);
    return inputs[inputs.length - 1] || null;
}

/**
 * Adds a node of `type` under `parent`, right after `after` in model order (or at the end); the layout
 * places and sizes it. Returns the new node.
 */
function addChild(engine, parent, type, after) {
    const node = {
        id: engine.generateId(),
        type,
        label: engine.getDefaultLabelForType(type),
        x: parent.x, y: parent.y, width: 0, height: 0
    };

    const nodes = engine.model.nodes;
    const index = after ? nodes.indexOf(after) : -1;
    if (index >= 0) nodes.splice(index + 1, 0, node);
    else nodes.push(node);

    engine.model.edges.push(makeEdge(engine, node, parent));
    return node;
}

/** Selects a new node and opens its label for editing once the engine has laid it out and drawn it. */
function editLabel(engine, node) {
    engine.selectSingleNode(node.id);
    engine.emitSelectionChanged();

    setTimeout(() => {
        if (engine.getNode(node.id) && !engine.state.editingLabel) {
            engine.startInlineLabelEdit("node", node.id);
        }
    }, 0);
}
