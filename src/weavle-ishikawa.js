/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — Ishikawa (fishbone / oorzaak-gevolg) diagram definition.

  The diagram is a tree, stored as ordinary nodes and edges (edge = child → parent):

      effect (the problem, the "head")
        └ category   (main bone, slanted, alternately above / below the spine)
            └ cause      (horizontal line onto the main bone, text above the line)
                └ subCause   (short slanted twig onto the cause line)

  The definition owns the layout: layoutDiagram() positions every node from the tree on each change
  (the engine calls it before every undo step), and routeEdge() returns the bone drawn by that layout.
  Users don't connect; they add, rename, reorder and delete through the node tools. Dragging any part
  moves the whole diagram (getDragTarget → the head, getDependentNodes → everything under it).
  Sibling order is the order of the nodes in model.nodes.

  Prepared for a later "hybrid" mode (manual offsets along a bone): all geometry comes from
  layoutCategory(), which works relative to the bone's junction with the spine.
*/

const NS = "http://www.w3.org/2000/svg";

// ── Layout constants ────────────────────────────────────────

const SLANT        = 0.5;   // horizontal run per unit of distance from the spine, for every slanted bone
const SPINE_CLEAR  = 26;    // distance between the spine and the nearest cause line
const LINE_GAP     = 4;     // room between a cause line and what lies on its inner side
const SLOT_GAP     = 10;    // vertical gap between two cause slots on one bone
const MIN_BONE     = 90;    // minimum distance from the spine to a category box
const TEXT_GAP     = 8;     // gap between a cause's text and the main bone
const SUB_RISE     = 22;    // length (vertical) of a sub-cause twig
const SUB_GAP      = 12;    // horizontal gap between neighbouring sub-causes
const HEAD_GAP     = 50;    // spine length between the nearest junction and the head
const COLUMN_GAP   = 36;    // horizontal gap between two columns of main bones
const TAIL         = 40;    // spine length beyond the last junction (or before the head without bones)

const MAX_TEXT_WIDTH = { category: 150, cause: 160, subCause: 130 };
const MIN_WIDTH      = { category: 100, cause: 28,  subCause: 24 };

// Label layout per type; also used to size the text nodes, so they must match what the engine draws.
const LABELS = {
    effect:   { placement: "inside", fontSize: 15, paddingX: 18, paddingY: 8, maxLines: 4 },
    category: { placement: "inside", fontSize: 14, paddingX: 10, paddingY: 6, maxLines: 2 },
    cause:    { placement: "inside", fontSize: 13, paddingX: 3,  paddingY: 2, maxLines: 3 },
    subCause: { placement: "inside", fontSize: 12, paddingX: 3,  paddingY: 1, maxLines: 3 }
};

const LINE_HEIGHT = 1.25;   // the engine's default label line height

// Look of the text-only nodes (causes): no box.
const TEXT_NODE = { fill: "transparent", stroke: "none" };

// What a node's children are, and the edge type that links a node to its parent.
const CHILD_TYPE = { effect: "category", category: "cause", cause: "subCause" };
const EDGE_TYPE  = { category: "bone", cause: "causeLine", subCause: "subCauseLine" };

// Classic 6M (Mens, Machine, Methode, Materiaal, Meting, Milieu) — what a new diagram starts with.
const SIX_M = ["Mens", "Machine", "Methode", "Materiaal", "Meting", "Milieu"];

// ── Shapes ──────────────────────────────────────────────────

const ishikawaShapes = {
    // The head: flat on the left where the spine arrives, rounded on the right. It also draws the
    // spine's tail (left of the first junction), which no bone covers.
    effect(node, engine) {
        const { x, y, width: w, height: h } = node;
        const r     = Math.min(h / 2, w / 3);
        const group = document.createElementNS(NS, "g");
        const tailX = engine.diagram.getSpineStart?.(node, engine);

        if (tailX != null) {
            // Same look as the main bones it continues.
            const bone  = engine.getEdgeStyle({ type: "bone" });
            const spine = document.createElementNS(NS, "line");
            spine.setAttribute("x1", tailX);
            spine.setAttribute("y1", y + h / 2);
            spine.setAttribute("x2", x);
            spine.setAttribute("y2", y + h / 2);
            spine.setAttribute("stroke", bone.stroke);
            spine.setAttribute("stroke-width", String(bone.strokeWidth));
            if (bone.dash) spine.setAttribute("stroke-dasharray", bone.dash);
            spine.setAttribute("class", "weavle-ishikawa-spine");
            spine.setAttribute("pointer-events", "none");
            group.appendChild(spine);
        }

        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", `M ${x} ${y} L ${x + w - r} ${y} A ${r} ${h / 2} 0 0 1 ${x + w - r} ${y + h} L ${x} ${y + h} Z`);
        engine.applyNodeStyle(path, node);
        group.appendChild(path);
        return group;
    },

    category(node, engine) {
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x);
        rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width);
        rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 4);
        engine.applyNodeStyle(rect, node);
        return rect;
    },

    // Causes are text on a line (the line is their edge): an invisible hit area that shows an
    // outline when selected.
    text(node, engine) {
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x - 2);
        rect.setAttribute("y", node.y - 1);
        rect.setAttribute("width", node.width + 4);
        rect.setAttribute("height", node.height + 2);
        rect.setAttribute("rx", 3);
        engine.applyNodeStyle(rect, node);
        return rect;
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

    return {
        effect:   nodes.find(n => n.type === "effect") || null,
        parentOf: node => parentOf.get(node.id) || null,
        children: node => nodes.filter(n => parentOf.get(n.id) === node)
    };
}

function makeEdge(engine, child, parent) {
    return {
        id: engine.generateId(),
        sourceNodeId: child.id,
        targetNodeId: parent.id,
        sourceHandle: "right",
        targetHandle: "left",
        type: EDGE_TYPE[child.type] || "bone"
    };
}

/** Sizes a text node to its (wrapped) label, using the same layout the engine draws it with. */
function fitToLabel(engine, node) {
    const layout    = LABELS[node.type];
    const font      = engine.getNodeStyle(node);   // a bold preset makes the text wider
    const { lines } = engine.wrapLabel(node.label || "", MAX_TEXT_WIDTH[node.type], layout.maxLines, layout.fontSize, font);
    const textWidth = Math.max(0, ...lines.map(line => engine.measureLabelText(line, layout.fontSize, font)));

    node.width  = Math.max(MIN_WIDTH[node.type], Math.ceil(textWidth + 2 * layout.paddingX + 2));
    node.height = Math.ceil(Math.max(1, lines.length) * layout.fontSize * LINE_HEIGHT + 2 * layout.paddingY);
}

// ── Layout ──────────────────────────────────────────────────

/**
 * Lays out one main bone with its causes and sub-causes, relative to its junction with the spine
 * (junction at x = 0, y = spineY). side = -1 above the spine, +1 below.
 * Positions the nodes (x relative) and returns { nodes, routes, minX, maxX, anchor }.
 *
 * Distances are measured outward from the spine ("t"); a slanted bone at distance t lies at x = -t * SLANT.
 * Causes are stacked from the spine outward, the first cause nearest the category box.
 */
function layoutCategory(engine, tree, category, side, spineY) {
    const yAt    = t => spineY + side * t;
    const boneAt = t => -t * SLANT;

    const nodes  = [category];
    const routes = new Map();
    let minX = 0;
    let t    = SPINE_CLEAR;

    for (const cause of [...tree.children(category)].reverse()) {
        fitToLabel(engine, cause);

        const subs = tree.children(cause);
        subs.forEach(sub => fitToLabel(engine, sub));

        // Above the spine the twigs share the cause text's side, so they rise past it.
        const rise      = side < 0 ? Math.max(SUB_RISE, cause.height + 6) : SUB_RISE;
        const subExtent = subs.length ? rise + Math.max(...subs.map(s => s.height)) + 2 : 0;

        // The text sits above its line: toward the spine below it, away from it above.
        const inward  = side < 0 ? 0 : cause.height + 2;
        const outward = side < 0 ? Math.max(cause.height + 2, subExtent) : subExtent;

        t += inward + LINE_GAP;
        const tLine = t;
        t += outward + SLOT_GAP;

        const lineY = yAt(tLine);
        const boneX = boneAt(tLine);

        // Right-aligned against the bone (which leans further left at the text's top above the spine).
        cause.x = boneX - TEXT_GAP - (side < 0 ? cause.height * SLANT : 0) - cause.width;
        cause.y = lineY - cause.height - 1;
        nodes.push(cause);

        // Sub-causes: twigs parallel to the main bone on the free left part of the line, first one
        // nearest the bone; their text is centred on the twig's outer end.
        let lineLeft     = cause.x - 4;
        let junctionMax  = cause.x - TEXT_GAP;
        let prevTextLeft = Infinity;

        for (const sub of subs) {
            const endX = Math.min(
                junctionMax - rise * SLANT,
                prevTextLeft - SUB_GAP - sub.width / 2,
                boneAt(tLine + rise + sub.height) - TEXT_GAP - sub.width / 2   // clear of the main bone
            );
            const endY     = lineY + side * rise;
            const junction = endX + rise * SLANT;

            sub.x = endX - sub.width / 2;
            sub.y = side < 0 ? endY - sub.height - 1 : endY + 1;
            nodes.push(sub);

            routes.set(sub.id, [{ x: endX, y: endY }, { x: junction, y: lineY }]);

            prevTextLeft = sub.x;
            junctionMax  = junction - SUB_GAP;
            lineLeft     = Math.min(lineLeft, junction - 10);
            minX         = Math.min(minX, sub.x);
        }

        routes.set(cause.id, [{ x: lineLeft, y: lineY }, { x: boneX, y: lineY }]);
        minX = Math.min(minX, lineLeft, cause.x);

        // Deeper levels aren't part of the classic diagram; they keep their place.
    }

    fitToLabel(engine, category);

    const tEnd   = Math.max(t + 4, MIN_BONE);
    const anchor = { x: boneAt(tEnd), y: yAt(tEnd) };

    category.x = anchor.x - category.width / 2;
    category.y = side < 0 ? anchor.y - category.height : anchor.y;

    minX = Math.min(minX, category.x);
    const maxX = Math.max(0, category.x + category.width);

    return { nodes, routes, minX, maxX, anchor };
}

/**
 * Positions the whole diagram around the head (which stays where it is): main bones in columns of
 * two (one above, one below the spine), in model order from left to right, the last column nearest
 * the head. Fills `routes` (edge id → { points, at }) for routeEdge; `at` is where the edge's child node
 * was placed, so routeEdge can shift the bone along while the diagram is dragged.
 */
function layoutFishbone(engine, routes) {
    routes.clear();

    const tree   = readTree(engine);
    const effect = tree.effect;
    if (!effect) return;

    // Categories added without an edge (e.g. via addNode) belong to the head.
    for (const node of engine.model.nodes) {
        if (node.type === "category" && !tree.parentOf(node)) {
            engine.model.edges.push(makeEdge(engine, node, effect));
        }
    }

    const fresh      = readTree(engine);
    const categories = fresh.children(effect).filter(n => n.type === "category");
    const spineY     = effect.y + effect.height / 2;

    const bones = categories.map((category, i) => ({
        category,
        column: Math.floor(i / 2),
        ...layoutCategory(engine, fresh, category, i % 2 === 0 ? -1 : 1, spineY)
    }));

    const columnCount = Math.ceil(bones.length / 2);
    let rightEdge     = effect.x - HEAD_GAP;   // where the next column (moving left) may end

    for (let column = columnCount - 1; column >= 0; column--) {
        const members  = bones.filter(b => b.column === column);
        const minX     = Math.min(...members.map(b => b.minX));
        const maxX     = Math.max(...members.map(b => b.maxX));
        const junction = rightEdge - maxX;

        for (const bone of members) {
            bone.nodes.forEach(n => { n.x += junction; });

            for (const [id, points] of bone.routes) {
                routes.set(id, points.map(p => ({ x: p.x + junction, y: p.y })));
            }

            routes.set(bone.category.id, [
                { x: bone.anchor.x + junction, y: bone.anchor.y },
                { x: junction, y: spineY },
                { x: effect.x, y: spineY }
            ]);
        }

        rightEdge = junction + minX - COLUMN_GAP;
    }

    // Routes are stored per child node; translate to edge ids.
    const byChild = new Map(routes);
    routes.clear();
    for (const edge of engine.model.edges) {
        const points = byChild.get(edge.sourceNodeId);
        const child  = engine.getNode(edge.sourceNodeId);
        if (points && child) routes.set(edge.id, { points, at: { x: child.x, y: child.y } });
    }
}

// ── Definition ──────────────────────────────────────────────

/**
 * Ishikawa (fishbone) diagram: problem → categories → causes → sub-causes, laid out automatically.
 * A new (empty) diagram starts with the problem and the 6M categories.
 */
export function createIshikawaDefinition() {
    // Bone geometry from the last layout, per edge id (see layoutFishbone / routeEdge).
    const routes = new Map();

    return {
        id: "ishikawa",
        shapes: ishikawaShapes,

        nodeTypes: {
            effect:   { defaultLabel: "Probleem",   title: "Probleem (gevolg)", colors: { fill: "#FDE8E7", stroke: "#B42318" }, shape: "effect" },
            category: { defaultLabel: "Categorie",  colors: { fill: "#EAF4FB", stroke: "#1B5278" }, shape: "category" },
            // Causes are text on a line: a generic theme must not give them a box.
            cause:    { defaultLabel: "Oorzaak",    colors: TEXT_NODE, fixedStyle: TEXT_NODE, shape: "text" },
            subCause: { defaultLabel: "Suboorzaak", colors: TEXT_NODE, fixedStyle: TEXT_NODE, shape: "text" }
        },

        // Nothing to place freely: the toolbar adds categories, the node tools do the rest.
        palette: [],

        interaction: { connect: false, selectEdges: false },

        defaultEdgeType: "bone",

        edgeTypes: {
            bone:         { router: "straight", marker: "arrow", strokeWidth: 2.25 },
            causeLine:    { router: "straight", marker: "none",  strokeWidth: 1.5 },
            subCauseLine: { router: "straight", marker: "none",  strokeWidth: 1.25 }
        },

        getEdgeTypeForConnection({ source }) {
            return EDGE_TYPE[source?.type] || "bone";
        },

        createInitialModel() {
            const effect = { id: "effect", type: "effect", label: "Probleem", x: 860, y: 300, width: 180, height: 90 };
            const nodes  = [effect];
            const edges  = [];

            SIX_M.forEach((label, i) => {
                const id = `category-${i + 1}`;
                nodes.push({ id, type: "category", label, x: 0, y: 0, width: 110, height: 32 });
                edges.push({ id: `bone-${i + 1}`, sourceNodeId: id, targetNodeId: effect.id,
                             sourceHandle: "right", targetHandle: "left", type: "bone" });
            });

            return { nodes, edges };
        },

        layoutDiagram(engine) {
            layoutFishbone(engine, routes);
        },

        // The bone from the last layout, shifted by how far its child node moved since (the whole diagram
        // moves as one while dragged; the layout runs again on the drop).
        routeEdge({ sourcePoint, targetPoint, edge, engine }) {
            const route = routes.get(edge?.id);
            const child = route && engine.getNode(edge.sourceNodeId);
            if (!child) return [sourcePoint, targetPoint];

            const dx = child.x - route.at.x;
            const dy = child.y - route.at.y;
            return route.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        },

        // Grabbing any part drags the whole diagram: the head, which takes everything under it along.
        getDragTarget(node, engine) {
            return readTree(engine).effect || null;
        },

        /**
         * x where the spine starts, for the head shape: a tail left of the first junction, read from
         * the bones' stored routes (so it is right after undo too). Null for type previews.
         */
        getSpineStart(node, engine) {
            if (!engine?.getNode(node.id)) return null;

            const junctions = engine.model.edges
                .filter(e => e.targetNodeId === node.id && e.routePoints?.length >= 3)
                .map(e => e.routePoints[1].x);

            return Math.min(node.x - HEAD_GAP, ...junctions) - TAIL;
        },

        // Deleting a category or cause takes its causes along; the problem itself stays.
        getDependentNodes(node, engine) {
            return CHILD_TYPE[node.type] ? readTree(engine).children(node) : [];
        },

        canDeleteNode(node) {
            return node.type !== "effect";
        },

        getCanvasActions() {
            return [{ type: "fishboneAddCategory", label: "Categorie toevoegen", nodeType: "category" }];
        },

        handleCanvasAction(action, engine) {
            if (action.type !== "fishboneAddCategory") return false;

            const effect = readTree(engine).effect;
            if (!effect) return false;

            addNodeUnder(engine, effect, null);
            return true;
        },

        getContextActions(node, engine) {
            const tree     = readTree(engine);
            const parent   = tree.parentOf(node);
            const siblings = parent ? tree.children(parent) : [];
            const index    = siblings.indexOf(node);
            const title    = type => this.nodeTypes[type].defaultLabel.toLowerCase();

            const actions = [];

            if (node.type === "effect") {
                actions.push({ type: "fishboneAddChild", label: "Categorie toevoegen", nodeType: "category" });
                return actions;
            }

            if (CHILD_TYPE[node.type]) {
                actions.push({ type: "fishboneAddChild", label: `${capitalize(title(CHILD_TYPE[node.type]))} toevoegen`, icon: "branch" });
            }

            actions.push(node.type === "category"
                ? { type: "fishboneAddSibling", label: "Categorie toevoegen", nodeType: "category" }
                : { type: "fishboneAddSibling", label: `${capitalize(title(node.type))} toevoegen`, icon: "plus" });

            if (index > 0) {
                actions.push({ type: "fishboneMove", direction: -1, label: "Eerder in de volgorde", icon: "moveUp" });
            }
            if (index >= 0 && index < siblings.length - 1) {
                actions.push({ type: "fishboneMove", direction: 1, label: "Later in de volgorde", icon: "moveDown" });
            }

            actions.push({ type: "deleteNode", label: "Verwijderen" });
            return actions;
        },

        handleAction(action, node, engine) {
            const tree = readTree(engine);

            switch (action.type) {
                case "fishboneAddChild":
                    if (!CHILD_TYPE[node.type]) return false;
                    addNodeUnder(engine, node, null);
                    return true;

                case "fishboneAddSibling": {
                    const parent = tree.parentOf(node);
                    if (!parent) return false;
                    addNodeUnder(engine, parent, node);
                    return true;
                }

                case "fishboneMove": {
                    const parent   = tree.parentOf(node);
                    const siblings = parent ? tree.children(parent) : [];
                    const other    = siblings[siblings.indexOf(node) + action.direction];
                    if (!other) return false;

                    // Sibling order is model order: swap the two nodes in model.nodes.
                    const nodes = engine.model.nodes;
                    const a = nodes.indexOf(node);
                    const b = nodes.indexOf(other);
                    [nodes[a], nodes[b]] = [nodes[b], nodes[a]];
                    return true;
                }

                default:
                    return false;
            }
        },

        getDefaultSize(nodeType) {
            return {
                effect:   { width: 180, height: 90 },
                category: { width: 110, height: 32 },
                cause:    { width: 80,  height: 20 },
                subCause: { width: 70,  height: 18 }
            }[nodeType] || { width: 110, height: 32 };
        },

        getNodeInteractionMode() {
            return "action-surface";
        },

        getLabelLayout(node) {
            return LABELS[node.type] || {};
        },

        // Only the head may be resized; everything else is sized to its text.
        getResizeRules(node) {
            return node.type === "effect"
                ? { minWidth: 100, minHeight: 50, maxWidth: 360, maxHeight: 240 }
                : false;
        }
    };
}

/**
 * Adds a new child of `parent` (the type follows from the parent) right after `after`, or as the
 * last child when after is null; selects it and opens its label for editing once it is drawn.
 */
function addNodeUnder(engine, parent, after) {
    const type = CHILD_TYPE[parent.type];
    const node = {
        id: engine.generateId(),
        type,
        label: engine.getDefaultLabelForType(type),
        x: parent.x, y: parent.y, width: 0, height: 0   // placed and sized by the layout
    };

    const nodes = engine.model.nodes;
    const index = after ? nodes.indexOf(after) : -1;
    if (index >= 0) nodes.splice(index + 1, 0, node);
    else nodes.push(node);

    engine.model.edges.push(makeEdge(engine, node, parent));

    engine.selectSingleNode(node.id);
    engine.emitSelectionChanged();

    // The engine lays out and renders after this action; edit the label once the node has its place.
    setTimeout(() => {
        if (engine.getNode(node.id) && !engine.state.editingLabel) {
            engine.startInlineLabelEdit("node", node.id);
        }
    }, 0);
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
