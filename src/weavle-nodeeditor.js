/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  Node editor (Blender / Unreal style): nodes with a coloured header, outputs on the right and inputs on
  the left, each with a label and a data type; links are bezier curves in the colour of their data type.

  Catalog (createNodeEditorDefinition({ nodeTypes, dataTypes, categories, includeDefaults, allowCycles }), all
  optional, objects or — through the OutSystems adapter's diagramOptions — JSON):
    nodeTypes     { [type]: { title, category, color?, width?, outputs?, fields?, inputs?, list? } } — ports / fields are
                  { id, label, type, value? } (see NODE_TYPES); an input with multiple: true takes more than
                  one link (e.g. a workflow step reached from several places).
                  list? = { id, label, type?, value?, min?, max?, port? } — rows the user adds and removes per
                  node (e.g. conditions), after the inputs: an input of `type` with a value box (port: false = a
                  field without port); node.items holds the ids of the rows ("<id>-<n>"), node.values their values
    dataTypes     { [type]: { label, color } } (see DATA_TYPES); a port of type "any" fits every type
    categories    { [id]: { label, color } } — palette groups in this order and header colours (see CATEGORIES)
    includeDefaults  true (default): the host's entries are added to (or replace same-named) built-in ones;
                     false: only the host's catalog
    allowCycles   false (default): no cycles; true: cycles allowed; ["flow"]: links of these data types may
                  close a cycle (e.g. rework loops in a workflow), the other links still may not
  Types without a (known) category go to the palette group "Overig".

  Model
    node.type     a key of the catalog's nodeTypes; node.label is the header title
    node.values   { [fieldId]: string } — the values typed into the node: an input's own value (shown while
                  the input is not connected) or a field of a constant node
    edge          output → input: sourceHandle "out-<id>", targetHandle "in-<id>"; edge.type = the data type

  Rules
    - an output goes to an input, the data types must match (the engine's port checks, ARCHITECTURE.md 4.3);
    - an input takes one link: a new link replaces the old one (port max 1, onFull "replace") — unless the
      input has multiple: true;
    - no cycles, except through links of the data types in allowCycles.

  Editing: double-click the header to rename a node, double-click a value box to type its value. List rows are
  added and removed through the node tools.
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
export const CATEGORIES = {
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

// ── Catalog ─────────────────────────────────────────────────

/** A catalog option: an object, JSON text, or nothing. */
function parseOption(value) {
    if (!value) return {};
    if (typeof value === "string") {
        try { return JSON.parse(value) || {}; } catch { return {}; }
    }
    return value;
}

/** The catalog a definition works with: the built-in tables, extended or replaced by the host's. */
function createCatalog({ nodeTypes, dataTypes, categories, includeDefaults = true } = {}) {
    const merge = (defaults, own) => ({ ...(includeDefaults ? defaults : {}), ...parseOption(own) });
    return {
        nodeTypes:  merge(NODE_TYPES, nodeTypes),
        dataTypes:  merge(DATA_TYPES, dataTypes),
        categories: merge(CATEGORIES, categories)
    };
}

const DEFAULT_CATALOG = createCatalog();

/**
 * Which links may close a cycle, from the allowCycles option: () => false (default), () => true (true), or
 * a test on the data type (an array of data types, also as JSON text).
 */
function createCycleRule(allowCycles) {
    let value = allowCycles;
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { value = [value]; }
    }
    if (value === true) return () => true;
    if (!Array.isArray(value) || !value.length) return () => false;

    const types = new Set(value);
    return dataType => types.has(dataType);
}

/** Header colour of a node type: its own colour, else its category's. */
function headerColor(catalog, def) {
    return def.color || catalog.categories[def.category]?.color || null;
}

/** Palette: one group per category (catalog order), types without a known category in "Overig". */
function buildPalette(catalog) {
    const types = Object.keys(catalog.nodeTypes);
    const known = id => !!catalog.categories[id];

    const groups = Object.entries(catalog.categories).map(([category, def]) => ({
        group: def.label || category,
        types: types.filter(type => catalog.nodeTypes[type].category === category)
    }));
    groups.push({ group: "Overig", types: types.filter(type => !known(catalog.nodeTypes[type].category)) });

    return groups.filter(group => group.types.length);
}

// ── Rows and geometry ───────────────────────────────────────

/** The minimum and maximum number of list rows of a node type definition. */
function listLimits(list) {
    const min = Math.max(0, list.min ?? 1);
    return { min, max: Math.max(min, list.max ?? 20) };
}

/** The ids of a node's list rows: node.items, else the type's minimum ("<list id>-1", ...). */
function listItems(def, node) {
    if (!def.list) return [];
    if (Array.isArray(node?.items)) return node.items;
    return Array.from({ length: listLimits(def.list).min }, (_, i) => `${def.list.id}-${i + 1}`);
}

/** A fresh id for a new list row of a node. */
function nextListItem(def, node) {
    const used = new Set(listItems(def, node));
    let n = used.size + 1;
    while (used.has(`${def.list.id}-${n}`)) n++;
    return `${def.list.id}-${n}`;
}

/**
 * The rows of a node type definition, top to bottom: outputs, fields, inputs, list rows. The list rows
 * depend on the node (node.items); without a node: the type's minimum.
 */
function rowsOf(def = {}, node = null) {
    const list = def.list;
    return [
        ...(def.outputs || []).map(p => ({ kind: "out",   ...p, handle: `out-${p.id}` })),
        ...(def.fields  || []).map(f => ({ kind: "field", ...f })),
        ...(def.inputs  || []).map(p => ({ kind: "in",    ...p, handle: `in-${p.id}` })),
        ...listItems(def, node).map((id, i) => {
            const row = { id, label: `${list.label || list.id} ${i + 1}`, type: list.type, value: list.value ?? "", listItem: true };
            return list.port === false || !list.type ? { kind: "field", ...row } : { kind: "in", ...row, handle: `in-${id}` };
        })
    ];
}

/** Size of a node of a type definition: the type's width (default NODE_WIDTH), height from its rows. */
function sizeOf(def, node = null) {
    return { width: def.width || NODE_WIDTH, height: HEADER + PAD_Y * 2 + rowsOf(def, node).length * ROW };
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

/** The default values of a node type definition: { [fieldId]: value } for fields and inputs with a value. */
function defaultValues(def, node = null) {
    const values = {};
    for (const row of rowsOf(def, node)) {
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

function drawNode(catalog, node, engine, compact = false) {
    const def = catalog.nodeTypes[node.type] || {};

    // Smaller than its rows need (a toolbar icon, appendTypePreview): draw it full size, scaled down,
    // with the ports but without text.
    const full = sizeOf(def, node);
    if (!compact && node.height < full.height - 1) {
        const scale = node.height / full.height;
        const icon  = svgEl("g", { transform: `translate(${node.x} ${node.y}) scale(${scale})` });
        icon.appendChild(drawNode(catalog, { ...node, x: 0, y: 0, width: node.width / scale, height: full.height }, engine, true));
        return icon;
    }

    const { x, y, width: w, height: h } = node;
    const style  = engine.getNodeStyle(node);
    const header = headerColor(catalog, def) || "#5B6573";
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

    rowsOf(def, node).forEach((row, i) => {
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
                fill: catalog.dataTypes[row.type]?.color || "#999999", stroke: "#1E2228", "stroke-width": 1.5,
                "data-handle-position": row.handle, cursor: "crosshair", class: "weavle-nodeeditor-port"
            }));
        }
    });

    return group;
}

// ── Theme ───────────────────────────────────────────────────

// Dark nodes with white text; links in the colour of their data type. A theme may override both.
function createTheme(catalog) {
    return {
        nodeTypes: Object.fromEntries(Object.keys(catalog.nodeTypes).map(type => [
            type, { fill: "#3A3F47", stroke: "#1E2228", textColor: "#FFFFFF", fontWeight: "600" }
        ])),
        edgeTypes: {
            link: { stroke: "#8A94A3", strokeWidth: 2.5 },
            ...Object.fromEntries(Object.entries(catalog.dataTypes).map(([type, def]) => [
                type, { stroke: def.color || "#8A94A3", strokeWidth: 2.5 }
            ]))
        }
    };
}

// ── Helpers for hosts and samples ───────────────────────────

/**
 * A node of a node-editor type with its default size and title: nodeEditorNode("and", "n1", 100, 80).
 * values: the typed-in values ({ b: "960" }); catalog: the same options as createNodeEditorDefinition
 * (for a host's own node types).
 */
export function nodeEditorNode(type, id, x, y, values = undefined, catalog = null) {
    const def  = (catalog ? createCatalog(catalog) : DEFAULT_CATALOG).nodeTypes[type] || {};
    const node = { id, type, x, y };

    // List rows: as many as the given values fill ("<list id>-1", ...), at least the type's minimum.
    if (def.list) {
        const { min, max } = listLimits(def.list);
        const prefix = `${def.list.id}-`;
        const given  = Object.keys(values || {}).filter(key => key.startsWith(prefix)).length;
        node.items = Array.from({ length: Math.min(max, Math.max(min, given)) }, (_, i) => `${prefix}${i + 1}`);
    }

    return {
        ...node,
        ...sizeOf(def, node),
        label: def.title || type,
        values: { ...defaultValues(def, node), ...(values || {}) }
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

/**
 * @param {object} [options]  the catalog (see the top of this file): nodeTypes, dataTypes, categories,
 *                            includeDefaults — objects or JSON text; allowCycles — true or data types
 */
export function createNodeEditorDefinition(options = {}) {
    const catalog  = createCatalog(options);
    const mayCycle = createCycleRule(options.allowCycles);
    const typeDef  = type => catalog.nodeTypes[type] || {};
    const rows     = node => rowsOf(typeDef(node.type), node);

    // A node's height follows its rows (list rows come and go).
    const fitHeight = node => { node.height = sizeOf(typeDef(node.type), node).height; };

    return {
        id: "nodeeditor",
        shapes: { node: (node, engine) => drawNode(catalog, node, engine) },
        defaultTheme: createTheme(catalog),
        dataTypes: catalog.dataTypes,

        /** The catalog in use (built-in tables plus the host's). */
        catalog,

        nodeTypes: Object.fromEntries(Object.entries(catalog.nodeTypes).map(([type, def]) => [
            type, { defaultLabel: def.title || type, title: def.title || type, shape: "node" }
        ])),

        palette: buildPalette(catalog),

        // The shape draws the ports (coloured by data type); no extra handles on a selected node.
        showPortHandles: false,

        getDefaultSize(type) {
            return sizeOf(typeDef(type));
        },

        // A new node starts with its default values (so editing a value starts from what is shown) and,
        // for a type with a list, its first list rows.
        onNodeCreated(node) {
            const def = typeDef(node.type);
            if (def.list && !Array.isArray(node.items)) {
                node.items = listItems(def, null).slice();
                fitHeight(node);
            }
            node.values = { ...defaultValues(def, node), ...(node.values || {}) };
        },

        // Width only: the height follows from the rows.
        getResizeRules(node) {
            const { width, height } = sizeOf(typeDef(node.type), node);
            return { minWidth: 150, maxWidth: Math.max(420, width), minHeight: height, maxHeight: height, handles: ["e", "w"] };
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
            rows(node).forEach((row, i) => {
                if (!row.handle) return;
                const isOut = row.kind === "out";
                ports[row.handle] = {
                    x:         isOut ? node.x + node.width : node.x,
                    y:         rowY(node, i),
                    side:      isOut ? "right" : "left",
                    direction: isOut ? "out" : "in",
                    dataType:  row.type,
                    label:     row.label,
                    // An input takes one link (a new one replaces it), unless it takes several.
                    ...(isOut || row.multiple ? {} : { max: 1, onFull: "replace" })
                };
            });
            return ports;
        },

        // "link": a link whose data type has no colour of its own (e.g. from an "any" output).
        defaultEdgeType: "link",

        edgeTypes: {
            link: { router: "bezier", marker: "none" },
            ...Object.fromEntries(Object.keys(catalog.dataTypes).map(type => [
                type, { router: "bezier", marker: "none" }
            ]))
        },

        // A link has the type of the data it carries (and so its colour).
        getEdgeTypeForConnection({ source, sourceHandle }, engine) {
            const type = engine.getPort(source, sourceHandle)?.dataType;
            return catalog.dataTypes[type] ? type : "link";
        },

        // Directions, data types and one link per input come from the ports; what is left: no cycles,
        // except through links whose data type is in allowCycles (those don't count as a way back either).
        canConnect({ source, target, sourceHandle, edge }, engine) {
            const dataTypeOf = (node, handle) => engine.getPort(node, handle)?.dataType;
            if (mayCycle(dataTypeOf(source, sourceHandle))) return true;

            const next = new Map();
            for (const e of engine.model.edges) {
                if (e.id === edge?.id) continue;
                const from = engine.getNode(e.sourceNodeId);
                if (from && mayCycle(dataTypeOf(from, e.sourceHandle))) continue;
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

            const list = rows(node);
            for (let i = 0; i < list.length; i++) {
                const box = valueBox(engine, node, list[i], i);
                if (!box) continue;
                if (pos.x >= box.x && pos.x <= box.x + box.width && pos.y >= box.y && pos.y <= box.y + box.height) {
                    return {
                        field: `values.${list[i].id}`,
                        box: {
                            centerX: box.x + box.width / 2, centerY: box.y + box.height / 2,
                            width: box.width, height: box.height, fontSize: FONT_SIZE, lineHeight: FONT_SIZE * 1.25
                        }
                    };
                }
            }
            return null;
        },

        getContextActions(node) {
            const actions = [];
            const def     = typeDef(node.type);

            // List rows: add one, or remove one of them (not below the minimum).
            if (def.list) {
                const items      = listItems(def, node);
                const { min, max } = listLimits(def.list);
                const name       = def.list.label || def.list.id;
                const list       = rows(node).filter(row => row.listItem);

                if (items.length < max) {
                    actions.push({ type: "neAddItem", label: `${name} toevoegen`, icon: "plus" });
                }
                if (items.length > min) {
                    actions.push({
                        type: "group", label: `${name} verwijderen`, icon: "delete",
                        children: list.map(row => {
                            const value = valueOf(node, row);
                            return { type: "neRemoveItem", itemId: row.id, label: value ? `${row.label}: ${value}` : row.label };
                        })
                    });
                }
            }

            actions.push({ type: "deleteNode", label: "Verwijderen" });
            return actions;
        },

        handleAction(action, node, engine) {
            const def = typeDef(node.type);
            if (!def.list) return false;

            switch (action.type) {
                case "neAddItem": {
                    const items = listItems(def, node);
                    if (items.length >= listLimits(def.list).max) return false;

                    const id = nextListItem(def, node);
                    node.items  = [...items, id];
                    node.values = { ...(node.values || {}), [id]: def.list.value ?? "" };
                    fitHeight(node);

                    // Type the new row's value straight away (once the node is drawn at its new height).
                    setTimeout(() => {
                        const list = rows(node);
                        const i    = list.findIndex(row => row.id === id);
                        const box  = i >= 0 && engine.getNode(node.id) ? valueBox(engine, node, list[i], i) : null;
                        if (!box || engine.state.editingLabel) return;
                        engine.startInlineLabelEdit("node", node.id, {
                            field: `values.${id}`,
                            box: {
                                centerX: box.x + box.width / 2, centerY: box.y + box.height / 2,
                                width: box.width, height: box.height, fontSize: FONT_SIZE, lineHeight: FONT_SIZE * 1.25
                            }
                        });
                    }, 0);
                    return true;
                }

                case "neRemoveItem": {
                    const items = listItems(def, node);
                    if (!items.includes(action.itemId) || items.length <= listLimits(def.list).min) return false;

                    node.items = items.filter(id => id !== action.itemId);
                    if (node.values) delete node.values[action.itemId];
                    // Its link goes with it.
                    engine.model.edges = engine.model.edges.filter(e =>
                        !(e.targetNodeId === node.id && e.targetHandle === `in-${action.itemId}`));
                    fitHeight(node);
                    return true;
                }

                default:
                    return false;
            }
        }
    };
}
