# Changelog

## Unreleased

### Added
- **Canvas toolbar** docked at the top while nothing is selected: insert any shape, pool or lane from
  grouped submenus, then click where it goes (Escape cancels). Built from the palette, or from a
  definition's `getCanvasActions()`; option `toolbar: false` turns it off.

### Fixed
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
