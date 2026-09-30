import { WeavleJS } from  "./weavle.js";
import { createFlowchartDefinition } from "./weavle-flowchart.js";
import { createBpmnDefinition } from "./weavle-bpmn.js";

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
          x: 120,
          y: 140,
          width: 60,
          height: 60,
          label: "Start"
        },
        {
          id: "b2",
          type: "task",
          x: 280,
          y: 120,
          width: 140,
          height: 80,
          label: "Process order"
        },
        {
          id: "b3",
          type: "gateway",
          x: 500,
          y: 120,
          width: 90,
          height: 90,
          label: "OK?"
        },
        {
          id: "b4",
          type: "endEvent",
          x: 700,
          y: 140,
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
        x: 120,
        y: 120,
        width: 140,
        height: 70,
        label: "Start process"
      },
      {
        id: "n2",
        type: "decision",
        x: 420,
        y: 120,
        width: 120,
        height: 90,
        label: "Valid?"
      },
      {
        id: "n3",
        type: "terminator",
        x: 720,
        y: 120,
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

  palette.forEach(item => {
    const type = item.type;
    const def = currentDiagramDefinition.nodeTypes[type];

    const btn = document.createElement("button");
    btn.textContent = def?.defaultLabel || type;

    btn.addEventListener("click", () => addNode(type));

    shapeButtonsEl.appendChild(btn);
  });
}

function getDefaultNodeSize(type) {
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
  const x = 120 + (nodeCounter * 30);
  const y = 120 + (nodeCounter * 20);
  const size = getDefaultNodeSize(type);

  if (typeof editor.addNode === "function") {
    const label =
      currentDiagramDefinition?.nodeTypes?.[type]?.defaultLabel || type;

    editor.addNode({
      id,
      type,
      x,
      y,
      width: size.width,
      height: size.height,
      label
    });

    logEvent("demo:addNode", { id, type, x, y, diagram: currentDiagramKey });
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
document.getElementById("btnClearLog").addEventListener("click", clearLog);

chkReadonly.addEventListener("change", rebuildEditorPreserveModel);
chkSnap.addEventListener("change", rebuildEditorPreserveModel);

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