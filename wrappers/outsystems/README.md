# WeavleJS in OutSystems

How to wrap WeavleJS in a reusable **block** (OutSystems 11 Reactive or ODC — the JavaScript is the same).
The block takes the model as JSON text, raises events when it changes and exposes client actions such as
Undo / Redo. One block serves every diagram type: flowchart, BPMN, Ishikawa, fault tree, org chart, node editor and
family tree. The org chart and the family tree can also be fed straight from your own entities as a flat list —
see [section 6](#6-node-editor) and [section 7](#7-family-tree-pedigree) for the type-specific parts.

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
| `DiagramType` | Text | `"bpmn"` | `"bpmn"`, `"flowchart"`, `"ishikawa"`, `"fta"`, `"orgchart"`, `"nodeeditor"` or `"pedigree"` — the type for models that don’t carry their own `diagramType` |
| `ModelJson` | Text | `""` | The model; empty = empty diagram |
| `ListJson` | Text | `""` | Org chart / family tree only: your own data as a flat list (see sections 7 and the controller API). When filled it is used instead of `ModelJson` |
| `ReadOnly` | Boolean | `False` | |
| `ToolbarPosition` | Text | `"top"` | Canvas toolbar: `"top"`, `"left"`, `"right"` or `"floating"` (draggable by its grip) |
| `OptionsJson` | Text | `""` | Optional editor options, e.g. `{"snapToGrid":true,"gridType":"dots"}` |
| `DiagramOptionsJson` | Text | `""` | Optional options of the diagram type itself, e.g. `{"orientation":"vertical"}` for the family tree |

**Events**

| Name | Parameters |
|---|---|
| `OnModelChanged` | `ModelJson` (Text) |
| `OnSelectionChanged` | `NodeId` (Text), `EdgeId` (Text), `SelectedNodeIdsJson` (Text) |
| `OnDiagramEvent` | `Name` (Text), `DetailJson` (Text) — diagram-specific events, e.g. `"orgchart:managerchanged"` or the family tree's `"pedigree:addparent"` request |

JavaScript can't trigger a block event directly, so add small client actions that do:

- `RaiseModelChanged` (input `ModelJson` Text) → *Trigger Event* `OnModelChanged`
- `RaiseSelectionChanged` (inputs `NodeId`, `EdgeId`, `SelectedNodeIdsJson` Text) → *Trigger Event* `OnSelectionChanged`
- `RaiseDiagramEvent` (inputs `Name`, `DetailJson` Text) → *Trigger Event* `OnDiagramEvent`

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

**OnReady** — inputs: `ContainerId`, `DiagramType`, `ModelJson`, `ListJson`, `ReadOnly`, `ToolbarPosition`,
`OptionsJson`, `DiagramOptionsJson`

```js
const options = $parameters.OptionsJson ? JSON.parse($parameters.OptionsJson) : {};
options.readOnly = $parameters.ReadOnly;
options.toolbarPosition = $parameters.ToolbarPosition || "top";

var weavle = Weavle.mount($parameters.ContainerId, {
    diagramType: $parameters.DiagramType || "bpmn",
    model: $parameters.ListJson ? "" : $parameters.ModelJson,
    options: options,
    diagramOptions: $parameters.DiagramOptionsJson,
    onModelChanged: function (json) {
        $actions.RaiseModelChanged(json);
    },
    onSelectionChanged: function (nodeId, edgeId, selectedNodeIdsJson) {
        $actions.RaiseSelectionChanged(nodeId, edgeId, selectedNodeIdsJson);
    },
    onDiagramEvent: function (name, detailJson) {
        $actions.RaiseDiagramEvent(name, detailJson);
    }
});

if ($parameters.ListJson) weavle.setModelFromList($parameters.ListJson);
```

**OnParametersChanged** — inputs: `ContainerId`, `ModelJson`, `ListJson`, `ReadOnly`, `ToolbarPosition`

```js
var weavle = Weavle.getInstance($parameters.ContainerId);

if (weavle) {
    if ($parameters.ListJson) {
        weavle.setModelFromList($parameters.ListJson);   // skipped when it's the list the editor itself reported
    } else {
        weavle.setModel($parameters.ModelJson);          // skipped when it's the editor's own model (see below)
    }
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

## 6. Node editor

`DiagramType` = `"nodeeditor"`. A Blender-style node graph: nodes with outputs (right) and inputs (left), typed
`boolean`, `number` or `text`, joined by bezier links. It works like the free-drawing types (flowchart, BPMN): the
model JSON from `OnModelChanged` is the whole graph — store it as text (section 5) and pass it back through
`ModelJson`.

- The canvas toolbar offers 15 node types in five groups (input, logic, numbers, text, output).
- Values typed into a node (double-click a value box) are in `node.values`, e.g. `{"a": 10, "b": 3}`; a link is an
  edge from `out-<port>` to `in-<port>` (`sourceHandle` / `targetHandle`). Read them after `JSONDeserialize` if your
  logic needs them.
- Rules: output → input only, matching data types, one link per input (a new link replaces the old one), no cycles.
  A refused connection shows the reason at the cursor; to hear about it in OutSystems, pass
  `onConnectionRefused: function (reason, detailJson) { ... }` in `mount`.
- The playground sample "Node-editor" shows a small page logic (`src/samples/nodeeditor-page-logic.js`).

---

## 7. Family tree (pedigree)

`DiagramType` = `"pedigree"`. The family tree is **derived** from your data: you keep persons and families in
entities, hand them to the block as one JSON text (`ListJson`), and the chart lays out an hourglass around one focus
person — ancestors on one side, descendants on the other, brothers and sisters beside the focus. The chart never
changes your data: "Vader toevoegen", "Kind toevoegen" and the like arrive as requests through `OnDiagramEvent`; you
open your own form, save, and pass the new data back.

### Data

Two entities is enough — `Person` and `Family` (a child points to the family it was born into):

```json
{
  "focusId": "jan",
  "persons": [
    { "id": "jan", "name": "Jan de Vries", "gender": "male", "birthYear": 1932, "deathYear": 2004,
      "living": false, "refId": "KN6Q-LXY", "photoUrl": "", "parentFamilyId": "f1", "preferredFamilyId": "",
      "hasMoreAncestors": false, "hasMoreDescendants": false }
  ],
  "families": [
    { "id": "f1", "partner1Id": "hendrik", "partner2Id": "antje",
      "marriageDate": "3 juni 1928", "marriagePlace": "Sneek" }
  ]
}
```

| Person field | |
|---|---|
| `id` | Your id (text; entity ids work — persons and families may use the same numbers) |
| `name`, `gender` | `gender`: `"male"`, `"female"` or `"unknown"` (also `"m"` / `"v"`) |
| `birthYear`, `deathYear`, `living` | `0` = unknown; `living` shows "Levend" instead of a death year |
| `refId`, `photoUrl` | Optional: a reference shown after the years, a photo instead of the silhouette |
| `parentFamilyId` | The family this person is a child of (`""` = parents unknown) |
| `preferredFamilyId` | With several relationships: the one shown (default the last) |
| `hasMoreAncestors`, `hasMoreDescendants` | You have more data that you did not send (for loading step by step, coming next) |

| Family field | |
|---|---|
| `id`, `partner1Id`, `partner2Id` | Either partner may be `""` (one parent known) |
| `marriageDate`, `marriagePlace` | Shown as text, e.g. `"12 mei 1956"` |

Build the JSON with a structure of this shape and `JSONSerialize`, and pass it to `ListJson`. `getList()` returns the
same shape.

`DiagramOptionsJson`: `{"orientation":"horizontal"}` (default, ancestors to the right) or `"vertical"` (ancestors at
the top), plus `ancestorGenerations` (3), `descendantGenerations` (2), `showSiblings` (true) and `showPlaceholders`
(true). In read-only mode there are no empty slots or "+" buttons.

To switch the orientation from a client action (input `Orientation` Text):

```js
var weavle = Weavle.getInstance($parameters.ContainerId);
weavle.editor.diagram.setOrientation($parameters.Orientation, weavle.editor);
```

### Requests from the chart

Handle `OnDiagramEvent` on the screen with a *Switch* on `Name`; `JSONDeserialize` the `DetailJson` into a structure
with the fields below. Ids are your own ids; a `familyId` of `""` / null means "make a new family".

| `Name` | `DetailJson` | Typical handling |
|---|---|---|
| `pedigree:addparent` | `requestId`, `personId`, `role` (`"father"` / `"mother"`), `familyId` | Form for a new person; create the family when `familyId` is empty and set the person's `parentFamilyId` |
| `pedigree:addpartner` | `requestId`, `personId`, `familyId` | New person; fill the empty slot of `familyId`, or create a new family |
| `pedigree:addchild` | `requestId`, `personId`, `familyId` | New person with `parentFamilyId` = `familyId` (or a new family with `personId` as the only parent) |
| `pedigree:addsibling` | `requestId`, `personId`, `familyId` | New person with the same `parentFamilyId` (create the parent family when it is empty) |
| `pedigree:editperson` | `requestId`, `personId` | Your edit form |
| `pedigree:removeperson` | `requestId`, `personId` | Confirm and delete |
| `pedigree:preferredpartnerchanged` | `personId`, `familyId` | The user picked another relationship to show; store it as `preferredFamilyId` if you want it to stick |
| `pedigree:orientationchanged` | `orientation` | Optional: remember the user's choice |

After saving, refresh your data and serialize it to the variable bound to `ListJson`; `OnParametersChanged` loads it.
For now that reloads the whole tree (the focus is kept as long as you send the same `focusId`). Sending only what
changed (`applyChanges`, with the `requestId` passed back), keeping opened branches and changing the focus from the
chart are the next step — see ARCHITECTURE.md, section 6 "Pedigree".

---

## Controller API

`Weavle.mount(container, config)` returns a controller; `Weavle.getInstance(container)` finds it again.

| Member | |
|---|---|
| `setModel(jsonOrObject)` | Load a model; returns `false` when it was the editor's own model (echo). Another `diagramType` switches the editor to that type |
| `getModel()` | Current model as JSON text, with `diagramType` |
| `setModelFromList(listJson)` | Org chart: load a flat list `[{ id, managerId, name, role, vacancy, assistant, dottedManagerIds }]` (e.g. from an Employee entity; `dottedManagerIds` an array or `"id1,id2"`). Family tree: `{ focusId, persons, families }` (section 7). Returns `false` when it is the list the editor itself last reported (echo) |
| `getList()` | The current chart as that list (JSON text; org chart: `managerId` is `""` for the top; family tree: without the empty slots) |
| `getDiagramType()` | `"bpmn"`, `"flowchart"`, ... |
| `setDiagramType(type, model?)` | Switch type with an empty (or the given) model; reported via `onModelChanged` |
| `optimizeLayout(nodeIdsJson?)` | "Flow optimaliseren": layered layout + tidy edges; one undo step |
| `optimizeEdges(nodeIdsJson?)` | "Lijnen optimaliseren": better ports and routes, nodes stay put |
| `setLayoutDirection("LR" | "TB")` | Flow direction for the two functions above |
| `undo()`, `redo()`, `clear()` | |
| `setReadOnly(bool)` | Switch without rebuilding |
| `setToolbarPosition(position)` | `"top"`, `"left"`, `"right"` or `"floating"` |
| `setNodeStyle(nodeIdOrJsonArray, styleJson)` | Own style of nodes, e.g. `{"preset":"critical"}` from the theme's presets; `""` removes it (one undo step) |
| `setEdgeStyle(edgeId, styleJson)` | The same for an edge |
| `getDefaultTheme()` | The diagram type's own colours as JSON (same shape as a theme) — copy it to start a house style |
| `setTheme(themeJson)` | House style (node / edge colours, font, editor colours; see ARCHITECTURE.md 7.4); `""` = none. Also as `options.theme` |
| `addNode(type, label?)` | Adds a node on a free spot in view; returns its id |
| `setNodeLabel(nodeId, label)` | One undo step |
| `selectNode(nodeId)` | Empty id clears the selection |
| `destroy()` | Removes the editor and all its listeners |
| `editor` | The underlying `WeavleJS` instance |

`config` callbacks: `onModelChanged(json)`, `onSelectionChanged(nodeId, edgeId, selectedNodeIdsJson)`,
`onNodeMoved(nodeJson)`, `onNodeResized(nodeJson)`, `onToolbarMoved(x, y)` (a floating toolbar was dragged —
store it and pass it back as option `toolbarFloatingPosition: { x, y }` to keep the spot across visits),
`onListChanged(listJson)` (org chart: with every `onModelChanged`, the chart as a flat list — store it and pass it back
through `setModelFromList`), `onDiagramEvent(name, detailJson)` (a diagram-specific event such as
`"orgchart:managerchanged"` with `nodeId`, `oldManagerId`, `newManagerId`, or `"orgchart:dottedlineadded"` /
`"orgchart:dottedlineremoved"` with `nodeId`, `managerId`; always in addition to `onModelChanged`, so
handle it only when you want to store that one change — a Switch on `name` in the handler; the family tree's requests
such as `"pedigree:addparent"` come without a model change, see section 7), `onConnectionRefused(reason, detailJson)`
(the diagram's rules refused a connection the user tried to make).

`config.diagramOptions` (object or JSON text) goes to the diagram definition, e.g. `{ "orientation": "vertical" }` for
the family tree or `{ "direction": "LR" }` for the flowchart.

Extra diagram types: `Weavle.registerDiagramType("myType", createMyDefinition)` before mounting.
