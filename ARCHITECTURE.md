# WeavleJS — architectuur: engine en add-ins

WeavleJS is een engine die allerlei soorten diagrammen kan tekenen en bewerken. Wat een diagramtype *is* —
welke onderdelen er bestaan, hoe ze eruitzien, wat met wat verbonden mag worden en hoe het geheel geordend
wordt — staat niet in de engine, maar in een **add-in** (diagramdefinitie).

Dit document legt die verdeling vast en is het plan om er stap voor stap naartoe te werken.

- **Nu:** flowchart en BPMN.
- **Gepland:** node-editor (Blender-stijl) en stamboom (pedigree, zoals de Landscape-weergave van FamilySearch).

---

## 1. Uitgangspunt

| | Verantwoordelijk voor |
|---|---|
| **Engine** | Een generieke tekentafel met een graaf: nodes, poorten en verbindingen, plus alle interactie (selecteren, slepen, resizen, zoomen/pannen, snappen, undo/redo, events, API). De engine kent geen "gateway" of "echtpaar". |
| **Add-in** | Een diagramtaal: welke node- en verbindingstypes er zijn, hoe ze eruitzien, welke poorten ze hebben, welke verbindingen zijn toegestaan, welke acties er zijn, en eventueel hoe het diagram automatisch wordt geordend. |

Vuistregel: **als je een type bij naam moet noemen, hoort het in de add-in.**

---

## 2. Twee werkwijzen

| | Vrij tekenen | Afgeleid |
|---|---|---|
| **Voorbeelden** | Flowchart, BPMN, node-editor | Stamboom |
| **Bron van waarheid** | De nodes en verbindingen zelf | Domeindata (personen, huwelijken, ouder-kindrelaties), bijvoorbeeld uit OutSystems |
| **Wie maakt de nodes** | De gebruiker | De add-in, via `toGraph(data)` |
| **Wie bepaalt de positie** | De gebruiker (slepen, snappen, uitlijnen) | De layout van de add-in |
| **Wat een actie doet** | Past het model direct aan (met undo) | Stuurt een verzoek als event, bijvoorbeeld `weavle:action { action: "addFather", personId }`; de host verwerkt het en levert nieuwe data aan |

De engine ondersteunt beide. Een add-in geeft aan in welke modus hij werkt.

---

## 3. Verdeling van verantwoordelijkheden

| Onderwerp | Engine | Add-in |
|---|---|---|
| **Nodes** | Tekenen, selecteren, slepen, resizen, snappen, uitlijnen, verwijderen | Types, vorm (SVG of HTML), kleuren, standaardmaat, resize-regels, labelplaatsing, iconen |
| **Poorten** | Tekenen, raken, hover, snappen naar een poort | Welke poorten een type heeft: positie, richting, in/uit, datatype, maximum aantal verbindingen |
| **Verbindingen** | Trekken, opnieuw verbinden, preview, selecteren, labels | Verbindingstypes: lijnstijl, pijlpunt, router |
| **Regels** | Vragen "mag dit?" en feedback geven (rode poort, geweigerde drop met reden) | Het antwoord: `canConnect(...)` |
| **Routering** | De algoritmes: haaks (A\*), elleboog, bezier, recht | Kiest per verbindingstype een router en de instellingen |
| **Layout** | Het mechanisme: toepassen, animeren, undo | Optioneel een strategie (bijvoorbeeld generaties in kolommen) en de opties ervan |
| **Data** | Opslaan, undo, events, `getData()` / `load()` | Welke velden een node heeft en hoe die zichtbaar worden |
| **UI rond nodes** | Plek voor node tools, contextacties en overlays | Welke acties er zijn ("kind toevoegen", "partner toevoegen", ...) |
| **Palet** | – | Welke types er in het palet staan, en in welke groepen |
| **Interactie** | Voert slepen, verbinden, resizen en verwijderen uit | Zet die per diagramtype aan of uit |

---

## 4. Het add-in-contract

### 4.1 Wat er nu al is

Dit zijn de hooks die de engine vandaag gebruikt:

| Hook | Doel |
|---|---|
| `id` | Naam van het diagramtype |
| `shapes` | SVG-vormfuncties `(node, engine) => SVGElement` |
| `nodeTypes[type]` | `defaultLabel`, `colors`, `shape` (plus optioneel `resize` en `label`) |
| `getPorts(node)` | Poortposities (nu altijd boven, rechts, onder, links) |
| `routeEdge(...)` | Eigen routering van een verbinding |
| `getRoutingConfig(edge)` | Instellingen voor de haakse A\*-router |
| `getContextActions(node)` | Acties in de node tools |
| `getNodeInteractionMode(node)` | `"action-rail"` of `"docked-panel"` |
| `getNodeToolRenderer` | Eigen weergave van de node tools |
| `getResizeRules(node)` | `false` of `{ minWidth, minHeight, maxWidth, maxHeight, keepAspectRatio }` |
| `getLabelLayout(node)` | `{ placement: "inside" \| "below" \| "auto", padding…, widthFactor, heightFactor, fontSize, maxLines }` |

### 4.2 Waar we naartoe gaan

Dit is een schets; details volgen per stap uit de roadmap.

```js
export default {
    id: "flowchart",
    name: "Flowchart",
    mode: "free",                       // "free" | "derived"

    interaction: {                      // standaard alles aan
        dragNodes: true, resizeNodes: true, connect: true, deleteItems: true
    },

    nodeTypes: {
        terminator: {
            label: "Start / Stop",
            render: (node, api) => ...,  // SVGElement, of { html } voor een HTML-node
            size: { width: 140, height: 60 },
            colors: { fill: "#E8F3EC", stroke: "#1B5278" },
            ports: "sides",              // of een lijst, zie 4.3
            resize: { minWidth: 80, minHeight: 40 },
            labelLayout: { placement: "inside" },
            fields: { }                  // datavelden (zie node-data)
        }
    },

    edgeTypes: {
        flow: { router: "orthogonal", marker: "arrow", style: { stroke: "#666", width: 1.5 } }
    },

    rules: {
        canConnect({ source, sourcePort, target, targetPort, edgeType }) {
            // true, false, of { ok: false, reason: "..." }
        }
    },

    palette: [ { group: "Basis", types: ["process", "decision", "terminator"] } ],
    actions: (node) => [ ... ],

    layout: null,                        // of { run(graph, options), options: { orientation: "landscape" } }
    toGraph: null                        // alleen bij mode "derived": (data) => ({ nodes, edges })
};
```

### 4.3 Poortenmodel (nieuw)

Poorten krijgen een naam en zijn niet meer beperkt tot de vier zijden:

```js
ports: [
    { id: "in-color",  side: "left",  offset: 40, direction: "in",  dataType: "color", max: 1, label: "Color" },
    { id: "out-shader", side: "right", offset: 40, direction: "out", dataType: "shader", label: "BSDF" }
]
```

- `side` en `offset` bepalen de positie. De uitgangsrichting volgt uit `side`.
- `direction`, `dataType` en `max` zijn input voor `canConnect` en voor de feedback tijdens het slepen.
- `ports: "sides"` blijft de korte vorm voor de huidige vier poorten.

---

## 5. Wat de engine hiervoor nodig heeft

| Mogelijkheid | Nodig voor | Status |
|---|---|---|
| Resize-regels per type | Alle | ✅ `getResizeRules` |
| Labelplaatsing en afbreken per type | Alle | ✅ `getLabelLayout` |
| Interactie per add-in aan/uit | Stamboom | – |
| Acties als events (`weavle:action`) | Stamboom, integratie met OutSystems | – |
| Verbindingsregels met feedback | Flowchart, BPMN, node-editor | – |
| Flexibele poorten (naam, positie, datatype, maximum) | Node-editor, stamboom | – |
| Verbindingstypes met router, pijlpunt en stijl | Alle | – |
| Routers: elleboog, bezier, recht (naast haaks) | Stamboom, node-editor | – |
| HTML-nodes via `foreignObject` | Stamboom, node-editor | – |
| Node-data (velden) en tekenen vanuit data | Stamboom, node-editor | – |
| Overlays aan een node (bijvoorbeeld een uitklaplijst) | Stamboom | Deels (UI-laag bestaat) |
| Afgeleide modus: `toGraph(data)` | Stamboom | – |
| Layout-hook met opties en animatie | Stamboom | – |
| Uitklappen en lazy loading via events | Stamboom | – |

### Koppelingen die nu nog aan de verkeerde kant zitten

- `"decision"` staat hard in de engine (vorm-uitzondering en extra obstakelmarge in `getNodeObstacleBox`).
- Overal wordt uitgegaan van vier poorten (boven, rechts, onder, links).
- Verbindingen zijn altijd haaks, met een vaste pijlpunt.
- Palet en standaardmaten staan in de demo (`palette`, `getDefaultNodeSize`), niet in de add-in.
- `createConnectedNode` en `startNodeCreation` gebruiken vaste maten (140×60).
- Nodes hebben alleen een `label`, geen gestructureerde data.

---

## 6. De diagramtypes

### Flowchart en BPMN (vrij tekenen)

- Blijven functioneel zoals ze nu zijn, alleen omgezet naar het contract.
- Krijgen verbindingsregels, bijvoorbeeld:
  - Geen verbinding van eind naar eind.
  - Een start-event heeft geen inkomende lijnen, een eind-event geen uitgaande.

### Node-editor (vrij tekenen, Blender-stijl)

- Nodes met een kop en een lijst ingangen (links) en uitgangen (rechts), elk met een label en een datatype.
  Eventueel met invoervelden in de node (HTML-node).
- Verbindingen als bezier-curves, gekleurd naar datatype.
- Regels:
  - Datatypes moeten passen.
  - Een ingang heeft maximaal één verbinding; een uitgang mag er meerdere hebben.
  - Geen kringen.
- Vooral een test voor het poortenmodel, de bezier-router en HTML-nodes.

### Stamboom (afgeleid, FamilySearch Landscape-stijl)

- **Domeinmodel:** personen, huwelijken (echtparen) en ouder-kindrelaties. Het diagram volgt daaruit via `toGraph`.
- **Echtpaarkaart:** één HTML-node met man en vrouw, huwelijksgegevens, avatars, actieknoppen, lege plekken
  ("Add spouse", "Add father/mother") en een uitklapbare kinderlijst ("Children", "Add child").
- **Poorten per persoon:** aan de voorouderkant één poort voor de man en één voor de vrouw, elk naar het
  eigen ouderpaar. Aan de nakomelingenkant één poort naar de kinderen.
- **Layout:** automatisch, generaties in kolommen. Voorouders naar de ene kant en nakomelingen naar de
  andere; de oriëntatie is een optie ("landscape", later eventueel "portrait").
- **Verbindingen:** elleboog-lijnen met één knik tussen de kolommen, zonder pijl.
- **Interactie:** slepen, vrij verbinden en resizen staan uit. Acties ("addFather", "addChild", uitklappen,
  focus verschuiven) gaan als events naar de host.

---

## 7. Roadmap

Elke stap is los te testen en mag het bestaande niet breken.

- [ ] **1. Contract en opruimen:** het add-in-contract vastleggen, palet en standaardmaten van de demo naar
      de add-in verhuizen, en de `decision`-uitzonderingen uit de engine halen.
- [ ] **2. Interactie per add-in en acties als events** (`interaction`, `weavle:action`).
- [ ] **3. Verbindingsregels:** `canConnect` met feedback tijdens het slepen. Eerste regels voor BPMN en flowchart.
- [ ] **4. Flexibele poorten en verbindingstypes:** het poortenmodel uit 4.3, `edgeTypes`, en de routers
      elleboog, bezier en recht.
- [ ] **5. HTML-nodes** via `foreignObject`.
- [ ] **6. Node-editor-add-in.**
- [ ] **7. Afgeleide modus en layout:** `toGraph`, layout-hook met opties en animatie, uitklappen en lazy loading.
- [ ] **8. Stamboom-add-in.**

Na stap 5 kan de stamboom eventueel vóór de node-editor, als die meer prioriteit heeft.

---

## 8. Open vragen (stamboom)

1. **Databron:** levert OutSystems de personen en relaties? Opent "Add father" daar een formulier, of moet
   het bewerken in de chart zelf gebeuren?
2. **Bekijken of bewerken:** is de chart vooral om te navigeren, of ook om de stamboom mee op te bouwen?
3. **Weergaven:** alleen Landscape, of ook Portrait of een waaier?
4. **Omvang:** alle generaties tegelijk, of per stap uitklappen zoals FamilySearch?
