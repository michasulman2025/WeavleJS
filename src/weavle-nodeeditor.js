/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  Node editor (Blender / Unreal style): nodes with a coloured header, outputs on the right and inputs on
  the left, each with a label and a data type; links are bezier curves in the colour of their data type.

  Model
    node.type     a key of NODE_TYPES; node.label is the header title
    node.values   { [fieldId]: string } — the values typed into the node: an input's own value (shown while
                  the input is not connected) or a field of a constant node
    edge          output → input: sourceHandle "out-<id>", targetHandle "in-<id>"; edge.type = the data type

  Rules
    - an output goes to an input, the data types must match (the engine's port checks, ARCHITECTURE.md 4.3);
    - an input takes one link: a new link replaces the old one (port max 1, onFull "replace");
    - no cycles.

  Editing: double-click the header to rename a node, double-click a value box to type its value.
*/

const NS = "http://www.w3.org/2000/svg";

// ── Layout constants ────────────────────────────────────────

const NODE_WIDTH = 190;
const HEADER     = 28;     // coloured title strip
const ROW        = 26;     // one output, input or field
const PAD_Y      = 6;      // above the first and below the last row
const PAD_X      = 12;     // between the border and a label / value box
const PORT_R     = 5.5;
const FONT_SIZE  = 12;
const BOX_H      = 19;     // value box inside a row

// ── Data types and node types ───────────────────────────────

/** Data types: name in messages and the colour of their ports and links. */
export const DATA_TYPES = {
    boolean: { label: "Boolean", color: "#4F7DF0" },
    number:  { label: "Getal",   color: "#E5484D" },
    string:  { label: "Tekst",   color: "#22B07D" }
};

/** Categories: palette group and header colour. */
const CATEGORIES = {
    input:  { label: "Invoer",  color: "#2F6F8F" },
    logic:  { label: "Logica",  color: "#6B4FA8" },
    number: { label: "Getallen", color: "#A8483E" },
    text:   { label: "Tekst",   color: "#2E8060" },
    output: { label: "Uitvoer", color: "#8A6A1F" }
};

/**
 * The node types. outputs / inputs: { id, label, type }; an input with `value` gets a value box while it
 * is not connected (value = the default). fields: values without a port (constants).
 */
export const NODE_TYPES = {
    currentUser: {
        title: "Huidige gebruiker", category: "input",
        outputs: [
            { id: "loggedIn", label: "Ingelogd",       type: "boolean" },
            { id: "admin",    label: "Beheerder",      type: "boolean" },
            { id: "fullName", label: "Volledige naam", type: "string"  },
            { id: "email",    label: "E-mail",         type: "string"  }
        ]
    },
    window: {
        title: "Venster", category: "input",
        outputs: [
            { id: "width",  label: "Breedte", type: "number" },
            { id: "height", label: "Hoogte",  type: "number" }
        ]
    },
    text: {
        title: "Tekst", category: "input",
        fields:  [{ id: "value", label: "Tekst", type: "string", value: "" }],
        outputs: [{ id: "value", label: "Tekst", type: "string" }]
    },
    number: {
        title: "Getal", category: "input",
        fields:  [{ id: "value", label: "Waarde", type: "number", value: "0" }],
        outputs: [{ id: "value", label: "Getal", type: "number" }]
    },
    boolean: {
        title: "Ja / nee", category: "input",
        fields:  [{ id: "value", label: "Waarde", type: "boolean", value: "waar" }],
        outputs: [{ id: "value", label: "Boolean", type: "boolean" }]
    },

    and: {
        title: "EN", category: "logic",
        outputs: [{ id: "result", label: "Boolean", type: "boolean" }],
        inputs:  [{ id: "a", label: "Boolean", type: "boolean" }, { id: "b", label: "Boolean", type: "boolean" }]
    },
    or: {
        title: "OF", category: "logic",
        outputs: [{ id: "result", label: "Boolean", type: "boolean" }],
        inputs:  [{ id: "a", label: "Boolean", type: "boolean" }, { id: "b", label: "Boolean", type: "boolean" }]
    },
    not: {
        title: "Omkeren", category: "logic",
        outputs: [{ id: "result", label: "Boolean", type: "boolean" }],
        inputs:  [{ id: "value", label: "Boolean", type: "boolean" }]
    },

    lessThan: {
        title: "Kleiner dan", category: "number",
        outputs: [{ id: "result", label: "Boolean", type: "boolean" }],
        inputs:  [{ id: "a", label: "Getal", type: "number", value: "0" }, { id: "b", label: "Getal", type: "number", value: "0" }]
    },
    add: {
        title: "Optellen", category: "number",
        outputs: [{ id: "result", label: "Getal", type: "number" }],
        inputs:  [{ id: "a", label: "Getal", type: "number", value: "0" }, { id: "b", label: "Getal", type: "number", value: "0" }]
    },

    joinText: {
        title: "Tekst samenvoegen", category: "text",
        outputs: [{ id: "result", label: "Tekst", type: "string" }],
        inputs:  [{ id: "first", label: "Eerste", type: "string", value: "" }, { id: "second", label: "Tweede", type: "string", value: "" }]
    },
    chooseText: {
        title: "Tekst kiezen", category: "text",
        outputs: [{ id: "result", label: "Tekst", type: "string" }],
        inputs:  [
            { id: "test",    label: "Test",       type: "boolean" },
            { id: "ifTrue",  label: "Indien waar", type: "string", value: "" },
            { id: "ifFalse", label: "Anders",      type: "string", value: "" }
        ]
    },
    numberToText: {
        title: "Getal naar tekst", category: "text",
        outputs: [{ id: "result", label: "Tekst", type: "string" }],
        inputs:  [{ id: "value", label: "Getal", type: "number", value: "0" }]
    },

    pageSettings: {
        title: "Pagina-instellingen", category: "output",
        inputs: [
            { id: "title",         label: "Paginatitel",    type: "string", value: "" },
            { id: "description",   label: "Omschrijving",   type: "string", value: "" },
            { id: "showDashboard", label: "Toon dashboard", type: "boolean" },
            { id: "showSignup",    label: "Toon aanmelden", type: "boolean" }
        ]
    }
};

// ── Rows and geometry ───────────────────────────────────────

/** The rows of a node type, top to bottom: outputs, fields, inputs. */
function rowsOf(type) {
    const def = NODE_TYPES[type] || {};
    return [
        ...(def.outputs || []).map(p => ({ kind: "out",   ...p, handle: `out-${p.id}` })),
        ...(def.fields  || []).map(f => ({ kind: "field", ...f })),
        ...(def.inputs  || []).map(p => ({ kind: "in",    ...p, handle: `in-${p.id}` }))
    ];
}

/** Default size of a node type: fixed width, height from its rows. */
function sizeOf(type) {
    return { width: NODE_WIDTH, height: HEADER + PAD_Y * 2 + rowsOf(type).length * ROW };
}

/** Vertical centre of row i of a node. */
function rowY(node, i) {
    return node.y + HEADER + PAD_Y + i * ROW + ROW / 2;
}

/** True if an input of the node has a link. */
function isConnected(engine, node, handle) {
    return engine.model.edges.some(e => e.targetNodeId === node.id && e.targetHandle === handle);
}

/** The value box of a row, or null: fields always, inputs with a value only while not connected. */
function valueBox(engine, node, row, i) {
    if (row.kind === "out") return null;
    if (row.kind === "in" && (row.value === undefined || isConnected(engine, node, row.handle))) return null;

    const y = rowY(node, i);
    return { x: node.x + PAD_X, y: y - BOX_H / 2, width: node.width - PAD_X * 2, height: BOX_H };
}

/** The default values of a node type: { [fieldId]: value } for fields and inputs with a value. */
function defaultValues(type) {
    const values = {};
    for (const row of rowsOf(type)) {
        if (row.kind !== "out" && row.value !== undefined) values[row.id] = row.value;
    }
    return values;
}

/** The value of a row: node.values, else the type's default. */
function valueOf(node, row) {
    return node.values?.[row.id] ?? row.value ?? "";
}

// ── Shape ───────────────────────────────────────────────────

function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
}

function textEl(content, attrs) {
    const text = svgEl("text", { "font-size": FONT_SIZE, "pointer-events": "none", ...attrs });
    text.textContent = content;
    return text;
}

/** One line of text cut to width with "…". */
function fit(engine, value, width) {
    return engine.wrapLabel(String(value), width, 1, FONT_SIZE).lines[0] || "";
}

function drawNode(node, engine, compact = false) {
    // Smaller than its rows need (a toolbar icon, appendTypePreview): draw it full size, scaled down,
    // with the ports but without text.
    const full = sizeOf(node.type);
    if (!compact && node.height < full.height - 1) {
        const scale = node.height / full.height;
        const icon  = svgEl("g", { transform: `translate(${node.x} ${node.y}) scale(${scale})` });
        icon.appendChild(drawNode({ ...node, x: 0, y: 0, width: node.width / scale, height: full.height }, engine, true));
        return icon;
    }

    const { x, y, width: w, height: h } = node;
    const def    = NODE_TYPES[node.type] || {};
    const style  = engine.getNodeStyle(node);
    const header = CATEGORIES[def.category]?.color || style.stroke;
    const muted  = "#C9CED6";
    const group  = svgEl("g", {});

    const body = svgEl("rect", { x, y, width: w, height: h, rx: 6 });
    engine.applyNodeStyle(body, node);
    group.appendChild(body);

    // Header strip: rounded top, square bottom (a second rect covers the lower corners).
    group.appendChild(svgEl("rect", {
        x: x + 1, y: y + 1, width: Math.max(0, w - 2), height: HEADER - 1, rx: 5,
        fill: header, "pointer-events": "none", class: "weavle-nodeeditor-header"
    }));
    group.appendChild(svgEl("rect", {
        x: x + 1, y: y + HEADER - 6, width: Math.max(0, w - 2), height: 6,
        fill: header, "pointer-events": "none"
    }));

    rowsOf(node.type).forEach((row, i) => {
        const cy  = rowY(node, i);
        const box = valueBox(engine, node, row, i);

        if (compact) {
            // Icon: no text, just the value boxes.
            if (box) group.appendChild(svgEl("rect", { x: box.x, y: box.y, width: box.width, height: box.height, rx: 4, fill: "#2A2E35" }));
        } else if (box) {
            group.appendChild(svgEl("rect", {
                x: box.x, y: box.y, width: box.width, height: box.height, rx: 4,
                fill: "#2A2E35", stroke: "#4A505A", "pointer-events": "none", class: "weavle-nodeeditor-value"
            }));
            const label = textEl(row.label, { x: box.x + 6, y: cy + 4, fill: muted });
            group.appendChild(label);

            const room = box.width - 12 - engine.measureLabelText(row.label, FONT_SIZE) - 10;
            group.appendChild(textEl(fit(engine, valueOf(node, row), Math.max(10, room)), {
                x: box.x + box.width - 6, y: cy + 4, "text-anchor": "end", fill: style.textColor || "#FFFFFF"
            }));
        } else {
            const isOut = row.kind === "out";
            group.appendChild(textEl(fit(engine, row.label, w - PAD_X * 2), {
                x: isOut ? x + w - PAD_X : x + PAD_X, y: cy + 4,
                "text-anchor": isOut ? "end" : "start", fill: style.textColor || "#FFFFFF"
            }));
        }

        // The port: data-handle-position makes it a place to start (or end) a link.
        if (row.handle) {
            group.appendChild(svgEl("circle", {
                cx: row.kind === "out" ? x + w : x, cy, r: PORT_R,
                fill: DATA_TYPES[row.type]?.color || "#999999", stroke: "#1E2228", "stroke-width": 1.5,
                "data-handle-position": row.handle, cursor: "crosshair", class: "weavle-nodeeditor-port"
            }));
        }
    });

    return group;
}

// ── Theme ───────────────────────────────────────────────────

// Dark nodes with white text; links in the colour of their data type. A theme may override both.
const NODE_EDITOR_THEME = {
    nodeTypes: Object.fromEntries(Object.keys(NODE_TYPES).map(type => [
        type, { fill: "#3A3F47", stroke: "#1E2228", textColor: "#FFFFFF", fontWeight: "600" }
    ])),
    edgeTypes: Object.fromEntries(Object.entries(DATA_TYPES).map(([type, def]) => [
        type, { stroke: def.color, strokeWidth: 2.5 }
    ]))
};

// ── Helpers for hosts and samples ───────────────────────────

/**
 * A node of a node-editor type with its default size and title: nodeEditorNode("and", "n1", 100, 80).
 * values: the typed-in values ({ b: "960" }).
 */
export function nodeEditorNode(type, id, x, y, values = undefined) {
    return {
        id, type, x, y,
        ...sizeOf(type),
        label: NODE_TYPES[type]?.title || type,
        values: { ...defaultValues(type), ...(values || {}) }
    };
}

/** A link from an output to an input: nodeEditorLink("e1", "user", "loggedIn", "and1", "a"). */
export function nodeEditorLink(id, sourceNodeId, output, targetNodeId, input) {
    return {
        id, sourceNodeId, targetNodeId,
        sourceHandle: `out-${output}`,
        targetHandle: `in-${input}`,
        label: "", isAutoRoute: true
    };
}

// ── Definition ──────────────────────────────────────────────

export function createNodeEditorDefinition() {
    return {
        id: "nodeeditor",
        shapes: { node: drawNode },
        defaultTheme: NODE_EDITOR_THEME,
        dataTypes: DATA_TYPES,

        nodeTypes: Object.fromEntries(Object.entries(NODE_TYPES).map(([type, def]) => [
            type, { defaultLabel: def.title, title: def.title, shape: "node" }
        ])),

        palette: Object.entries(CATEGORIES).map(([category, def]) => ({
            group: def.label,
            types: Object.keys(NODE_TYPES).filter(type => NODE_TYPES[type].category === category)
        })),

        // The shape draws the ports (coloured by data type); no extra handles on a selected node.
        showPortHandles: false,

        getDefaultSize(type) {
            return sizeOf(type);
        },

        // A new node starts with its default values (so editing a value starts from what is shown).
        onNodeCreated(node) {
            node.values = { ...defaultValues(node.type), ...(node.values || {}) };
        },

        // Width only: the height follows from the rows.
        getResizeRules(node) {
            const { height } = sizeOf(node.type);
            return { minWidth: 150, maxWidth: 420, minHeight: height, maxHeight: height, handles: ["e", "w"] };
        },

        // The title in the header strip.
        getLabelLayout(node) {
            const h = Math.max(node.height, HEADER);
            return {
                placement:    "inside",
                fontSize:     13,
                maxLines:     1,
                paddingX:     10,
                paddingY:     0,
                heightFactor: HEADER / h,
                offsetY:      -(h - HEADER) / 2
            };
        },

        getPorts(node) {
            const ports = {};
            rowsOf(node.type).forEach((row, i) => {
                if (!row.handle) return;
                const isOut = row.kind === "out";
                ports[row.handle] = {
                    x:         isOut ? node.x + node.width : node.x,
                    y:         rowY(node, i),
                    side:      isOut ? "right" : "left",
                    direction: isOut ? "out" : "in",
                    dataType:  row.type,
                    label:     row.label,
                    // An input takes one link; a new one replaces it.
                    ...(isOut ? {} : { max: 1, onFull: "replace" })
                };
            });
            return ports;
        },

        defaultEdgeType: "string",

        edgeTypes: Object.fromEntries(Object.keys(DATA_TYPES).map(type => [
            type, { router: "bezier", marker: "none" }
        ])),

        // A link has the type of the data it carries (and so its colour).
        getEdgeTypeForConnection({ source, sourceHandle }, engine) {
            const type = engine.getPort(source, sourceHandle)?.dataType;
            return DATA_TYPES[type] ? type : "string";
        },

        // Directions, data types and one link per input come from the ports; what is left: no cycles.
        canConnect({ source, target, edge }, engine) {
            const next = new Map();
            for (const e of engine.model.edges) {
                if (e.id === edge?.id) continue;
                if (!next.has(e.sourceNodeId)) next.set(e.sourceNodeId, []);
                next.get(e.sourceNodeId).push(e.targetNodeId);
            }

            // Does the target already lead back to the source?
            const seen  = new Set();
            const stack = [target.id];
            while (stack.length) {
                const id = stack.pop();
                if (id === source.id) return "Deze verbinding maakt een kringloop";
                if (seen.has(id)) continue;
                seen.add(id);
                stack.push(...(next.get(id) || []));
            }
            return true;
        },

        // Links attach to ports only: never split one by dropping a node on it.
        canSplitEdge() {
            return false;
        },

        // Double-click on a value box edits that value; elsewhere the title.
        getEditTarget(node, engine, pos) {
            if (!pos) return null;

            const rows = rowsOf(node.type);
            for (let i = 0; i < rows.length; i++) {
                const box = valueBox(engine, node, rows[i], i);
                if (!box) continue;
                if (pos.x >= box.x && pos.x <= box.x + box.width && pos.y >= box.y && pos.y <= box.y + box.height) {
                    return {
                        field: `values.${rows[i].id}`,
                        box: {
                            centerX: box.x + box.width / 2, centerY: box.y + box.height / 2,
                            width: box.width, height: box.height, fontSize: FONT_SIZE, lineHeight: FONT_SIZE * 1.25
                        }
                    };
                }
            }
            return null;
        },

        getContextActions() {
            return [{ type: "deleteNode", label: "Verwijderen" }];
        }
    };
}
