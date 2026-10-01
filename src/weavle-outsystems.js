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
      Weavle.getInstance("WeavleHost").destroy();             // in OnDestroy

  Echo protection: when the editor reports a change, the host app typically stores the JSON and
  hands it straight back as an input parameter. setModel() recognises its own model (also when the
  host re-serialised it with another key order) and skips the reload, so undo history and the
  selection survive.
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
 *   model               JSON text or { nodes, edges } (default: empty)
 *   options             editor options, object or JSON text (snapToGrid, readOnly, gridType, ...)
 *   onModelChanged      (modelJson) => void       — after every change (add, move, connect, undo, ...)
 *   onSelectionChanged  (nodeId, edgeId, selectedNodeIdsJson) => void — ids are "" when nothing is selected
 *   onNodeMoved         (nodeJson) => void
 *   onNodeResized       (nodeJson) => void
 */
export function mount(container, config = {}) {
    const host = resolveContainer(container);
    if (!host) throw new Error(`Weavle.mount: container "${container}" not found`);

    host._weavle?.destroy();

    const createDefinition = typeof config.diagramType === "function"
        ? config.diagramType
        : DIAGRAM_TYPES[config.diagramType || "bpmn"];

    if (!createDefinition) {
        throw new Error(`Weavle.mount: unknown diagram type "${config.diagramType}" (known: ${getDiagramTypes().join(", ")})`);
    }

    const editor = new WeavleJS(host, parseJson(config.options) || {}, createDefinition());

    // Canonical JSON of the model the editor and the host app last agreed on (see setModel).
    let lastModel = null;

    const listeners = {
        "weavle:modelchanged": e => {
            const json = JSON.stringify(e.detail.model);
            lastModel  = canonical(e.detail.model);
            config.onModelChanged?.(json);
        },
        "weavle:selectionchanged": e => {
            config.onSelectionChanged?.(
                e.detail.primarySelectedNodeId || "",
                e.detail.selectedEdgeId || "",
                JSON.stringify(e.detail.selectedNodeIds || [])
            );
        },
        "weavle:nodemoved":   e => config.onNodeMoved?.(JSON.stringify(e.detail.node)),
        "weavle:noderesized": e => config.onNodeResized?.(JSON.stringify(e.detail.node))
    };

    for (const [name, fn] of Object.entries(listeners)) host.addEventListener(name, fn);

    const emitChange = () => editor.emit("weavle:modelchanged", { model: editor.getData() });

    const controller = {
        /** The underlying WeavleJS instance, for anything the controller doesn't cover. */
        editor,

        /**
         * Loads a model (JSON text or object). Returns false and does nothing when it is the model
         * the editor itself last reported — the usual "event → store → parameter" round trip.
         */
        setModel(model) {
            const data = (typeof model === "string" ? parseJson(model) : model) || EMPTY_MODEL;
            const key  = canonical(data);

            if (key === lastModel) return false;

            lastModel = key;
            editor.load(JSON.parse(JSON.stringify(data)));
            return true;
        },

        /** The current model as JSON text. */
        getModel() {
            return JSON.stringify(editor.getData());
        },

        undo()  { editor.undo(); },
        redo()  { editor.redo(); },
        clear() { editor.clear(); },

        setReadOnly(readOnly) {
            const value = !!readOnly;
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
