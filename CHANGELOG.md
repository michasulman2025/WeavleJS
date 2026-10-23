# Changelog

## Unreleased

### Added
- **Style variants** (ARCHITECTURE.md 7.4 / 7.6): a definition can derive a variant per node from the diagram's
  structure (`getNodeVariant(node, engine)`), styled by `nodeVariants` in its default theme and in `options.theme`
  (also per diagram), between the per-type layers and presets; class `weavle-node--variant-{name}`. Org chart: the
  top (a person without a manager) is dark blue with white text, managers (a person with reports) get a light blue
  tint, everyone else stays a white card; it follows changes by itself. The sample house style colours them navy /
  warm.
- **Org chart, step 2**: drag a card onto another card to make that its manager (the target is highlighted; with
  Alt it adds a dotted line instead; dropped elsewhere the card goes back). Collapse / expand a team ("+n" on the
  card). Assistants beside the line under their manager (node tool "Assistent maken", or "Medewerker toevoegen" →
  "Assistent"). Dotted-line (matrix) reporting: "Stippellijn toevoegen" then click the other card, "Stippellijn
  verwijderen". The flat list gains `assistant` and `dottedManagerIds`; new events `weavle:orgchart:dottedlineadded`
  / `dottedlineremoved { nodeId, managerId }`. The sample has an assistant and a dotted line.
- Engine hooks: `diagram.isNodeHidden(node, engine)`, `diagram.getDropTarget(...)` + `diagram.onNodeDrop(...)`,
  `edgeTypes[type].fixed` (type kept instead of re-derived), `engine.startNodePick({ filter, onPick, onCancel })` /
  `cancelNodePick()`; action icons `collapse`, `expand`, `dottedLine`.
- Build: the first line of `dist/weavle.iife.js` and `dist/weavle.es.js` now carries the version and build time
  (`/*! WeavleJS v0.9.0 | built 2026-10-23 14:23 UTC | ... */`).
- **Org chart (organogram) diagram type** (`createOrgChartDefinition()` in `src/weavle-orgchart.js`, OutSystems
  `diagramType: "orgchart"`): cards with name and job title, and vacancies (dashed), in a reporting tree laid out
  automatically top-down; teams without sub-teams (three or more people) are stacked below their manager. Node tools:
  add a report or colleague, edit the job title, vacancy ↔ person, insert a manager above, one level higher, reorder,
  remove only this person (the team moves up) or with the team. Flat list in / out: `orgChartFromList()` /
  `orgChartToList()`, OutSystems `setModelFromList(listJson)` (with echo protection), `getList()` and
  `onListChanged(listJson)`. Manager changes dispatch `weavle:orgchart:managerchanged`. Playground: "Organogram"
  with a sample (`src/samples/orgchart-acme.js`).
- Engine: label layouts take `offsetX` / `offsetY` (shift of an inside label); `startInlineLabelEdit(type, id,
  { field, box })` edits another text property of a node; action icons `edit` and `moveUpLevel`.
- **Diagram-specific events**: `engine.emitDiagramEvent(name, payload)` for definitions dispatches
  `weavle:<definition id>:<name>` (e.g. `weavle:orgchart:managerchanged`) plus the generic `weavle:diagramevent`,
  detail `{ diagramType, name, ...payload }`. Core events keep their generic names. OutSystems: callback
  `onDiagramEvent(name, detailJson)`. The playground no longer listens to the never-emitted `edgecreated`,
  `edgereconnected` and `labelchanged`, and now logs `toolbarmoved` and diagram events.
- **Fault tree (FTA, foutenboom) diagram type** (`createFtaDefinition()` in `src/weavle-fta.js`, OutSystems
  `diagramType: "fta"`): top event → gates → events, stored as nodes with child → parent edges and laid out
  automatically top-down (tidy tree; the lines from a gate's inputs meet in a shared bus). Gates: OR, AND, XOR,
  priority AND, k-out-of-n (threshold `node.k`, shown as "k/n") and inhibit (with a condition beside it). Events:
  top, intermediate (box), basic (circle), undeveloped (diamond), house and transfer (label below the symbol).
  Node tools: add / change a gate, add causes or a neighbour, change an event's type, set k, move left / right,
  delete (takes everything below along; the top event can't be deleted). Dragging any part moves the whole tree.
  A new diagram starts with a top event, an OR gate and two basic events. Playground: "Foutenboom (FTA)" with a
  sample (`src/samples/fta-datacenter-outage.js`). New action icons `moveLeft`, `moveRight`.
- **Definition default themes, styles step 5** (ARCHITECTURE.md 7.4): flowchart, BPMN and Ishikawa keep their
  colours in `diagram.defaultTheme` (same shape as a theme) instead of `nodeTypes[type].colors` — one readable
  table per diagram type. `getDefaultTheme()` (OutSystems `controller.getDefaultTheme()`, JSON) returns it as a
  starting point for a house style; `getPresets()` merges definition and theme presets. `colors` still works for
  custom definitions. No visible change: exports and toolbar icons of all samples, with and without the sample
  theme, are identical.
- **"Stijl" in the node tools, styles step 4** (ARCHITECTURE.md 7.9): a built-in tool with "Standaard" and the
  theme's presets, each with a swatch of how the node would look (fill, line, "Aa" in the text colour); with
  `options.allowCustomStyles` also colour inputs for fill, line and text. Applies to the whole selection (one
  undo step). Shown when the theme has presets or custom styles are allowed, unless `diagram.canStyleNode(node)`
  returns false. Submenus support colour-input children (`{ input: "color", property, value }`). Playground:
  "Custom styles" checkbox.
- **Per-item styles, styles step 3** (ARCHITECTURE.md 7.5): `node.style` / `edge.style` in the model —
  `{ preset: "critical" }` refers to `theme.presets` (unknown presets are ignored), own properties only show with
  `options.allowCustomStyles` (default: presets only). `setNodeStyle(nodeIds, style)` / `setEdgeStyle(edgeId,
  style)` (one undo step; `null` removes); OutSystems `controller.setNodeStyle` / `setEdgeStyle`. Styled items get
  `weavle-node--preset-{name}` / `weavle-edge--preset-{name}`. Bold / italic labels are measured as such. The
  sample house style has presets (Accent, Let op, Kritiek, Gedempt); the Ishikawa sample uses two of them.
- **Themes (house style), styles step 2** (ARCHITECTURE.md 7.4): `options.theme`, `setTheme(theme)`, `getTheme()`.
  A theme sets node / edge styles for every type (`node`, `edge`), per type (`nodeTypes`, `edgeTypes`) and per
  diagram type (`diagrams[id]`), the label font (`font.family`) and the editor colours (`ui`: selection, accent,
  hot, canvasBackground, grid, uiFont / uiBackground / uiText / uiBorder → the CSS custom properties, set on the
  container). Types protect properties against the generic layers with `fixedStyle` (BPMN pool / lane header
  text, Ishikawa causes). Arrowheads now follow the line colour (markers per colour, `getMarkerId`); every colour
  the engine drew in SVG comes from the theme with the old values as defaults. Works in `exportSvg()`.
  OutSystems: `options.theme`, `controller.setTheme(themeJson)` (kept across type switches). Playground: "Theme"
  select with a sample house style (`src/samples/theme-house-style.js`). Without a theme nothing changes (exports
  identical apart from marker ids).
- **Styles, step 1** (ARCHITECTURE.md section 7): one place decides how a node or edge looks —
  `getNodeStyle(node)` / `getEdgeStyle(edge)` (fill, stroke, strokeWidth, dash, textColor, fontWeight, fontStyle;
  engine defaults → the definition's `colors` / `style` / label colour, `edgeTypes[type]`). Shapes, detail
  lines, labels, edges and type previews use it; flowchart, BPMN and Ishikawa switched from `getNodeColors`
  (now a deprecated wrapper). Node groups get `weavle-node weavle-node--{type}` and `data-node-type` for CSS.
  Edge types may set `stroke`. No visible change: exports of all three samples are identical apart from the
  new classes.
- **Ishikawa (visgraat) diagram type** (`createIshikawaDefinition()` in `src/weavle-ishikawa.js`, OutSystems
  `diagramType: "ishikawa"`): problem (head) → categories (slanted main bones, alternately above / below the
  spine) → causes (horizontal lines) → sub-causes (twigs), stored as nodes with child → parent edges. Laid out
  automatically on every change; a new diagram starts with the 6M categories (Mens, Machine, Methode, Materiaal,
  Meting, Milieu). Node tools: add child / sibling, reorder (sibling order = model order), delete (takes the
  causes along; the problem can't be deleted). Dragging any part moves the whole diagram. Playground: diagram
  type "Ishikawa (visgraat)" with a sample, and a "New" button (empty diagram of the current type).
- Engine hooks for diagram types that arrange themselves: `layoutDiagram(engine)` (run on load, before every
  undo step and after undo / redo; `applyDiagramLayout()`), `createInitialModel()` (what `load` of an empty
  model and `clear()` start with), `interaction: { dragNodes, connect, selectEdges }` (`getInteraction()`),
  `canDeleteNode(node)`, `getDependentNodes(node)` (deleted / dragged along, like contents of a container).
  `handleCanvasAction` returning `true` gets an undo step and a change event. Edge types may set
  `strokeWidth`. New action icons `branch`, `moveUp`, `moveDown`.
- `embed-test.html`: test page for keyboard scope, `fitToContent` / `setCanvasSize` and `exportSvg`
  (linked from the playground, included in `npm run build:demo`).
- **Embedding in documents** (first user: ScrivleJS, the rich text editor): `fitToContent({ padding, maxZoom,
  minZoom })` zooms and pans so the whole diagram is in view; `getContentBounds()` returns what is drawn;
  `setCanvasSize(width, height)` lets the canvas follow its host element; `exportSvg({ padding, background })`
  returns a standalone, cropped SVG without grid, selection, handles or UI (colours are presentation attributes,
  the label font is carried over). OutSystems controller: `setCanvasSize`, `fitToContent`, `exportSvg`.

### Changed
- **Keyboard shortcuts follow focus** (`options.keyboardScope`, default `"focus"`): Delete, Escape and
  Ctrl+Z / Y only act on the editor that has focus. The container becomes focusable (`tabindex="0"` unless it
  has one, `data-weavle-host`) and takes focus on a press inside it. Fixes several editors on one page reacting
  to the same key, and keys being lost inside a contenteditable host. `"global"` restores the old behaviour.
  Focus ring only for keyboard focus (`:focus-visible`, `--weavle-selection-color`).
- **Flow optimaliseren with pools and lanes**: every pool is laid out on its own; its lanes are bands —
  the layers run through all lanes, every node stays in its lane (`computeGroupedLayout` in weavle-layout.js),
  lanes get the height their contents need (at least their minimum), the pool fits around them, and the pools
  are stacked with `poolGap` between them, equally long. Satellites (annotations, data) join the lane of their
  anchor. Padding inside containers via `getLayoutConfig().getContainerPadding(container)`.
- **Toolbar position**: `options.toolbarPosition` `"top"` (default) | `"left"` | `"right"` (vertical strip) |
  `"floating"` (dragged by a grip, kept inside the visible area; start spot `options.toolbarFloatingPosition`,
  event `weavle:toolbarmoved { x, y }`). `setToolbarPosition()` switches at runtime; submenus open beside a
  vertical toolbar. OutSystems: `controller.setToolbarPosition()`, callback `onToolbarMoved(x, y)`, block input
  `ToolbarPosition` in the guide. Playground: "Toolbar" select.
- **OutSystems: self-describing models.** The JSON from `onModelChanged` / `getModel()` now carries
  `diagramType`; `setModel()` with a model of another type rebuilds the editor for that type in the same
  container (callbacks and options kept), so one block can show BPMN and flowchart records. Models without
  `diagramType` use the mount type. New controller methods `getDiagramType()`, `setDiagramType(type, model?)`;
  `controller.editor` is now a getter (follows the rebuilt editor). `example.html` has buttons to load a
  flowchart / BPMN record.
- **Flow optimaliseren** (toolbar button, `optimizeLayout({ nodeIds? })`, OutSystems
  `controller.optimizeLayout(nodeIdsJson)`): layered layout (new `src/weavle-layout.js`, no dependencies) —
  loops left out, longest-path layers, barycenter crossing reduction, straight main lines (branches
  symmetric around a split, joins back on it), components stacked; then all edges are optimised.
  Settings via `getLayoutConfig()`: `direction`, `layerGap`, `nodeGap`, `isFlowEdge(edge)` (BPMN: sequence
  flows; flowchart: all but comment lines). Unconnected nodes are lined up after the flow.
- Flow layout places **satellites** (annotations, data objects, stores, comments) beside the node(s) they
  belong to: on the side from `getLayoutConfig().getSatelliteSide(node)` (BPMN: annotations above, data
  below; flowchart: right / below), centred between several anchors, on the cheapest free spot (other
  side, further out, shifted along the flow). **Boundary events** stay on their host and their outgoing
  flows count as side branches: the exception path is laid out after the host, below the main line
  (layout edges may be `secondary`).
- **Lijnen optimaliseren** (toolbar button, `optimizeEdges({ nodeIds?, edgeIds? })`, OutSystems
  `controller.optimizeEdges(nodeIdsJson)`): nodes stay put; every edge gets the best port pair and route,
  scored on length, bends, crossings, overlap with other edges, shared ports and going against the flow.
  Short edges first, then a second pass; A* avoids cells other edges already use. Manual routes are
  replaced. One undo step. `options.tidyTools: false` hides the button.
- Flow direction: `options.layoutDirection` ("LR" | "TB"), `setLayoutDirection()`, definition hook
  `getLayoutConfig()` (BPMN "LR"; flowchart "TB", `createFlowchartDefinition({ direction })`).
  Playground: "Flow direction" select.
- **Canvas toolbar** docked at the top while nothing is selected: insert any shape, pool or lane from
  grouped submenus, then click where it goes (Escape cancels). Built from the palette, or from a
  definition's `getCanvasActions()`; option `toolbar: false` turns it off.

- **Flowchart** uses the same node tools as BPMN: floating next to the node, with "Type wijzigen"
  and one "... toevoegen" submenu per shape group.
- **All standard flowchart shapes** (ISO 5807), 26 in five groups: Basis (terminator, process, decision,
  subprocess, preparation, loop limit, delay), Invoer & uitvoer (input/output, manual input, display,
  document, multiple documents), Opslag (database, stored data, internal storage, direct access storage),
  Bewerkingen (manual operation, merge, extract, sort, collate, summing junction, or) and Verbinders &
  opmerkingen (on-page connector, off-page connector, comment). Small symbols label below the shape;
  a comment is linked with a dashed line without an arrow (edge type `comment`, flow lines are `flow`).
- **Drop a node onto an edge** to insert it into the flow: while dragging a free node (no edges, or one
  edge to another node) with its centre over an edge, the edge is drawn as the two halves it will become,
  exactly as they will look after the release; on release A → B becomes A → node → B. Only where both
  halves keep the edge's type (an annotation or data object never splits a flow); definitions can narrow it
  with `canSplitEdge(edge, node, engine)`. The halves carry `.weavle-edge--split-preview` for custom styling.
  Works the same when placing a new node from the toolbar; the ghost then centres on the edge segment.
- **"Losmaken"** in the node tools (flowchart and BPMN, when the node has edges): built-in action
  `detachNode` removes the node's edges and, if it sat between one incoming and one outgoing edge,
  reconnects A → B — the reverse of dropping it onto an edge. Icon "detach".
- The node tools are rebuilt after every model change, so they never offer stale actions.
- Submenus can hold section headings (`{ type: "heading", label }` children), used to group "Type wijzigen".
- `nodeTypes[type].title`: the name in menus and the toolbar when the default label is not a good name
  (connector "A" → "On-page verbinder"); `getTypeTitle(type)`.

### Fixed
- Changing a node's type re-derives the type of its edges (e.g. a flow line becomes a comment line).
- Label editing: a click anywhere on the canvas ends the edit and keeps the text; unchanged text adds no
  undo step. Typing reaches the editor right after a double-click (the focus was taken back by the canvas).
- Placing a node (`startNodeCreation`): the ghost now follows the mouse, a click on the canvas no longer
  starts a marquee, and the placed node gets its node tools.

## 0.9.0 — 2026-10-02

### Added
- **OutSystems integration** — single-file build `dist/weavle.iife.js` (global `Weavle`), `dist/weavle.es.js`
  and `dist/weavle.css` (`npm run build`). Adapter `Weavle.mount` / `getInstance` with JSON in and out, a
  controller (setModel, getModel, undo, redo, setReadOnly, addNode, setNodeLabel, selectNode, destroy) and echo
  protection for the event → screen variable → block input round trip. Guide and simulation in
  `wrappers/outsystems/`.
- **BPMN** — all common events and activities, "change type", boundary events, pools and lanes as containers
  (stacking, proportional resizing, reordering), message flows, associations, complex sample.
- **Styling** — `weavle.css` with custom properties and classes; no visual inline styles. Compact node tools
  with submenus.

### Changed
- Console diagnostics are off unless `options.debug` is set.
- `npm run build` builds the library; the playground build moved to `npm run build:demo`.

## 0.8.0 — 2026-10-01

First public release.

### Added
- **Edge types** — `edgeTypes`, `defaultEdgeType` and `getEdgeTypeForConnection` in diagram definitions;
  orthogonal and straight routers; filled, open and no arrowheads; dash patterns.
  BPMN: sequence flow, association (annotations) and data association (data objects / stores).
- **Node resizing** — corner handles, Shift keeps the ratio, Alt resizes from the centre, Escape cancels.
  Per-type rules via `getResizeRules`. New `setNodeSize()` API and `weavle:noderesized` event.
- **Label wrapping** — labels wrap to the node size, overflow ends in "…" with a tooltip, explicit line breaks
  are kept. Per-type layout via `getLabelLayout` (`inside`, `below`, `auto`). Multi-line inline editing.
- **Grid** — CSS-stylable dot / line grid (`gridType`, `--weavle-grid-*` custom properties).
- **Smart placement** — `addNode()` without x/y finds a free spot in the visible area; "add connected node"
  fans out to free spots with a working route.
- **`destroy()`** — removes all listeners and DOM, for frameworks that rebuild screens (e.g. OutSystems).
- **Vite dev setup** with a playground (`npm run dev`).

### Fixed
- Loop-back edges routed through their own source / target node.
- Edges froze as "manual" after a single failed route.
- A* routes rejected after endpoint normalization near decisions (edges jumping while dragging).
- Connection / reconnect previews showed a different route than the edge drawn on release.
- Nodes of different sizes could never line up: snap-to-grid now snaps node centres.
- Group drag ignored the grid; palette nodes weren't undoable; a plain click created an undo step.

### Changed
- Debug overlays (routing grid, route point markers) are off by default.

## 0.7.5

Starting point of this repository: engine, flowchart and BPMN definitions, demo playground.
