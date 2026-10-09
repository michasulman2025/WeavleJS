# WeavleJS in OutSystems

How to wrap WeavleJS in a reusable **block** (OutSystems 11 Reactive or ODC — the JavaScript is the same).
The block takes the model as JSON text, raises events when it changes and exposes client actions such as
Undo / Redo.

`example.html` in this folder simulates exactly this block in a plain page — open it with the playground
running (`npm run dev` → http://localhost:5173/wrappers/outsystems/example.html).

---

## 1. Add the files

From `dist/` (run `npm run build`, or take them from the repository):

| File | Add as | Notes |
|---|---|---|
| `weavle.iife.js` | **Script** resource (O11: *Interface → Scripts*; ODC: *Scripts*) | Defines one global: `Weavle` |
| `weavle.css` | **Style sheet** of the block or theme (paste it in, or add it as a resource) | All visual styling — restyle it freely |

In the block, add the script under **Required Scripts** (O11) / **Scripts** (ODC).

---

## 2. Create the block `WeavleEditor`

**Widgets**

- A **Container** named `WeavleHost`, with a height, e.g. style `height: 600px; overflow: auto;`
  (put that in a CSS class rather than inline if you prefer).

**Input parameters**

| Name | Type | Default | |
|---|---|---|---|
| `DiagramType` | Text | `"bpmn"` | `"bpmn"` or `"flowchart"` — the type for models that don’t carry their own `diagramType` |
| `ModelJson` | Text | `""` | The model; empty = empty diagram |
| `ReadOnly` | Boolean | `False` | |
| `ToolbarPosition` | Text | `"top"` | Canvas toolbar: `"top"`, `"left"`, `"right"` or `"floating"` (draggable by its grip) |
| `OptionsJson` | Text | `""` | Optional editor options, e.g. `{"snapToGrid":true,"gridType":"dots"}` |

**Events**

| Name | Parameters |
|---|---|
| `OnModelChanged` | `ModelJson` (Text) |
| `OnSelectionChanged` | `NodeId` (Text), `EdgeId` (Text), `SelectedNodeIdsJson` (Text) |

JavaScript can't trigger a block event directly, so add two small client actions that do:

- `RaiseModelChanged` (input `ModelJson` Text) → *Trigger Event* `OnModelChanged`
- `RaiseSelectionChanged` (inputs `NodeId`, `EdgeId`, `SelectedNodeIdsJson` Text) → *Trigger Event* `OnSelectionChanged`

`OnSelectionChanged` parameters:

| Parameter | Value |
|---|---|
| `NodeId` | The primary selected node (the one clicked last), or `""` |
| `EdgeId` | The selected edge, or `""` (a node and an edge are never selected together) |
| `SelectedNodeIdsJson` | All selected nodes as a JSON array, e.g. `["b1","b2"]` — more than one after Ctrl+click or a marquee; `[]` when nothing is selected |

To use the list in OutSystems, `JSONDeserialize` it into a *Text List*.

---

## 3. Lifecycle (JavaScript nodes)

Give each JavaScript node an input `ContainerId` = `WeavleHost.Id`, plus the inputs it uses.

**OnReady** — inputs: `ContainerId`, `DiagramType`, `ModelJson`, `ReadOnly`, `ToolbarPosition`, `OptionsJson`

```js
const options = $parameters.OptionsJson ? JSON.parse($parameters.OptionsJson) : {};
options.readOnly = $parameters.ReadOnly;
options.toolbarPosition = $parameters.ToolbarPosition || "top";

Weavle.mount($parameters.ContainerId, {
    diagramType: $parameters.DiagramType || "bpmn",
    model: $parameters.ModelJson,
    options: options,
    onModelChanged: function (json) {
        $actions.RaiseModelChanged(json);
    },
    onSelectionChanged: function (nodeId, edgeId, selectedNodeIdsJson) {
        $actions.RaiseSelectionChanged(nodeId, edgeId, selectedNodeIdsJson);
    }
});
```

**OnParametersChanged** — inputs: `ContainerId`, `ModelJson`, `ReadOnly`, `ToolbarPosition`

```js
var weavle = Weavle.getInstance($parameters.ContainerId);

if (weavle) {
    weavle.setModel($parameters.ModelJson);   // skipped when it's the editor's own model (see below)
    weavle.setReadOnly($parameters.ReadOnly);
    if (weavle.editor.options.toolbarPosition !== ($parameters.ToolbarPosition || "top")) {
        weavle.setToolbarPosition($parameters.ToolbarPosition || "top");
    }
}
```

**OnDestroy** — input: `ContainerId`. Important: otherwise the old editor keeps listening to the keyboard.

```js
var weavle = Weavle.getInstance($parameters.ContainerId);
if (weavle) weavle.destroy();
```

### Switching diagram type

Models describe themselves: the JSON in `OnModelChanged` is `{ "diagramType": "bpmn", "nodes": [...], "edges": [...] }`.
When `setModel` gets a model with **another** `diagramType`, the block rebuilds the editor for that type (same
container, callbacks and options) and loads it — so loading a flowchart record into a block that shows BPMN just
works with the OnParametersChanged code above. Undo history and selection start fresh (`OnSelectionChanged`
fires with empty ids). Models without `diagramType` (older data) use the block’s `DiagramType` input.

To start an empty diagram of another type from a client action: `setDiagramType("flowchart")` (reports the new
empty model through `OnModelChanged`).

---

## 4. Client actions (optional)

Each is a client action of the block with one JavaScript node (input `ContainerId` = `WeavleHost.Id`):

| Action | JavaScript |
|---|---|
| `Undo` | `Weavle.getInstance($parameters.ContainerId).undo();` |
| `Redo` | `Weavle.getInstance($parameters.ContainerId).redo();` |
| `Clear` | `Weavle.getInstance($parameters.ContainerId).clear();` |
| `AddNode` (in: `Type`, `Label`; out: `NodeId`) | `$parameters.NodeId = Weavle.getInstance($parameters.ContainerId).addNode($parameters.Type, $parameters.Label);` |
| `SetNodeLabel` (in: `NodeId`, `Label`) | `Weavle.getInstance($parameters.ContainerId).setNodeLabel($parameters.NodeId, $parameters.Label);` |
| `SelectNode` (in: `NodeId`) | `Weavle.getInstance($parameters.ContainerId).selectNode($parameters.NodeId);` |
| `GetModel` (out: `ModelJson`) | `$parameters.ModelJson = Weavle.getInstance($parameters.ContainerId).getModel();` |
| `SetDiagramType` (in: `DiagramType`) | `Weavle.getInstance($parameters.ContainerId).setDiagramType($parameters.DiagramType);` |
| `OptimizeLayout` (in: `NodeIdsJson`, optional) | `Weavle.getInstance($parameters.ContainerId).optimizeLayout($parameters.NodeIdsJson);` |
| `OptimizeEdges` (in: `NodeIdsJson`, optional) | `Weavle.getInstance($parameters.ContainerId).optimizeEdges($parameters.NodeIdsJson);` |

---

## 5. Using the block on a screen

1. Screen variable `ModelJson` (Text). Fill it in the screen's data fetch from your entity.
2. Drop `WeavleEditor` on the screen, bind `ModelJson` to the variable.
3. Handle `OnModelChanged`: assign the event's `ModelJson` to the screen variable. Save it to the entity
   when it suits you — on a Save button, or debounced.

**Storing the model:** an entity attribute of type *Text* with a large length (e.g. 1,000,000), stored as-is.
If you need individual nodes / edges in OutSystems, `JSONDeserialize` the text into a structure with the
fields from the [model schema](../../README.md#model-schema) — but keep saving the original text.

### Why the round trip is safe

`OnModelChanged` → screen variable → block input `ModelJson` → `OnParametersChanged` → `setModel(...)`.
`setModel` recognises the model the editor itself just reported (also if OutSystems re-serialised it with a
different key order) and does nothing, so the undo history and the selection are kept. A genuinely different
model (e.g. another record loaded) is loaded normally.

---

## Controller API

`Weavle.mount(container, config)` returns a controller; `Weavle.getInstance(container)` finds it again.

| Member | |
|---|---|
| `setModel(jsonOrObject)` | Load a model; returns `false` when it was the editor's own model (echo). Another `diagramType` switches the editor to that type |
| `getModel()` | Current model as JSON text, with `diagramType` |
| `getDiagramType()` | `"bpmn"`, `"flowchart"`, ... |
| `setDiagramType(type, model?)` | Switch type with an empty (or the given) model; reported via `onModelChanged` |
| `optimizeLayout(nodeIdsJson?)` | "Flow optimaliseren": layered layout + tidy edges; one undo step |
| `optimizeEdges(nodeIdsJson?)` | "Lijnen optimaliseren": better ports and routes, nodes stay put |
| `setLayoutDirection("LR" | "TB")` | Flow direction for the two functions above |
| `undo()`, `redo()`, `clear()` | |
| `setReadOnly(bool)` | Switch without rebuilding |
| `setToolbarPosition(position)` | `"top"`, `"left"`, `"right"` or `"floating"` |
| `addNode(type, label?)` | Adds a node on a free spot in view; returns its id |
| `setNodeLabel(nodeId, label)` | One undo step |
| `selectNode(nodeId)` | Empty id clears the selection |
| `destroy()` | Removes the editor and all its listeners |
| `editor` | The underlying `WeavleJS` instance |

`config` callbacks: `onModelChanged(json)`, `onSelectionChanged(nodeId, edgeId, selectedNodeIdsJson)`,
`onNodeMoved(nodeJson)`, `onNodeResized(nodeJson)`, `onToolbarMoved(x, y)` (a floating toolbar was dragged —
store it and pass it back as option `toolbarFloatingPosition: { x, y }` to keep the spot across visits).

Extra diagram types: `Weavle.registerDiagramType("myType", createMyDefinition)` before mounting.
