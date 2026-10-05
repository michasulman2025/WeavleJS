const NS = "http://www.w3.org/2000/svg";

// ── Shape helpers ───────────────────────────────────────────

function _fcPolygon(node, engine, points) {
    const polygon = document.createElementNS(NS, "polygon");
    polygon.setAttribute("points", points.map(([px, py]) => `${px},${py}`).join(" "));
    engine.applyNodeStyle(polygon, node);
    return polygon;
}

function _fcPath(node, engine, d) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    engine.applyNodeStyle(path, node);
    return path;
}

/** A detail line in the node's stroke colour (no fill, not part of the selection outline). */
function _fcLine(node, engine, x1, y1, x2, y2) {
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
    line.setAttribute("stroke-width", "1.5");
    return line;
}

/** Outline of a document: a rectangle with a wavy bottom edge. */
function _fcDocumentPath(x, y, w, h) {
    const wave = Math.min(8, h * 0.12);
    return [
        `M ${x} ${y}`,
        `L ${x + w} ${y}`,
        `L ${x + w} ${y + h - wave}`,
        `Q ${x + w * 0.75} ${y + h + wave} ${x + w * 0.5} ${y + h - wave}`,
        `Q ${x + w * 0.25} ${y + h - 3 * wave} ${x} ${y + h - wave}`,
        "Z"
    ].join(" ");
}

const flowchartShapes = {
    process(node, engine) {
        const rect = document.createElementNS(NS, "rect");

        rect.setAttribute("x", node.x);
        rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width);
        rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 8);

        engine.applyNodeStyle(rect, node);
        return rect;
    },

    decision(node, engine) {
        const polygon = document.createElementNS(NS, "polygon");

        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;

        const points = [
            `${cx},${node.y}`,
            `${node.x + node.width},${cy}`,
            `${cx},${node.y + node.height}`,
            `${node.x},${cy}`
        ].join(" ");

        polygon.setAttribute("points", points);

        engine.applyNodeStyle(polygon, node);
        return polygon;
    },

    terminator(node, engine) {
        const rect = document.createElementNS(NS, "rect");

        rect.setAttribute("x", node.x);
        rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width);
        rect.setAttribute("height", node.height);
        rect.setAttribute("rx", Math.min(node.height / 2, 30));

        engine.applyNodeStyle(rect, node);
        return rect;
    },

    inputOutput(node, engine) {
        const polygon = document.createElementNS(NS, "polygon");
        const skew = 18;

        const points = [
            `${node.x + skew},${node.y}`,
            `${node.x + node.width},${node.y}`,
            `${node.x + node.width - skew},${node.y + node.height}`,
            `${node.x},${node.y + node.height}`
        ].join(" ");

        polygon.setAttribute("points", points);

        engine.applyNodeStyle(polygon, node);
        return polygon;
    },

    subProcess(node, engine) {
        const group = document.createElementNS(NS, "g");

        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x);
        rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width);
        rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 8);
        engine.applyNodeStyle(rect, node);

        const leftLine = document.createElementNS(NS, "line");
        leftLine.setAttribute("x1", node.x + 10);
        leftLine.setAttribute("y1", node.y + 6);
        leftLine.setAttribute("x2", node.x + 10);
        leftLine.setAttribute("y2", node.y + node.height - 6);
        leftLine.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
        leftLine.setAttribute("stroke-width", "1.5");

        const rightLine = document.createElementNS(NS, "line");
        rightLine.setAttribute("x1", node.x + node.width - 10);
        rightLine.setAttribute("y1", node.y + 6);
        rightLine.setAttribute("x2", node.x + node.width - 10);
        rightLine.setAttribute("y2", node.y + node.height - 6);
        rightLine.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
        rightLine.setAttribute("stroke-width", "1.5");

        group.appendChild(rect);
        group.appendChild(leftLine);
        group.appendChild(rightLine);

        return group;
    },

    document(node, engine) {
        const path = document.createElementNS(NS, "path");

        const x = node.x;
        const y = node.y;
        const w = node.width;
        const h = node.height;
        const wave = 8;

        const d = [
            `M ${x} ${y}`,
            `L ${x + w} ${y}`,
            `L ${x + w} ${y + h - wave}`,
            `Q ${x + w * 0.75} ${y + h + wave} ${x + w * 0.5} ${y + h - wave}`,
            `Q ${x + w * 0.25} ${y + h - 3 * wave} ${x} ${y + h - wave}`,
            `Z`
        ].join(" ");

        path.setAttribute("d", d);

        engine.applyNodeStyle(path, node);
        return path;
    },

    database(node, engine) {
        const group = document.createElementNS(NS, "g");

        const rx = node.width / 2;
        const ry = 10;
        const cx = node.x + node.width / 2;

        const body = document.createElementNS(NS, "rect");
        body.setAttribute("x", node.x);
        body.setAttribute("y", node.y + ry);
        body.setAttribute("width", node.width);
        body.setAttribute("height", node.height - ry * 2);
        engine.applyNodeStyle(body, node);

        const top = document.createElementNS(NS, "ellipse");
        top.setAttribute("cx", cx);
        top.setAttribute("cy", node.y + ry);
        top.setAttribute("rx", rx);
        top.setAttribute("ry", ry);
        engine.applyNodeStyle(top, node);

        const bottom = document.createElementNS(NS, "ellipse");
        bottom.setAttribute("cx", cx);
        bottom.setAttribute("cy", node.y + node.height - ry);
        bottom.setAttribute("rx", rx);
        bottom.setAttribute("ry", ry);
        bottom.setAttribute("fill", "none");
        bottom.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
        bottom.setAttribute("stroke-width", "1.5");

        group.appendChild(body);
        group.appendChild(top);
        group.appendChild(bottom);

        return group;
    },

    // ── Connectors ───────────────────────────────────────────

    // On-page connector: a small circle (usually labelled with a letter).
    onPageConnector(node, engine) {
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", node.x + node.width / 2);
        circle.setAttribute("cy", node.y + node.height / 2);
        circle.setAttribute("r", Math.min(node.width, node.height) / 2);
        engine.applyNodeStyle(circle, node);
        return circle;
    },

    // Off-page connector: a "home plate" pointing down.
    offPageConnector(node, engine) {
        const { x, y, width: w, height: h } = node;
        return _fcPolygon(node, engine, [[x, y], [x + w, y], [x + w, y + h * 0.6], [x + w / 2, y + h], [x, y + h * 0.6]]);
    },

    // ── Basic / flow ─────────────────────────────────────────

    // Preparation: a hexagon.
    preparation(node, engine) {
        const { x, y, width: w, height: h } = node;
        const c = Math.min(w * 0.15, h / 2);
        return _fcPolygon(node, engine, [[x + c, y], [x + w - c, y], [x + w, y + h / 2], [x + w - c, y + h], [x + c, y + h], [x, y + h / 2]]);
    },

    // Loop limit: a rectangle with its top corners cut off.
    loopLimit(node, engine) {
        const { x, y, width: w, height: h } = node;
        const c = Math.min(15, h * 0.3, w * 0.2);
        return _fcPolygon(node, engine, [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h], [x, y + h], [x, y + c]]);
    },

    // Delay: a "D" — flat left side, rounded right side.
    delay(node, engine) {
        const { x, y, width: w, height: h } = node;
        const r = Math.min(h / 2, w / 2);
        return _fcPath(node, engine, `M ${x} ${y} L ${x + w - r} ${y} A ${r} ${h / 2} 0 0 1 ${x + w - r} ${y + h} L ${x} ${y + h} Z`);
    },

    // ── Input & output ───────────────────────────────────────

    // Manual input: a quadrilateral whose top slopes up to the right.
    manualInput(node, engine) {
        const { x, y, width: w, height: h } = node;
        return _fcPolygon(node, engine, [[x, y + h * 0.3], [x + w, y], [x + w, y + h], [x, y + h]]);
    },

    // Display: pointed on the left, rounded on the right.
    display(node, engine) {
        const { x, y, width: w, height: h } = node;
        const r = Math.min(w * 0.18, h / 2);
        const p = Math.min(w * 0.18, h / 2);
        return _fcPath(node, engine,
            `M ${x} ${y + h / 2} L ${x + p} ${y} L ${x + w - r} ${y} A ${r} ${h / 2} 0 0 1 ${x + w - r} ${y + h} L ${x + p} ${y + h} Z`);
    },

    // Multiple documents: three stacked documents.
    multipleDocuments(node, engine) {
        const group = document.createElementNS(NS, "g");
        const { x, y, width: w, height: h } = node;
        const o = Math.min(8, w * 0.06, h * 0.08);

        [[2 * o, 0], [o, o], [0, 2 * o]].forEach(([dx, dy]) => {
            const path = document.createElementNS(NS, "path");
            path.setAttribute("d", _fcDocumentPath(x + dx, y + dy, w - 2 * o, h - 2 * o));
            engine.applyNodeStyle(path, node);
            group.appendChild(path);
        });

        return group;
    },

    // ── Storage ──────────────────────────────────────────────

    // Stored data: convex on the left, concave on the right.
    storedData(node, engine) {
        const { x, y, width: w, height: h } = node;
        const r = Math.min(w * 0.12, h / 2);
        return _fcPath(node, engine,
            `M ${x + r} ${y} L ${x + w} ${y} A ${r} ${h / 2} 0 0 0 ${x + w} ${y + h} L ${x + r} ${y + h} A ${r} ${h / 2} 0 0 1 ${x + r} ${y} Z`);
    },

    // Internal storage: a rectangle with a line along the top and the left side.
    internalStorage(node, engine) {
        const group = document.createElementNS(NS, "g");
        const { x, y, width: w, height: h } = node;
        const i = Math.min(12, w * 0.15, h * 0.2);

        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", x); rect.setAttribute("y", y);
        rect.setAttribute("width", w); rect.setAttribute("height", h);
        engine.applyNodeStyle(rect, node);
        group.appendChild(rect);

        const stroke = engine.getNodeColors(node.type).stroke;
        const lines = document.createElementNS(NS, "path");
        lines.setAttribute("d", `M ${x + i} ${y} L ${x + i} ${y + h} M ${x} ${y + i} L ${x + w} ${y + i}`);
        lines.setAttribute("fill", "none");
        lines.setAttribute("stroke", stroke);
        lines.setAttribute("stroke-width", "1.2");
        group.appendChild(lines);

        return group;
    },

    // Direct access storage: a cylinder on its side, its right end facing you.
    directAccessStorage(node, engine) {
        const group = document.createElementNS(NS, "g");
        const { x, y, width: w, height: h } = node;
        const r = Math.min(w * 0.12, h / 2);

        const body = document.createElementNS(NS, "path");
        body.setAttribute("d",
            `M ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${h / 2} 0 0 1 ${x + w - r} ${y + h} L ${x + r} ${y + h} A ${r} ${h / 2} 0 0 1 ${x + r} ${y} Z`);
        engine.applyNodeStyle(body, node);
        group.appendChild(body);

        const end = document.createElementNS(NS, "ellipse");
        end.setAttribute("cx", x + w - r); end.setAttribute("cy", y + h / 2);
        end.setAttribute("rx", r); end.setAttribute("ry", h / 2);
        end.setAttribute("fill", "none");
        end.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
        end.setAttribute("stroke-width", "1.5");
        group.appendChild(end);

        return group;
    },

    // ── Operations ───────────────────────────────────────────

    // Manual operation: a trapezoid, wide at the top.
    manualOperation(node, engine) {
        const { x, y, width: w, height: h } = node;
        const c = Math.min(w * 0.15, h);
        return _fcPolygon(node, engine, [[x, y], [x + w, y], [x + w - c, y + h], [x + c, y + h]]);
    },

    // Merge: a triangle pointing down.
    merge(node, engine) {
        const { x, y, width: w, height: h } = node;
        return _fcPolygon(node, engine, [[x, y], [x + w, y], [x + w / 2, y + h]]);
    },

    // Extract: a triangle pointing up.
    extract(node, engine) {
        const { x, y, width: w, height: h } = node;
        return _fcPolygon(node, engine, [[x + w / 2, y], [x + w, y + h], [x, y + h]]);
    },

    // Sort: a diamond with a horizontal line through the middle.
    sort(node, engine) {
        const group = document.createElementNS(NS, "g");
        const { x, y, width: w, height: h } = node;
        group.appendChild(_fcPolygon(node, engine, [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]));
        group.appendChild(_fcLine(node, engine, x, y + h / 2, x + w, y + h / 2));
        return group;
    },

    // Collate: an hourglass (two triangles meeting at the centre).
    collate(node, engine) {
        const { x, y, width: w, height: h } = node;
        return _fcPolygon(node, engine, [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]);
    },

    // Summing junction: a circle with an X.
    summingJunction(node, engine) {
        const group = document.createElementNS(NS, "g");
        const r  = Math.min(node.width, node.height) / 2;
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;
        const d  = r * Math.SQRT1_2;

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", r);
        engine.applyNodeStyle(circle, node);
        group.appendChild(circle);

        group.appendChild(_fcLine(node, engine, cx - d, cy - d, cx + d, cy + d));
        group.appendChild(_fcLine(node, engine, cx + d, cy - d, cx - d, cy + d));
        return group;
    },

    // Or: a circle with a plus.
    or(node, engine) {
        const group = document.createElementNS(NS, "g");
        const r  = Math.min(node.width, node.height) / 2;
        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", r);
        engine.applyNodeStyle(circle, node);
        group.appendChild(circle);

        group.appendChild(_fcLine(node, engine, cx - r, cy, cx + r, cy));
        group.appendChild(_fcLine(node, engine, cx, cy - r, cx, cy + r));
        return group;
    },

    // ── Comment ──────────────────────────────────────────────

    // Comment / annotation: an open bracket on the left.
    annotation(node, engine) {
        const { x, y, height: h } = node;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", `M ${x + 12} ${y} L ${x} ${y} L ${x} ${y + h} L ${x + 12} ${y + h}`);
        engine.applyNodeStyle(path, node);
        path.setAttribute("fill", "none");
        return path;
    }
};


// Flowchart shapes (ISO 5807 and common additions), grouped for the toolbar and the node tools.
const FLOWCHART_GROUPS = [
    { group: "Basis",                    types: ["terminator", "process", "decision", "subProcess", "preparation", "loopLimit", "delay"] },
    { group: "Invoer & uitvoer",         types: ["inputOutput", "manualInput", "display", "document", "multipleDocuments"] },
    { group: "Opslag",                   types: ["database", "storedData", "internalStorage", "directAccessStorage"] },
    { group: "Bewerkingen",              types: ["manualOperation", "merge", "extract", "sort", "collate", "summingJunction", "or"] },
    { group: "Verbinders & opmerkingen", types: ["onPageConnector", "offPageConnector", "annotation"] }
];

// All flowchart shape types, in palette order.
const FLOWCHART_TYPES = FLOWCHART_GROUPS.flatMap(g => g.types);

// Node types whose shape is a circle (keep their proportions).
const FLOWCHART_ROUND = ["onPageConnector", "summingJunction", "or"];

export function createFlowchartDefinition() {
    return {

        id: "flowchart",
        shapes: flowchartShapes,
        nodeTypes: {
            process: {
                defaultLabel: "Processtap",
                colors: {
                    fill: "#F6D6B4",
                    stroke: "#0d2d44"
                },
                shape: "process"
            },
            decision: {
                defaultLabel: "Beslissing?",
                colors: {
                    fill: "#FFB366",
                    stroke: "#F57100"
                },
                shape: "decision"
            },
            terminator: {
                defaultLabel: "Start / Stop",
                colors: {
                    fill: "#E8F3EC",
                    stroke: "#1B5278"
                },
                shape: "terminator"
            },
            inputOutput: {
                defaultLabel: "Input / Output",
                colors: {
                    fill: "#F6D6B4",
                    stroke: "#4A8DB5"
                },
                shape: "inputOutput"
            },
            document: {
                defaultLabel: "Document",
                colors: {
                    fill: "#FFF4E8",
                    stroke: "#4A8DB5"
                },
                shape: "document"
            },
            subProcess: {
                defaultLabel: "Subproces",
                colors: {
                    fill: "#8aa8b9",
                    stroke: "#4A8DB5"
                },
                shape: "subProcess"
            },
            database: {
                defaultLabel: "Database",
                colors: {
                    fill: "#EAF4FB",
                    stroke: "#1B5278"
                },
                shape: "database"
            },

            // ── Additional standard shapes ──
            preparation:         { defaultLabel: "Voorbereiding",        colors: { fill: "#E8F3EC", stroke: "#1B5278" }, shape: "preparation" },
            loopLimit:           { defaultLabel: "Herhaal",              colors: { fill: "#E8F3EC", stroke: "#1B5278" }, shape: "loopLimit" },
            delay:               { defaultLabel: "Wachten",              colors: { fill: "#FFF4E8", stroke: "#B07A00" }, shape: "delay" },

            manualInput:         { defaultLabel: "Handmatige invoer",    colors: { fill: "#F6D6B4", stroke: "#4A8DB5" }, shape: "manualInput" },
            display:             { defaultLabel: "Weergave",             colors: { fill: "#F6D6B4", stroke: "#4A8DB5" }, shape: "display" },
            multipleDocuments:   { defaultLabel: "Documenten",           colors: { fill: "#FFF4E8", stroke: "#4A8DB5" }, shape: "multipleDocuments" },

            storedData:          { defaultLabel: "Opgeslagen gegevens",  colors: { fill: "#EAF4FB", stroke: "#1B5278" }, shape: "storedData" },
            internalStorage:     { defaultLabel: "Intern geheugen",      colors: { fill: "#EAF4FB", stroke: "#1B5278" }, shape: "internalStorage" },
            directAccessStorage: { defaultLabel: "Directe opslag",       colors: { fill: "#EAF4FB", stroke: "#1B5278" }, shape: "directAccessStorage" },

            manualOperation:     { defaultLabel: "Handmatige handeling", colors: { fill: "#F6D6B4", stroke: "#0d2d44" }, shape: "manualOperation" },
            merge:               { defaultLabel: "Samenvoegen",          colors: { fill: "#FFFFFF", stroke: "#0d2d44" }, shape: "merge" },
            extract:             { defaultLabel: "Uitsplitsen",          colors: { fill: "#FFFFFF", stroke: "#0d2d44" }, shape: "extract" },
            sort:                { defaultLabel: "Sorteren",             colors: { fill: "#FFFFFF", stroke: "#0d2d44" }, shape: "sort" },
            collate:             { defaultLabel: "Collatie",             colors: { fill: "#FFFFFF", stroke: "#0d2d44" }, shape: "collate" },
            summingJunction:     { defaultLabel: "Sommatie",             colors: { fill: "#FFFFFF", stroke: "#0d2d44" }, shape: "summingJunction" },
            or:                  { defaultLabel: "Of",                   colors: { fill: "#FFFFFF", stroke: "#0d2d44" }, shape: "or" },

            onPageConnector:     { defaultLabel: "A",        title: "On-page verbinder", colors: { fill: "#FFFFFF", stroke: "#1B5278" }, shape: "onPageConnector" },
            offPageConnector:    { defaultLabel: "Pagina 2", title: "Off-page verbinder", colors: { fill: "#FFFFFF", stroke: "#1B5278" }, shape: "offPageConnector" },
            annotation:          { defaultLabel: "Opmerking",            colors: { fill: "none",    stroke: "#64748B" }, shape: "annotation" }
        },

        // Grouped: the canvas toolbar and the node tools get a submenu per group.
        palette: FLOWCHART_GROUPS,

        // Flow lines get an arrow; a comment is linked with a dashed line without one.
        defaultEdgeType: "flow",

        edgeTypes: {
            flow:    { router: "orthogonal", marker: "arrow" },
            comment: { router: "straight",   marker: "none", dash: "3,4" }
        },

        getEdgeTypeForConnection({ source, target }) {
            return source?.type === "annotation" || target?.type === "annotation" ? "comment" : "flow";
        },

        getPorts(node) {
            const { x, y, width: w, height: h } = node;

            // Triangles and the hourglass: side ports sit on the slanted outline.
            switch (node.type) {
                case "merge":
                    return { top: { x: x + w / 2, y }, right: { x: x + w * 0.75, y: y + h / 2 },
                             bottom: { x: x + w / 2, y: y + h }, left: { x: x + w * 0.25, y: y + h / 2 } };
                case "extract":
                    return { top: { x: x + w / 2, y }, right: { x: x + w * 0.75, y: y + h / 2 },
                             bottom: { x: x + w / 2, y: y + h }, left: { x: x + w * 0.25, y: y + h / 2 } };
                case "collate":
                    return { top: { x: x + w / 2, y }, right: { x: x + w * 0.75, y: y + h * 0.25 },
                             bottom: { x: x + w / 2, y: y + h }, left: { x: x + w * 0.25, y: y + h * 0.25 } };
                case "manualInput":
                    return { top: { x: x + w / 2, y: y + h * 0.15 }, right: { x: x + w, y: y + h / 2 },
                             bottom: { x: x + w / 2, y: y + h }, left: { x, y: y + h * 0.65 } };
            }

            return {
                top: {
                    x: node.x + node.width / 2,
                    y: node.y
                },
                right: {
                    x: node.x + node.width,
                    y: node.y + node.height / 2
                },
                bottom: {
                    x: node.x + node.width / 2,
                    y: node.y + node.height
                },
                left: {
                    x: node.x,
                    y: node.y + node.height / 2
                }
            };
        },

        routeEdge({ sourcePoint, targetPoint, sourceHandle, targetHandle, edge, engine }) {
            return engine.buildRoutedEdgePoints(
                sourcePoint,
                targetPoint,
                sourceHandle,
                targetHandle,
                edge
            );
        },

        // Same menu style as BPMN: change type, add a connected step, delete.
        // One "add" submenu per shape group; "Type wijzigen" lists every shape under group headings.
        getContextActions(node, engine) {
            const label = type => this.nodeTypes[type].title || this.nodeTypes[type].defaultLabel;

            return [
                {
                    type: "group", label: "Type wijzigen", icon: "wrench",
                    children: FLOWCHART_GROUPS.flatMap(g => [
                        { type: "heading", label: g.group },
                        ...g.types.map(t => ({ type: "changeType", nodeType: t, label: label(t), active: t === node.type }))
                    ])
                },
                ...FLOWCHART_GROUPS.map(g => ({
                    type: "group", label: g.group + " toevoegen", nodeType: g.types[0],
                    children: g.types.map(t => ({ type: "addConnectedNode", nodeType: t, label: label(t) }))
                })),
                // Take the node out of its flow (A → node → B becomes A → B), to move it elsewhere.
                ...(engine?.hasEdges(node) ? [{ type: "detachNode", label: "Losmaken" }] : []),
                { type: "deleteNode", label: "Verwijderen" }
            ];
        },

        handleAction(action, node) {
            if (action.type !== "changeType" || !action.nodeType || action.nodeType === node.type) return false;

            // Keep a custom label; replace the default label of the old type.
            const oldDefault = this.nodeTypes[node.type]?.defaultLabel;
            node.type = action.nodeType;

            if (!node.label || node.label === oldDefault) {
                node.label = this.nodeTypes[node.type].defaultLabel;
            }
            return true;
        },

        getDefaultSize(nodeType) {
            const sizes = {
                process:     { width: 140, height: 70 },
                decision:    { width: 120, height: 90 },
                terminator:  { width: 140, height: 60 },
                inputOutput: { width: 140, height: 70 },
                document:    { width: 140, height: 80 },
                subProcess:  { width: 140, height: 70 },
                database:    { width: 120, height: 80 },

                preparation:         { width: 140, height: 70 },
                loopLimit:           { width: 140, height: 60 },
                delay:               { width: 120, height: 60 },
                manualInput:         { width: 140, height: 70 },
                display:             { width: 140, height: 70 },
                multipleDocuments:   { width: 150, height: 90 },
                storedData:          { width: 140, height: 70 },
                internalStorage:     { width: 120, height: 80 },
                directAccessStorage: { width: 160, height: 70 },
                manualOperation:     { width: 140, height: 70 },
                merge:               { width: 60,  height: 50 },
                extract:             { width: 60,  height: 50 },
                sort:                { width: 60,  height: 60 },
                collate:             { width: 50,  height: 60 },
                summingJunction:     { width: 40,  height: 40 },
                or:                  { width: 40,  height: 40 },
                onPageConnector:     { width: 40,  height: 40 },
                offPageConnector:    { width: 60,  height: 60 },
                annotation:          { width: 140, height: 60 }
            };
            return sizes[nodeType] || { width: 140, height: 70 };
        },

        // Node tools float next to the selected node, like BPMN.
        getNodeInteractionMode(node) {
            return "action-surface";
        },

        // Usable text area per shape: a diamond only has room around its middle,
        // a parallelogram loses its slanted sides, a cylinder its top ellipse.
        getLabelLayout(node) {
            switch (node.type) {
                case "decision":    return { widthFactor: 0.7, heightFactor: 0.6, paddingX: 4, paddingY: 2 };
                case "inputOutput": return { paddingX: 22 };
                case "database":    return { paddingY: 14 };
                case "subProcess":  return { paddingX: 16 };

                case "preparation":
                case "manualOperation":   return { paddingX: 22 };
                case "loopLimit":         return { paddingY: 8 };
                case "delay":
                case "display":           return { paddingX: 18 };
                case "manualInput":       return { paddingY: 10 };
                case "multipleDocuments": return { paddingX: 12, paddingY: 12 };
                case "storedData":        return { paddingX: 20 };
                // Keep the text clear of the cylinder's end face on the right (both sides, so it stays centred).
                case "directAccessStorage": return { paddingX: 2 * Math.min(node.width * 0.12, node.height / 2) + 4 };
                case "internalStorage":   return { paddingX: 16, paddingY: 10 };
                case "document":          return { paddingY: 6 };

                // Small symbols: the label goes below the shape.
                case "merge":
                case "extract":
                case "sort":
                case "collate":
                case "summingJunction":
                case "or":                return { placement: "below", fontSize: 12, belowWidth: 110 };

                // Connectors carry a short reference ("A", "Pagina 2").
                case "onPageConnector":   return { fontSize: 12, paddingX: 2, paddingY: 2, maxLines: 1 };
                case "offPageConnector":  return { fontSize: 11, paddingX: 3, paddingY: 2, heightFactor: 0.6, maxLines: 2 };

                case "annotation":        return { placement: "inside", paddingX: 10, paddingY: 6, fontSize: 13 };
                default:            return {};
            }
        },

        getResizeRules(node) {
            switch (node.type) {
                case "decision": return { minWidth: 80, minHeight: 60 };
                case "database": return { minWidth: 60, minHeight: 50 };

                case "onPageConnector":
                case "summingJunction":
                case "or":               return { keepAspectRatio: true, minWidth: 30, minHeight: 30, maxWidth: 120, maxHeight: 120 };
                case "offPageConnector": return { minWidth: 40, minHeight: 40 };
                case "merge":
                case "extract":
                case "sort":
                case "collate":          return { minWidth: 40, minHeight: 40 };
                case "annotation":       return { minWidth: 60, minHeight: 30 };
                default:         return { minWidth: 80, minHeight: 40 };
            }
        },

        getRoutingConfig(edge, engine) {
            return {
                gridSize: 20,
                stubLength: 20,
                obstacleMargin: 16,
                turnPenalty: 25,
                proximityPenalty: 2,
                preferredDirection: null,
                backtrackPenalty: 0,
                allowedDirections: ["up", "right", "down", "left"],
                searchMargin: 200,
                maxIterations: 3000,
                storeRoutingMeta: true
            };
        }
    };


}