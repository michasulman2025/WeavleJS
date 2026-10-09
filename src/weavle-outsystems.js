/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — OutSystems adapter.

  A thin layer that speaks the language of a low-code host: models go in and out as JSON text,
  events become plain callbacks, and the editor instance is found back by its container id.

      const weavle = Weavle.mount("WeavleHost", {
          diagramType: "bpmn",
          model: modelJson,                     // JSON text (or an object)
          options: { snapToGrid: true },        // object or JSON text
          onModelChanged:     json => ...,      // JSON text of the whole model
          onSelectionChanged: (nodeId, edgeId, selectedNodeIdsJson) => ...
      });

      Weavle.getInstance("WeavleHost").setModel(modelJson);   // e.g. in OnParametersChanged
                                                              // (a model of another diagramType switches type)
      Weavle.getInstance("WeavleHost").setDiagramType("flowchart");  // start an empty diagram of another type
      Weavle.getInstance("WeavleHost").destroy();             // in OnDestroy

  Echo protection: when the editor reports a change, the host app typically stores the JSON and
  hands it straight back as an input parameter. setModel() recognises its own model (also when the
  host re-serialised it with another key order) and skips the reload, so undo history and the
  selection survive.

  Models describe themselves: the reported JSON is { diagramType, nodes, edges }. Models without
  diagramType (older data) use the type given to mount().
*/

import { WeavleJS } from "./weavle.js";
import { createBpmnDefinition } from "./weavle-bpmn.js";
import { createFlowchartDefinition } from "./weavle-flowchart.js";

const DIAGRAM_TYPES = {
    bpmn:      createBpmnDefinition,
    flowchart: createFlowchartDefinition
};

const EMPTY_MODEL = { nodes: [], edges: [] };

/** Makes an extra diagram type available to mount(): registerDiagramType("pedigree", createPedigreeDefinition). */
export function registerDiagramType(name, createDefinition) {
    DIAGRAM_TYPES[name] = createDefinition;
}

/** Names of the diagram types mount() knows. */
export function getDiagramTypes() {
    return Object.keys(DIAGRAM_TYPES);
}

/** The controller mounted on this container (element, id or selector), or null. */
export function getInstance(container) {
    return resolveContainer(container)?._weavle || null;
}

/**
 * Creates an editor in the container and returns its controller (also stored as container._weavle,
 * so getInstance() finds it again). Mounting twice on the same container replaces the old editor.
 *
 * config:
 *   diagramType         "bpmn" | "flowchart" | a registered name | a definition factory function
 *                       (the type for models without their own diagramType)
 *   model               JSON text or { diagramType?, nodes, edges } (default: empty)
 *   options             editor options, object or JSON text (snapToGrid, readOnly, gridType, ...)
 *   onModelChanged      (modelJson) => void       — after every change (add, move, connect, undo, ...)
 *   onSelectionChanged  (nodeId, edgeId, selectedNodeIdsJson) => void — ids are "" when nothing is selected
 *   onNodeMoved         (nodeJson) => void
 *   onNodeResized       (nodeJson) => void
 *   onToolbarMoved      (x, y) => void          — a floating toolbar was dragged (e.g. to remember the spot)
 *
 * Models describe themselves: the JSON the editor reports carries "diagramType", and setModel() with a
 * model of another type rebuilds the editor for that type (same container, callbacks and options).
 */
export function mount(container, config = {}) {
    const host = resolveContainer(container);
    if (!host) throw new Error(`Weavle.mount: container "${container}" not found`);

    host._weavle?.destroy();

    // A factory function passed directly has no registered name: models then carry "custom".
    const defaultType = typeof config.diagramType === "function" ? "custom" : (config.diagramType || "bpmn");

    const resolveType = (type) => {
        const create = type === "custom" && typeof config.diagramType === "function"
            ? config.diagramType
            : DIAGRAM_TYPES[type];
        if (!create) {
            throw new Error(`Weavle: unknown diagram type "${type}" (known: ${getDiagramTypes().join(", ")})`);
        }
        return create;
    };

    // Kept across rebuilds; setReadOnly / setLayoutDirection update it too.
    const editorOptions = { ...(parseJson(config.options) || {}) };

    let diagramType = defaultType;
    let editor = new WeavleJS(host, { ...editorOptions }, resolveType(diagramType)());

    // Canonical JSON of the model the editor and the host app last agreed on (see setModel).
    let lastModel = null;

    // The model as the host sees it: the editor's data with its diagram type.
    const typed = (data) => ({ diagramType, ...data });

    const listeners = {
        "weavle:modelchanged": e => {
            const model = typed(e.detail.model);
            lastModel = canonical(model);
            config.onModelChanged?.(JSON.stringify(model));
        },
        "weavle:selectionchanged": e => {
            config.onSelectionChanged?.(
                e.detail.primarySelectedNodeId || "",
                e.detail.selectedEdgeId || "",
                JSON.stringify(e.detail.selectedNodeIds || [])
            );
        },
        "weavle:nodemoved":   e => config.onNodeMoved?.(JSON.stringify(e.detail.node)),
        "weavle:noderesized": e => config.onNodeResized?.(JSON.stringify(e.detail.node)),
        "weavle:toolbarmoved": e => {
            editorOptions.toolbarFloatingPosition = { x: e.detail.x, y: e.detail.y };
            config.onToolbarMoved?.(e.detail.x, e.detail.y);
        }
    };

    // On the container, so they keep working when the editor is rebuilt for another type.
    for (const [name, fn] of Object.entries(listeners)) host.addEventListener(name, fn);

    const emitChange = () => editor.emit("weavle:modelchanged", { model: editor.getData() });

    /** Replaces the editor by one for another diagram type (empty; the selection is gone). */
    const rebuild = (type) => {
        const create = resolveType(type);   // throws before anything is torn down
        editor.destroy();
        diagramType = type;
        editor = new WeavleJS(host, { ...editorOptions }, create());
        config.onSelectionChanged?.("", "", "[]");
    };

    /** Loads plain { nodes, edges } into the editor (the diagramType field stays with the adapter). */
    const load = (data) => {
        const { diagramType: _type, ...plain } = data;
        editor.load(JSON.parse(JSON.stringify({ ...EMPTY_MODEL, ...plain })));
    };

    const controller = {
        /** The underlying WeavleJS instance, for anything the controller doesn't cover. */
        get editor() { return editor; },

        /**
         * Loads a model (JSON text or object). A model with another diagramType rebuilds the editor
         * for that type; a model without one uses the type given to mount(). Returns false and does
         * nothing when it is the model the editor itself last reported — the usual
         * "event → store → parameter" round trip.
         */
        setModel(model) {
            const data = (typeof model === "string" ? parseJson(model) : model) || EMPTY_MODEL;
            const type = data.diagramType || defaultType;
            const key  = canonical({ ...data, diagramType: type });

            if (key === lastModel) return false;

            if (type !== diagramType) rebuild(type);

            lastModel = key;
            load(data);
            return true;
        },

        /** The current model as JSON text (with its diagramType). */
        getModel() {
            return JSON.stringify(typed(editor.getData()));
        },

        /** The current diagram type name ("bpmn", "flowchart", ...). */
        getDiagramType() {
            return diagramType;
        },

        /**
         * Switches to another diagram type with an empty model (or the given one) and reports the
         * new model through onModelChanged. Returns false if it already is that type and no model
         * was given.
         */
        setDiagramType(type, model) {
            if (type === diagramType && model == null) return false;

            const data = (typeof model === "string" ? parseJson(model) : model) || EMPTY_MODEL;
            if (type !== diagramType) rebuild(type);

            load(data);
            emitChange();
            return true;
        },

        undo()  { editor.undo(); },
        redo()  { editor.redo(); },
        clear() { editor.clear(); },

        /** Re-picks ports and re-routes edges; nodeIdsJson (optional) = JSON array limiting it to those nodes. */
        optimizeEdges(nodeIdsJson) {
            return editor.optimizeEdges({ nodeIds: parseIds(nodeIdsJson) });
        },

        /** Lays out the flow in layers and re-routes the edges; nodeIdsJson (optional) limits it to those nodes. */
        optimizeLayout(nodeIdsJson) {
            return editor.optimizeLayout({ nodeIds: parseIds(nodeIdsJson) });
        },

        /** "LR" or "TB": flow direction for the tidy-up functions. */
        setLayoutDirection(direction) {
            editor.setLayoutDirection(direction);
            editorOptions.layoutDirection = editor.options.layoutDirection;
        },

        /** Canvas toolbar placement: "top", "left", "right" or "floating" (draggable). */
        setToolbarPosition(position) {
            editorOptions.toolbarPosition = position;
            editor.setToolbarPosition(position);
        },

        setReadOnly(readOnly) {
            const value = !!readOnly;
            editorOptions.readOnly = value;
            if (editor.options.readOnly === value) return;

            editor.options.readOnly = value;
            editor.clearSelection?.();
            editor.clearNodeToolSurface();
            editor.render();
        },

        /** Adds a node of `type` on a free spot in view; returns its id. */
        addNode(type, label) {
            const id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            editor.addNode({ id, type, label: label ?? editor.getDefaultLabelForType(type) });
            return id;
        },

        /** Changes a node's label (one undo step). */
        setNodeLabel(nodeId, label) {
            const node = editor.getNode(nodeId);
            if (!node || node.label === label) return false;

            node.label = label;
            editor.pushHistory();
            editor.render();
            emitChange();
            return true;
        },

        /** Selects a node (or clears the selection with an empty id). */
        selectNode(nodeId) {
            if (nodeId && editor.getNode(nodeId)) {
                editor.selectSingleNode(nodeId);
                editor.renderNodeToolSurface(editor.getNode(nodeId));
            } else {
                editor.clearSelection?.();
                editor.clearNodeToolSurface();
            }
            editor.render();
            editor.emitSelectionChanged();
        },

        destroy() {
            for (const [name, fn] of Object.entries(listeners)) host.removeEventListener(name, fn);
            editor.destroy();
            if (host._weavle === controller) delete host._weavle;
        }
    };

    host._weavle = controller;
    controller.setModel(config.model ?? EMPTY_MODEL);

    return controller;
}

/** A JSON array of ids (text or array) → array, or null when empty. */
function parseIds(value) {
    const ids = value ? (typeof value === "string" ? JSON.parse(value) : value) : null;
    return ids && ids.length ? ids : null;
}

function resolveContainer(container) {
    if (!container) return null;
    if (typeof container !== "string") return container;
    return document.getElementById(container) || document.querySelector(container);
}

function parseJson(value) {
    if (typeof value !== "string") return value ?? null;
    return value.trim() ? JSON.parse(value) : null;
}

/** JSON with sorted keys, so two serialisations of the same model compare equal. */
function canonical(value) {
    return JSON.stringify(value, (key, v) =>
        v && typeof v === "object" && !Array.isArray(v)
            ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]]))
            : v
    );
}
