import { WeavleJS } from  "./weavle.js";
import { createFlowchartDefinition } from "./weavle-flowchart.js";
import { createBpmnDefinition } from "./weavle-bpmn.js";
import { createOrderProcessSample } from "./samples/bpmn-order-process.js";

/*
  Demo / debug playground for WeavleJS

  What this file does:
  1. Creates the editor
  2. Hooks up UI buttons
  3. Logs custom events
  4. Shows current selection / exported JSON
  5. Makes local debugging much easier than inside OutSystems
*/

const host = document.getElementById("canvasHost");
const selectionInfoEl = document.getElementById("selectionInfo");
const eventLogEl = document.getElementById("eventLog");
const jsonOutputEl = document.getElementById("jsonOutput");
const statusTextEl = document.getElementById("statusText");

const chkReadonly = document.getElementById("chkReadonly");
const chkSnap = document.getElementById("chkSnap");
const rngCornerRadius = document.getElementById("rngCornerRadius");
const lblCornerRadius = document.getElementById("lblCornerRadius");
const selGridType = document.getElementById("selGridType");
const clrGrid = document.getElementById("clrGrid");
const selFlowDirection = document.getElementById("selFlowDirection");
const selToolbarPosition = document.getElementById("selToolbarPosition");
const chkDebugRoutePoints = document.getElementById("chkDebugRoutePoints");
const chkDebugAStarGrid = document.getElementById("chkDebugAStarGrid");
const nodeSurfaceEl = document.getElementById("nodeToolDock");







const shapeButtonsEl = document.getElementById("shapeButtons");

let currentDiagramKey = "bpmn";
let hostListenersAttached = false;

const selDiagram = document.getElementById("selDiagram");

if (selDiagram) {
  selDiagram.value = currentDiagramKey;
}


let currentDiagramDefinition = null;


let nodeCounter = 1;
let editor = null;

function getDiagramDefinition(key) {
  switch (key) {
    case "bpmn":
      return createBpmnDefinition();
    case "flowchart":
    default:
      return createFlowchartDefinition();
  }
}

function getSampleForDiagram(key) {
  if (key === "bpmn") {
    return {
      nodes: [
        {
          id: "b1",
          type: "startEvent",
          x: 130,
          y: 130,
          width: 60,
          height: 60,
          label: "Start"
        },
        {
          id: "b2",
          type: "task",
          x: 290,
          y: 120,
          width: 140,
          height: 80,
          label: "Process order"
        },
        {
          id: "b3",
          type: "gateway",
          x: 495,
          y: 115,
          width: 90,
          height: 90,
          label: "OK?"
        },
        {
          id: "b4",
          type: "endEvent",
          x: 690,
          y: 130,
          width: 60,
          height: 60,
          label: "End"
        }
      ],
      edges: [
        {
          id: "be1",
          sourceNodeId: "b1",
          targetNodeId: "b2",
          sourceHandle: "right",
          targetHandle: "left",
          label: ""
        },
        {
          id: "be2",
          sourceNodeId: "b2",
          targetNodeId: "b3",
          sourceHandle: "right",
          targetHandle: "left",
          label: ""
        },
        {
          id: "be3",
          sourceNodeId: "b3",
          targetNodeId: "b4",
          sourceHandle: "right",
          targetHandle: "left",
          label: "yes"
        }
      ]
    };
  }

  return {
    nodes: [
      {
        id: "n1",
        type: "process",
        x: 110,
        y: 125,
        width: 140,
        height: 70,
        label: "Start process"
      },
      {
        id: "n2",
        type: "decision",
        x: 420,
        y: 115,
        width: 120,
        height: 90,
        label: "Valid?"
      },
      {
        id: "n3",
        type: "terminator",
        x: 725,
        y: 125,
        width: 150,
        height: 70,
        label: "Done"
      }
    ],
    edges: [
      {
        id: "e1",
        sourceNodeId: "n1",
        targetNodeId: "n2",
        sourceHandle: "right",
        targetHandle: "left",
        label: "continue"
      },
      {
        id: "e2",
        sourceNodeId: "n2",
        targetNodeId: "n3",
        sourceHandle: "right",
        targetHandle: "left",
        label: "yes"
      }
    ]
  };
}


/**
 * Create a fresh editor instance.
 * Rebuild on option changes to keep demo logic simple.
 */
function createEditor() {
  // Tear down the previous instance so its window listeners don't keep reacting.
  editor?.destroy();
  host.innerHTML = "";

  currentDiagramDefinition = getDiagramDefinition(currentDiagramKey);

  editor = new WeavleJS(
    host,
    {
      width: 1600,
      height: 1000,
      snapToGrid: chkSnap.checked,
      readOnly: chkReadonly.checked,
      edgeCornerRadius: Number(rngCornerRadius.value),
      gridType: selGridType.value,
      layoutDirection: selFlowDirection.value || null,
      toolbarPosition: selToolbarPosition.value,
      debugRouting: chkDebugRoutePoints.checked || chkDebugAStarGrid.checked,
      debugRoutePoints: chkDebugRoutePoints.checked,
      debugAStarGrid: chkDebugAStarGrid.checked,
      toolSurfaceDockHost: nodeSurfaceEl

    },
    currentDiagramDefinition
  );

  window.weavle = editor;


  if (!hostListenersAttached){
    attachEditorEventListeners();
    hostListenersAttached = true;
  }

  renderShapeButtons();
  refreshSelectionInfo();
  refreshJsonOutput();
  setStatus(`Editor created (${currentDiagramKey})`);
}


function renderShapeButtons() {
  shapeButtonsEl.innerHTML = "";

  const palette = currentDiagramDefinition.palette
    || Object.keys(currentDiagramDefinition.nodeTypes).map(t => ({ type: t }));

  const makeButton = type => {
    const def = currentDiagramDefinition.nodeTypes[type];
    const btn = document.createElement("button");
    btn.textContent = def?.title || def?.defaultLabel || type;
    btn.addEventListener("click", () => addNode(type));
    return btn;
  };

  // Palette entries are either { type } or a group { group, types: [...] } (collapsible).
  palette.forEach((item, index) => {
    if (!item.group) {
      shapeButtonsEl.appendChild(makeButton(item.type));
      return;
    }

    const details = document.createElement("details");
    details.className = "palette-group";
    details.open = index < 2;

    const summary = document.createElement("summary");
    summary.textContent = item.group;
    details.appendChild(summary);

    const buttons = document.createElement("div");
    buttons.className = "palette-buttons";
    item.types.forEach(type => buttons.appendChild(makeButton(type)));
    details.appendChild(buttons);

    shapeButtonsEl.appendChild(details);
  });
}

function getDefaultNodeSize(type) {
  // The diagram definition knows its own sizes; this table is only a fallback.
  const fromDefinition = currentDiagramDefinition?.getDefaultSize?.(type);
  if (fromDefinition) return fromDefinition;

  switch (type) {
    case "startEvent":
          return { width: 80, height: 80 };
    case "endEvent":
                return { width: 60, height: 60 };
    case "intermediateEvent":
                return { width: 60, height: 60 };

    case "gateway":
      return { width: 120, height: 120 };

    case "decision":
      return { width: 140, height: 90 };

    case "task":
      return { width: 140, height: 60 };
    case "process":
      return { width: 140, height: 90 };
    case "terminator":
    default:
      return { width: 140, height: 70 };
  }
}

function addNode(type) {
  if (!editor) return;

  const id = "node_" + nodeCounter++;
  const size = getDefaultNodeSize(type);

  if (typeof editor.addNode === "function") {
    const label =
      currentDiagramDefinition?.nodeTypes?.[type]?.defaultLabel || type;

    // No x / y: the editor places the node on a free spot in the visible area.
    editor.addNode({
      id,
      type,
      width: size.width,
      height: size.height,
      label
    });

    const placed = editor.getData().nodes.find(n => n.id === id);
    logEvent("demo:addNode", { id, type, x: placed?.x, y: placed?.y, diagram: currentDiagramKey });
    refreshJsonOutput();
    return;
  }

  alert("No addNode API found.");
}


/**
 * Attach listeners to the host container.
 * If your class emits other custom events, add them here.
 */
function attachEditorEventListeners() {
  const eventNames = [
    "weavle:modelchanged",
    "weavle:nodemoved",
    "weavle:noderesized",
    "weavle:selectionchanged",
    "weavle:edgecreated",
    "weavle:edgereconnected",
    "weavle:labelchanged"
  ];

  eventNames.forEach(eventName => {
    host.addEventListener(eventName, handleEditorEvent);
  });
}

/**
 * Central event handler for custom events coming from the editor.
 */
function handleEditorEvent(event) {
  logEvent(event.type, event.detail || {});
  refreshSelectionInfo();
  refreshJsonOutput();
  setStatus(event.type);
}


/**
 * Add a log entry to the debug panel.
 */
function logEvent(type, detail) {
  const row = document.createElement("div");
  row.className = "event-log-entry";

  const now = new Date();
  const timeText = now.toLocaleTimeString();

  row.innerHTML = `
    <span class="event-log-time">${escapeHtml(timeText)}</span>
    <span class="event-log-type">${escapeHtml(type)}</span>
    <div>${escapeHtml(shortJson(detail))}</div>
  `;

  eventLogEl.prepend(row);

  while (eventLogEl.children.length > 100) {
    eventLogEl.removeChild(eventLogEl.lastChild);
  }
}

/**
 * Try to show the current selection.
 * This assumes your editor stores some selection state.
 * Adjust this function to your actual internal structure.
 */
function refreshSelectionInfo() {
  if (!editor) {
    selectionInfoEl.textContent = "Editor not initialized";
    return;
  }

  const selection = getSelectionSnapshot();
  selectionInfoEl.textContent = JSON.stringify(selection, null, 2);
}

/**
 * Export model JSON to the text area.
 */
function refreshJsonOutput() {
  if (!editor || typeof editor.getData !== "function") {
    jsonOutputEl.value = "";
    return;
  }

  try {
    const data = editor.getData();
    jsonOutputEl.value = JSON.stringify(data, null, 2);
  } catch (err) {
    jsonOutputEl.value = "Could not read model:\n" + err.message;
  }
}

/**
 * Read selection info from known or likely fields.
 * This is intentionally defensive, because your internal structure may change.
 */
function getSelectionSnapshot() {
  const state = editor?.state || {};
  const selectedNodeIds = Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : [];
  const primarySelectedNodeId = state.primarySelectedNodeId ?? null;
  const selectedEdgeId = state.selectedEdgeId ?? null;

  let selectedNodes = [];
  let selectedEdge = null;

  try {
    const data = typeof editor.getData === "function" ? editor.getData() : null;

    if (data?.nodes && selectedNodeIds.length > 0) {
      selectedNodes = data.nodes.filter(n => selectedNodeIds.includes(n.id));
    }

    if (data?.edges && selectedEdgeId) {
      selectedEdge = data.edges.find(e => e.id === selectedEdgeId) || null;
    }
  } catch {
    // no drama
  }

  return {
    selectedNodeIds,
    primarySelectedNodeId,
    selectedEdgeId,
    selectedNodes,
    selectedEdge,
    rawStateHints: {
      dragMode: state.dragMode ?? null,
      hoverNodeId: state.hoverNodeId ?? null,
      hoverEdgeId: state.hoverEdgeId ?? null,
      hoveredHandle: state.hoveredHandle ?? null,
      connecting: state.isConnecting ?? null
    }
  };
}


/**
 * Load a small sample model.
 */
function loadSample() {
  if (!editor || typeof editor.load !== "function") {
    alert("No load(data) function found on the editor.");
    return;
  }

  const sample = getSampleForDiagram(currentDiagramKey);
  editor.load(sample);

  logEvent("demo:loadSample", {
    diagram: currentDiagramKey,
    nodes: sample.nodes.length,
    edges: sample.edges.length
  });

  refreshSelectionInfo();
  refreshJsonOutput();
  setStatus(`Sample loaded (${currentDiagramKey})`);
}
/**
 * Recreate the editor with current options, then restore model if possible.
 */
function rebuildEditorPreserveModel() {
  let currentData = null;

  try {
    if (editor && typeof editor.getData === "function") {
      currentData = editor.getData();
    }
  } catch {
    // ignore
  }

  createEditor();

  if (currentData && typeof editor.load === "function") {
    editor.load(currentData);
    refreshJsonOutput();
  }
}

function clearLog() {
  eventLogEl.innerHTML = "";
}

function setStatus(text) {
  statusTextEl.textContent = text;
}

function shortJson(value) {
  try {
    const json = JSON.stringify(value);
    return json.length > 220 ? json.slice(0, 220) + "..." : json;
  } catch {
    return String(value);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- UI wiring ---------- */

document.getElementById("btnExport").addEventListener("click", () => {
  refreshJsonOutput();
  logEvent("demo:export", { ok: true });
  setStatus("JSON exported");
});

document.getElementById("btnLoadSample").addEventListener("click", loadSample);

// The complex sample is BPMN: switch the diagram type first if needed.
document.getElementById("btnLoadComplex").addEventListener("click", () => {
  if (currentDiagramKey !== "bpmn") {
    selDiagram.value = "bpmn";
    selDiagram.dispatchEvent(new Event("change"));
  }

  const sample = createOrderProcessSample();
  editor.load(sample);

  logEvent("demo:loadComplexSample", { nodes: sample.nodes.length, edges: sample.edges.length });
  refreshSelectionInfo();
  refreshJsonOutput();
  setStatus("Complex sample loaded (bpmn)");
});
document.getElementById("btnClearLog").addEventListener("click", clearLog);

chkReadonly.addEventListener("change", rebuildEditorPreserveModel);
chkSnap.addEventListener("change", rebuildEditorPreserveModel);
selGridType.addEventListener("change", rebuildEditorPreserveModel);

selToolbarPosition.addEventListener("change", () => editor.setToolbarPosition(selToolbarPosition.value));

// The flow direction only steers the tidy-up functions: no rebuild needed.
selFlowDirection.addEventListener("change", () => {
  editor.options.layoutDirection = selFlowDirection.value || null;
});
chkDebugRoutePoints.addEventListener("change", rebuildEditorPreserveModel);
chkDebugAStarGrid.addEventListener("change", rebuildEditorPreserveModel);

// The grid colour is pure CSS: no rebuild needed, just set the custom property on the host.
clrGrid.addEventListener("input", () => {
  host.style.setProperty("--weavle-grid-color", clrGrid.value);
});

rngCornerRadius.addEventListener("input", () => {
  lblCornerRadius.textContent = rngCornerRadius.value;
});

rngCornerRadius.addEventListener("change", rebuildEditorPreserveModel);

selDiagram.addEventListener("change", () => {
  currentDiagramKey = selDiagram.value;
  createEditor();
  loadSample();
});

/* ---------- Start ---------- */

lblCornerRadius.textContent = rngCornerRadius.value;
createEditor();
loadSample();