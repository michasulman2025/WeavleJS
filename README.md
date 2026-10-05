# 🧶 Weavle

A lightweight, dependency-free SVG diagram editor for the browser. One engine, many diagram types:
flowcharts and BPMN today, more to come. Built with OutSystems in mind, but it runs anywhere you have a DOM.

The engine knows nothing about "gateways" or "decisions". Everything that makes a diagram type what it is —
shapes, colours, ports, edge types, sizes, labels, rules — lives in a **diagram definition** (an add-in).
See [ARCHITECTURE.md](ARCHITECTURE.md) for the design and roadmap.

---

## Features

- Zero runtime dependencies, plain ES modules
- Pluggable diagram definitions — flowchart and BPMN included
- Flowchart: all 26 standard (ISO 5807) shapes in five groups, incl. on-page / off-page connectors and comments
- BPMN: 23 event types (start / intermediate catch & throw / end), 10 activity types, gateways, data,
  annotations, pools & lanes — with "change type" in the node tools
- Drag, multi-select (Ctrl+click, marquee), group drag, delete, undo / redo
- Orthogonal edge routing with obstacle avoidance (A*), live while dragging
- Drop a shape onto an edge to insert it into the flow (live preview of the result); "Losmaken" takes it out again
- Edge types per diagram: orthogonal or straight, filled / open / no arrowheads, dash patterns
- Snap-to-grid on node centres, so shapes of different sizes line up; alignment guides
- Resizable nodes with per-type rules (min / max size, keep aspect ratio)
- Attached nodes (BPMN boundary events): stick to their host's border, move, resize and delete with it
- Word-wrapping labels with ellipsis and tooltip; labels inside, below or "auto"
- Canvas toolbar docked at the top (while nothing is selected): insert any shape, pool or lane — pick it,
  then click where it goes (Escape cancels)
- Inline label editing (multi-line)
- Zoom (Ctrl + wheel) and pan (middle mouse button)
- CSS-stylable dot or line grid
- Containers: BPMN pools and lanes hold their contents, stack lanes and move as one
- Read-only mode
- DOM `CustomEvent`s for every model change — easy to sync with a server
- `destroy()` for frameworks that rebuild screens

---

## Files

| File | What it is |
|---|---|
| `src/weavle.js` | The engine — `export class WeavleJS` |
| `src/weavle-flowchart.js` | Flowchart definition — `export function createFlowchartDefinition()` |
| `src/weavle-bpmn.js` | BPMN definition — `export function createBpmnDefinition()` |
| `dist/weavle.iife.js` | Single-file build for a `<script>` tag — global `Weavle` (engine, definitions, OutSystems adapter) |
| `dist/weavle.es.js` | Same as an ES module |
| `dist/weavle.css` | Stylesheet (copy of `src/weavle.css`) |
| `src/weavle-outsystems.js` | Adapter: `mount`, `getInstance`, JSON in / out — see [wrappers/outsystems](wrappers/outsystems/README.md) |
| `src/weavle.css` | Default stylesheet — node tools, menus, handles, label editor, canvas and grid |
| `index.html`, `src/demo.js`, `src/style.css` | The playground |

---

## Quick Start

```html
<div id="diagram" style="width: 100%; height: 600px; overflow: auto;"></div>

<script type="module">
  import { WeavleJS } from "./src/weavle.js";
  import { createBpmnDefinition } from "./src/weavle-bpmn.js";

  const editor = new WeavleJS("#diagram", { snapToGrid: true }, createBpmnDefinition());

  editor.load({
    nodes: [
      { id: "s", type: "startEvent", x: 130, y: 130, width: 60,  height: 60, label: "Start" },
      { id: "t", type: "task",       x: 290, y: 120, width: 140, height: 80, label: "Process order" },
      { id: "e", type: "endEvent",   x: 530, y: 130, width: 60,  height: 60, label: "End" }
    ],
    edges: [
      { id: "e1", sourceNodeId: "s", targetNodeId: "t", sourceHandle: "right", targetHandle: "left" },
      { id: "e2", sourceNodeId: "t", targetNodeId: "e", sourceHandle: "right", targetHandle: "left" }
    ]
  });

  document.getElementById("diagram").addEventListener("weavle:modelchanged", e => {
    console.log("model", e.detail.model);
  });
</script>
```

### Without a build step

```html
<link rel="stylesheet" href="dist/weavle.css" />
<script src="dist/weavle.iife.js"></script>
<script>
  const editor = new Weavle.WeavleJS("#diagram", { snapToGrid: true }, Weavle.createBpmnDefinition());
</script>
```

### Playground

```bash
npm install
npm run dev      # playground on http://localhost:5173
npm run build    # library into dist/
```

Then open http://localhost:5173.

---

## Model Schema

The model is plain JSON: `{ nodes: [...], edges: [...] }`. `getData()` returns it, `load()` takes it.

### Node

| Property | Type | Description |
|---|---|---|
| `id` | string | Unique id |
| `type` | string | Node type from the diagram definition (`task`, `decision`, ...) |
| `x`, `y` | number | Top-left position |
| `width`, `height` | number | Size |
| `label` | string | Text; `\n` for explicit line breaks |
| `parentId` | string | Container the node sits in (BPMN pool / lane). Derived from the position when omitted |
| `attachedToId` | string | Host node this node is attached to (BPMN boundary events): it sits on the host's border, moves and is deleted with it |
| `interrupting` | boolean | BPMN boundary events: `false` = non-interrupting (dashed). Omitted = interrupting |

### Edge

| Property | Type | Description |
|---|---|---|
| `id` | string | Unique id |
| `type` | string | Edge type from the definition (e.g. `sequenceFlow`, `association`). Derived automatically when omitted |
| `sourceNodeId`, `targetNodeId` | string | Connected nodes |
| `sourceHandle`, `targetHandle` | string | Port: `top`, `right`, `bottom`, `left` |
| `label` | string | Optional text |
| `isAutoRoute` | boolean | `false` once the user reshaped the route by hand |
| `routePoints` | `{x, y}[]` | Computed (or manual) route — kept so manual routes survive a reload |
| `routingMeta` | object | Router diagnostics |

---

## Options

Second constructor argument: `new WeavleJS(container, options, definition)`.

| Option | Default | Description |
|---|---|---|
| `width`, `height` | `1200`, `800` | SVG canvas size |
| `gridSize` | `20` | Grid spacing in px |
| `gridType` | `"dots"` | `"dots"`, `"lines"` or `"none"` |
| `snapToGrid` | `false` | Snap node centres (and sizes, in steps of 2 × grid) to the grid |
| `readOnly` | `false` | Disable all editing |
| `edgeCornerRadius` | `8` | Rounded corners on orthogonal edges |
| `toolbar` | `true` | Canvas toolbar at the top for inserting shapes (shown while nothing is selected) |
| `toolSurfaceDockHost` | `null` | Element (or selector) to dock the node tools into, instead of floating them |
| `debug` | `false` | Console logging of routing / interaction diagnostics |
| `debugRouting` | `false` | Master switch for the debug overlays below |
| `debugRoutePoints` | `false` | Show numbered route points of the selected edge |
| `debugAStarGrid` | `false` | Show the routing grid of the selected edge |

---

## Events

All events are `CustomEvent`s dispatched on the container element; the payload is in `event.detail`.

| Event | Payload | When |
|---|---|---|
| `weavle:modelchanged` | `{ model }` | After any change to the model (add, move, resize, connect, delete, undo, ...) |
| `weavle:nodemoved` | `{ node, model }` | A node was dragged to a new position |
| `weavle:noderesized` | `{ node, model }` | A node was resized |
| `weavle:selectionchanged` | `{ selectedNodeIds, primarySelectedNodeId, selectedEdgeId }` | Selection changed |

A plain click without movement doesn't fire change events or create an undo step.

---

## Public API

```js
const editor = new WeavleJS(container, options, definition);

editor.load({ nodes, edges });          // replace the model (resets undo history)
editor.getData();                       // deep copy of { nodes, edges }

editor.addNode(node);                   // without x / y: placed on a free spot in view
editor.setNodeSize(id, width, height);  // keeps the centre; respects the type's resize rules
editor.clear();                         // remove everything (undoable)

editor.undo();
editor.redo();

editor.getSelectedNodeIds();
editor.getVersion();

editor.destroy();                       // remove listeners and DOM; the instance is done
```

Keyboard: `Delete` / `Backspace` removes the selection, `Ctrl+Z` / `Ctrl+Y` undo / redo, `Escape` cancels the
current interaction, double-click edits a label (`Enter` commits, `Shift+Enter` adds a line).

---

## Diagram Definitions

A definition is a plain object returned by a factory like `createBpmnDefinition()`. The main parts:

| Key | Purpose |
|---|---|
| `nodeTypes` | Per type: `defaultLabel`, `colors`, `shape` |
| `shapes` | SVG shape functions `(node, engine) => SVGElement` |
| `palette` | Types shown in a palette: `{ type }` entries or groups `{ group, types: [...] }` |
| `getPorts(node)` | Port positions |
| `edgeTypes`, `defaultEdgeType` | Edge types: `router` (`orthogonal` / `straight`), `marker` (`arrow` / `openArrow` / `none`), `dash` |
| `getEdgeTypeForConnection({ source, target })` | Which edge type a new connection gets |
| `getResizeRules(node)` | `false` or `{ minWidth, minHeight, maxWidth, maxHeight, keepAspectRatio }` |
| `getLabelLayout(node)` | `{ placement: "inside" \| "below" \| "auto", padding, fontSize, maxLines, ... }` |
| `getContextActions(node)` | Actions in the node tools ("add connected node", "delete", ...) |
| `handleAction(action, node, engine)` | Handle a custom action (e.g. BPMN "add lane"); return `true` to record an undo step |
| `nodeTypes[type].isContainer` | Container type (BPMN pool / lane): holds other nodes via `parentId` |
| `canContain(container, child)` | Which nodes a container accepts |
| `layoutContainer(container, engine, { changedNode })` | Arrange a container's children (BPMN: stacked lanes) |
| `getDragTarget(node, engine, pos)` | Drag another node instead (BPMN: grabbing a lane moves its pool, its header reorders it) |
| `constrainNodePosition(node, { x, y })` | Restrict where a dragged node can go (BPMN: lanes move vertically only) |
| `onNodeCreated(node, engine)` | Complete a new node (BPMN: a new pool gets two lanes) |
| `getDefaultSize(type)` | Default size for new nodes of a type |
| `getCanvasActions(engine)` | Buttons of the canvas toolbar (default: built from `palette`); `{ type: "createNode", nodeType }` places a node |
| `handleCanvasAction(action, engine)` | Handles other canvas toolbar actions |
| `getRoutingConfig(edge)` | Tuning for the orthogonal router |

Want a new diagram type? Copy `weavle-flowchart.js`, change the shapes and types, and pass it to the constructor.
[ARCHITECTURE.md](ARCHITECTURE.md) describes where this is heading (connection rules, flexible ports, HTML nodes,
auto-layout) and the planned node-editor and pedigree add-ins.

---

## Theming

All styling lives in **`src/weavle.css`** — include it next to the scripts. The engine sets no visual inline
styles: only positions and sizes it computes while dragging and zooming (tool surface, label editor) and a few
functional ones (`pointer-events`, `touch-action`). Colours in the SVG are presentation attributes, so your CSS
always wins over them.

Override the custom properties on the container (or any ancestor):

```css
#diagram {
  --weavle-canvas-bg: #ffffff;
  --weavle-grid-color: #d6dbe1;
  --weavle-handle-fill: #0f766e;
  --weavle-ui-radius: 4px;
}
```

| Variable | Default | Description |
|---|---|---|
| `--weavle-canvas-bg` | `#fafafa` | Canvas background |
| `--weavle-grid-color` | `#c3cad3` | Dot / line colour |
| `--weavle-grid-dot-radius` | `1px` | Dot size (`gridType: "dots"`) |
| `--weavle-grid-line-width` | `0.5px` | Line thickness (`gridType: "lines"`) |
| `--weavle-selection-color` | `#f57100` | Selected node outline, label editor border |
| `--weavle-handle-fill` / `--weavle-handle-stroke` | `#2563eb` / `#fff` | Resize handles |
| `--weavle-port-fill` / `--weavle-port-stroke` / `--weavle-port-hot` | `#fff` / `#2ea8df` / `#eb6c4c` | Connection ports |
| `--weavle-ui-font`, `--weavle-ui-bg`, `--weavle-ui-border`, `--weavle-ui-radius`, `--weavle-ui-shadow` | | Node tools and submenus |
| `--weavle-ui-text`, `--weavle-ui-muted`, `--weavle-ui-icon`, `--weavle-ui-hover` | | Text, titles, icons, hover |
| `--weavle-ui-active-bg` / `--weavle-ui-active-text` | | Current type in the "change type" menu |
| `--weavle-ui-danger` / `--weavle-ui-danger-hover` | | Delete button |
| `--weavle-tool-size` | `30px` | Size of a node tool button |

Classes you can target directly:

| Class | Element |
|---|---|
| `.weavle-canvas`, `.weavle-canvas.is-panning` | The SVG canvas |
| `.weavle-grid-dot`, `.weavle-grid-line` | Grid |
| `.weavle-node-shape`, `.weavle-node-shape.is-selected` | Node shapes |
| `.weavle-node-label`, `.weavle-edge-label` | Labels |
| `.weavle-edge`, `.weavle-edge--<type>`, `.is-selected`, `.is-preview` | Edges |
| `.weavle-resize-handle`, `.weavle-resize-handle--<corner>` | Resize handles |
| `.weavle-port`, `.weavle-port--hot` | Connection ports |
| `.weavle-tool-surface`, `.weavle-tool-surface--action-surface`, `.weavle-tool-surface--docked-panel` | Node tools |
| `.weavle-tool-button`, `--group`, `--danger`, `.is-open`; `.weavle-tool-separator`; `.weavle-tool-icon` | Tool buttons |
| `.weavle-tool-submenu`, `.weavle-tool-submenu-title`, `.weavle-tool-menu-item`, `.is-active` | Submenus |
| `.weavle-toolbar-anchor`, `.weavle-toolbar` | Canvas toolbar (its submenus reuse the tool classes) |
| `.weavle-canvas.is-creating` | Canvas while a new node is being placed |
| `.weavle-label-editor` | Inline label editor |
| `.weavle-drop-target` | Container highlight while dragging into it |

Node colours come from the diagram definition.

---

## OutSystems Integration

Use the single-file build: add `dist/weavle.iife.js` as a script and `dist/weavle.css` as a style sheet, then
wrap the editor in a block with the small adapter that ships in the bundle:

```js
// OnReady
Weavle.mount($parameters.ContainerId, {
    diagramType: "bpmn",
    model: $parameters.ModelJson,
    onModelChanged:     json => $actions.RaiseModelChanged(json),
    onSelectionChanged: (nodeId, edgeId, selectedNodeIdsJson) =>
        $actions.RaiseSelectionChanged(nodeId, edgeId, selectedNodeIdsJson)
});

// OnParametersChanged
Weavle.getInstance($parameters.ContainerId)?.setModel($parameters.ModelJson);

// OnDestroy
Weavle.getInstance($parameters.ContainerId)?.destroy();
```

`setModel` ignores the model the editor itself just reported, so the usual *event → screen variable → block
input* round trip keeps undo history and selection. The full step-by-step guide (block inputs, events,
client actions, storing the model) is in [wrappers/outsystems/README.md](wrappers/outsystems/README.md), with a
runnable simulation in `wrappers/outsystems/example.html`.

---

## Browser Support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). No IE11.

---

## License

MIT © 2026 Micha Sulman
