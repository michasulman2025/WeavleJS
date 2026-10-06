# Changelog

## Unreleased

### Added
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
  flows; flowchart: all but comment lines). Unconnected nodes are lined up after the flow. Not yet: pools and lanes.
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
