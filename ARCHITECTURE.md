# WeavleJS — architecture: engine and add-ins

WeavleJS is an engine that can draw and edit all kinds of diagrams. What a diagram type *is* — which parts
exist, what they look like, what may be connected to what and how the whole is arranged — is not in the
engine, but in an **add-in** (diagram definition).

This document records that split and is the plan for getting there step by step.

- **Now:** flowchart, BPMN and Ishikawa (fishbone).
- **Planned:** node editor (Blender style) and pedigree (family tree, like FamilySearch's Landscape view).

---

## 1. Starting point

| | Responsible for |
|---|---|
| **Engine** | A generic drawing board with a graph: nodes, ports and edges, plus all interaction (selecting, dragging, resizing, zooming/panning, snapping, undo/redo, events, API). The engine knows no "gateway" or "couple". |
| **Add-in** | A diagram language: which node and edge types exist, what they look like, which ports they have, which connections are allowed, which actions there are, and optionally how the diagram is arranged automatically. |

Rule of thumb: **if you need to name a type, it belongs in the add-in.**

---

## 2. Two ways of working

| | Free drawing | Derived |
|---|---|---|
| **Examples** | Flowchart, BPMN, node editor | Pedigree |
| **Source of truth** | The nodes and edges themselves | Domain data (persons, marriages, parent-child relations), for example from OutSystems |
| **Who creates the nodes** | The user | The add-in, via `toGraph(data)` |
| **Who decides the position** | The user (dragging, snapping, aligning) | The add-in's layout |
| **What an action does** | Changes the model directly (with undo) | Sends a request as an event, for example `weavle:action { action: "addFather", personId }`; the host handles it and supplies new data |

The engine supports both. An add-in states which mode it works in.

Ishikawa sits in between: the nodes and edges are the source of truth (as in free drawing), but the add-in
decides every position (as in derived mode).

---

## 3. Division of responsibilities

| Topic | Engine | Add-in |
|---|---|---|
| **Nodes** | Drawing, selecting, dragging, resizing, snapping, aligning, deleting | Types, shape (SVG or HTML), colours, default size, resize rules, label placement, icons |
| **Ports** | Drawing, hit testing, hover, snapping to a port | Which ports a type has: position, direction, in/out, data type, maximum number of connections |
| **Edges** | Drawing out, reconnecting, preview, selecting, labels | Edge types: line style, arrowhead, router |
| **Rules** | Asking "is this allowed?" and giving feedback (red port, refused drop with a reason) | The answer: `canConnect(...)` |
| **Routing** | The algorithms: orthogonal (A\*), elbow, bezier, straight | Picks a router and its settings per edge type |
| **Layout** | The mechanism: applying, animating, undo | Optionally a strategy (for example generations in columns) and its options |
| **Data** | Storing, undo, events, `getData()` / `load()` | Which fields a node has and how they are shown |
| **UI around nodes** | A place for node tools, context actions and overlays | Which actions exist ("add child", "add partner", ...) |
| **Palette** | – | Which types are in the palette, and in which groups |
| **Interaction** | Performs dragging, connecting, resizing and deleting | Switches them on or off per diagram type |

---

## 4. The add-in contract

### 4.1 What exists today

These are the hooks the engine uses today:

| Hook | Purpose |
|---|---|
| `id` | Name of the diagram type |
| `shapes` | SVG shape functions `(node, engine) => SVGElement` |
| `nodeTypes[type]` | `defaultLabel`, `colors`, `shape` (plus optionally `resize` and `label`) |
| `getPorts(node)` | Port positions (currently always top, right, bottom, left) |
| `routeEdge(...)` | Custom routing of an edge |
| `getRoutingConfig(edge)` | Settings for the orthogonal A\* router |
| `getContextActions(node)` | Actions in the node tools |
| `getNodeInteractionMode(node)` | `"action-rail"` or `"docked-panel"` |
| `getNodeToolRenderer` | Custom rendering of the node tools |
| `getResizeRules(node)` | `false` or `{ minWidth, minHeight, maxWidth, maxHeight, keepAspectRatio }` |
| `getLabelLayout(node)` | `{ placement: "inside" \| "below" \| "auto", padding…, widthFactor, heightFactor, fontSize, maxLines }` |
| `layoutDiagram(engine)` | Automatic layout: positions every node, on load, before every undo step and after undo/redo |
| `createInitialModel()` | What an empty diagram starts with (Ishikawa: problem + 6M) |
| `interaction` | `{ dragNodes, connect, selectEdges }` — switches interactions off per add-in |
| `canDeleteNode(node)` / `getDependentNodes(node)` | Not deletable / deleted (and dragged) along with the node |

### 4.2 Where we are heading

This is a sketch; details follow per roadmap step.

```js
export default {
    id: "flowchart",
    name: "Flowchart",
    mode: "free",                       // "free" | "derived"

    interaction: {                      // everything on by default
        dragNodes: true, resizeNodes: true, connect: true, deleteItems: true
    },

    nodeTypes: {
        terminator: {
            label: "Start / Stop",
            render: (node, api) => ...,  // SVGElement, or { html } for an HTML node
            size: { width: 140, height: 60 },
            colors: { fill: "#E8F3EC", stroke: "#1B5278" },
            ports: "sides",              // or a list, see 4.3
            resize: { minWidth: 80, minHeight: 40 },
            labelLayout: { placement: "inside" },
            fields: { }                  // data fields (see node data)
        }
    },

    edgeTypes: {
        flow: { router: "orthogonal", marker: "arrow", style: { stroke: "#666", width: 1.5 } }
    },

    rules: {
        canConnect({ source, sourcePort, target, targetPort, edgeType }) {
            // true, false, or { ok: false, reason: "..." }
        }
    },

    palette: [ { group: "Basis", types: ["process", "decision", "terminator"] } ],
    actions: (node) => [ ... ],

    layout: null,                        // or { run(graph, options), options: { orientation: "landscape" } }
    toGraph: null                        // only in mode "derived": (data) => ({ nodes, edges })
};
```

### 4.3 Port model (new)

Ports get a name and are no longer limited to the four sides:

```js
ports: [
    { id: "in-color",  side: "left",  offset: 40, direction: "in",  dataType: "color", max: 1, label: "Color" },
    { id: "out-shader", side: "right", offset: 40, direction: "out", dataType: "shader", label: "BSDF" }
]
```

- `side` and `offset` determine the position. The exit direction follows from `side`.
- `direction`, `dataType` and `max` are input for `canConnect` and for the feedback while dragging.
- `ports: "sides"` remains the short form for the current four ports.

---

## 5. What the engine needs for this

| Capability | Needed for | Status |
|---|---|---|
| Resize rules per type | All | ✅ `getResizeRules` |
| Label placement and wrapping per type | All | ✅ `getLabelLayout` |
| Interaction on/off per add-in | Pedigree, Ishikawa | ✅ `interaction` (dragging, connecting, selecting edges) |
| Actions as events (`weavle:action`) | Pedigree, integration with OutSystems | – |
| Connection rules with feedback | Flowchart, BPMN, node editor | – |
| Flexible ports (name, position, data type, maximum) | Node editor, pedigree | – |
| Edge types with router, arrowhead and style | All | ✅ `edgeTypes`, `defaultEdgeType`, `getEdgeTypeForConnection` |
| Routers: elbow, bezier, straight (besides orthogonal) | Pedigree, node editor | Partly: straight ✅ |
| HTML nodes via `foreignObject` | Pedigree, node editor | – |
| Node data (fields) and rendering from data | Pedigree, node editor | – |
| Containers (pools, lanes, groups): membership, moving along, `canContain`, `layoutContainer` | BPMN, later groups | ✅ |
| Custom add-in actions (`handleAction`) and redirected dragging (`getDragTarget`) | BPMN, pedigree | ✅ |
| Overlays on a node (for example an expandable list) | Pedigree | Partly (UI layer exists) |
| Derived mode: `toGraph(data)` | Pedigree | – |
| Layout hook with options and animation | Pedigree, Ishikawa | Partly: `layoutDiagram` ✅ (without options and animation) |
| Expanding and lazy loading via events | Pedigree | – |

### Couplings that are still on the wrong side

- `"decision"` is hard-coded in the engine (shape exception and extra obstacle margin in `getNodeObstacleBox`).
- Four ports (top, right, bottom, left) are assumed everywhere.
- Palette and default sizes are in the demo (`palette`, `getDefaultNodeSize`), not in the add-in.
- `createConnectedNode` and `startNodeCreation` use fixed sizes (140×60).
- Nodes only have a `label`, no structured data.

---

## 6. The diagram types

### Flowchart and BPMN (free drawing)

- Remain functionally as they are now, only converted to the contract.
- Get connection rules, for example:
  - No connection from end to end.
  - A start event has no incoming lines, an end event no outgoing ones.

### Ishikawa / fishbone (automatic layout)

- **Model:** a tree of nodes — problem (`effect`) → category → cause → sub-cause — with edges from child to
  parent. The order of siblings is their order in `model.nodes`.
- **Layout:** `layoutDiagram` places everything around the head: slanted main bones, alternately above and
  below the spine, in columns of two; causes as text on a horizontal line, sub-causes on a slanted twig.
  Text nodes are sized to their label.
- **Interaction:** dragging, connecting and selecting edges are off; adding, reordering and deleting go through
  the node tools, the toolbar adds a category. A new diagram = problem + 6M.
- **Later (hybrid):** manual offsets along a bone. `layoutCategory` already works relative to the bone's
  junction with the spine; a per-node offset can be added there.

### Node editor (free drawing, Blender style)

- Nodes with a header and a list of inputs (left) and outputs (right), each with a label and a data type.
  Optionally with input fields inside the node (HTML node).
- Edges as bezier curves, coloured by data type.
- Rules:
  - Data types must match.
  - An input has at most one connection; an output may have several.
  - No cycles.
- Mainly a test for the port model, the bezier router and HTML nodes.

### Pedigree (derived, FamilySearch Landscape style)

- **Domain model:** persons, marriages (couples) and parent-child relations. The diagram follows from it via `toGraph`.
- **Couple card:** one HTML node with husband and wife, marriage details, avatars, action buttons, empty slots
  ("Add spouse", "Add father/mother") and an expandable list of children ("Children", "Add child").
- **Ports per person:** on the ancestor side one port for the husband and one for the wife, each to their
  own parents. On the descendant side one port to the children.
- **Layout:** automatic, generations in columns. Ancestors to one side and descendants to the other; the
  orientation is an option ("landscape", later possibly "portrait").
- **Edges:** elbow lines with one bend between the columns, without an arrow.
- **Interaction:** dragging, free connecting and resizing are off. Actions ("addFather", "addChild",
  expanding, shifting the focus) go to the host as events.

---

## 7. Roadmap

Every step can be tested on its own and must not break what exists.

- [ ] **1. Contract and clean-up:** pin down the add-in contract, move the palette and default sizes from the
      demo to the add-in, and remove the `decision` exceptions from the engine.
- [ ] **2. Interaction per add-in and actions as events** (`interaction` ✅, `weavle:action`).
- [ ] **3. Connection rules:** `canConnect` with feedback while dragging. First rules for BPMN and flowchart.
- [ ] **4. Flexible ports and edge types:** the port model from 4.3, `edgeTypes`, and the routers
      elbow, bezier and straight.
- [ ] **5. HTML nodes** via `foreignObject`.
- [ ] **6. Node editor add-in.**
- [ ] **7. Derived mode and layout:** `toGraph`, layout hook with options and animation, expanding and lazy loading.
- [ ] **8. Pedigree add-in.**

After step 5 the pedigree may come before the node editor, if it has more priority.

---

## 8. Backlog

- **Vertical pools and lanes** (header strip on top, lanes side by side).
- **Connection rules** for BPMN (roadmap step 3): no sequence flow between pools, no incoming line on a
  start event, no outgoing line on an end event, message flow only between pools.
- **Live preview while reordering lanes** (now you only see the result after releasing).
- **Nested lanes** (lanes within lanes).
- **Ishikawa hybrid mode:** drag causes and categories along their bone (offsets kept in the model).

## 9. Open questions (pedigree)

1. **Data source:** does OutSystems supply the persons and relations? Does "Add father" open a form there, or
   should editing happen in the chart itself?
2. **Viewing or editing:** is the chart mainly for navigating, or also for building the family tree?
3. **Views:** only Landscape, or also Portrait or a fan?
4. **Size:** all generations at once, or expanding step by step like FamilySearch?
