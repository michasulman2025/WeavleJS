# WeavleJS

WeavleJS is a browser-only SVG diagram editor library in vanilla JavaScript (ES modules, no dependencies).
A generic engine manages nodes and edges; swappable diagram definitions decide which shapes, ports,
routing and interactions exist. It is embedded in OutSystems apps; the demo playground is for local debugging.

This folder (`C:\dev\Weavle\WeavleJS`, engine v0.8.0) is the current codebase. The files one level up
(`../waevle.js`, `../weavleflowchart.js`, v0.6.5, global-script style) are an older version — don't edit them.

The engine / add-in split and the roadmap (flowchart, BPMN, node editor, pedigree) are in `ARCHITECTURE.md`.
Rule of thumb: if you need to name a node type, it belongs in the add-in (diagram definition), not the engine.

## Commands

- `npm run dev` — Vite dev server with the playground at http://localhost:5173 (hot reload).
- `npm run build` — library into `dist/` (weavle.iife.js with global `Weavle`, weavle.es.js, weavle.css;
  entry `src/index.js`). Commit `dist/` after changing `src/` — OutSystems users take the files from GitHub.
- `npm run build:demo` — static build of the playground into `dist-demo/`.

## Files

- `src/weavle.js` — the engine, `export class WeavleJS` (~4900 lines).
- `src/weavle-flowchart.js` — `export function createFlowchartDefinition()`.
- `src/weavle-bpmn.js` — `export function createBpmnDefinition()`.
- `src/weavle-outsystems.js` — host adapter: `mount(container, config)` → controller, `getInstance`,
  `registerDiagramType`; JSON in / out and echo protection (`setModel` skips the model the editor reported).
- `src/index.js` — library entry (exports everything, imports weavle.css). `wrappers/outsystems/` — block guide
  and `example.html` simulation.
- `src/samples/bpmn-order-process.js` — complex BPMN sample (3 pools, lanes, message flows), button
  "Load complex sample" in the playground.
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
- Attached nodes: `node.attachedToId` = host id (BPMN boundary events). The engine keeps them on the host
  border (`projectOntoHostBorder` via `constrainNodePosition`, `reattachNodes` after a resize), drags /
  deletes them with the host (`withDescendants`), draws them last (`getRenderOrder`) and gives them the
  host's `parentId`. BPMN: `kind: "boundary"` in `EVENT_TYPES`, `node.interrupting === false` = dashed,
  actions `addBoundaryEvent` (activities) and `setInterrupting`; label placement "below-right".
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
- Containers (`nodeTypes[type].isContainer`, BPMN pools/lanes): membership via `node.parentId`, derived from
  geometry on drop/create/load (`applyContainment`). Drawn in their own layer below edges; hit testing picks the
  topmost node; dragging moves descendants; deleting removes contents; not routing obstacles
  (`getObstacleNodes`). Definition hooks: `canContain(container, child)`, `layoutContainer(container, engine,
  { changedNode, previousRect, reason })` (reason: resize | move | add | remove; BPMN: lanes tile the pool, edges
  stop at the contents), `getDragTarget(node, engine, pos)` (lane body drags its pool, lane header reorders),
  `constrainNodePosition(node, {x, y})` (lane moves vertically only), `handleAction(action, node, engine)` for
  custom context actions (BPMN `addLane`), `onNodeCreated(node, engine)` to complete new nodes (BPMN: a new pool
  gets two lanes). BPMN pool resize spreads the height change proportionally over the lanes; growing never
  shrinks a lane. Container layouts run live while resizing (geometry snapshot +
  restore); resize rules may ask for edge handles (`handles: ["n", "s"]`). BPMN message flow = edge between two pools.
- BPMN events come from the `EVENT_TYPES` table in weavle-bpmn.js (kind start/intermediate/end, trigger,
  throw) and share one `event` shape + `drawEventMarker`; activities / gateways are listed in `ACTIVITY_TYPES` /
  `GATEWAY_TYPES`. "Type wijzigen" (`changeType` action, `getTypeFamily`) switches a node within its family.
  Tool-rail icons and the type menu are scaled-down real shapes (`appendTypePreview`). Palette entries may be
  groups `{ group, types }`. Node tool renderers receive `surfaceEl`; interaction mode "action-rail" is an
  alias of "action-surface".
- Edge types: `edge.type` keys into the definition's `edgeTypes` (`router: "orthogonal" | "straight"`,
  `marker: "arrow" | "openArrow" | "none"`, `dash`). `getEdgeTypeForConnection({source, target})` picks the type
  when an edge is created or reconnected; `defaultEdgeType` otherwise. Untyped saved edges get a type on load.
  BPMN: sequenceFlow, association (annotation), dataAssociation (data object/store). Flowchart: flow, comment
  (to/from an annotation). Changing a node's type re-derives the type of its edges.
- Flowchart shapes: `FLOWCHART_GROUPS` in weavle-flowchart.js (26 ISO 5807 shapes in 5 groups) drives the palette,
  "Type wijzigen" (with `{ type: "heading" }` children) and one add-submenu per group. `nodeTypes[type].title` is
  the menu name when the default label is not one (connectors).
- Edge splitting: dragging a single free node over an edge sets `state.splitEdgeId` (`findSplitEdgeFor`,
  rules in `canSplitEdgeWith`: at most one own edge, not to either end, both halves keep the edge type, optional
  `diagram.canSplitEdge`; the edge must pass within a quarter of the node's smaller side of its centre);
  `renderEdges` draws the edge as its two future halves (`renderSplitPreview`); mouseup calls `splitEdgeWithNode`.
  Also while placing a node from the toolbar: the ghost (`buildPreviewNode`) is added to the model only while the
  halves are routed, and centres on the crossed segment (`state.creationAlign`, `getSegmentAlignment`).
  The reverse is the built-in context action `detachNode` ("Losmaken", `detachNode(node)`, `hasEdges(node)`).
  The open node tool surface is rebuilt on every `weavle:modelchanged` (`refreshNodeToolSurface`).
- Optimise edges (`optimizeEdges`): per edge `getPortPairCandidates` → route each (`routeTemporaryEdge`) →
  `scoreEdgeRoute` (`countRouteConflicts`, shared ports, flow direction from `getLayoutDirection`); short edges
  first, two passes. While it runs `state.routeOccupancy` (`buildRouteOccupancy`) adds A* step costs
  (`getOccupancyPenalty`). Toolbar entries come from `getTidyActions()`. Roadmap: optimise flow (layered layout).
- Edge routing: orthogonal — straight or simple routes first, then A* on a grid (`findPathWithAStar`),
  tuned per definition via `getRoutingConfig`.
- The diagram definition is the extension point for new diagram types: shapes, nodeTypes, getPorts,
  routeEdge, getContextActions, getNodeInteractionMode, getRoutingConfig.

## Conventions

- No visual inline styles (OutSystems apps style through external CSS). UI chrome gets classes styled in
  `src/weavle.css`; SVG colours are presentation attributes (overridable by CSS). Inline style is only for
  computed geometry (left/top/width/height/font-size of floating elements) and functional bits
  (pointer-events, touch-action, body user-select during drags).
- Canvas toolbar (`createCanvasToolbar`): sticky zero-height strip before the SVG, shown while nothing is
  selected; buttons from `getCanvasActions()` (default: the palette, groups → submenus). "createNode" starts
  `startNodeCreation` — the ghost follows the mouse, a press on the canvas arms it, the release places it.
- Node tools are rendered generically by the engine from `getContextActions` (an action with `children` is a
  button with a submenu; icons are type previews via `appendTypePreview`). Definitions do not render tools.
- ES modules with named exports, ES2020+ classes, 4-space indentation, double quotes, JSDoc on public
  methods, section banners (`// ====== N. SECTION ======`).
- UI strings (default labels, context actions) are in Dutch.
- Bump the version in `getVersion()` for releases.

## Known issues

- `weavle.js` imports both definitions (flowchart and BPMN) even though only the flowchart is the default.
- No tests or linting yet.
