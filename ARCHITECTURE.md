# WeavleJS — architecture: engine and add-ins

WeavleJS is an engine that can draw and edit all kinds of diagrams. What a diagram type *is* — which parts
exist, what they look like, what may be connected to what and how the whole is arranged — is not in the
engine, but in an **add-in** (diagram definition).

This document records that split and is the plan for getting there step by step.

- **Now:** flowchart, BPMN, Ishikawa (fishbone), fault tree, org chart and node editor.
- **Planned:** pedigree (family tree around a focus person, horizontal like FamilySearch's Landscape view or
  vertical).

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
| `canConnect({ source, target, sourceHandle, targetHandle, edgeType, edge }, engine)` | Connection rules: true / false / a reason (string) / `{ ok, reason }`; `edge` = the edge being reconnected |
| `palette`, `getDefaultSize(type)` | Toolbar entries (groups allowed) and the size of a new node |
| `nodeTypes[type].outline` / `getNodeOutline(node)` | Outline for highlights: `"rect"`, `"pill"`, `"diamond"`, `"ellipse"` |
| `nodeTypes[type].extraObstacleMargin` | Extra clearance edges keep around this type |

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
| Connection rules with feedback | Flowchart, BPMN, node editor | ✅ `canConnect`, `weavle:connectionrefused` |
| Flexible ports (name, position, data type, maximum) | Node editor, pedigree | ✅ port objects from `getPorts`: `side`, `direction`, `dataType`, `max`, `onFull` |
| Edge types with router, arrowhead and style | All | ✅ `edgeTypes`, `defaultEdgeType`, `getEdgeTypeForConnection` |
| Routers: elbow, bezier, straight (besides orthogonal) | Pedigree, node editor | Partly: straight ✅, bezier ✅ |
| HTML nodes via `foreignObject` | Pedigree, node editor | – |
| Node data (fields) and rendering from data | Pedigree, node editor | Partly: `node.values` + field paths in inline editing (`getEditTarget`) |
| Containers (pools, lanes, groups): membership, moving along, `canContain`, `layoutContainer` | BPMN, later groups | ✅ |
| Custom add-in actions (`handleAction`) and redirected dragging (`getDragTarget`) | BPMN, pedigree | ✅ |
| Overlays on a node (for example an expandable list) | Pedigree | Partly (UI layer exists) |
| Derived mode: `toGraph(data)` | Pedigree | – |
| Layout hook with options and animation | Pedigree, Ishikawa | Partly: `layoutDiagram` ✅ (without options and animation) |
| Expanding and lazy loading via events | Pedigree | – |
| Themes (house style) and per-item styles | All (organisations) | Partly: style resolver, type classes, themes and per-item styles ✅ (section 7) |

### Couplings that are still on the wrong side

- Orthogonal routing still derives exit directions from the four side names (`getHandleDirection`); named ports
  work with the bezier router (`getPortSide`). Elbow router still open (roadmap step 4).
- Nodes only have a `label`, no structured data.

Solved in step 1: the `decision` exceptions (now `outline` and `extraObstacleMargin` per type), palette and
default sizes (definition `palette` / `getDefaultSize`; the engine's 140×60 is only the fallback for definitions
without sizes), the `"process"` shape fallback (now a plain box). UI colours come from the theme (7.2).

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

### Fault tree / FTA (automatic layout)

- **Model:** a tree of nodes with edges from child to parent: `topEvent` → gate → inputs. An event box (`topEvent`,
  `event`) has at most one gate; a gate's inputs are intermediate events or leaves (`basicEvent`,
  `undevelopedEvent`, `houseEvent`, `transfer`); an inhibit gate may also have one `conditionEvent`. Sibling order
  = order in `model.nodes`. A k-out-of-n gate keeps its threshold in `node.k` (n = its number of inputs).
- **Layout:** `layoutDiagram` builds a tidy tree top-down around the top event (which keeps its centre and top):
  every subtree gets a column as wide as its widest row, parents are centred above it. Event boxes have a fixed
  width and grow with their text; leaves carry their label below the symbol; the condition sits right of its gate.
  `routeEdge` returns the stored elbow lines (bus between a gate and its inputs).
- **Interaction:** as Ishikawa — no connecting or edge selection, dragging moves the whole tree, everything else
  through the node tools.
- **Later:** probabilities on basic events and the computed probability per gate / top event; minimal cut sets;
  collapsing subtrees; transfer events that link to another tree.

### Cause tree / ADC (automatic layout)

- **Model:** the INRS "arbre des causes": facts `variation` (unusual, circle) and `state` (usual, rectangle), plus one
  `damage` (the injury). Edges run from antecedent to consequent; a fact with several antecedents is a conjunction, a
  fact with several consequents a disjunction — so the model is a directed acyclic graph, not a tree. Edge type
  `uncertain` (dashed): it is not certain how the variation came about.
- **Layout:** `layoutDiagram` runs the layered layout on the reversed edges (from the damage, as the method asks
  "what was needed for this?") and mirrors it: the damage on the right, every fact as close to it as its longest
  path allows. Circles share one diameter, rectangles one height (the smallest that fits every label). `routeEdge`
  returns stored bus lines: conjunctions meet just before their consequent, disjunctions split just after their
  antecedent; edges across several columns follow the layout's dummy points (`bends`).
- **Interaction:** as the FTA — no connecting or edge selection, dragging moves the whole diagram; causes, links to
  another consequent (pick a fact), uncertainty and type through the node tools.
- **Later:** prevention measures per fact (the action plan of step 2 of the method), FPA (potential accident factors),
  the I / T-A / Ma / Mi observation frame per fact, vertical (bottom-up) orientation.

### Org chart (automatic layout)

- **Model:** cards `person` / `vacancy` (name = `label`, job title = `node.role`) with `reportsTo` edges from report
  to manager; several trees side by side are allowed. `dottedLine` edges (report → second manager) are functional /
  matrix lines outside the tree. `node.assistant` marks a report without reports of its own as an assistant;
  `node.collapsed` hides everything below a card (view state). Sibling order = order in `model.nodes`. Host apps keep
  a flat list (`id`, `managerId`, `name`, `role`, `vacancy`, `assistant`, `dottedManagerIds`): `modelFromList` /
  `modelToList` on the definition (`orgChartFromList` / `orgChartToList`), OutSystems `setModelFromList` / `getList` /
  `onListChanged`.
- **Layout:** tidy tree top-down; the first tree's top keeps its place, further trees follow on the right. A manager
  with at least three reports that have no reports of their own (and no assistants) gets them stacked below each
  other on a spine ("hanging" layout), so wide teams don't make the chart wide. Assistants sit in rows of two beside
  the line under their manager, above the team. A collapsed card shows "+n" and its subtree is hidden (engine hook
  `isNodeHidden`). Dotted lines use the engine's orthogonal router between facing sides. Cards have a fixed width and
  grow with name and role.
- **Interaction:** no connecting or edge selection. Dragging a card drags its team; dropping it onto another card
  (highlighted) makes that card its manager, with Alt it adds a dotted line instead; while dragging, its own line
  previews the new one to the highlighted card (no line over empty space); dropped elsewhere it goes back
  (engine hooks `getDropTarget` / `onNodeDrop`). Node tools: add a report, assistant or colleague (person or vacancy),
  collapse / expand the team, edit the job title (inline, field `role`), vacancy ↔ person, assistant on / off, insert
  a manager above, one level higher, add a dotted line (then click the other card: engine `startNodePick`) or remove
  one, reorder, remove only this person (the team moves up) or with the team. Diagram events after the action's
  `modelchanged`: `managerchanged { nodeId, oldManagerId, newManagerId }`, `dottedlineadded` / `dottedlineremoved
  { nodeId, managerId }`.
- **Colours:** variants `top` (person without a manager: dark blue, white text) and `manager` (person with reports:
  light blue tint); everyone else a white card, vacancies grey and dashed. Presets still win per card.
- **Collapse / expand buttons:** a "−" on the bottom edge of a card with a team (shown while hovered or selected)
  collapses it; a collapsed card shows a "+n" button there that expands it (kept in the export). Both also work in
  read-only mode. Built on the engine's node buttons (`getNodeButtons`), which other diagram types can use for their
  own on-node actions.
- **Later:** photo / initials, department colours and counts on the
  card; a search that opens collapsed teams and focuses a card.

### Node editor (free drawing, Blender style)

Status: built (`src/weavle-nodeeditor.js`, playground "Node-editor" with a sample).

- Nodes with a header and a list of outputs (right) and inputs (left), each with a label and a data type.
  Inputs may have a value box (shown while not connected); constants have value fields. Drawn in SVG; values are
  edited inline (double-click, `getEditTarget`). HTML nodes (step 5) can come later.
- Edges as bezier curves, coloured by data type (`edge.type` = the data type).
- Rules:
  - Data types must match (engine port check).
  - An input has at most one connection — a new link replaces the old one (`max: 1, onFull: "replace"`); an output
    may have several.
  - No cycles (`canConnect`).
- Later: evaluating the graph (computing output values), dynamic ports, HTML nodes.

### Pedigree (derived, hourglass around a focus person)

Status: build steps 1–3 done (`src/weavle-pedigree.js`: data → graph, horizontal and vertical layout, cards, one
partner at a time, empty slots, "+" menu and request events; playground "Stamboom" with "Weergave"). A vertical chart
grows upwards, so a layout keeps the focus card in place only as long as the chart stays inside the canvas; switching
the orientation pans the view instead. Decisions (see section 10): one card per person, one partner at a time, the host owns the data (the chart
asks, the host adds), an hourglass (ancestors, descendants and siblings) around one focus person, and generations
that load step by step. Horizontal and vertical are two layouts of the same model. Reference: FamilySearch
Landscape (couples, empty "add father / mother" slots, chevrons for more generations) for horizontal; a
MyHeritage-style tree (partners side by side, children below, a "+" under every card) for vertical.

#### Data (host side)

The host (OutSystems) keeps two flat lists plus the focus; GEDCOM-like (INDI / FAM):

```js
{
    focusId: "p1",
    persons: [
        { id: "p1", name: "Anne Sijtzes Miedema", gender: "male",   // "male" | "female" | "unknown"
          birthYear: 1870, deathYear: 1943, living: false,
          refId: "LYF5-4YW",                                         // shown after the years (optional)
          photoUrl: "",                                              // optional, else a silhouette
          parentFamilyId: "f2",                                      // the family this person is a child of
          preferredFamilyId: "f1",                                   // relationship shown when there are several
          hasMoreAncestors: false, hasMoreDescendants: false }       // host has data that was not sent (lazy)
    ],
    families: [
        { id: "f1", partner1Id: "p1", partner2Id: "p2",               // either may be empty (single parent)
          marriageDate: "5 mei 1894", marriagePlace: "Franekeradeel" }
    ]
}
```

- A child belongs to a **family**, not to one parent, so children of different marriages stay apart.
- Sibling order: `birthYear`, then list order. A person's families: list order. Partner1 is drawn first (top / left).
- One parent family per person for now (adoption / several parent sets: later).

#### Graph (`modelFromList` / `modelToList`, like the org chart)

- **Nodes:** `person` per person (fields copied onto the node: `name` as `label`, `gender`, `birthYear`, ...),
  `family` per family (the junction between the partners: carries the marriage details and is where child lines
  start). Persons outside the visible range stay in the model and are hidden (`isNodeHidden`).
- **Placeholders:** `placeholder` nodes (`role: "father" | "mother" | "partner" | "child"`, `forId`) generated by
  the layout before every pass (`addPlaceholders`), with derived ids (`ph:<person node id>:father`), plus a generated
  `family` (`ph:f:...`) where none exists yet and generated `partner` / `child` edges, so the normal layout places
  them. All carry `generated: true`; `modelToList` skips them.
- **Edges:** `partner` (person → family) and `child` (child → its parent family). No arrows; `routeEdge` returns the
  routes stored by the layout (as in the FTA).
- **View state on the nodes** (like `node.collapsed` in the org chart): `focus: true` on the focus person,
  `shownFamilyId` on a person whose shown relationship was switched in the chart (else the host's
  `preferredFamilyId`, else the last family), `expandedAncestors` / `expandedDescendants` on persons whose branch
  was opened beyond the default range.
- `modelFromList(list, previousModel)` keeps the view state of the previous model for ids that still exist, so a
  full refresh by the host does not reset the focus or the opened branches (normal edits use `applyChanges`).

#### What is shown (hourglass)

- **One partner at a time** (FamilySearch style): a person is shown with one relationship — its partner and that
  relationship's children. Several partners beside one person read as a triangle, and a frame around three people
  even more so. A badge on the card's top edge (two rings and the number of relationships; also read-only and in the
  export) says there are more; on the focus and descendants it opens "Relatie tonen" to switch (view state
  `shownFamilyId`, event `preferredpartnerchanged` so the host may store it as the preferred relationship).
- **Generation 0:** the focus person, its shown partner and, with `showSiblings` (default on), its siblings ordered
  by birth.
- **Ancestors:** `ancestorGenerations` (default 3) generations of parents of the focus person and of its shown
  partner. Every couple is one unit (the parent family is fixed; an ancestor's other relationships only show in the
  badge).
- **Descendants:** `descendantGenerations` (default 2) generations below the focus's shown relationship. A descendant
  is shown with its shown partner; their children follow in the next generation.
- **Siblings of the focus:** only the card (their partners and children by focusing on them).
- **Beyond the range:** a chevron button on the outer side of a unit when there is more: data in the model, or
  `hasMoreAncestors` / `hasMoreDescendants` from the host.

#### Layout

- `layoutDiagram` works in two abstract axes: **generation** (ancestors +, descendants −) and **spread** (order within
  a generation). Units: a couple (two cards), a person with its partners, a single sibling. Ancestors and descendants
  are each a tidy tree of units (`measure` / `place` as in the FTA), parents centred on their child, children centred
  on their family. Then the axes are mapped to x / y:
  - **`orientation: "horizontal"`** (default): generations are columns, ancestors to the right, descendants to the
    left. Partners are stacked, with the marriage details in the band between them (the `family` node).
  - **`orientation: "vertical"`:** generations are rows, ancestors at the top, descendants at the bottom. Partners sit
    side by side with a short partner line between them (the `family` node, ring icon).
- The focus card keeps its screen position when the layout changes (orientation, focus, expand, reload by the host);
  only a new focus scrolls it into the middle.
- **Edges:** elbow lines with a bend halfway between two generations: child → junction of its parents' couple;
  family → bus → each child.
- Changing the orientation, focus or opened branches relayouts without an undo step and without `modelchanged`.

#### Cards

| | Horizontal | Vertical |
|---|---|---|
| Size | 240 × 56 | 120 × 150 |
| Content | Silhouette / photo left, name (bold, 1 line), "1870–1943 • LYF5-4YW" | Photo on top, name (2 lines, centred), years |
| Gender | 4 px bar on the left | Coloured border and light tint |
| "+" button | Top-right corner inside the card (hover / selected) | Same |
| Relationship badge | On the top edge, right of the middle | Same |
| Chevron (more ancestors) | Outside the right edge | Above the top edge |

- Living persons show "Levend" instead of years; an unknown year shows "?".
- Variants (`getNodeVariant`, `defaultTheme`): `male` (blue), `female` (pink), `unknown` (grey), `focus` (heavier
  border, on top of the gender variant), placeholders dashed with a "+" and their text. Presets still win.

#### Interaction and actions

- Dragging, free connecting, edge selection and resizing are off; undo / redo are off (the host owns the data).
- **Click a card:** select it, open its node tools, event `personclicked`. **Double-click:** focus on it.
- **Placeholders:** "Vader toevoegen" / "Moeder toevoegen" as an empty couple for a person in the ancestor range
  (the focus, its shown partner and their ancestors) whose parents are unknown (and `hasMoreAncestors` is false), or as
  the missing parent of a single-parent family; for the focus "Partner toevoegen" when it has no relationship and
  "Kind toevoegen" when its shown relationship has no children. One click sends the request (engine hook
  `getNodeClickAction`). Shown with `showPlaceholders` (default on), never in read-only mode.
- **"+" button** (top-right, hover): opens "Toevoegen" — Vader / Moeder toevoegen (only when missing), Partner
  toevoegen, Broer of zus toevoegen, Kind toevoegen (with several relationships a heading and one row per relationship
  plus "zonder (nieuwe) partner"). **Click a card:** the full node tools — "Toevoegen", "Relatie tonen" (several
  relationships), Bewerken, Verwijderen. Centreren follows with step 4. Nothing of this in read-only mode.
- **Chevron:** opens that branch one generation further (`expandedAncestors` / `expandedDescendants`). If the host
  said there is more but the data is not in the model, the chart emits `needdata` and draws the branch when the host
  answers with `applyChanges`.

#### Events (`weavle:pedigree:<name>`, OutSystems `onDiagramEvent`)

The add actions are **requests**: the chart does not change the data. The host opens its form, saves, and answers
with `applyChanges` (below) — only what changed, never the whole tree. Every request carries a `requestId` that the
host passes back.

| Event | Detail |
|---|---|
| `personclicked` | `{ personId }` |
| `editperson` | `{ requestId, personId }` |
| `removeperson` | `{ requestId, personId }` |
| `addparent` | `{ requestId, personId, role: "father" \| "mother", familyId }` (`familyId` = the existing parent family or null) |
| `addpartner` | `{ requestId, personId, familyId }` (family with an empty partner slot, or null for a new family) |
| `addchild` | `{ requestId, personId, familyId }` (null = a new family without partner) |
| `addsibling` | `{ requestId, personId, familyId }` (the parent family, or null when there is none yet) |
| `focuschanged` | `{ personId, familyId }` |
| `preferredpartnerchanged` | `{ personId, familyId }` (the relationship now shown; the host may store it as `preferredFamilyId`) |
| `orientationchanged` | `{ orientation }` |
| `needdata` | `{ requestId, personId, direction: "ancestors" \| "descendants" }` |

#### Incremental changes (`applyChanges`)

A large tree is browsed, not reloaded: the host sends the focus and a few generations once (`setModelFromList`),
and after that only changes. Use case: deep in the ancestors, add a marriage and two children to a great-great-
grandfather; after "OK" in the host's form the chart looks the same, with the new family added in place.

```js
applyChanges({
    upsertPersons:   [ { id: "p90", name: "Grietje Jans", gender: "female", ... },     // the new wife
                       { id: "p91", name: "...", parentFamilyId: "f40", ... },         // child 1
                       { id: "p92", name: "...", parentFamilyId: "f40", ... } ],       // child 2
    upsertFamilies:  [ { id: "f40", partner1Id: "p17", partner2Id: "p90", marriageDate: "1823" } ],
    removePersonIds: [],
    removeFamilyIds: []
}, { requestId: "r12" })                                                               // optional
```

- **Upsert** = add when the id is new, else replace the record (full records, same shape as in the lists).
  Answers to `editperson` (changed fields) and `needdata` (the next generation) use the same call.
- **Remove:** a removed partner leaves an empty slot in its family; children of a removed family lose their
  `parentFamilyId`. The host decides what else to remove and sends it in the same call. Removing the focus person
  moves the focus to its partner, else a parent, else a child.
- **References may arrive before their target** (a child whose family is not sent yet): kept and hidden until the
  target arrives, so the host can send data in any order.
- **The view stays put:** focus, opened branches and the viewport are kept; the anchor is the person the request
  started from (with `requestId`) or else the focus card — it keeps its screen position (`keepNodeInView`).
- **With `requestId`:** the result is made visible — when the new persons fall outside the shown range, their branch
  is opened just far enough (e.g. the children of a great-great-grandfather) — and briefly highlighted. Without
  `requestId` (changes made elsewhere in the host) the chart only updates.
- One relayout per call, no undo step, no `modelchanged` echo back to the host (it already knows the change).
- `setModelFromList` stays for the first load and a full refresh; it also keeps the view state (see "Graph").
- `cancelRequest(requestId)`: the user closed the host's form without saving; the chart drops the pending request
  (e.g. its waiting indicator on the chevron for `needdata`).

#### Options and API

- `createPedigreeDefinition({ orientation, ancestorGenerations, descendantGenerations, showSiblings,
  showPlaceholders })`.
- Commands on the definition, also reachable from the adapter: `setOrientation(o)`, `setFocus(personId, familyId?)`,
  `expand(personId, direction)`, `applyChanges(changes, { requestId })`, `cancelRequest(requestId)`.
- OutSystems: `setModelFromList(json)` with the object above (not an array), `applyChanges(changesJson,
  requestId)`, `cancelRequest(requestId)`, `getList()`, plus the commands.

#### Engine work this needs

1. ✅ Nodes generated by the layout (placeholders): `layoutDiagram` adds / removes nodes marked `generated: true`
   (works without engine changes); they are never saved by `modelToList`.
2. Relayout without history (`engine.relayout()`), and undo / redo off per definition (`history: false`). For now the
   definition calls `applyDiagramLayout()` + `render()` itself and requests return false (no undo step).
3. ✅ A node button that opens the node tools of its node: action `{ type: "openNodeTools", menu }` →
   `getContextActions(node, engine, { menu })`; a menu of one group opens its submenu at once. Node buttons may carry
   an own glyph (`path`). Plus `getNodeClickAction(node)`: a click runs an action instead of selecting (empty slots).
4. Adapter: `setModelFromList` accepts an object; a generic way to call definition commands
   (`runDiagramCommand(name, argsJson)`).
5. Keep a node's screen position across a relayout or reload (`keepNodeInView(nodeId, before)`).
6. Change the model from outside without an undo step or `modelchanged` (for `applyChanges`): add, replace and
   remove nodes / edges, then one relayout; the adapter must not report it back as a host change.

#### Build steps

1. Data → graph, horizontal layout, cards, read-only; fictional sample family; playground entry "Stamboom".
2. Vertical layout and the orientation switch (playground toggle).
3. Placeholders, "+" button, node tools and the request events.
4. Focus change, chevrons / `needdata`, `applyChanges` / `cancelRequest` (with the playground simulating the host's
   form), view state across reloads, adapter commands, OutSystems wrapper guide.
5. Theme variants, `exportSvg`, docs (CLAUDE.md, README).

#### Later

- An ancestor appearing twice (pedigree collapse): drawn once, the second place gets a reference card that jumps to
  it. Until then a person is drawn only at its first place; the second path stops at the child (no placeholders
  or chevron there).
- Siblings of ancestors ("Kinderen" list on a couple, as on FamilySearch); half-siblings; adoption.
- Quick add in the chart itself (name only, `editMode: "inline"`); badges on cards (sources, warnings); animation
  between layouts; a fan chart.

---

## 7. Styling and themes (design)

Status: built (steps 1–5 of 7.10); open points in 7.11 and the backlog (edge tools). Goal: organisations can apply their house style to every diagram, and users can
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

        nodeVariants: {                                      // per structural variant (see below), e.g. org chart
            top:     { fill: "#003B70", textColor: "#FFFFFF" },
            manager: { fill: "#E6F0FA" }
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
- `nodeVariants` style nodes by a role the definition derives from the diagram's structure
  (`diagram.getNodeVariant(node, engine)`), not by their type: org chart `top` (a person without a manager) and
  `manager` (a person with reports). The variant follows the structure by itself (someone who gets a report turns
  into a manager), is not stored in the model and gives the node group the class `weavle-node--variant-{name}`.
  To keep every card the same, set the variants back to the type's colours in the theme.
- The theme is not part of the model, not part of undo and not reported in `weavle:modelchanged`.
- API: `setTheme(theme)` (re-renders, no undo step), `getTheme()`. OutSystems: `options.theme` (JSON) and
  `controller.setTheme(themeJson)`.
- Definitions ship their own colours as `diagram.defaultTheme` (`node`, `nodeTypes`, `nodeVariants`, `edge`, `edgeTypes`, `presets`;
  not `ui` / `font`, which belong to the editor): flowchart `FLOWCHART_THEME`, BPMN `BPMN_THEME` (events per kind
  from `EVENT_COLORS`), Ishikawa `ISHIKAWA_THEME`. It is part of layer 2 of 7.6, so any `options.theme` overrides it.
  `getDefaultTheme()` (OutSystems: `controller.getDefaultTheme()`, JSON) returns it as a starting point for a house
  style; `getPresets()` merges its presets with the theme's. `nodeTypes[type].colors` keeps working as a shorthand
  for `{ fill, stroke }` (custom definitions).

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
  2. definition default                   (nodeTypes[type].colors / .style, label colour; edgeTypes[type];
                                           then defaultTheme.nodeVariants[variant])
  3. generic theme                        theme.node / theme.edge, then theme.diagrams[id].node / .edge
  4. the type's fixedStyle                (properties a generic theme must not change)
  5. theme per type                       theme.nodeTypes[type] / theme.edgeTypes[type], then theme.diagrams[id]'s
  5b. theme per variant (nodes)           theme.nodeVariants[variant], then theme.diagrams[id]'s
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

- A built-in context action `setStyle` ("Stijl", icon: a palette; `getStyleAction`, added after the definition's
  actions by `getNodeContextActions`) with a submenu: "Standaard" (removes `style`) and the theme's presets.
  Each entry shows a swatch (`appendStyleSwatch`): a card in the resolved fill / line of this node type with that
  style and "Aa" in its text colour and weight — readable for text-only types (Ishikawa causes) too, where a
  scaled-down real shape would be invisible. The current choice is marked active.
- With `allowCustomStyles`: a heading "Eigen kleuren" with colour inputs for fill, line and text (submenu children
  `{ input: "color", property, value }`), starting from the resolved colour.
- Works on the whole selection when the node is part of it (one undo step, via `setNodeStyle`).
- Shown only when the theme has presets (or custom styles are allowed) and `diagram.canStyleNode(node)` does not
  return false.
- Edges: style via the API only (`setEdgeStyle`) — there are no edge tools yet (backlog).

### 7.10 Steps

Each step is usable on its own and changes nothing for existing diagrams without a theme.

1. ✅ **Resolver and classes:** `getNodeStyle` / `getEdgeStyle` (steps 1–4 of 7.6 with an empty theme), type classes,
   definitions switch from `getNodeColors` to `getNodeStyle`. No visible change.
2. ✅ **Theme:** `options.theme`, `setTheme`, `theme.diagrams`, `fixedStyle`, markers per colour, `theme.font`,
   `theme.ui`, the remaining hard-coded colours. OutSystems `setTheme`. Playground: a theme switch (default /
   sample house style).
3. ✅ **Per-item style:** `node.style` / `edge.style` with presets and `allowCustomStyles`; export check.
4. ✅ **"Stijl" in the node tools** and `canStyleNode` (edges: backlog).
5. ✅ **Definition defaults:** move BPMN / flowchart / Ishikawa colours into `defaultTheme`.

### 7.11 Open questions

Built with these defaults; revisit when real users ask:

1. **Free colours:** presets only by default (`allowCustomStyles: false`); colour pickers are opt-in.
2. **Per-diagram-type overrides:** `theme.diagrams[id]` is built (the sample theme uses it for Ishikawa).
3. **Dark mode:** a second theme the host switches with `setTheme` (nothing built in).
4. **Fonts:** only the family in the theme; no base size (it would change how much text fits a node).

---

## 8. Roadmap

Every step can be tested on its own and must not break what exists.

- [x] **1. Contract and clean-up:** pin down the add-in contract, move the palette and default sizes from the
      demo to the add-in, and remove the `decision` exceptions from the engine.
- [ ] **2. Interaction per add-in and actions as events** (`interaction` ✅, `weavle:action`).
- [x] **3. Connection rules:** `canConnect` with feedback while dragging. First rules for BPMN and flowchart.
- [~] **4. Flexible ports and edge types:** (port model and bezier done with step 6; elbow open) the port model from 4.3, `edgeTypes`, and the routers
      elbow, bezier and straight.
- [ ] **5. HTML nodes** via `foreignObject`.
- [x] **6. Node editor add-in.**
- [ ] **7. Derived mode and layout:** `toGraph`, layout hook with options and animation, expanding and lazy loading.
- [ ] **8. Pedigree add-in** (designed in section 6; its own build steps there). Needs from step 7 only what the
      pedigree section lists under "Engine work"; HTML nodes (step 5) are not needed (SVG cards).
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
- **Edge tools:** a tool surface for a selected edge (style, label, type), with `canStyleEdge(edge)`.

## 10. Decisions (pedigree)

The former open questions, decided (details in section 6, "Pedigree"):

0. **Several partners:** one at a time (FamilySearch style), with a badge that shows how many relationships there are
   and switches between them. Showing all partners around a person (and one frame around three people) suggests a
   triangle relationship.
1. **Card per person or per couple:** per person. The couple is a layout unit, so horizontal and vertical are two
   layouts of the same model.
2. **Data source and editing:** OutSystems owns persons and families. The chart is for navigating and for starting
   edits: "Vader toevoegen" etc. send a request event, the host opens its form and supplies the new data. Quick add
   in the chart itself may come later.
3. **Range:** an hourglass around a focus person — ancestors, descendants and the focus's siblings.
4. **Size:** a few generations each way; chevrons open a branch further and ask the host for data it has not sent
   yet (`needdata`).
5. **Views:** horizontal (FamilySearch Landscape style) and vertical; a fan chart later.
