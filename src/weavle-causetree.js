/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — cause tree (oorzakenboom, INRS "arbre des causes", ADC) diagram definition.

  The analysis of a work accident: starting from the damage (the injury), every fact asks "what was
  needed for this to happen?". Its answers are the facts before it. Drawn right to left:

      variation  (unusual fact)  ○ circle
      state      (usual fact)    ▭ rectangle
      damage     (the injury)    the last fact, on the right

  Facts are joined by three kinds of logical link, all stored as plain edges antecedent → consequent:
    chain        X alone was needed for Y              X ──> Y
    conjunction  X1 and X2 (independent) were needed   X1 ─┐
                 together for Y                        X2 ─┴─> Y      (Y has several antecedents)
    disjunction  X alone was needed for both Y1 and    X ─┬─> Y1
                 Y2 (independent of each other)          └─> Y2      (X has several consequents)
  So the "tree" is a directed acyclic graph; a fact may lead to more than one other fact.
  edge.type "uncertain" (dashed) = it is not certain how the variation came about.

  The definition owns the layout: layoutDiagram() runs the layered layout (weavle-layout.js) from left
  (the earliest facts) to right (the damage) on every change and draws the links as buses: a
  conjunction meets in a vertical bus in front of its consequent, a disjunction splits in a bus right
  after its antecedent. Users don't connect by dragging: they add causes and link facts through the
  node tools. Dragging any part moves the whole diagram.
*/

import { computeLayeredLayout } from "./weavle-layout.js";

const NS = "http://www.w3.org/2000/svg";

// ── Layout constants ────────────────────────────────────────

const LAYER_GAP = 84;      // free space between columns (along the flow)
const NODE_GAP  = 30;      // free space between facts in a column
const BUS_SHARE = 0.36;    // where a bus sits in the gap, measured from its own fact

// All circles in a diagram get one diameter, all rectangles one height: the smallest that fits
// every label (like the columns of an INRS tree). Tried from small to large.
const CIRCLE_SIZES = [96, 108, 120, 132, 144, 160, 176];
const STATE_WIDTH  = 136;
const STATE_MIN_H  = 60;

// Label layout per type; also used to size the facts, so it must match what the engine draws.
const CIRCLE_LABEL = { placement: "inside", fontSize: 12, paddingX: 3, paddingY: 3, widthFactor: 0.74, heightFactor: 0.74, maxLines: 7 };
const STATE_LABEL  = { placement: "inside", fontSize: 12, paddingX: 8, paddingY: 8, maxLines: 7 };

const LINE_HEIGHT = 1.25;  // the engine's default label line height

const FACT_TYPES = ["variation", "state"];

const isCircle = node => node?.type === "variation" || node?.type === "damage";

// ── Shapes ──────────────────────────────────────────────────

function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

const causeTreeShapes = {
    fact(node, engine) {
        const r  = Math.min(node.width, node.height) / 2;
        const el = svgEl("circle", { cx: node.x + node.width / 2, cy: node.y + node.height / 2, r });
        engine.applyNodeStyle(el, node);
        return el;
    },

    state(node, engine) {
        const el = svgEl("rect", { x: node.x, y: node.y, width: node.width, height: node.height, rx: 2 });
        engine.applyNodeStyle(el, node);
        return el;
    }
};

// ── Graph helpers ───────────────────────────────────────────

/** The facts and their links as stored in the model: antecedents and consequents per fact. */
function readGraph(engine) {
    const nodes = engine.model.nodes;
    const byId  = new Map(nodes.map(n => [n.id, n]));
    const into  = new Map(nodes.map(n => [n.id, []]));   // edges arriving at a fact (from its antecedents)
    const out   = new Map(nodes.map(n => [n.id, []]));   // edges leaving a fact (to its consequents)

    for (const edge of engine.model.edges) {
        if (!byId.has(edge.sourceNodeId) || !byId.has(edge.targetNodeId)) continue;
        out.get(edge.sourceNodeId).push(edge);
        into.get(edge.targetNodeId).push(edge);
    }

    const graph = {
        damage:       nodes.find(n => n.type === "damage") || null,
        into:         node => into.get(node.id) || [],
        out:          node => out.get(node.id) || [],
        antecedents:  node => graph.into(node).map(e => byId.get(e.sourceNodeId)),
        consequents:  node => graph.out(node).map(e => byId.get(e.targetNodeId)),

        /** Whether `to` can be reached from `from` along the links (from is an antecedent of to). */
        leadsTo(from, to) {
            const seen  = new Set();
            const stack = [from];
            while (stack.length) {
                const n = stack.pop();
                if (n === to) return true;
                if (seen.has(n)) continue;
                seen.add(n);
                stack.push(...graph.consequents(n));
            }
            return false;
        },

        /**
         * The facts that only exist for `node`: antecedents all of whose consequents are (in the end)
         * this node or other such facts. Deleting the node takes them along.
         */
        onlyFor(node) {
            const set = new Set([node]);
            let grew = true;
            while (grew) {
                grew = false;
                for (const n of nodes) {
                    if (set.has(n)) continue;
                    const next = graph.consequents(n);
                    if (next.length && next.every(c => set.has(c))) {
                        set.add(n);
                        grew = true;
                    }
                }
            }
            set.delete(node);
            return [...set];
        }
    };
    return graph;
}

function makeEdge(engine, source, target) {
    return {
        id: engine.generateId(),
        sourceNodeId: source.id,
        targetNodeId: target.id,
        sourceHandle: "right",
        targetHandle: "left",
        type: "link"
    };
}

/** Lines the label of `node` wraps to in a circle of diameter d / a rectangle of the state width. */
function wrapFor(engine, node, layout, width, height) {
    const font      = engine.getNodeStyle(node);   // a bold damage or preset makes the text wider
    const wrapWidth = width * (layout.widthFactor ?? 1) - 2 * layout.paddingX;
    const room      = height == null ? layout.maxLines
                                     : Math.floor((height * (layout.heightFactor ?? 1) - 2 * layout.paddingY) / (layout.fontSize * LINE_HEIGHT));
    return engine.wrapLabel(node.label || "", wrapWidth, Math.max(1, Math.min(layout.maxLines, room)), layout.fontSize, font);
}

/** Sizes every fact to its label: one diameter for all circles, one height for all rectangles. */
function sizeFacts(engine) {
    const nodes   = engine.model.nodes;
    const circles = nodes.filter(isCircle);
    const states  = nodes.filter(n => n.type === "state");

    const fits = d => circles.every(n => !wrapFor(engine, n, CIRCLE_LABEL, d, d).truncated);
    const diameter = CIRCLE_SIZES.find(fits) ?? CIRCLE_SIZES[CIRCLE_SIZES.length - 1];

    const height = Math.max(STATE_MIN_H, ...states.map(n => {
        const { lines } = wrapFor(engine, n, STATE_LABEL, STATE_WIDTH, null);
        return Math.ceil(Math.max(1, lines.length) * STATE_LABEL.fontSize * LINE_HEIGHT + 2 * STATE_LABEL.paddingY);
    }));

    for (const n of circles) n.width = n.height = diameter;
    for (const n of states) {
        n.width  = STATE_WIDTH;
        n.height = height;
    }
}

// ── Layout ──────────────────────────────────────────────────

/**
 * Positions every fact in columns, earliest facts left, the damage right (it keeps its right edge and
 * vertical centre). Fills `routes` (edge id → { points, at }) for routeEdge; `at` is where the edge's
 * source fact was placed, so routeEdge can shift the line along while the diagram is dragged.
 */
function layoutCauseTree(engine, routes) {
    routes.clear();

    const nodes  = engine.model.nodes;
    const damage = nodes.find(n => n.type === "damage");
    if (!nodes.length) return;

    // Remember where the damage was, before sizing changes its width.
    const anchor = damage && damage.width
        ? { right: damage.x + damage.width, cy: damage.y + damage.height / 2 }
        : null;

    sizeFacts(engine);

    const ids   = new Set(nodes.map(n => n.id));
    const edges = engine.model.edges.filter(e => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId));
    const bends = new Map();

    // Laid out backwards, from the damage (as the method asks its questions), then mirrored: every fact
    // stands as close to the damage as its longest path allows, not as close to the earliest cause.
    const centres = computeLayeredLayout({
        // x / y (current centre) keep the order of the facts in a column as it was.
        nodes: nodes.map(n => ({ id: n.id, width: n.width, height: n.height, x: -(n.x + n.width / 2), y: n.y + n.height / 2 })),
        edges: edges.map(e => ({ id: e.id, source: e.targetNodeId, target: e.sourceNodeId }))
    }, { direction: "LR", layerGap: LAYER_GAP, nodeGap: NODE_GAP, componentGap: LAYER_GAP, bends });

    for (const c of centres.values()) c.x = -c.x;
    for (const [id, points] of bends) {
        points.forEach(p => { p.x = -p.x; });
        bends.set(id, points.reverse());
    }

    // Keep the damage where it was (a fresh diagram: where the model put it).
    let dx = 0;
    let dy = 0;
    const at = damage && centres.get(damage.id);
    if (at) {
        const right = anchor ? anchor.right : damage.x + damage.width;
        const cy    = anchor ? anchor.cy : damage.y + damage.height / 2;
        dx = right - (at.x + damage.width / 2);
        dy = cy - at.y;
    }

    for (const n of nodes) {
        const c = centres.get(n.id);
        if (!c) continue;
        n.x = c.x + dx - n.width / 2;
        n.y = c.y + dy - n.height / 2;
    }
    for (const points of bends.values()) {
        for (const p of points) {
            p.x += dx;
            p.y += dy;
        }
    }

    // Columns: the facts that share a centre x. A bus sits in the gap next to its fact's column.
    const columns = [];
    for (const n of nodes) {
        const cx  = Math.round(n.x + n.width / 2);
        let col   = columns.find(c => Math.abs(c.cx - cx) < 1);
        if (!col) columns.push(col = { cx, left: n.x, right: n.x + n.width });
        col.left  = Math.min(col.left, n.x);
        col.right = Math.max(col.right, n.x + n.width);
    }
    columns.sort((a, b) => a.cx - b.cx);

    const columnAt = x => columns.reduce((best, c) => Math.abs(c.cx - x) < Math.abs(best.cx - x) ? c : best, columns[0]);
    const nextColumn = col => columns[columns.indexOf(col) + 1] || null;
    const gapAfter = col => {
        const next = nextColumn(col);
        return next ? { left: col.right, right: next.left } : { left: col.right, right: col.right + LAYER_GAP };
    };

    const graph = readGraph(engine);

    for (const edge of edges) {
        const source = engine.getNode(edge.sourceNodeId);
        const target = engine.getNode(edge.targetNodeId);

        const start = { x: source.x + source.width, y: source.y + source.height / 2 };
        const end   = { x: target.x, y: target.y + target.height / 2 };
        const via   = (bends.get(edge.id) || []).map(p => ({ x: p.x, y: p.y }));
        const stops = [start, ...via, end];

        const splits = graph.out(source).length > 1;   // disjunction: a bus right after the source
        const joins  = graph.into(target).length > 1;  // conjunction: a bus right before the target

        const points = [start];
        for (let i = 0; i < stops.length - 1; i++) {
            const a = stops[i];
            const b = stops[i + 1];
            if (Math.abs(a.y - b.y) >= 0.5) {
                const gap   = gapAfter(columnAt(i === 0 ? source.x + source.width / 2 : a.x));
                const width = gap.right - gap.left;
                const first = i === 0;
                const last  = i === stops.length - 2;
                const x = first && splits ? gap.left + width * BUS_SHARE
                        : last && joins   ? gap.right - width * BUS_SHARE
                        : (gap.left + gap.right) / 2;
                points.push({ x, y: a.y }, { x, y: b.y });
            }
            points.push(b);
        }

        routes.set(edge.id, { points: simplify(points), at: { x: source.x, y: source.y } });
    }
}

/** Drops points that lie on the straight line between their neighbours (and duplicates). */
function simplify(points) {
    const out = [];
    for (const p of points) {
        const prev = out[out.length - 1];
        if (prev && Math.abs(prev.x - p.x) < 0.5 && Math.abs(prev.y - p.y) < 0.5) continue;
        const before = out[out.length - 2];
        if (before && prev &&
            ((Math.abs(before.x - prev.x) < 0.5 && Math.abs(prev.x - p.x) < 0.5) ||
             (Math.abs(before.y - prev.y) < 0.5 && Math.abs(prev.y - p.y) < 0.5))) {
            out[out.length - 1] = p;
            continue;
        }
        out.push(p);
    }
    return out;
}

// The definition's own colours (ARCHITECTURE.md 7.4): the bottom layer under any theme. Close to the
// INRS brochure: warm grey facts, the variations (what drives the accident) with a stronger outline.
const CAUSE_TREE_THEME = {
    nodeTypes: {
        damage:    { fill: "#FDE8E7", stroke: "#B42318", strokeWidth: 2, fontWeight: "bold" },
        variation: { fill: "#E4E2DA", stroke: "#6F6B5E", strokeWidth: 1.5 },
        state:     { fill: "#F4F3EF", stroke: "#A19D90" }
    },
    edgeTypes: {
        link:      { stroke: "#4A4F57" },
        uncertain: { stroke: "#4A4F57" }
    }
};

// ── Definition ──────────────────────────────────────────────

/**
 * Cause tree (INRS "arbre des causes"): the facts behind a work accident, from the earliest causes on
 * the left to the damage on the right, laid out automatically. A new (empty) diagram starts with the
 * damage and one variation that led to it.
 */
export function createCauseTreeDefinition() {
    // Lines from the last layout, per edge id (see layoutCauseTree / routeEdge).
    const routes = new Map();

    return {
        id: "causetree",
        shapes: causeTreeShapes,
        defaultTheme: CAUSE_TREE_THEME,

        nodeTypes: {
            damage:    { defaultLabel: "Letsel",   title: "Letsel (schade)",          shape: "fact" },
            variation: { defaultLabel: "Variatie", title: "Variatie (ongewoon feit)", shape: "fact" },
            state:     { defaultLabel: "Staat",    title: "Staat (gewoon feit)",      shape: "state" }
        },

        // Nothing to place freely: the node tools build the tree.
        palette: [],

        interaction: { connect: false, selectEdges: false },

        defaultEdgeType: "link",

        edgeTypes: {
            link:      { router: "straight", marker: "openArrow", strokeWidth: 1.5 },
            // Chosen on purpose (not derived from the facts it joins): kept as it is.
            uncertain: { router: "straight", marker: "openArrow", strokeWidth: 1.5, dash: "6,4", fixed: true }
        },

        getEdgeTypeForConnection() {
            return "link";
        },

        createInitialModel() {
            return {
                nodes: [
                    { id: "damage", type: "damage",    label: "Letsel",   x: 600, y: 160, width: 96, height: 96 },
                    { id: "fact-1", type: "variation", label: "Variatie", x: 0,   y: 0,   width: 96, height: 96 }
                ],
                edges: [
                    { id: "link-1", sourceNodeId: "fact-1", targetNodeId: "damage",
                      sourceHandle: "right", targetHandle: "left", type: "link" }
                ]
            };
        },

        layoutDiagram(engine) {
            layoutCauseTree(engine, routes);
        },

        // The line from the last layout, shifted by how far its source fact moved since (the whole
        // diagram moves as one while dragged; the layout runs again on the drop).
        routeEdge({ sourcePoint, targetPoint, edge, engine }) {
            const route  = routes.get(edge?.id);
            const source = route && engine.getNode(edge.sourceNodeId);
            if (!source) return [sourcePoint, targetPoint];

            const dx = source.x - route.at.x;
            const dy = source.y - route.at.y;
            return route.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        },

        // Grabbing any part drags the whole diagram: the damage, which takes everything along.
        getDragTarget(node, engine) {
            return readGraph(engine).damage || null;
        },

        // The damage carries every other fact (dragging); deleting a fact takes the facts along that
        // only led to it. The damage itself stays.
        getDependentNodes(node, engine) {
            if (node.type === "damage") return engine.model.nodes.filter(n => n !== node);
            return readGraph(engine).onlyFor(node);
        },

        canDeleteNode(node) {
            return node.type !== "damage";
        },

        getCanvasActions() {
            return [];
        },

        getContextActions(node, engine) {
            const graph = readGraph(engine);
            const title = type => engine.getTypeTitle(type);
            const name  = n => (n.label || title(n.type)).replace(/\s+/g, " ");
            const facts = (action, extra = {}) => FACT_TYPES.map(t => ({ type: action, nodeType: t, label: title(t), ...extra }));

            const actions = [{ type: "group", label: "Oorzaak toevoegen", icon: "branch", children: facts("ctAddCause") }];

            if (node.type === "damage") return actions;

            actions.push({ type: "ctLink", label: "Ook oorzaak van… (klik daarna op een feit)", icon: "plus" });

            actions.push({
                type: "group", label: "Type wijzigen", icon: "wrench",
                children: FACT_TYPES.map(t => ({ type: "changeType", nodeType: t, label: title(t), active: node.type === t }))
            });

            // Per link to a consequent: dashed (uncertain) or not; remove it when there are others.
            const out = graph.out(node);
            const target = e => engine.getNode(e.targetNodeId);
            if (out.length === 1) {
                const uncertain = out[0].type === "uncertain";
                actions.push({
                    type: "ctToggleUncertain", edgeId: out[0].id, icon: "dottedLine",
                    label: uncertain ? "Verband zeker maken" : "Verband onzeker (stippellijn)"
                });
            } else if (out.length > 1) {
                actions.push({
                    type: "group", label: "Onzeker verband (stippellijn)", icon: "dottedLine",
                    children: out.map(e => ({ type: "ctToggleUncertain", edgeId: e.id, label: `→ ${name(target(e))}`, active: e.type === "uncertain" }))
                });
                actions.push({
                    type: "group", label: "Verband verwijderen", icon: "detach",
                    children: out.map(e => ({ type: "ctUnlink", edgeId: e.id, label: `→ ${name(target(e))}` }))
                });
            }

            actions.push({ type: "deleteNode", label: "Verwijderen" });
            return actions;
        },

        handleAction(action, node, engine) {
            const graph = readGraph(engine);
            const edges = engine.model.edges;

            switch (action.type) {
                case "ctAddCause": {
                    if (!FACT_TYPES.includes(action.nodeType)) return false;
                    const fact = {
                        id: engine.generateId(),
                        type: action.nodeType,
                        label: engine.getDefaultLabelForType(action.nodeType),
                        // Below the other causes of this fact, so the layout puts it there.
                        x: node.x - LAYER_GAP, y: node.y + node.height, width: 0, height: 0
                    };
                    engine.model.nodes.push(fact);
                    edges.push(makeEdge(engine, fact, node));
                    editLabel(engine, fact);
                    return true;
                }

                case "ctLink":
                    // Not a model change yet: the pick that follows records the undo step.
                    engine.startNodePick({
                        filter: target => target !== node &&
                                          !graph.out(node).some(e => e.targetNodeId === target.id) &&
                                          !graph.leadsTo(target, node),
                        onPick: target => {
                            edges.push(makeEdge(engine, node, target));
                            engine.pushHistory();
                            engine.emitModelChanged();
                            engine.render();
                        }
                    });
                    return false;

                case "ctToggleUncertain": {
                    const edge = edges.find(e => e.id === action.edgeId && e.sourceNodeId === node.id);
                    if (!edge) return false;
                    edge.type = edge.type === "uncertain" ? "link" : "uncertain";
                    return true;
                }

                case "ctUnlink": {
                    // The last link of a fact stays: without it the fact would lead nowhere.
                    if (graph.out(node).length < 2) return false;
                    const index = edges.findIndex(e => e.id === action.edgeId && e.sourceNodeId === node.id);
                    if (index < 0) return false;
                    edges.splice(index, 1);
                    return true;
                }

                case "changeType": {
                    if (!FACT_TYPES.includes(action.nodeType) || action.nodeType === node.type) return false;

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

        getDefaultSize(nodeType) {
            return nodeType === "state"
                ? { width: STATE_WIDTH, height: STATE_MIN_H }
                : { width: CIRCLE_SIZES[0], height: CIRCLE_SIZES[0] };
        },

        getNodeInteractionMode() {
            return "action-surface";
        },

        getLabelLayout(node) {
            return node.type === "state" ? STATE_LABEL : CIRCLE_LABEL;
        },

        // Everything is sized by the layout.
        getResizeRules() {
            return false;
        }
    };
}

/** Selects a new fact and opens its label for editing once the engine has laid it out and drawn it. */
function editLabel(engine, node) {
    engine.selectSingleNode(node.id);
    engine.emitSelectionChanged();

    setTimeout(() => {
        if (engine.getNode(node.id) && !engine.state.editingLabel) {
            engine.startInlineLabelEdit("node", node.id);
        }
    }, 0);
}
