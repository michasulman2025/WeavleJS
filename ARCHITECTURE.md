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
| Themes (house style) and per-item styles | All (organisations) | Partly: style resolver, type classes, themes and per-item styles ✅ (section 7) |

### Couplings that are still on the wrong side

- `"decision"` is hard-coded in the engine (shape exception and extra obstacle margin in `getNodeObstacleBox`).
- Four ports (top, right, bottom, left) are assumed everywhere.
- Palette and default sizes are in the demo (`palette`, `getDefaultNodeSize`), not in the add-in.
- `createConnectedNode` and `startNodeCreation` use fixed sizes (140×60).
- Nodes only have a `label`, no structured data.
- Colours of selection, ports, handles, guides and edges are hard-coded in the engine (see 7.2).

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
- **Interaction:** connecting and selecting edges are off; dragging any part moves the whole diagram. Adding,
  reordering and deleting go through the node tools, the toolbar adds a category. A new diagram = problem + 6M.
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

## 7. Styling and themes (design)

Status: steps 1–3 of 7.10 are built; the rest is design. Goal: organisations can apply their house style to every diagram, and users can
mark individual nodes and edges — without visual inline styles, and with the same result on screen and in
`exportSvg()`.

### 7.1 Two needs, two mechanisms

| | House style | Emphasis |
|---|---|---|
| **Who** | The organisation (developer / OutSystems theme) | The user, while drawing |
| **Example** | "Tasks in our blue, lines in our grey, our font" | "This cause is critical: red" |
| **Scope** | All diagrams, all nodes of a type | One node or edge |
| **Stored in** | Editor options (`options.theme`), **not** in the model | The model (`node.style`, `edge.style`) |
| **Changes when the house style changes** | Yes, everywhere at once | Only if it refers to the theme (presets) |

A house style must not be stored in each model: then every new node has to be coloured by hand, and old
diagrams keep the old colours after a rebrand.

### 7.2 Today (starting point)

- Node colours: `nodeTypes[type].colors = { fill, stroke }` in the definition, set as SVG presentation attributes
  by `applyNodeStyle()`. Definitions also call `engine.getNodeColors(node.type)` for detail lines (27 places).
- Edges: `stroke="#666"`, width 1.5 (`edgeTypes[type].strokeWidth`), arrowheads as `<marker>` elements with a
  fixed colour (`#666`, selected `#eb6c4c`).
- Selection, ports, handles, guides, marquee, drop target: fixed colours in `weavle.js`, partly overridable
  through `weavle.css` (`--weavle-selection-color`, `--weavle-port-*`, `--weavle-handle-*`).
- Canvas, grid and all HTML UI (node tools, toolbar, menus, label editor): CSS custom properties in `weavle.css`.
- Gaps: no styling per node; node shapes have no type class; arrowheads don't follow a CSS line colour;
  CSS overrides don't reach `exportSvg()` (the export only keeps attributes); no single place to set a theme.

### 7.3 Style properties

One vocabulary for theme entries and per-item styles. Every property is optional.

| Property | Nodes | Edges | Notes |
|---|---|---|---|
| `fill` | ✅ | – | Shape fill |
| `stroke` | ✅ | ✅ | Outline / line colour; arrowheads follow the edge stroke |
| `strokeWidth` | ✅ | ✅ | Number (px) |
| `dash` | ✅ | ✅ | SVG dash array, e.g. `"4,3"`; `null` = solid |
| `textColor` | ✅ | ✅ | Label colour |
| `fontWeight` | ✅ | ✅ | `"normal"` \| `"bold"` (or a number) |
| `fontStyle` | ✅ | ✅ | `"normal"` \| `"italic"` |

Colours are CSS colour strings. Font family and size are theme-level only (7.4), so diagrams stay legible and
labels keep fitting their boxes (label size is part of the layout, see `getLabelLayout`).

### 7.4 The theme (`options.theme`)

```js
new WeavleJS(container, {
    theme: {
        font:  { family: "Inter, sans-serif" },             // labels; also written into the export

        node:  { stroke: "#003B70", textColor: "#0B1F33" },  // every node type
        nodeTypes: {                                         // per node type (all diagram types)
            task:    { fill: "#E6F0FA" },
            gateway: { fill: "#FFF4E0", stroke: "#B26B00" }
        },

        edge:  { stroke: "#5A6B7B", strokeWidth: 1.5 },      // every edge type
        edgeTypes: {
            messageFlow: { dash: "6,4" }
        },

        diagrams: {                                          // per diagram type (definition id), same keys
            ishikawa: { nodeTypes: { category: { fill: "#E6F0FA" } } }
        },

        presets: {                                           // named styles for node.style / edge.style
            accent:   { label: "Accent",   fill: "#E6F0FA", stroke: "#003B70" },
            warning:  { label: "Let op",   fill: "#FFF4E0", stroke: "#B26B00", textColor: "#6B4000" },
            critical: { label: "Kritiek",  fill: "#FDECEC", stroke: "#B42318", textColor: "#7A1A12", fontWeight: "bold" }
        },

        ui: {                                                // editor chrome, see 7.8
            selection: "#FF6A00", canvasBackground: "#FFFFFF", grid: "#D5DBE3", accent: "#003B70"
        }
    }
}, definition);
```

- `nodeTypes` / `edgeTypes` are keyed by type name. Names are unique within a definition but may repeat across
  definitions (e.g. `annotation`); `diagrams[id]` is for the cases where one name needs different styles per
  diagram type. One theme object can then serve every diagram type of an app (the OutSystems adapter rebuilds
  the editor per type with the same options).
- The theme is not part of the model, not part of undo and not reported in `weavle:modelchanged`.
- API: `setTheme(theme)` (re-renders, no undo step), `getTheme()`. OutSystems: `options.theme` (JSON) and
  `controller.setTheme(themeJson)`.
- Definitions may ship a default theme (`diagram.defaultTheme`, same shape) — e.g. BPMN's current colours move
  there from `nodeTypes[type].colors`. `colors` keeps working as a shorthand for `{ fill, stroke }`.

### 7.5 Per-item style (`node.style`, `edge.style`)

```js
{ id: "n7", type: "cause", label: "Te weinig planners", style: { preset: "critical" } }
{ id: "n8", type: "task",  label: "Controleren",        style: { fill: "#FDECEC", dash: "4,3" } }
```

- Stored in the model: saved, undone / redone, reported to the host, exported.
- `preset` refers to `theme.presets`; explicit properties override the preset. An unknown preset is ignored
  (the item falls back to its type's style), so a model stays valid when the theme changes.
- Recommended for organisations: presets only (`options.allowCustomStyles = false`, the default), so users
  stay within the house style. Free colours are opt-in; without it, own properties stay in the model but are
  not shown.
- API: `setNodeStyle(nodeIds, style)` (one id or an array; one undo step), `setEdgeStyle(edgeId, style)`; `null` /
  `{}` removes the style. Only `preset` and the style properties are stored. OutSystems:
  `controller.setNodeStyle(nodeIdOrJsonArray, styleJson)`, `controller.setEdgeStyle(edgeId, styleJson)`.
- Bold / italic labels are measured as such (`measureLabelText(text, size, font)`, `wrapLabel(..., font)`), so a
  bold preset wraps correctly and Ishikawa sizes its text nodes to it.

### 7.6 How a style is resolved

One engine method per item; everything that draws uses it (shapes, detail lines, labels, edges, arrowheads,
export, type previews in the toolbar):

```
engine.getNodeStyle(node)  /  engine.getEdgeStyle(edge)

  1. engine defaults                      (fill #eee, stroke #999, strokeWidth 1.5, ...)
  2. definition default                   (nodeTypes[type].colors / .style, label colour; edgeTypes[type])
  3. generic theme                        theme.node / theme.edge, then theme.diagrams[id].node / .edge
  4. the type's fixedStyle                (properties a generic theme must not change)
  5. theme per type                       theme.nodeTypes[type] / theme.edgeTypes[type], then theme.diagrams[id]'s
  6. theme.presets[item.style.preset]     (unknown presets are ignored)
  7. item.style                           (its own properties — only with options.allowCustomStyles)
```

- **Fixed properties** protect a type against the *generic* theme layers only: `theme.node.fill` must not give an
  Ishikawa cause a box (`fixedStyle: { fill: "transparent", stroke: "none" }`), and `theme.node.textColor` must
  not make the white header text of a BPMN pool or lane unreadable (`fixedStyle: { textColor: "#ffffff" }`). An
  entry for that specific type (`theme.nodeTypes.swimlane.textColor`), a preset or a node's own style may still
  change them — that is a deliberate choice for that type. The selection outline always works.
- **Selection** stays outside this chain: a selected item is drawn with `theme.ui.selection` on top of its own
  style, and the export never contains it.
- `getNodeColors(type)` stays as a deprecated wrapper (`{ fill, stroke }` of steps 1–5) for existing definitions;
  definitions move to `getNodeStyle(node)` so detail lines follow per-node styles too.
- Not cached (yet): resolving is a handful of object spreads per item; cache per render if it ever shows up.

### 7.7 Rendering, classes and export

- Resolved values are written as **presentation attributes** (as today). That keeps `exportSvg()` and arrowheads
  correct without CSS, and keeps the "no visual inline styles" rule.
- **Classes for CSS users:** node groups get `weavle-node weavle-node--{type}` and `data-node-type`; edges keep
  `weavle-edge--{type}`; styled items also get `weavle-node--preset-{name}` / `weavle-edge--preset-{name}`.
  CSS rules still win over attributes on screen, but they are **not** carried into the export; the theme is the
  recommended route for a house style, CSS for fine-tuning.
- **Arrowheads** follow the edge stroke: markers are created on demand per kind and colour (`getMarkerId(kind,
  colour)` → `weavle-arrow-<colour>`, `weavle-openArrow-<colour>`, `weavle-circle-<colour>`) in the SVG `<defs>`
  and reused. (SVG2 `context-stroke` would be
  simpler but is not supported everywhere yet.)
- **Labels:** `textColor`, `fontWeight`, `fontStyle` as attributes on the `<text>`; `theme.font.family` on the
  SVG root (and so in the export). Web fonts are not embedded in the export; the host page or document must
  provide them.

### 7.8 Editor chrome (`theme.ui`)

- `theme.ui` maps to the existing CSS custom properties, set on the container: `selection` →
  `--weavle-selection-color`, `canvasBackground` → `--weavle-canvas-bg`, `grid` → `--weavle-grid-color`,
  `accent` → `--weavle-handle-fill` / `--weavle-port-stroke` / `--weavle-ui-active-text`, `hot` →
  `--weavle-port-hot`, plus `uiFont`, `uiBackground`, `uiText`, `uiBorder` for the node tools and toolbar
  (`THEME_UI_CSS_VARS`; `applyThemeUi`, removed again by `destroy`). (Setting custom properties on the container
  is configuration, not a visual inline style on an element.)
- The colours drawn in SVG (selection, ports, handles, guides, marquee, drop target, hover glow, grid) come from
  `getUiColors()`: `theme.ui` with the old values as defaults, so attributes and CSS agree.

### 7.9 Node tools: "Stijl"

- A built-in context action `setStyle` ("Stijl", icon: a palette) with a submenu: the theme's presets (each
  shown as a small swatch of the type's real shape, like the type menus) and "Standaard" (removes `style`).
  With `allowCustomStyles`: fill / line / text colour pickers as well.
- Works on the whole selection (one undo step) and on a selected edge.
- Shown only when the theme has presets (or custom styles are allowed) and the definition allows it:
  `diagram.canStyleNode(node)` / `canStyleEdge(edge)`, default yes (Ishikawa: not for edges, which are bones).

### 7.10 Steps

Each step is usable on its own and changes nothing for existing diagrams without a theme.

1. ✅ **Resolver and classes:** `getNodeStyle` / `getEdgeStyle` (steps 1–4 of 7.6 with an empty theme), type classes,
   definitions switch from `getNodeColors` to `getNodeStyle`. No visible change.
2. ✅ **Theme:** `options.theme`, `setTheme`, `theme.diagrams`, `fixedStyle`, markers per colour, `theme.font`,
   `theme.ui`, the remaining hard-coded colours. OutSystems `setTheme`. Playground: a theme switch (default /
   sample house style).
3. ✅ **Per-item style:** `node.style` / `edge.style` with presets and `allowCustomStyles`; export check.
4. **"Stijl" in the node tools** and `canStyleNode` / `canStyleEdge`.
5. **Definition defaults:** move BPMN / flowchart / Ishikawa colours into `defaultTheme`.

### 7.11 Open questions

1. **Free colours:** presets only by default — or should users get a colour picker unless the theme forbids it?
2. **Per-diagram-type overrides:** is `theme.diagrams` needed in practice, or is one style per type name enough?
3. **Dark mode:** a second theme the host switches with `setTheme`, or `theme.dark` inside one theme?
4. **Fonts:** only the family in the theme — or also a base size (which changes how much text fits a node)?

---

## 8. Roadmap

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
- [ ] **9. Themes and per-item styles** (section 7, steps 7.10). Independent of the steps above; can be done
      at any time.

After step 5 the pedigree may come before the node editor, if it has more priority.

---

## 9. Backlog

- **Vertical pools and lanes** (header strip on top, lanes side by side).
- **Connection rules** for BPMN (roadmap step 3): no sequence flow between pools, no incoming line on a
  start event, no outgoing line on an end event, message flow only between pools.
- **Live preview while reordering lanes** (now you only see the result after releasing).
- **Nested lanes** (lanes within lanes).
- **Ishikawa hybrid mode:** drag causes and categories along their bone (offsets kept in the model).

## 10. Open questions (pedigree)

1. **Data source:** does OutSystems supply the persons and relations? Does "Add father" open a form there, or
   should editing happen in the chart itself?
2. **Viewing or editing:** is the chart mainly for navigating, or also for building the family tree?
3. **Views:** only Landscape, or also Portrait or a fan?
4. **Size:** all generations at once, or expanding step by step like FamilySearch?
