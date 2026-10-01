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
- Drag, multi-select (Ctrl+click, marquee), group drag, delete, undo / redo
- Orthogonal edge routing with obstacle avoidance (A*), live while dragging
- Edge types per diagram: orthogonal or straight, filled / open / no arrowheads, dash patterns
- Snap-to-grid on node centres, so shapes of different sizes line up; alignment guides
- Resizable nodes with per-type rules (min / max size, keep aspect ratio)
- Word-wrapping labels with ellipsis and tooltip; labels inside, below or "auto"
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

### Playground

```bash
npm install
npm run dev
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
| `toolSurfaceDockHost` | `null` | Element (or selector) to dock the node tools into, instead of floating them |
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
| `palette` | Types shown in a palette |
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
| `getDragTarget(node)` | Drag another node instead (BPMN: grabbing a lane moves its pool) |
| `getRoutingConfig(edge)` | Tuning for the orthogonal router |

Want a new diagram type? Copy `weavle-flowchart.js`, change the shapes and types, and pass it to the constructor.
[ARCHITECTURE.md](ARCHITECTURE.md) describes where this is heading (connection rules, flexible ports, HTML nodes,
auto-layout) and the planned node-editor and pedigree add-ins.

---

## Theming

The grid and canvas are styled with CSS custom properties on the container (or any ancestor):

```css
#diagram {
  --weavle-canvas-bg: #ffffff;
  --weavle-grid-color: #d6dbe1;
  --weavle-grid-dot-radius: 1.2px;
  --weavle-grid-line-width: 0.5px;
}
```

| Variable | Default | Description |
|---|---|---|
| `--weavle-canvas-bg` | `#fafafa` | Canvas background |
| `--weavle-grid-color` | `#c3cad3` | Dot / line colour |
| `--weavle-grid-dot-radius` | `1px` | Dot size (`gridType: "dots"`) |
| `--weavle-grid-line-width` | `0.5px` | Line thickness (`gridType: "lines"`) |

You can also target `.weavle-grid-dot`, `.weavle-grid-line`, `.weavle-node-label` and `.weavle-resize-handle`.
Node colours come from the diagram definition.

---

## OutSystems Integration

Weavle is a set of ES modules today. Until the single-file (IIFE) build lands, load it with a dynamic `import()`
from the module's scripts location — the three files must sit next to each other.

**OnReady** (JavaScript node):

```js
const host = document.getElementById($parameters.ContainerId);
const { WeavleJS }             = await import($parameters.ScriptsUrl + "/weavle.js");
const { createBpmnDefinition } = await import($parameters.ScriptsUrl + "/weavle-bpmn.js");

const editor = new WeavleJS(host, JSON.parse($parameters.OptionsJson || "{}"), createBpmnDefinition());
editor.load(JSON.parse($parameters.ModelJson || '{"nodes":[],"edges":[]}'));
host._weavle = editor;

host.addEventListener("weavle:modelchanged", e => {
  $actions.OnModelChanged(JSON.stringify(e.detail.model));
});

host.addEventListener("weavle:selectionchanged", e => {
  $actions.OnSelectionChanged(e.detail.primarySelectedNodeId || "", e.detail.selectedEdgeId || "");
});
```

**OnParametersChanged**:

```js
const host = document.getElementById($parameters.ContainerId);
host._weavle?.load(JSON.parse($parameters.ModelJson));
```

**OnDestroy** — important, otherwise old editors keep listening to the keyboard:

```js
const host = document.getElementById($parameters.ContainerId);
host._weavle?.destroy();
host._weavle = null;
```

**Client actions** use the stored instance, e.g. `host._weavle.undo()` or `host._weavle.setNodeSize(id, 200, 100)`.

Data flow: the model is plain JSON, so `JSONSerialize` / `JSONDeserialize` map it to OutSystems structures
(a Node and an Edge structure with the fields from the schema above).

---

## Browser Support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). No IE11.

---

## License

MIT © 2026 Micha Sulman
