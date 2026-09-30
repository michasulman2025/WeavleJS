# WeavleJS

WeavleJS is a browser-only SVG diagram editor library in vanilla JavaScript (ES modules, no dependencies).
A generic engine manages nodes and edges; swappable diagram definitions decide which shapes, ports,
routing and interactions exist. It is embedded in OutSystems apps; the demo playground is for local debugging.

This folder (`C:\dev\Weavle\WeavleJS`, engine v0.7.5) is the current codebase. The files one level up
(`../waevle.js`, `../weavleflowchart.js`, v0.6.5, global-script style) are an older version — don't edit them.

## Commands

- `npm run dev` — Vite dev server with the playground at http://localhost:5173 (hot reload).
- `npm run build` — production build of the playground into `dist/`.

## Files

- `src/weavle.js` — the engine, `export class WeavleJS` (~4900 lines).
- `src/weavle-flowchart.js` — `export function createFlowchartDefinition()`.
- `src/weavle-bpmn.js` — `export function createBpmnDefinition()`.
- `index.html`, `src/demo.js`, `src/style.css` — the playground (diagram type switch, shape buttons,
  event log, selection info, model JSON).

## Architecture (class WeavleJS)

- `new WeavleJS(container, options, diagramDefinition)` — container is a selector or element; the definition
  defaults to `createFlowchartDefinition()`.
- Data: `this.model = { nodes, edges }` (plain objects). Transient UI state lives in `this.state`.
- Public API: `getVersion()`, `load(data)`, `getData()`, `addNode()`, `clear()`, `undo()`, `redo()`, `destroy()`,
  `setNodeSize(id, w, h)`.
  Every model change a user can make pushes one undo step (`pushHistory()`) and emits `weavle:modelchanged`;
  a click without movement does neither. `addNode()` without x/y auto-places the node on a free spot in the
  visible area (`findFreePosition`); `createConnectedNode()` picks a free spot with a working route.
- Events: `CustomEvent`s dispatched on the container via `emit()`: `weavle:modelchanged`,
  `weavle:nodemoved`, `weavle:noderesized`, `weavle:selectionchanged`.
- Resizing: corner handles on a single selected node (side midpoints are connection ports). Shift keeps the
  ratio, Alt resizes from the centre, Escape cancels. With snap on, sizes change in steps of 2 × gridSize and
  the centre stays on the grid. Rules per type via the definition: `getResizeRules(node)` or
  `nodeTypes[type].resize` (`false` = fixed size; `{ minWidth, minHeight, maxWidth, maxHeight, keepAspectRatio }`).
- Rendering: `render()` redraws the SVG layers (grid, edges, nodes, overlay) inside a `<g data-viewport>`
  group; floating HTML (action rail, inline label editing) lives in `this.uiLayer` over the SVG.
- Grid: `options.gridType` ("dots" default, "lines", "none") rendered as an SVG pattern in the grid layer.
  Styled via CSS custom properties `--weavle-grid-color`, `--weavle-grid-dot-radius`,
  `--weavle-grid-line-width`, `--weavle-canvas-bg`. Debug overlays (`debugRouting` + `debugRoutePoints`,
  `debugAStarGrid`, `debugCanvasGrid`) are off by default.
- Labels: word-wrapped into the node label box (`getNodeLabelBox`, canvas-measured and cached); explicit
  newlines kept, overflow ends in "…" with the full label as a tooltip. Layout per type via the definition:
  `getLabelLayout(node)` or `nodeTypes[type].label` (`placement: "inside" | "below" | "auto"`, paddings,
  width/height factors, fontSize, maxLines). "auto" = inside if the whole label fits, else below; used for plain
  BPMN events and gateways. Marker shapes (X, +, timer, ...) and data elements always label below.
  Inline editing uses a textarea for nodes (Enter commits, Shift+Enter = new line).
- Edge routing: orthogonal — straight or simple routes first, then A* on a grid (`findPathWithAStar`),
  tuned per definition via `getRoutingConfig`.
- The diagram definition is the extension point for new diagram types: shapes, nodeTypes, getPorts,
  routeEdge, getContextActions, getNodeInteractionMode, getRoutingConfig.

## Conventions

- ES modules with named exports, ES2020+ classes, 4-space indentation, double quotes, JSDoc on public
  methods, section banners (`// ====== N. SECTION ======`).
- UI strings (default labels, context actions) are in Dutch.
- Bump the version in `getVersion()` for releases.

## Known issues

- `weavle.js` imports both definitions (flowchart and BPMN) even though only the flowchart is the default.
- The engine logs heavily to the console on every render (`this.debug`, `console.log`).
- `index.html` contains the Export/Load sample/Clear log button group twice (duplicate element ids).
- No library build (IIFE/ESM for OutSystems), tests or linting yet.
