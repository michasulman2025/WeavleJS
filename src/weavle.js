
import { createFlowchartDefinition } from "./weavle-flowchart.js";
import { createBpmnDefinition  } from "./weavle-bpmn.js";

export class WeavleJS {


    // ============================================================
    // 1. STATIC / CONFIGURATION
    // ============================================================

    /**
     * Returns the built-in flowchart diagram definition.
     * A diagram definition describes node types, port layout, edge routing,
     * context actions, and the interaction mode.
     * Pass a custom definition to the constructor to override this.
     */



    // ============================================================
    // 2. CONSTRUCTOR & INITIALISATION
    // ============================================================

    /**
     * @param {string|HTMLElement} container  CSS selector or DOM element that hosts the diagram.
     * @param {object}             options     Optional overrides for width, height, gridSize, etc.
     * @param {object|null}        diagramDefinition  Custom diagram definition; defaults to flowchart.
     */
    constructor(container, options = {}, diagramDefinition = null) {

        // Accept either a CSS selector string or a direct DOM element reference.
        this.container = typeof container === "string"
            ? document.querySelector(container)
            : container;

        // Merge provided options with sensible defaults.
        this.options = Object.assign({
            width: 1200,
            height: 800,
            gridSize: 20,
            snapToGrid: false,
            readOnly: false,
            edgeCornerRadius: 8,
            edgeStubLength: 24,
            autoEdgeConnect: false,
            gridType: "dots",          // "dots" | "lines" | "none" — style via CSS vars, see renderGrid
            debugRouting: false,       // master switch for the debug overlays below
            debugCanvasGrid: false,
            debugAStarGrid: false,
            debugRoutePoints: false,
            toolSurfaceDockHost: null,
        }, options);

        // The diagram definition drives node types, port layout, routing and context actions.
        this.diagram = diagramDefinition || createFlowchartDefinition();


        // The internal data model — nodes and edges are plain objects.
        this.model = {
            nodes: [],
            edges: []
        };

        // Transient UI state: selection, hover, drag, pan/zoom, previews, etc.
        this.state = {
            selectedNodeIds: [],
            selectedEdgeId: null,
            primarySelectedNodeId: null,

            hoverNodeId: null,
            hoverHandleNodeId: null,
            hoverHandleName: null,

            draggingNodeId: null,
            draggingEdgeHandleId: null,
    
            draggingNodeIds: null, // array van ids
            dragStartMouseX: 0,
            dragStartMouseY: 0,
            dragStartPositions: null, // { nodeId: {x,y} }
    
            draggingSegmentEdgeId: null,
            draggingSegmentIndex: null,
            draggingSegmentOrientation: null,
            draggingSegmentStartMouseX: 0,
            draggingSegmentStartMouseY: 0,
            draggingSegmentOriginalPoints: null,

            reconnectingEdgeId: null,
            reconnectingSide: null,
            reconnectionPreviewX: 0,
            reconnectionPreviewY: 0,

            offsetX: 0,
            offsetY: 0,

            connectingNodeId: null,
            connectingHandle: null,
            connectionPreviewX: 0,
            connectionPreviewY: 0,

            creatingNodeType: null,
            creatingNodeWidth: 0,
            creatingNodeHeight: 0,
            creationPreviewX: 0,
            creationPreviewY: 0,

            lastMouseX: 0,
            lastMouseY: 0,

            snapGuideX: null,
            snapGuideY: null,

            zoom: 1,
            panX: 0,
            panY: 0,

            isPanning: false,
            panStartX: 0,
            panStartY: 0,
            panOriginX: 0,
            panOriginY: 0,

            lastClickTime: 0,
            lastClickType: null,
            lastClickId: null,

            editingLabel: null,
            nodeToolNodeId: null,

            isMarqueeSelecting: false,
            marqueeStartX: 0,
            marqueeStartY: 0,
            marqueeCurrentX: 0,
            marqueeCurrentY: 0,
            marqueeAdditive: false,

        };

        this.routing = {
            gridSize: 20,
            stubLength: 20,
            obstacleMargin: 16
        };

        // Undo / redo history stack.
        this.history = [];
        this.historyIndex = -1;
        this.isRestoringHistory = false;

        this.init();
    }


    

    /** Builds the SVG canvas, the HTML UI overlay layer, and wires up all events. */
    init() {
        this.createSvg();

        // Ensure the container establishes a positioning context for the overlay layer.
        if (getComputedStyle(this.container).position === "static") {
            this.container.style.position = "relative";
        }

        this.nodeToolEl = null;

        // The UI layer sits on top of the SVG and holds floating HTML elements
        // (node tool surface, inline label inputs). pointer-events are disabled by default
        // so mouse events fall through to the SVG unless a child re-enables them.
        this.uiLayer = document.createElement("div");
        this.uiLayer.style.position = "absolute";
        this.uiLayer.style.left = "0";
        this.uiLayer.style.top = "0";
        this.uiLayer.style.width = "100%";
        this.uiLayer.style.height = "100%";
        this.uiLayer.style.pointerEvents = "none";

        this.container.appendChild(this.uiLayer);

        this.bindEvents();
        this.render();
    }

    /**
     * Creates the SVG element, arrow-head marker definitions, and the four render layers.
     *
     * Layer stack inside the <g data-viewport> group:
     *   grid    – background grid (dots or lines, per options.gridType)
     *   edges   – rendered edge paths and labels
     *   nodes   – rendered node shapes
     *   overlay – transient previews (new connection, new node, snap guides)
     */
    createSvg() {

        const NS = "http://www.w3.org/2000/svg";

        this.svg = document.createElementNS(NS, "svg");
        this.svg.setAttribute("width", this.options.width);
        this.svg.setAttribute("height", this.options.height);
        this.svg.style.background = "var(--weavle-canvas-bg, #fafafa)";
        this.svg.style.userSelect = "none";
        this.svg.style.touchAction = "none";

        // --- SVG <defs>: arrow-head markers ---

        const defs = document.createElementNS(NS, "defs");

        // Default (unselected) arrowhead — grey fill.
        const markerDefault = document.createElementNS(NS, "marker");
        markerDefault.setAttribute("id", "arrow-default");
        markerDefault.setAttribute("viewBox", "0 0 10 10");
        markerDefault.setAttribute("refX", "10");
        markerDefault.setAttribute("refY", "5");
        markerDefault.setAttribute("markerWidth", "6");
        markerDefault.setAttribute("markerHeight", "6");
        markerDefault.setAttribute("orient", "auto-start-reverse");

        const pathDefault = document.createElementNS(NS, "path");
        pathDefault.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
        pathDefault.setAttribute("fill", "#666");

        markerDefault.appendChild(pathDefault);
        defs.appendChild(markerDefault);

        // Selected arrowhead — accent colour fill.
        const markerSelected = document.createElementNS(NS, "marker");
        markerSelected.setAttribute("id", "arrow-selected");
        markerSelected.setAttribute("viewBox", "0 0 10 10");
        markerSelected.setAttribute("refX", "10");
        markerSelected.setAttribute("refY", "5");
        markerSelected.setAttribute("markerWidth", "6");
        markerSelected.setAttribute("markerHeight", "6");
        markerSelected.setAttribute("orient", "auto-start-reverse");

        const pathSelected = document.createElementNS(NS, "path");
        pathSelected.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
        pathSelected.setAttribute("fill", "#eb6c4c");

        markerSelected.appendChild(pathSelected);
        defs.appendChild(markerSelected);

        this.svg.appendChild(defs);

        //Node glow in hot state..
        const hoverGlowFilter = document.createElementNS(NS, "filter");
        hoverGlowFilter.setAttribute("id", "hover-glow");
        hoverGlowFilter.setAttribute("x", "-50%");
        hoverGlowFilter.setAttribute("y", "-50%");
        hoverGlowFilter.setAttribute("width", "200%");
        hoverGlowFilter.setAttribute("height", "200%");

        const blur = document.createElementNS(NS, "feGaussianBlur");
        blur.setAttribute("in", "SourceGraphic");
        blur.setAttribute("stdDeviation", "3");

        hoverGlowFilter.appendChild(blur);
        defs.appendChild(hoverGlowFilter);

        // Background grid pattern — contents are (re)built by renderGrid for the current gridType.
        // Unique id per instance so several editors can live on one page.
        this.gridPattern = document.createElementNS(NS, "pattern");
        this.gridPattern.setAttribute("id", `weavle-grid-${Math.random().toString(36).slice(2, 10)}`);
        this.gridPattern.setAttribute("patternUnits", "userSpaceOnUse");
        this.gridPatternKey = null;
        defs.appendChild(this.gridPattern);

        // --- Viewport group (receives pan / zoom transform) ---
        //
        //  <svg>
        //      <defs />
        //      <g data-viewport>
        //          <g data-layer="grid" />     (dots / lines pattern, see renderGrid)
        //          <g data-layer="edges" />
        //          <g data-layer="nodes" />
        //          <g data-layer="overlay" />
        //      </g>
        //  </svg>

        this.viewport = document.createElementNS(NS, "g");
        this.viewport.setAttribute("data-viewport", "true");

        this.layers = {
            grid:    document.createElementNS(NS, "g"),
            edges:   document.createElementNS(NS, "g"),
            nodes:   document.createElementNS(NS, "g"),
            overlay: document.createElementNS(NS, "g"),
            debug: document.createElementNS(NS, "g")
        };

        this.layers.grid.setAttribute("data-layer", "grid");
        this.layers.edges.setAttribute("data-layer", "edges");
        this.layers.nodes.setAttribute("data-layer", "nodes");
        this.layers.overlay.setAttribute("data-layer", "overlay");
        this.layers.debug.setAttribute("data-layer", "debug");

        this.viewport.appendChild(this.layers.grid);
        this.viewport.appendChild(this.layers.edges);
        this.viewport.appendChild(this.layers.nodes);
        this.viewport.appendChild(this.layers.overlay);
        this.viewport.appendChild(this.layers.debug);

        this.svg.appendChild(this.viewport);
        this.container.appendChild(this.svg);
    }

    /** Binds all required DOM event listeners and stores the bound references for later cleanup. */
    bindEvents() {
        this.onMouseDownBound = this.onMouseDown.bind(this);
        this.onMouseMoveBound = this.onMouseMove.bind(this);
        this.onMouseUpBound   = this.onMouseUp.bind(this);
        this.onKeyDownBound   = this.onKeyDown.bind(this);
        this.onWheelBound     = this.onWheel.bind(this);
        //this.onDoubleClickBound = this.onDoubleClick.bind(this);

        this.svg.addEventListener("mousedown", this.onMouseDownBound);
        this.svg.addEventListener("wheel",     this.onWheelBound, { passive: false });
        //this.svg.addEventListener("dblclick", this.onDoubleClickBound);

        window.addEventListener("mousemove", this.onMouseMoveBound);
        window.addEventListener("mouseup",   this.onMouseUpBound);
        window.addEventListener("keydown",   this.onKeyDownBound);
    }


    // ============================================================
    // 3. PUBLIC API
    // ============================================================

    /** Returns the engine version string. */
    getVersion() {
        return "0.7.5";
    }

    /** Replaces the current model with the supplied data and re-renders. */
    load(data) {
        this.model.nodes = data.nodes || [];
        this.model.edges = data.edges || [];

        this.model.edges.forEach(edge => {
            // Older versions froze edges as manual when auto-routing failed; give them a fresh attempt.
            if (edge.isAutoRoute === false && this.isFallbackRoute(edge)) {
                edge.isAutoRoute = true;
            }

            this.updateEdgeRoute(edge);
        });

        this.history = [];
        this.historyIndex = -1;

        this.clearTransientStateAfterHistoryRestore();
        this.render();
        this.pushHistory();
    }

    /** Returns a deep copy of the current model (safe to mutate externally). */
    getData() {
        return JSON.parse(JSON.stringify(this.model));
    }

    /**
     * Dispatches a CustomEvent on the container element.
     * @param {string} eventName  e.g. "weavle:modelchanged"
     * @param {object} payload    Placed in event.detail
     */
    emit(eventName, payload) {
        if (!this.container) return;

        this.container.dispatchEvent(
            new CustomEvent(eventName, {
                detail: payload
            })
        );
    }

    emitModelChanged() {
    this.emit("weavle:modelchanged", { model: this.getData() });
}

    /** Appends a node object to the model and re-renders. */
    addNode(node) {
        this.model.nodes.push(node);
        this.render();
    }

    /** Removes all nodes and edges and re-renders. */
    clear() {
        this.model.nodes = [];
        this.model.edges = [];
        this.render();
    }


    // ============================================================
    // 4. RENDERING
    // ============================================================

    /** Master render: updates the viewport transform then redraws every layer. */
    render() {
        this.updateViewportTransform();
        this.renderGrid();
        this.renderEdges();
        this.renderNodes();
        this.renderOverlay();
        this.renderDebug();
    }

    /**
     * Renders the background grid as a single pattern-filled rect covering the visible area.
     * It lives inside the viewport group, so it pans and zooms with the diagram.
     *
     * options.gridType: "dots" (default) | "lines" | "none". Grid points sit on multiples of gridSize.
     * Styling via CSS custom properties on the container (or any ancestor):
     *   --weavle-grid-color        dot / line colour          (default #c3cad3)
     *   --weavle-grid-dot-radius   dot radius                 (default 1px)
     *   --weavle-grid-line-width   line thickness             (default 0.5px)
     *   --weavle-canvas-bg         canvas background          (default #fafafa)
     * or target the classes .weavle-grid-dot / .weavle-grid-line directly.
     */
    renderGrid() {
        this.layers.grid.innerHTML = "";

        const type = this.options.gridType;
        if (type !== "dots" && type !== "lines") return;

        const NS   = "http://www.w3.org/2000/svg";
        const size = this.options.gridSize || 20;
        const key  = `${type}:${size}`;

        // Rebuild the pattern tile only when type or size changed.
        if (this.gridPatternKey !== key) {
            const p = this.gridPattern;
            p.innerHTML = "";

            // Offset the tile by half a cell so dots / line crossings land exactly on multiples of size.
            p.setAttribute("x", -size / 2);
            p.setAttribute("y", -size / 2);
            p.setAttribute("width", size);
            p.setAttribute("height", size);

            if (type === "dots") {
                const dot = document.createElementNS(NS, "circle");
                dot.setAttribute("class", "weavle-grid-dot");
                dot.setAttribute("cx", size / 2);
                dot.setAttribute("cy", size / 2);
                dot.setAttribute("r", 1);
                dot.style.r    = "var(--weavle-grid-dot-radius, 1px)";
                dot.style.fill = "var(--weavle-grid-color, #c3cad3)";
                p.appendChild(dot);
            } else {
                const lines = document.createElementNS(NS, "path");
                lines.setAttribute("class", "weavle-grid-line");
                lines.setAttribute("d", `M ${size / 2} 0 V ${size} M 0 ${size / 2} H ${size}`);
                lines.setAttribute("fill", "none");
                lines.style.stroke      = "var(--weavle-grid-color, #c3cad3)";
                lines.style.strokeWidth = "var(--weavle-grid-line-width, 0.5px)";
                p.appendChild(lines);
            }

            this.gridPatternKey = key;
        }

        // Visible area in model coordinates, plus one cell of slack on every side.
        const zoom   = this.state.zoom || 1;
        const width  = this.svg.clientWidth  || this.options.width;
        const height = this.svg.clientHeight || this.options.height;

        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", -this.state.panX / zoom - size);
        rect.setAttribute("y", -this.state.panY / zoom - size);
        rect.setAttribute("width",  width  / zoom + size * 2);
        rect.setAttribute("height", height / zoom + size * 2);
        rect.setAttribute("fill", `url(#${this.gridPattern.id})`);
        rect.setAttribute("pointer-events", "none");

        this.layers.grid.appendChild(rect);
    }

    renderDebug() {
        this.layers.debug.innerHTML = "";

        if (!this.options.debugRouting) {
            return;
        }

        if (this.options.debugCanvasGrid) {
            this.renderCanvasDebugGrid();
        }

        if (this.options.debugAStarGrid) {
            this.renderAStarDebugGrid();
        }

        if (this.options.debugRoutePoints) {
            this.renderDebugRoutePoints();
        }
    }

    renderCanvasDebugGrid() {
        const NS = "http://www.w3.org/2000/svg";
        const g = this.options.gridSize || 20;

        for (let x = 0; x <= this.options.width; x += g) {
            const line = document.createElementNS(NS, "line");
            line.setAttribute("x1", x);
            line.setAttribute("y1", 0);
            line.setAttribute("x2", x);
            line.setAttribute("y2", this.options.height);
            line.setAttribute("stroke", "red");
            line.setAttribute("stroke-width", "0.5");
            line.setAttribute("opacity", "0.35");
            this.layers.debug.appendChild(line);
        }

        for (let y = 0; y <= this.options.height; y += g) {
            const line = document.createElementNS(NS, "line");
            line.setAttribute("x1", 0);
            line.setAttribute("y1", y);
            line.setAttribute("x2", this.options.width);
            line.setAttribute("y2", y);
            line.setAttribute("stroke", "red");
            line.setAttribute("stroke-width", "0.5");
            line.setAttribute("opacity", "0.35");
            this.layers.debug.appendChild(line);
        }
    }

    renderAStarDebugGrid() {
        const NS = "http://www.w3.org/2000/svg";
        const edge = this.model.edges.find(e => e.id === this.state.selectedEdgeId);

        if (!edge) return;

        const cfg = this.getRoutingConfig(edge);
        const g = cfg.gridSize || 20;

        const sourceNode = this.getNode(edge.sourceNodeId);
        const targetNode = this.getNode(edge.targetNodeId);
        if (!sourceNode || !targetNode) return;

        const a = this.getHandlePoint(sourceNode, edge.sourceHandle);
        const b = this.getHandlePoint(targetNode, edge.targetHandle);

        const sourceExit = this.getHandleExitPoint(a, edge.sourceHandle, cfg.stubLength);
        const targetExit = this.getHandleExitPoint(b, edge.targetHandle, cfg.stubLength);

        const start = {
            x: this.snapToGrid(sourceExit.x, g),
            y: this.snapToGrid(sourceExit.y, g)
        };

        const end = {
            x: this.snapToGrid(targetExit.x, g),
            y: this.snapToGrid(targetExit.y, g)
        };

        const margin = g * 8;

        const left = Math.min(start.x, end.x) - margin;
        const right = Math.max(start.x, end.x) + margin;
        const top = Math.min(start.y, end.y) - margin;
        const bottom = Math.max(start.y, end.y) + margin;

        for (let x = left; x <= right; x += g) {
            const line = document.createElementNS(NS, "line");
            line.setAttribute("x1", x);
            line.setAttribute("y1", top);
            line.setAttribute("x2", x);
            line.setAttribute("y2", bottom);
            line.setAttribute("stroke", "blue");
            line.setAttribute("stroke-width", "0.5");
            line.setAttribute("opacity", "0.35");
            this.layers.debug.appendChild(line);
        }

        for (let y = top; y <= bottom; y += g) {
            const line = document.createElementNS(NS, "line");
            line.setAttribute("x1", left);
            line.setAttribute("y1", y);
            line.setAttribute("x2", right);
            line.setAttribute("y2", y);
            line.setAttribute("stroke", "blue");
            line.setAttribute("stroke-width", "0.5");
            line.setAttribute("opacity", "0.35");
            this.layers.debug.appendChild(line);
        }
    }

    renderDebugRoutePoints() {
        const NS = "http://www.w3.org/2000/svg";

        const edge = this.model.edges.find(e => e.id === this.state.selectedEdgeId);
        if (!edge || !Array.isArray(edge.routePoints)) return;

        edge.routePoints.forEach((p, index) => {
            const circle = document.createElementNS(NS, "circle");
            circle.setAttribute("cx", p.x);
            circle.setAttribute("cy", p.y);
            circle.setAttribute("r", 5);

            if (index === 0) {
                circle.setAttribute("fill", "green");
            } else if (index === edge.routePoints.length - 1) {
                circle.setAttribute("fill", "orange");
            } else {
                circle.setAttribute("fill", "blue");
            }

            circle.setAttribute("opacity", "0.85");
            this.layers.debug.appendChild(circle);

            const text = document.createElementNS(NS, "text");

            text.setAttribute("x", p.x + 7);
            text.setAttribute("y", p.y - 7);
            text.setAttribute("font-size", "10");
            text.setAttribute("fill", "blue");
            text.textContent = String(index);

            this.layers.debug.appendChild(text);
        });
    }


    /**
     * Clears and redraws all edges.
     * For each edge: computes the route, builds the SVG path, appends a transparent
     * hit area, the visible path, an optional label, and — when selected — draggable
     * endpoint handles.
     */
    renderEdges() {

        this.layers.edges.innerHTML = "";
        
        const selectedEdgeId = this.state.selectedEdgeId;
        const normalEdges = this.model.edges.filter(e => e.id !== selectedEdgeId);
        const selectedEdges = this.model.edges.filter(e => e.id === selectedEdgeId);

        [...normalEdges, ...selectedEdges].forEach(edge => {

            const sourceNode = this.model.nodes.find(n => n.id === edge.sourceNodeId);
            const targetNode = this.model.nodes.find(n => n.id === edge.targetNodeId);

            if (!sourceNode || !targetNode) return;
            if (!edge.sourceHandle || !edge.targetHandle) return;

            const sourcePoint = this.getHandlePoint(sourceNode, edge.sourceHandle);
            const targetPoint = this.getHandlePoint(targetNode, edge.targetHandle);

            let points = edge.routePoints;

            // Drawing edges whil draggging a node accross the canvas. Preview will be shown
            const isConnectedToDraggingNode =
                this.state.draggingNodeId &&
                (edge.sourceNodeId === this.state.draggingNodeId ||
                edge.targetNodeId === this.state.draggingNodeId);

            if (isConnectedToDraggingNode) {
                if (edge.isAutoRoute === false) {
                    points = this.getManualEdgePreviewRoute(edge);
                } else {
                    points = this.getEdgeRoute(
                        sourcePoint,
                        targetPoint,
                        edge.sourceHandle,
                        edge.targetHandle,
                        edge
                    );
                }
            }
            
            if (!Array.isArray(points) || points.length < 2) {
                return;
            }
            
            //this.debug ("points:", points);
            
            const pathData = this.buildRoundedOrthogonalPath(
                points,
                this.options.edgeCornerRadius
            );

            const isSelected = edge.id === this.state.selectedEdgeId;

            // Wide invisible stroke for easier click detection.
            const hitPath = this.createEdgeHitPath(pathData, edge.id);
            this.layers.edges.appendChild(hitPath);

            // Visible edge path.
            const visiblePath = this.createEdgePath(pathData, false, isSelected);
            visiblePath.setAttribute("data-edge-id", edge.id);
            this.layers.edges.appendChild(visiblePath);

            //If edge has a label, we place it on the right spot..
            if (edge.label) {
                const label = this.createEdgeLabelFromPoints(points, edge.label);
                this.layers.edges.appendChild(label);
            }

            // When selected, render draggable endpoint handles at source and target.
            if (isSelected) {
                const sourceHandleCircle = this.createEdgeEndpointHandle(
                    sourcePoint.x,
                    sourcePoint.y,
                    edge.id,
                    "source"
                );
                const targetHandleCircle = this.createEdgeEndpointHandle(
                    targetPoint.x,
                    targetPoint.y,
                    edge.id,
                    "target"
                );

                this.layers.edges.appendChild(sourceHandleCircle);
                this.layers.edges.appendChild(targetHandleCircle);
            }

            const isEditableRoute = edge.isAutoRoute === false || this.isFallbackRoute(edge);

            if (isSelected && isEditableRoute && Array.isArray(points) && points.length >= 2) {
                const segmentHandles = this.getSegmentHandles(points);

                segmentHandles.forEach(h => {
                    const handle = this.createEdgeSegmentHandle(
                        h.x,
                        h.y,
                        edge.id,
                        h.segmentIndex,
                        h.orientation
                    );
                    this.layers.edges.appendChild(handle);
                });
            }
        });
    }

    /** Clears and redraws all node groups. */
    renderNodes() {
        this.layers.nodes.innerHTML = "";

        this.model.nodes.forEach(node => {
            const group = this.createNodeGroup(node);
            this.layers.nodes.appendChild(group);
        });
    }

    /**
     * Clears and redraws the overlay layer.
     * Shows (in priority order):
     *   1. Reconnect preview  – dashed edge while dragging an endpoint
     *   2. New-connection preview – dashed edge while drawing from a handle
     *   3. Node creation preview  – ghost node following the cursor
     *   4. Alignment snap guides  – blue dashed lines while dragging a node
     */
    renderOverlay() {

        this.layers.overlay.innerHTML = "";

        // 1. Preview while reconnecting an existing edge endpoint.
        if (this.state.reconnectingEdgeId) {

            const edge = this.model.edges.find(e => e.id === this.state.reconnectingEdgeId);
            if (!edge) return;

            const sourceNode = this.model.nodes.find(n => n.id === edge.sourceNodeId);
            const targetNode = this.model.nodes.find(n => n.id === edge.targetNodeId);
            if (!sourceNode || !targetNode) return;

            const points = this.getReconnectPreviewRoute(edge);
            if (!points || points.length === 0) return;

            const pathData = this.buildRoundedOrthogonalPath(points, this.options.edgeCornerRadius);
            const previewPath = this.createEdgePath(pathData, true, true);
            this.layers.overlay.appendChild(previewPath);
            return;
        }

        // 2. Preview while drawing a new connection from a handle.
        if (this.state.connectingNodeId) {

            const cleanPoints = this.getConnectionPreviewRoute();
            if (!cleanPoints || cleanPoints.length === 0) return;

            const pathData = this.buildRoundedOrthogonalPath(cleanPoints, this.options.edgeCornerRadius);
            const previewPath = this.createEdgePath(pathData, true);
            this.layers.overlay.appendChild(previewPath);
            return;
        }

        // 3. Ghost node following the cursor during node placement.
        if (this.state.creatingNodeType) {
            const previewNode = this.buildPreviewNode();
            const previewGroup = this.createPreviewNodeGroup(previewNode);
            this.layers.overlay.appendChild(previewGroup);
        }

        // 4. Blue dashed alignment guide lines while dragging a node.
        if (this.state.draggingNodeId || this.state.draggingNodeIds) {
            const NS = "http://www.w3.org/2000/svg";

            if (this.state.snapGuideX !== null) {
                const lineX = document.createElementNS(NS, "line");
                lineX.setAttribute("x1", this.state.snapGuideX);
                lineX.setAttribute("y1", 0);
                lineX.setAttribute("x2", this.state.snapGuideX);
                lineX.setAttribute("y2", this.options.height);
                lineX.setAttribute("stroke", "#4da3ff");
                lineX.setAttribute("stroke-width", "1");
                lineX.setAttribute("stroke-dasharray", "4,4");
                lineX.setAttribute("pointer-events", "none");
                this.layers.overlay.appendChild(lineX);
            }

            if (this.state.snapGuideY !== null) {
                const lineY = document.createElementNS(NS, "line");
                lineY.setAttribute("x1", 0);
                lineY.setAttribute("y1", this.state.snapGuideY);
                lineY.setAttribute("x2", this.options.width);
                lineY.setAttribute("y2", this.state.snapGuideY);
                lineY.setAttribute("stroke", "#4da3ff");
                lineY.setAttribute("stroke-width", "1");
                lineY.setAttribute("stroke-dasharray", "4,4");
                lineY.setAttribute("pointer-events", "none");
                this.layers.overlay.appendChild(lineY);
            }
        }

        // 5. Marquee selection rectangle
        if (this.state.isMarqueeSelecting) {
            const NS = "http://www.w3.org/2000/svg";
            const rectData = this.getMarqueeRect();

            const rect = document.createElementNS(NS, "rect");
            rect.setAttribute("x", rectData.x);
            rect.setAttribute("y", rectData.y);
            rect.setAttribute("width", rectData.width);
            rect.setAttribute("height", rectData.height);
            rect.setAttribute("fill", "#4da3ff");
            rect.setAttribute("fill-opacity", "0.12");
            rect.setAttribute("stroke", "#4da3ff");
            rect.setAttribute("stroke-width", "1");
            rect.setAttribute("stroke-dasharray", "4,4");
            rect.setAttribute("pointer-events", "none");

            this.layers.overlay.appendChild(rect);
        }


    }

    /** Applies the current pan and zoom to the SVG viewport group. */
    updateViewportTransform() {
        if (!this.viewport) return;

        this.viewport.setAttribute(
            "transform",
            `translate(${this.state.panX}, ${this.state.panY}) scale(${this.state.zoom})`
        );
    }


    // ============================================================
    // 5. NODE RENDERING HELPERS
    // ============================================================

    /**
     * Builds the complete SVG <g> for a single node: shape + label + optional handles.
     * Handles are shown when the node is selected or when it is hovered during a
     * connection / reconnection interaction.
     */
    createNodeGroup(node) {
        const NS = "http://www.w3.org/2000/svg";
        const group = document.createElementNS(NS, "g");
        group.setAttribute("data-node-id", node.id);

        const isSelected = this.isNodeSelected(node.id);
        const isPrimarySelected = node.id === this.state.primarySelectedNodeId;

        const isHotNode =
            (this.state.connectingNodeId !== null || this.state.reconnectingEdgeId !== null) &&
            node.id === this.state.hoverNodeId;

        // HOT glow eerst (achter de shape)
        if (isHotNode) {
            const glow = this.createHoverGlow(node);
            group.appendChild(glow);
        }
        
        const shape = this.createNodeShape(node);
        const text = this.createNodeText(node);

        group.appendChild(shape);
        group.appendChild(text);


        //  Selected → alle 4 ports
        if (isPrimarySelected) {
            const handles = this.createSelectionHandles(node);
            handles.forEach(h => group.appendChild(h));
        }

        // Hot → alleen actieve port
        if (isHotNode && this.state.hoverHandleName) {
            const hotHandle = this.createHotHandle(node, this.state.hoverHandleName);
            if (hotHandle) group.appendChild(hotHandle);
        }

        return group;
    }

    /**
     * Selects and returns the correct shape element based on the node type
     * defined in the diagram definition.
     */
    createNodeShape(node) {
        const typeDef = this.diagram.nodeTypes && this.diagram.nodeTypes[node.type];
        const shapeName = typeDef && typeDef.shape ? typeDef.shape : "process";

        const shapeFactory = this.diagram.shapes && this.diagram.shapes[shapeName];

        if (!shapeFactory) {
            throw new Error(`Unknown shape factory for shape "${shapeName}"`);
        }

        return shapeFactory(node, this);
    }


    /**
     * Creates a semi-transparent ghost version of a node used as a
     * placement preview while the user positions a new node on the canvas.
     */
    createPreviewNodeGroup(node) {
        const NS    = "http://www.w3.org/2000/svg";
        const group = document.createElementNS(NS, "g");

        const shape = this.createNodeShape(node);
        const text  = this.createNodeText(node);

        shape.setAttribute("opacity",          "0.6");
        shape.setAttribute("stroke-dasharray", "4,4");
        text.setAttribute("opacity",           "0.7");

        group.appendChild(shape);
        group.appendChild(text);
        return group;
    }

    /** Creates a centred SVG text element for a node's label. */
    createNodeText(node) {
        const NS   = "http://www.w3.org/2000/svg";
        const text = document.createElementNS(NS, "text");

        text.setAttribute("x",           node.x + node.width  / 2);
        text.setAttribute("y",           node.y + node.height / 2 + 4);
        text.setAttribute("text-anchor", "middle");

        text.style.fontSize      = "14px";
        text.style.pointerEvents = "none";
        text.style.userSelect    = "none";
        text.textContent = node.label || "";

        return text;
    }

    /**
     * Creates the circular connection-point handles shown on a selected node
     * or on a node that is hovered during a connect / reconnect interaction.
     * The hovered handle is rendered larger and filled with the accent colour.
     */
    createHandles(node) {
        const NS      = "http://www.w3.org/2000/svg";
        const handles = [];

        const handlePositions = this.getPorts(node);

        Object.keys(handlePositions).forEach(positionName => {

            const pos    = handlePositions[positionName];
            const circle = document.createElementNS(NS, "circle");

            const isHovered =
                node.id === this.state.hoverHandleNodeId &&
                positionName === this.state.hoverHandleName;

            circle.setAttribute("cx",           pos.x);
            circle.setAttribute("cy",           pos.y);
            circle.setAttribute("r",            isHovered ? 7 : 5);
            circle.setAttribute("fill",         isHovered ? "#eb6c4c" : "#ffffff");
            circle.setAttribute("stroke",       "#eb6c4c");
            circle.setAttribute("stroke-width", isHovered ? "3" : "2");
            circle.setAttribute("data-handle-position", positionName);
            circle.style.cursor = "crosshair";

            handles.push(circle);
        });

        return handles;
    }

    createSelectionHandles(node) {
        const NS = "http://www.w3.org/2000/svg";
        const handles = [];
        const positions = this.getPorts(node);

        Object.keys(positions).forEach(handleName => {
            const p = positions[handleName];

            const c = document.createElementNS(NS, "circle");
            c.setAttribute("cx", p.x);
            c.setAttribute("cy", p.y);
            c.setAttribute("r", 4.5);

            c.setAttribute("fill", "#ffffff");
            c.setAttribute("stroke", "#2ea8df");
            c.setAttribute("stroke-width", "2");

            c.setAttribute("data-handle-position", handleName);
            c.style.cursor = "crosshair";

            handles.push(c);
        });

        return handles;
    }


    createHotHandle(node, handleName) {
        const NS = "http://www.w3.org/2000/svg";
        const p = this.getPorts(node)[handleName];
        if (!p) return null;

        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", p.x);
        c.setAttribute("cy", p.y);
        c.setAttribute("r", 6.5);

        c.setAttribute("fill", "#ffffff");
        c.setAttribute("stroke", "#f28c52");
        c.setAttribute("stroke-width", "2.5");

        c.setAttribute("data-handle-position", handleName);
        c.style.cursor = "crosshair";

        return c;
    }


    createHoverGlow(node) {
        const NS = "http://www.w3.org/2000/svg";
        const typeDef = this.diagram.nodeTypes && this.diagram.nodeTypes[node.type];
        const shapeName = typeDef && typeDef.shape ? typeDef.shape : "process";

        let glow;

        if (shapeName === "decision") {
            glow = document.createElementNS(NS, "polygon");

            const cx = node.x + node.width / 2;
            const cy = node.y + node.height / 2;

            const points = [
                `${cx},${node.y - 4}`,
                `${node.x + node.width + 4},${cy}`,
                `${cx},${node.y + node.height + 4}`,
                `${node.x - 4},${cy}`
            ].join(" ");

            glow.setAttribute("points", points);
        } else {
            glow = document.createElementNS(NS, "rect");
            glow.setAttribute("x", node.x - 4);
            glow.setAttribute("y", node.y - 4);
            glow.setAttribute("width", node.width + 8);
            glow.setAttribute("height", node.height + 8);

            if (shapeName === "terminator") {
                glow.setAttribute("rx", Math.min((node.height + 8) / 2, 34));
            } else {
                glow.setAttribute("rx", 12);
            }
        }

        glow.setAttribute("fill", "none");
        glow.setAttribute("stroke", "#f28c52");
        glow.setAttribute("stroke-width", "3");
        glow.setAttribute("opacity", "0.55");
        glow.setAttribute("filter", "url(#hover-glow)");
        glow.setAttribute("pointer-events", "none");

        return glow;
    }

    /**
     * Applies fill, stroke, and selection highlight to a node shape element.
     * Colors are resolved from the diagram definition via getNodeColors().
     */
    applyNodeStyle(shape, node) {
        const colors = this.getNodeColors(node.type);

        shape.setAttribute("fill",         colors.fill);
        shape.setAttribute("stroke",       colors.stroke);
        shape.setAttribute("stroke-width", "1.5");

        // Override stroke colour and width when the node is selected.
        if (this.isNodeSelected(node.id)) {
            shape.setAttribute("stroke",       "#F57100");
            shape.setAttribute("stroke-width", "2.5");
        }
    }


    // ============================================================
    // 6. EDGE RENDERING HELPERS
    // ============================================================

    /**
     * Creates the visible SVG path for an edge.
     * @param {string}  pathData   SVG path data string (d attribute).
     * @param {boolean} isPreview  If true, renders as a dashed semi-transparent line.
     * @param {boolean} isSelected If true, uses the accent colour and selected arrowhead.
     */
    createEdgePath(pathData, isPreview = false, isSelected = false) {
        const NS   = "http://www.w3.org/2000/svg";
        const path = document.createElementNS(NS, "path");

        path.setAttribute("d",           pathData);
        path.setAttribute("stroke",      isSelected ? "#F57100" : "#666");
        path.setAttribute("stroke-width", isSelected ? "2.5" : "1.5");
        path.setAttribute("fill",        "none");
        path.setAttribute("marker-end",  isSelected ? "url(#arrow-selected)" : "url(#arrow-default)");

        if (isPreview) {
            path.setAttribute("stroke-dasharray", "5,5");
            path.setAttribute("opacity", "0.7");
        }

        return path;
    }

    snapToGrid(value, gridSize) {
        return Math.round(value / gridSize) * gridSize;
    }

    toGridPoint(p) {
        const g = this.routing.gridSize;
        return {
            x: this.snapToGrid(p.x, g),
            y: this.snapToGrid(p.y, g)
        };
    }

    /**
     * Creates a wide transparent stroke path used as the clickable hit area for an edge.
     * The wider stroke (12 px) makes it much easier to select thin edges.
     */
    createEdgeHitPath(pathData, edgeId) {
        const NS   = "http://www.w3.org/2000/svg";
        const path = document.createElementNS(NS, "path");

        path.setAttribute("d",            pathData);
        path.setAttribute("fill",         "none");
        path.setAttribute("stroke",       "transparent");
        path.setAttribute("stroke-width", "12");
        path.setAttribute("data-edge-id", edgeId);
        path.style.cursor       = "pointer";
        path.style.pointerEvents = "stroke";

        return path;
    }

    /**
     * Creates an SVG text label placed near the middle of an edge.
     * For edges with 4+ points the label is placed at the midpoint of the middle segment.
     */
    createEdgeLabelFromPoints(points, textValue) {
        const NS   = "http://www.w3.org/2000/svg";
        const text = document.createElementNS(NS, "text");

        let labelX = 0;
        let labelY = 0;

        if (points.length >= 4) {
            labelX = (points[1].x + points[2].x) / 2;
            labelY = (points[1].y + points[2].y) / 2;
        } else {
            labelX = (points[0].x + points[points.length - 1].x) / 2;
            labelY = (points[0].y + points[points.length - 1].y) / 2;
        }

        text.setAttribute("x",           labelX);
        text.setAttribute("y",           labelY - 6);
        text.setAttribute("text-anchor", "middle");
        text.style.fontSize = "12px";
        text.style.fill     = "#444";
        text.textContent    = textValue;

        return text;
    }

    /** Creates a small draggable circle for a bend-point control handle on an edge. */
    createEdgeControlHandle(x, y, edgeId) {
        const NS     = "http://www.w3.org/2000/svg";
        const circle = document.createElementNS(NS, "circle");

        circle.setAttribute("cx",                    x);
        circle.setAttribute("cy",                    y);
        circle.setAttribute("r",                     5);
        circle.setAttribute("fill",                  "#ffffff");
        circle.setAttribute("stroke",                "#eb6c4c");
        circle.setAttribute("stroke-width",          "2");
        circle.setAttribute("data-edge-control-id",  edgeId);
        circle.style.cursor = "move";

        return circle;
    }

    /**
     * Creates a draggable circle at the source or target endpoint of a selected edge,
     * allowing the user to reconnect it to a different node / handle.
     * @param {number} x      X coordinate in model space.
     * @param {number} y      Y coordinate in model space.
     * @param {string} edgeId  Id of the owning edge.
     * @param {string} side   "source" or "target".
     */
    createEdgeEndpointHandle(x, y, edgeId, side) {
        const NS     = "http://www.w3.org/2000/svg";
        const circle = document.createElementNS(NS, "circle");

        circle.setAttribute("cx",                       x);
        circle.setAttribute("cy",                       y);
        circle.setAttribute("r",                        6);
        circle.setAttribute("fill",                     "#ffffff");
        circle.setAttribute("stroke",                   "#eb6c4c");
        circle.setAttribute("stroke-width",             "2");
        circle.setAttribute("data-edge-endpoint-id",   edgeId);
        circle.setAttribute("data-edge-endpoint-side", side);
        circle.style.cursor = "crosshair";

        return circle;
    }

    createEdgeSegmentHandle(x, y, edgeId, segmentIndex, orientation) {
    const NS = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(NS, "circle");

    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 5);
    circle.setAttribute("fill", "#ffffff");
    circle.setAttribute("stroke", "#eb6c4c");
    circle.setAttribute("stroke-width", "2");

    circle.setAttribute("data-edge-segment-id", edgeId);
    circle.setAttribute("data-edge-segment-index", segmentIndex);
    circle.setAttribute("data-edge-segment-orientation", orientation);

    circle.style.cursor = orientation === "vertical" ? "ew-resize" : "ns-resize";

    return circle;
}


    // ============================================================
    // 7.1 ROUTING & GEOMETRY
    // ============================================================


    rerouteEdgesForNodes(nodeIds) {
        const affectedEdges = this.model.edges.filter(e =>
            nodeIds.includes(e.sourceNodeId) ||
            nodeIds.includes(e.targetNodeId)
        );

        affectedEdges.forEach(edge => {
            if (edge.isAutoRoute !== false) {
                this.updateEdgeRoute(edge);
            }
        });
    }

    updateEdgeRoute(edge) {
        const sourceNode = this.getNode(edge.sourceNodeId);
        const targetNode = this.getNode(edge.targetNodeId);
        if (!sourceNode || !targetNode) return;


        if (edge.isAutoRoute === false) {
            this.rebuildManualEdgeAnchors(edge);
            return;
        }

        const sourcePoint = this.getHandlePoint(sourceNode, edge.sourceHandle);
        const targetPoint = this.getHandlePoint(targetNode, edge.targetHandle);

        edge.routePoints = this.getEdgeRoute(
            sourcePoint,
            targetPoint,
            edge.sourceHandle,
            edge.targetHandle,
            edge
        );
    }

    getNode(nodeId) {
        return this.model.nodes.find(n => n.id === nodeId) || null;
    }

    /** True if the edge's current route is the fallback L-route drawn after auto-routing failed. */
    isFallbackRoute(edge) {
        return edge?.routingMeta?.algorithm === "manual-fallback";
    }

    /**
     * Returns the ordered list of waypoints for an edge.
     * Delegates to diagram.routeEdge if defined; otherwise uses the built-in router.
     */
    getEdgeRoute(sourcePoint, targetPoint, sourceHandle, targetHandle, edge) {
        if (this.diagram.routeEdge) {
            const edgeroute = this.diagram.routeEdge({
                sourcePoint,
                targetPoint,
                sourceHandle,
                targetHandle,
                edge,
                engine: this
            });
            this.debug("getEdgeRoute: ", edgeroute);
            return edgeroute;
        }

        return  this.buildRoutedEdgePoints(sourcePoint, targetPoint, sourceHandle, targetHandle, edge);;
    }


    getManualEdgePreviewRoute(edge) {
        return this.buildManualEdgeAnchoredRoute(edge);
    }




    /**
     * Computes the full set of waypoints for an edge:
     *   source → source-exit → (orthogonal middle) → target-exit → target
     * Exit points are offset from the handle in its outward direction to prevent
     * the path from immediately turning back through the node.
     */
    buildRoutedEdgePoints(sourcePoint, targetPoint, sourceHandle, targetHandle, edge) {

        // 1. If the edge was manually edited before, keep that manual route.
        //    This prevents the auto-router from overwriting user-defined bend points later.
        if (edge && edge.isAutoRoute === false && Array.isArray(edge.routePoints) && edge.routePoints.length >= 2) {
            return edge.routePoints;
        }

        // 2. First try the simplest possible route:
        //    a perfectly straight horizontal or vertical line.
        //    This is the cleanest visual outcome, so it gets first priority. 
        //    only two points share the same x or y values with no obstacles in between
        const straight = this.tryStraightRoute(sourcePoint, targetPoint, edge);
        if (straight) {
            this.debug("straight");
            return this.simplify(straight);
        }

        // 3. If a straight line is not possible, try a simple orthogonal route:
        //    usually an L-shape or a basic Z-shape.
        //    This keeps routes human-looking without invoking full pathfinding yet.
        const simple = this.trySimpleOrthogonalRoute(sourcePoint, targetPoint, sourceHandle, targetHandle, edge);
        if (simple) {
            this.debug("Orthogonal");
            return this.simplify(simple);
        }

        // 4. If the simple options fail, fall back to A* pathfinding on the routing grid.
        //    This is the heavy-duty router for obstacle avoidance.
        const smart = this.tryAStarRoute(sourcePoint, targetPoint, sourceHandle, targetHandle, edge);
        if (smart) {
            this.debug("A* route");
            return this.simplify(smart);
        }

        // 5. Final fallback:
        //    if everything else fails, draw a simple L-route so rendering never breaks.
        //    The edge stays auto-routed, so the next node move gets a fresh routing attempt.
        //    Its segment handles are shown (see renderEdges) so the user can still fix it by hand.
        const fallback = this.buildManualFallbackRoute(
            sourcePoint,
            targetPoint,
            sourceHandle,
            targetHandle,
            edge
        );

        if (edge) {
            edge.routePoints = fallback;
            edge.routingMeta = {
                algorithm: "manual-fallback",
                found: false,
                reason: "auto-route-failed"
            };
        }

        return this.simplify(fallback);
    }

    getSegmentHandles(points) {
        const handles = [];

        if (!Array.isArray(points) || points.length < 4) {
            return handles;
        }

        for (let i = 1; i < points.length - 2; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            const mid = {
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
            };

            const isVertical = p1.x === p2.x;

            handles.push({
                segmentIndex: i,
                x: mid.x,
                y: mid.y,
                orientation: isVertical ? "vertical" : "horizontal"
            });
        }

        return handles;
    }

    moveSegment(edge, segmentIndex, dx, dy) {
        const pts = [...edge.routePoints];

        const p1 = pts[segmentIndex];
        const p2 = pts[segmentIndex + 1];

        const isVertical = p1.x === p2.x;

        if (isVertical) {
            p1.x += dx;
            p2.x += dx;
        } else {
            p1.y += dy;
            p2.y += dy;
        }

        edge.routePoints = this.simplify(pts);
    }


    buildManualEdgeAnchoredRoute(edge) {
        if (!edge || !Array.isArray(edge.routePoints) || edge.routePoints.length < 2) {
            return [];
        }

        const cfg = this.getRoutingConfig(edge);

        const sourceNode = this.getNode(edge.sourceNodeId);
        const targetNode = this.getNode(edge.targetNodeId);

        if (!sourceNode || !targetNode) {
            return edge.routePoints || [];
        }

        const sourcePoint = this.getHandlePoint(sourceNode, edge.sourceHandle);
        const targetPoint = this.getHandlePoint(targetNode, edge.targetHandle);

        const sourceExit = this.getHandleExitPoint(
            sourcePoint,
            edge.sourceHandle,
            cfg.stubLength
        );

        const targetExit = this.getHandleExitPoint(
            targetPoint,
            edge.targetHandle,
            cfg.stubLength
        );

        const internal = edge.routePoints.slice(2, -2);

        let points = [sourcePoint, sourceExit];

        if (internal.length === 0) {
            points.push(...this.buildOrthogonalJoin(sourceExit, targetExit).slice(1));
        } else {
            points.push(...this.buildOrthogonalJoin(sourceExit, internal[0]).slice(1));

            if (internal.length > 1) {
                points.push(...internal.slice(1, -1));
            }

            points.push(...this.buildOrthogonalJoin(
                internal[internal.length - 1],
                targetExit
            ).slice(1));
        }

        points.push(targetPoint);

        return this.simplify(points);
    }


    rebuildManualEdgeAnchors(edge) {
        edge.routePoints = this.buildManualEdgeAnchoredRoute(edge);
    }

    buildOrthogonalJoin(a, b) {
        if (a.x === b.x || a.y === b.y) {
            return [a, b];
        }

        return [
            a,
            { x: a.x, y: b.y },
            b
        ];
    }

    tryStraightRoute(a, b, sourceHandle, targetHandle, edge) {
        const cfg = this.getRoutingConfig(edge);

        const sourceExit = this.getHandleExitPoint(a, sourceHandle, cfg.stubLength);
        const targetExit = this.getHandleExitPoint(b, targetHandle, cfg.stubLength);

        const isOppositeHorizontal =
            (sourceHandle === "right" && targetHandle === "left") ||
            (sourceHandle === "left" && targetHandle === "right");

        const isOppositeVertical =
            (sourceHandle === "bottom" && targetHandle === "top") ||
            (sourceHandle === "top" && targetHandle === "bottom");

        // Straight only makes sense for opposite-facing handles
        if (!isOppositeHorizontal && !isOppositeVertical) {
            return null;
        }

        // Exits themselves must align
        if (sourceExit.x !== targetExit.x && sourceExit.y !== targetExit.y) {
            return null;
        }

        const points = this.simplify([
            a,
            sourceExit,
            targetExit,
            b
        ]);

        const hitsObstacle = this.routeHitsAnyObstacle(
            points,
            edge.sourceNodeId,
            edge.targetNodeId,
            sourceHandle,
            targetHandle,
            cfg.obstacleMargin
        );

        if (hitsObstacle) {
            return null;
        }

        if (edge) {
            const stats = this.calculateRouteStats(points);

            edge.routingMeta = {
                algorithm: "straight",
                found: true,
                pathLength: stats.pathLength,
                turns: stats.turns
            };
        }

        return points;
    }

    trySimpleOrthogonalRoute(a, b, sourceHandle, targetHandle, edge) {

        this.debug("sourceHandle: ", sourceHandle, "targetHandle: ", targetHandle)

        const candidates = [];

        const sourceIsVertical =
            sourceHandle === "top" || sourceHandle === "bottom";

        const sourceIsHorizontal =
            sourceHandle === "left" || sourceHandle === "right";

        const targetIsVertical =
            targetHandle === "top" || targetHandle === "bottom";

        const targetIsHorizontal =
            targetHandle === "left" || targetHandle === "right";

        const isOppositeHorizontalHandles =
            (sourceHandle === "left" && targetHandle === "right") ||
            (sourceHandle === "right" && targetHandle === "left");

        const isOppositeVerticalHandles =
            (sourceHandle === "top" && targetHandle === "bottom") ||
            (sourceHandle === "bottom" && targetHandle === "top");

        // ------------------------------------------------------------
        // L-shapes
        // Only allowed when one side is vertical and the other side is horizontal.
        // ------------------------------------------------------------

        if (sourceIsVertical && targetIsHorizontal) {
            candidates.push([
                a,
                { x: a.x, y: b.y },
                b
            ]);
        }

        if (sourceIsHorizontal && targetIsVertical) {
            candidates.push([
                a,
                { x: b.x, y: a.y },
                b
            ]);
        }

        // ------------------------------------------------------------
        // Horizontal Z-shape
        // Only allowed when one handle is left and the other is right.
        // ------------------------------------------------------------

        if (isOppositeHorizontalHandles) {
            this.debug("isOppositeHorizontalHandles: true");
            const midX = Math.round((a.x + b.x) / 2);

            candidates.push([
                a,
                { x: midX, y: a.y },
                { x: midX, y: b.y },
                b
            ]);
        }

        // ------------------------------------------------------------
        // Vertical Z-shape
        // Only allowed when one handle is top and the other is bottom.
        // ------------------------------------------------------------

        if (isOppositeVerticalHandles) {
            this.debug("isOppositeVerticalHandles: true");
            const midY = Math.round((a.y + b.y) / 2);

            candidates.push([
                a,
                { x: a.x, y: midY },
                { x: b.x, y: midY },
                b
            ]);
        }

        // ------------------------------------------------------------
        // Validate all candidates and keep only the legal ones.
        // ------------------------------------------------------------

        const validRoutes = [];

        for (const candidate of candidates) {
            const clean = this.simplify(candidate);

            const hitsObstacle = this.routeHitsAnyObstacle(
                clean,
                edge.sourceNodeId,
                edge.targetNodeId,
                sourceHandle,
                targetHandle
            );

            if (!hitsObstacle) {
                validRoutes.push(clean);
            }
        }

        // No valid simple route found.
        if (validRoutes.length === 0) {
            return null;
        }

        // Pick the best simple route by score.
        validRoutes.sort((r1, r2) => {
            return this.getRouteScore(r1) - this.getRouteScore(r2);
        });

        const bestRoute = validRoutes[0];

        if (edge) {
            const stats = this.calculateRouteStats(bestRoute);

            edge.routingMeta = {
                algorithm: "simple-orthogonal",
                found: true,
                pathLength: stats.pathLength,
                turns: stats.turns,
                candidateCount: candidates.length,
                validCandidateCount: validRoutes.length
            };
        }

        return bestRoute;
    }

    tryAStarRoute(sourcePoint, targetPoint, sourceHandle, targetHandle, edge) {
        const cfg = this.getRoutingConfig(edge);

        const sourceExit = this.getHandleExitPoint(sourcePoint, sourceHandle, cfg.stubLength);
        const targetExit = this.getHandleExitPoint(targetPoint, targetHandle, cfg.stubLength);

        const start = this.getGridEntry(
            sourceExit,
            sourceHandle,
            edge.sourceNodeId,
            edge.targetNodeId,
            cfg
        );

        const end = this.getGridEntry(
            targetExit,
            targetHandle,
            edge.sourceNodeId,
            edge.targetNodeId,
            cfg
        );

        const result = this.findPathWithAStar(
            start,
            end,
            edge.sourceNodeId,
            edge.targetNodeId,
            cfg
        );

        if (!result || !result.path) {
            return null;
        }

        let gridPath = this.simplify(result.path);

        // Only soften tiny kinks near source/target
        gridPath = this.normalizeFirstAStarPoint(
            gridPath,
            sourceExit,
            sourceHandle,
            cfg
        );

        gridPath = this.normalizeLastAStarPoint(
            gridPath,
            targetExit,
            targetHandle,
            cfg
        );

        const finalPoints = this.simplify([
            sourcePoint,
            sourceExit,
            ...gridPath,
            targetExit,
            targetPoint
        ]);

        const hitsObstacle = this.routeHitsAnyObstacle(
            finalPoints,
            edge.sourceNodeId,
            edge.targetNodeId,
            sourceHandle,
            targetHandle,
            cfg.obstacleMargin
        );

        if (hitsObstacle) {
            return null;
        }

        if (cfg.storeRoutingMeta && edge) {
            const stats = this.calculateRouteStats(finalPoints);

            edge.routingMeta = {
                ...(result.meta || {}),
                algorithm: "astar",
                found: true,
                sourceHandle,
                targetHandle,
                start,
                end,
                pathLength: stats.pathLength,
                turns: stats.turns
            };
        }

        return finalPoints;
    }

    normalizeFirstAStarPoint(path, sourceExit, sourceHandle, cfg) {
        if (!Array.isArray(path) || path.length < 2) {
            return path;
        }

        const result = [...path];
        const first = result[0];
        const next = result[1];
        const grid = cfg.gridSize || 20;

        // Only normalize if the first A* point is close to the source exit
        const dx = Math.abs(first.x - sourceExit.x);
        const dy = Math.abs(first.y - sourceExit.y);

        const isMicroKink = dx <= grid && dy <= grid && (dx > 0 || dy > 0);
        if (!isMicroKink) {
            return result;
        }

        let candidate = null;

        switch (sourceHandle) {
            case "left":
            case "right":
                // Keep the horizontal exit axis, borrow Y from the next point
                candidate = {
                    x: sourceExit.x,
                    y: next.y
                };
                break;

            case "top":
            case "bottom":
                // Keep the vertical exit axis, borrow X from the next point
                candidate = {
                    x: next.x,
                    y: sourceExit.y
                };
                break;
        }

        if (!candidate) {
            return result;
        }

        // Only accept if the new first point still keeps orthogonal continuity
        const firstSegmentOrthogonal =
            candidate.x === sourceExit.x || candidate.y === sourceExit.y;

        const secondSegmentOrthogonal =
            candidate.x === next.x || candidate.y === next.y;

        if (!firstSegmentOrthogonal || !secondSegmentOrthogonal) {
            return result;
        }

        result[0] = candidate;
        return this.simplify(result);
    }

    normalizeLastAStarPoint(path, targetExit, targetHandle, cfg) {
        if (!Array.isArray(path) || path.length < 2) {
            return path;
        }

        const result = [...path];
        const lastIndex = result.length - 1;
        const prev = result[lastIndex - 1];
        const last = result[lastIndex];
        const grid = cfg.gridSize || 20;

        // Only normalize if the last A* point is close to the target exit
        const dx = Math.abs(last.x - targetExit.x);
        const dy = Math.abs(last.y - targetExit.y);

        const isMicroKink = dx <= grid && dy <= grid && (dx > 0 || dy > 0);
        if (!isMicroKink) {
            return result;
        }

        let candidate = null;

        switch (targetHandle) {
            case "left":
            case "right":
                // Keep X from previous point, align Y with target exit
                candidate = {
                    x: prev.x,
                    y: targetExit.y
                };
                break;

            case "top":
            case "bottom":
                // Keep Y from previous point, align X with target exit
                candidate = {
                    x: targetExit.x,
                    y: prev.y
                };
                break;
        }

        if (!candidate) {
            return result;
        }

        // Only accept if the new last point still keeps orthogonal continuity
        const firstSegmentOrthogonal =
            candidate.x === prev.x || candidate.y === prev.y;

        const secondSegmentOrthogonal =
            candidate.x === targetExit.x || candidate.y === targetExit.y;

        if (!firstSegmentOrthogonal || !secondSegmentOrthogonal) {
            return result;
        }

        result[lastIndex] = candidate;
        return this.simplify(result);
    }

    buildCleanTargetJoin(lastPoint, targetPoint, targetHandle, edge, cfg) {
        const candidates = [];

        if (lastPoint.x === targetPoint.x || lastPoint.y === targetPoint.y) {
            candidates.push([lastPoint, targetPoint]);
        } else {
            candidates.push([
                lastPoint,
                { x: lastPoint.x, y: targetPoint.y },
                targetPoint
            ]);

            candidates.push([
                lastPoint,
                { x: targetPoint.x, y: lastPoint.y },
                targetPoint
            ]);
        }

        for (const candidate of candidates) {
            const clean = this.simplify(candidate);

            const hits = this.routeHitsAnyObstacle(
                clean,
                edge.sourceNodeId,
                edge.targetNodeId,
                edge.sourceHandle,
                edge.targetHandle,
                cfg.obstacleMargin
            );

            if (!hits) {
                return clean.slice(1); // first point is already in the main route
            }
        }

        return null;
    }

    buildManualFallbackRoute(sourcePoint, targetPoint, sourceHandle, targetHandle, edge) {
        const cfg = this.getRoutingConfig(edge);

        const sourceExit = this.getHandleExitPoint(sourcePoint, sourceHandle, cfg.stubLength);
        const targetExit = this.getHandleExitPoint(targetPoint, targetHandle, cfg.stubLength);

        let midPoints;

        // L-shape voorkeur
        if (Math.abs(sourceExit.x - targetExit.x) < Math.abs(sourceExit.y - targetExit.y)) {
            // eerst verticaal, dan horizontaal
            midPoints = [
                { x: sourceExit.x, y: targetExit.y }
            ];
        } else {
            // eerst horizontaal, dan verticaal
            midPoints = [
                { x: targetExit.x, y: sourceExit.y }
            ];
        }

        return this.simplify([
            sourcePoint,
            sourceExit,
            ...midPoints,
            targetExit,
            targetPoint
        ]);
    }

    getCombinedDetourCorridors(sourceNode, targetNode, margin = 24) {
        const s = this.getNodeObstacleBox(sourceNode, margin);
        const t = this.getNodeObstacleBox(targetNode, margin);

        return {
            top: Math.min(s.top, t.top) - margin,
            bottom: Math.max(s.bottom, t.bottom) + margin,
            left: Math.min(s.left, t.left) - margin,
            right: Math.max(s.right, t.right) + margin
        };
    }

    isSegmentClear(a, b, sourceNodeId = null, targetNodeId = null, margin = 0) {

        // Loop through all nodes in the model
        for (const node of this.model.nodes) {

            // Skip the source and target nodes
            // We allow segments to "touch" or originate/terminate there
            if (node.id === sourceNodeId || node.id === targetNodeId) {
                continue;
            }

            // Build an expanded bounding box around the node
            // Margin creates a safety buffer so edges don't run too close
            const left   = node.x - margin;
            const right  = node.x + node.width + margin;
            const top    = node.y - margin;
            const bottom = node.y + node.height + margin;

            // Case 1: vertical segment (same X)
            if (a.x === b.x) {
                const x = a.x;

                // If the X of the segment lies within the node's horizontal span
                if (x >= left && x <= right) {

                    // Check if the Y-range of the segment overlaps with the node
                    const minY = Math.min(a.y, b.y);
                    const maxY = Math.max(a.y, b.y);

                    const overlaps = !(maxY < top || minY > bottom);

                    // If there is overlap → segment intersects this node
                    if (overlaps) {
                        return false;
                    }
                }
            }

            // Case 2: horizontal segment (same Y)
            else if (a.y === b.y) {
                const y = a.y;

                // If the Y of the segment lies within the node's vertical span
                if (y >= top && y <= bottom) {

                    // Check if the X-range of the segment overlaps with the node
                    const minX = Math.min(a.x, b.x);
                    const maxX = Math.max(a.x, b.x);

                    const overlaps = !(maxX < left || minX > right);

                    // If there is overlap → segment intersects this node
                    if (overlaps) {
                        return false;
                    }
                }
            }

            // Optional: if you ever allow diagonal segments,
            // you'd need a proper line-rectangle intersection here.
        }

        // If no intersections found → segment is clear
        return true;
    }

    isPolylineClear(points, sourceNodeId = null, targetNodeId = null) {
        for (let i = 0; i < points.length - 1; i++) {
            if (!this.isSegmentClear(points[i], points[i + 1], sourceNodeId, targetNodeId)) {
                return false;
            }
        }
        return true;
    }

    segmentIntersectsRect(a, b, rect) {
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);

        return !(
            maxX < rect.x ||
            minX > rect.x + rect.width ||
            maxY < rect.y ||
            minY > rect.y + rect.height
        );
    }

    /**
     * Generates an L-shaped or Z-shaped list of waypoints between two points
     * that respects the axis of departure / arrival implied by the handle names.
     *
     * Rules:
     *   vertical → horizontal  : bend at (sourceX, targetY)
     *   horizontal → vertical  : bend at (targetX, sourceY)
     *   both vertical          : bend at (sourceX, targetY)
     *   both horizontal        : bend at midX  (Z-shape)
     *   neither known          : Z-shape through midX
     */
    buildOrthogonalPoints(sourcePoint, targetPoint, sourceHandle, targetHandle) {

        // Already aligned on one axis — straight line.
        if (sourcePoint.x === targetPoint.x || sourcePoint.y === targetPoint.y) {
            return [
                { x: sourcePoint.x, y: sourcePoint.y },
                { x: targetPoint.x, y: targetPoint.y }
            ];
        }

        const sourceIsVertical   = sourceHandle === "top"  || sourceHandle === "bottom";
        const sourceIsHorizontal = sourceHandle === "left" || sourceHandle === "right";
        const targetIsVertical   = targetHandle === "top"  || targetHandle === "bottom";
        const targetIsHorizontal = targetHandle === "left" || targetHandle === "right";

        if (sourceIsVertical && targetIsHorizontal) {
            return [
                { x: sourcePoint.x, y: sourcePoint.y },
                { x: sourcePoint.x, y: targetPoint.y },
                { x: targetPoint.x, y: targetPoint.y }
            ];
        }

        if (sourceIsHorizontal && targetIsVertical) {
            return [
                { x: sourcePoint.x, y: sourcePoint.y },
                { x: targetPoint.x, y: sourcePoint.y },
                { x: targetPoint.x, y: targetPoint.y }
            ];
        }

        if (sourceIsVertical) {
            return [
                { x: sourcePoint.x, y: sourcePoint.y },
                { x: sourcePoint.x, y: targetPoint.y },
                { x: targetPoint.x, y: targetPoint.y }
            ];
        }

        if (sourceIsHorizontal) {
            return [
                { x: sourcePoint.x, y: sourcePoint.y },
                { x: targetPoint.x, y: sourcePoint.y },
                { x: targetPoint.x, y: targetPoint.y }
            ];
        }

        // Fallback: Z-shape through the horizontal midpoint.
        const midX = (sourcePoint.x + targetPoint.x) / 2;
        return [
            { x: sourcePoint.x, y: sourcePoint.y },
            { x: midX,          y: sourcePoint.y },
            { x: midX,          y: targetPoint.y },
            { x: targetPoint.x, y: targetPoint.y }
        ];
    }



    /**
     * Converts a list of waypoints into an SVG path string with rounded corners.
     * Each interior corner is replaced by a quadratic bezier arc of the given radius,
     * capped at half the length of each adjacent segment.
     */
    buildRoundedOrthogonalPath(points, radius) {
        this.debug("buildRoundedOrthogonalPath points:", points, radius);

        if (!points || points.length < 2) return "";

        if (points.length === 2) {
            return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
        }

        let d = `M ${points[0].x} ${points[0].y}`;

        for (let i = 1; i < points.length - 1; i++) {

            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];

            const dx1 = curr.x - prev.x;
            const dy1 = curr.y - prev.y;
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;

            const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

            if (len1 === 0 || len2 === 0) {
                d += ` L ${curr.x} ${curr.y}`;
                continue;
            }

            // Clamp radius so it never exceeds half of either adjacent segment.
            const r = Math.min(radius, len1 / 2, len2 / 2);

            const p1 = {
                x: curr.x - (dx1 / len1) * r,
                y: curr.y - (dy1 / len1) * r
            };
            const p2 = {
                x: curr.x + (dx2 / len2) * r,
                y: curr.y + (dy2 / len2) * r
            };

            d += ` L ${p1.x} ${p1.y}`;
            d += ` Q ${curr.x} ${curr.y} ${p2.x} ${p2.y}`;
        }

        const last = points[points.length - 1];
        d += ` L ${last.x} ${last.y}`;

        return d;
    }

    /**
     * Returns the waypoints for the live preview shown while drawing a new edge
     * from a handle toward the current cursor position.
     */
    getConnectionPreviewRoute() {
        const sourceNode = this.model.nodes.find(
            n => n.id === this.state.connectingNodeId
        );
        if (!sourceNode) return [];

        const sourcePoint = this.getHandlePoint(sourceNode, this.state.connectingHandle);
        const targetPoint = {
            x: this.state.connectionPreviewX,
            y: this.state.connectionPreviewY
        };

        const sourceExit = this.getHandleExitPoint(sourcePoint, this.state.connectingHandle, 16);

        const points = [
            sourcePoint,
            ...this.buildOrthogonalPoints(
                sourceExit,
                targetPoint,
                this.state.connectingHandle,
                null
            )
        ];

        return this.compactPoints(points);
    }

    /**
     * Returns the waypoints for the live preview shown while dragging an edge endpoint
     * to reconnect it to a different node / handle.
     * One end is fixed (the untouched side of the edge) and the other follows the cursor.
     */
    getReconnectPreviewRoute(edge) {
        if (!edge) return [];

        const sourceNode = this.model.nodes.find(n => n.id === edge.sourceNodeId);
        const targetNode = this.model.nodes.find(n => n.id === edge.targetNodeId);
        if (!sourceNode || !targetNode) return [];

        let sourcePoint;
        let targetPoint;
        let sourceHandle = edge.sourceHandle;
        let targetHandle = edge.targetHandle;

        if (this.state.reconnectingSide === "source") {
            sourcePoint  = { x: this.state.reconnectionPreviewX, y: this.state.reconnectionPreviewY };
            targetPoint  = this.getHandlePoint(targetNode, edge.targetHandle);
            sourceHandle = null;
        } else {
            sourcePoint  = this.getHandlePoint(sourceNode, edge.sourceHandle);
            targetPoint  = { x: this.state.reconnectionPreviewX, y: this.state.reconnectionPreviewY };
            targetHandle = null;
        }

        // Both handles are known — use the full router.
        if (sourceHandle && targetHandle) {
            return this.getEdgeRoute(sourcePoint, targetPoint, sourceHandle, targetHandle, edge);
        }

        // One handle is unknown (cursor is floating) — use simplified routing.
        return this.buildOrthogonalPoints(sourcePoint, targetPoint, sourceHandle, targetHandle);
    }

    /**
     * Removes consecutive duplicate points from a waypoint list.
     * Prevents degenerate zero-length segments in the rendered path.
     */
    compactPoints(points) {

        this.debug("compactPoints");
        if (!points || points.length === 0) return [];

        const result = [points[0]];

        for (let i = 1; i < points.length; i++) {
            const prev = result[result.length - 1];
            const curr = points[i];

            if (prev.x !== curr.x || prev.y !== curr.y) {
                result.push(curr);
            }
        }

        return result;
    }

    simplify(points) {
        if (!Array.isArray(points) || points.length <= 2) {
            return points || [];
        }

        // 1. Remove exact duplicates first
        const compact = this.compactPoints(points);

        if (compact.length <= 2) {
            return compact;
        }

        // 2. Remove unnecessary collinear middle points
        const result = [compact[0]];

        for (let i = 1; i < compact.length - 1; i++) {
            const prev = result[result.length - 1];
            const curr = compact[i];
            const next = compact[i + 1];

            const sameX = prev.x === curr.x && curr.x === next.x;
            const sameY = prev.y === curr.y && curr.y === next.y;

            // Keep the point only if it is a real corner
            if (!sameX && !sameY) {
                result.push(curr);
            }
        }

        result.push(compact[compact.length - 1]);

        // 3. Final compact in case simplification created duplicates
        return this.compactPoints(result);
    }

    /**
     * Returns the visual midpoint of an edge (used for label placement).
     * Picks the midpoint of the middle segment for longer paths.
     */
    getEdgeMiddlePoint(points) {

        if (!points || points.length === 0) {
            return { x: 0, y: 0 };
        }

        // 4+ points: midpoint of the middle segment.
        if (points.length >= 4) {
            return {
                x: (points[1].x + points[2].x) / 2,
                y: (points[1].y + points[2].y) / 2
            };
        }

        // 3 points: midpoint of the second segment.
        if (points.length === 3) {
            return {
                x: (points[1].x + points[2].x) / 2,
                y: (points[1].y + points[2].y) / 2
            };
        }

        // 2 points: straight midpoint.
        return {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2
        };
    }

    // ============================================================
    // 7.2 ROUTE COLLISION HELPERS
    // ============================================================


    findFirstHitObstacle(points, sourceNodeId, targetNodeId, margin = 16) {
        const obstacles = this.model.nodes.filter(node =>
            node.id !== sourceNodeId &&
            node.id !== targetNodeId
        );

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            for (const node of obstacles) {
                const box = this.getNodeObstacleBox(node, margin);

                if (!this.segmentIntersectsBox(p1, p2, box)) {
                    return box;
                }
            }
        }

        return null;
    }


    getNodeObstacleBox(node, margin = 16) {

        const extra = node.type === "decision" ? 6 : 0;

        return {
            left: node.x - margin - extra,
            top: node.y - margin - extra,
            right: node.x + node.width + margin + extra,
            bottom: node.y + node.height + margin + extra
        };
    }

    segmentIntersectsBox(p1, p2, box) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        const isHorizontal = p1.y === p2.y;
        const isVertical = p1.x === p2.x;

        if (isHorizontal) {
            return (
                p1.y >= box.top &&
                p1.y <= box.bottom &&
                maxX >= box.left &&
                minX <= box.right
            );
        }

        if (isVertical) {
            return (
                p1.x >= box.left &&
                p1.x <= box.right &&
                maxY >= box.top &&
                minY <= box.bottom
            );
        }

        return false;
    }


    isAllowedSourceEscapeSegment(p1, p2, handle) {
        switch (handle) {
            case "right":  return p2.x > p1.x;
            case "left":   return p2.x < p1.x;
            case "top":    return p2.y < p1.y;
            case "bottom": return p2.y > p1.y;
            default: return false;
        }
    }

    isAllowedTargetEntrySegment(p1, p2, handle) {
        switch (handle) {
            case "right":  return p2.x < p1.x;
            case "left":   return p2.x > p1.x;
            case "top":    return p2.y > p1.y;
            case "bottom": return p2.y < p1.y;
            default: return false;
        }
    }


    routeHitsAnyObstacle(points, sourceNodeId, targetNodeId, sourceHandle, targetHandle, margin = 16) {
        if (!points || points.length < 2) return false;

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            for (const node of this.model.nodes) {
                const isSource = node.id === sourceNodeId;
                const isTarget = node.id === targetNodeId;

                const box = this.getNodeObstacleBox(node, margin);

                // Als dit segment deze box niet raakt, niks aan de hand
                if (!this.segmentIntersectsBox(p1, p2, box)) {
                    continue;
                }

                // Eerste segment mag uit de source-node weg in de juiste richting
                if (isSource && i === 0) {
                    if (this.isAllowedSourceEscapeSegment(p1, p2, sourceHandle)) {
                        continue;
                    }
                }

                // Laatste segment mag de target-node binnenkomen in de juiste richting
                if (isTarget && i === points.length - 2) {
                    if (this.isAllowedTargetEntrySegment(p1, p2, targetHandle)) {
                        continue;
                    }
                }

                return true;
            }
        }

        return false;
    }

    // routeHitsAnyObstacle(points, sourceNodeId, targetNodeId, margin = 8) {
    //     if (!points || points.length < 2) return false;

    //     const obstacles = this.model.nodes.filter(node =>
    //         node.id !== sourceNodeId &&
    //         node.id !== targetNodeId
    //     );

    //     for (let i = 0; i < points.length - 1; i++) {
    //         const p1 = points[i];
    //         const p2 = points[i + 1];

    //         for (const node of obstacles) {
    //             const box = this.getNodeObstacleBox(node, margin);

    //             if (this.segmentIntersectsBox(p1, p2, box)) {
    //                 return true;
    //             }
    //         }
    //     }

    //     return false;
    // }

    getRouteScore(points) {
        let length = 0;
        let bends = 0;

        for (let i = 0; i < points.length - 1; i++) {
            const dx = Math.abs(points[i+1].x - points[i].x);
            const dy = Math.abs(points[i+1].y - points[i].y);
            length += dx + dy;

            if (i > 0) {
                const prev = points[i-1];
                const curr = points[i];
                const next = points[i+1];

                const dir1 = { x: curr.x - prev.x, y: curr.y - prev.y };
                const dir2 = { x: next.x - curr.x, y: next.y - curr.y };

                if ((dir1.x !== dir2.x) || (dir1.y !== dir2.y)) {
                    bends++;
                }
            }
        }

        return length + bends * 20; // bends licht bestraffen
    }


    // ============================================================
    // 7.3  PATHFINDER HELPERS
    // ============================================================

    getRoutingConfig(edge) {
        if (this.diagram && typeof this.diagram.getRoutingConfig === "function") {
            return this.diagram.getRoutingConfig(edge, this);
        }

        return {
            gridSize: 20,
            stubLength: 20,
            obstacleMargin: 16,
            turnPenalty: 10,
            proximityPenalty: 0,
            preferredDirection: null,
            backtrackPenalty: 0,
            allowedDirections: ["up", "right", "down", "left"]
        };
    }


    calculateRouteStats(points) {
        if (!Array.isArray(points) || points.length < 2) {
            return {
                pathLength: 0,
                turns: 0
            };
        }

        let pathLength = 0;
        let turns = 0;

        for (let i = 0; i < points.length - 1; i++) {
            const dx = Math.abs(points[i + 1].x - points[i].x);
            const dy = Math.abs(points[i + 1].y - points[i].y);
            pathLength += dx + dy;

            if (i > 0) {
                const prev = points[i - 1];
                const curr = points[i];
                const next = points[i + 1];

                const dir1x = curr.x - prev.x;
                const dir1y = curr.y - prev.y;
                const dir2x = next.x - curr.x;
                const dir2y = next.y - curr.y;

                if (dir1x !== dir2x || dir1y !== dir2y) {
                    turns++;
                }
            }
        }

        return {
            pathLength,
            turns
        };
    }

    findPathWithAStar(start, goal, sourceId, targetId, cfg) {
        const grid = cfg.gridSize;
        const key = (p) => `${p.x},${p.y}`;

        const DIRS = {
            up:    { dx: 0, dy: -grid, name: "up" },
            right: { dx: grid, dy: 0, name: "right" },
            down:  { dx: 0, dy: grid, name: "down" },
            left:  { dx: -grid, dy: 0, name: "left" }
        };

        const directions = cfg.allowedDirections.map(name => DIRS[name]);

        const sourceNode = this.getNode(sourceId);
        const targetNode = this.getNode(targetId);

        const margin = cfg.searchMargin || 200;

        const minX = Math.min(
            start.x,
            goal.x,
            sourceNode ? sourceNode.x : start.x,
            targetNode ? targetNode.x : goal.x
        ) - margin;

        const maxX = Math.max(
            start.x,
            goal.x,
            sourceNode ? sourceNode.x + sourceNode.width : start.x,
            targetNode ? targetNode.x + targetNode.width : goal.x
        ) + margin;

        const minY = Math.min(
            start.y,
            goal.y,
            sourceNode ? sourceNode.y : start.y,
            targetNode ? targetNode.y : goal.y
        ) - margin;

        const maxY = Math.max(
            start.y,
            goal.y,
            sourceNode ? sourceNode.y + sourceNode.height : start.y,
            targetNode ? targetNode.y + targetNode.height : goal.y
        ) + margin;

        const isOutOfBounds = (p) =>
            p.x < minX || p.x > maxX || p.y < minY || p.y > maxY;

        const open = new Map();
        const closed = new Set();

        let iterations = 0;
        const maxIterations = cfg.maxIterations || 3000;

        open.set(key(start), {
            point: start,
            g: 0,
            f: this.manhattan(start, goal),
            parent: null,
            dir: null
        });

        while (open.size > 0) {
            iterations++;

            if (iterations > maxIterations) {
                return {
                    path: null,
                    meta: {
                        algorithm: "astar",
                        found: false,
                        iterations,
                        visitedCount: closed.size,
                        totalCost: null
                    }
                };
            }

            let currentKey = null;
            let current = null;

            for (const [k, v] of open) {
                if (!current || v.f < current.f) {
                    current = v;
                    currentKey = k;
                }
            }

            if (current.point.x === goal.x && current.point.y === goal.y) {
                const path = this.reconstructPath(current);

                return {
                    path,
                    meta: {
                        algorithm: "astar",
                        found: true,
                        iterations,
                        visitedCount: closed.size,
                        totalCost: current.g
                    }
                };
            }

            open.delete(currentKey);
            closed.add(currentKey);

            for (const d of directions) {
                const next = {
                    x: current.point.x + d.dx,
                    y: current.point.y + d.dy
                };

                if (isOutOfBounds(next)) continue;

                const nextKey = key(next);

                if (closed.has(nextKey)) continue;

                if (this.isBlocked(next.x, next.y, sourceId, targetId, cfg.obstacleMargin)) {
                    continue;
                }

                let stepCost = grid;

                if (current.dir && current.dir !== d.name) {
                    stepCost += cfg.turnPenalty || 0;
                }

                if (cfg.preferredDirection && this.isBacktracking(d.name, cfg.preferredDirection)) {
                    stepCost += cfg.backtrackPenalty || 0;
                }

                stepCost += this.getProximityPenalty(next.x, next.y, sourceId, targetId, cfg) || 0;

                const g = current.g + stepCost;
                const h = this.manhattan(next, goal);
                const f = g + h;

                const existing = open.get(nextKey);

                if (!existing || g < existing.g) {
                    open.set(nextKey, {
                        point: next,
                        g,
                        f,
                        parent: current,
                        dir: d.name
                    });
                }
            }
        }

        return {
            path: null,
            meta: {
                algorithm: "astar",
                found: false,
                iterations,
                visitedCount: closed.size,
                totalCost: null
            }
        };
    }

    manhattan(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    reconstructPath(node) {
        const path = [];
        let curr = node;

        while (curr) {
            path.push(curr.point);
            curr = curr.parent;
        }

        return path.reverse();
    }

    getGridEntry(exitPoint, handle, sourceId, targetId, routingConfig) {
        const g = routingConfig.gridSize;

        let p = {
            x: Math.round(exitPoint.x / g) * g,
            y: Math.round(exitPoint.y / g) * g
        };

        for (let i = 0; i < 12; i++) {
            if (!this.isBlocked(p.x, p.y, sourceId, targetId, routingConfig.obstacleMargin)) {
                return p;
            }

            switch (handle) {
                case "top":    p.y -= g; break;
                case "bottom": p.y += g; break;
                case "left":   p.x -= g; break;
                case "right":  p.x += g; break;
            }
        }

        return p;
    }


    isBacktracking(direction, preferredDirection) {
        return (
            (preferredDirection === "right" && direction === "left") ||
            (preferredDirection === "left" && direction === "right") ||
            (preferredDirection === "down" && direction === "up") ||
            (preferredDirection === "up" && direction === "down")
        );
    }


    getProximityPenalty(x, y, sourceId, targetId, cfg) {
        if (!cfg.proximityPenalty) return 0;

        let minDistance = Infinity;

        for (const node of this.model.nodes) {
            if (node.id === sourceId || node.id === targetId) continue;

            const box = this.getNodeObstacleBox(node, cfg.obstacleMargin);

            const dx = Math.max(box.left - x, 0, x - box.right);
            const dy = Math.max(box.top - y, 0, y - box.bottom);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDistance) {
                minDistance = dist;
            }
        }

        if (minDistance < cfg.gridSize) {
            return cfg.proximityPenalty * 2;
        }

        if (minDistance < cfg.gridSize * 2) {
            return cfg.proximityPenalty;
        }

        return 0;
    }

    getPortExitPoint(portPoint, handle, distance) {
        switch (handle) {
            case "top": return { x: portPoint.x, y: portPoint.y - distance };
            case "bottom": return { x: portPoint.x, y: portPoint.y + distance };
            case "left": return { x: portPoint.x - distance, y: portPoint.y };
            case "right": return { x: portPoint.x + distance, y: portPoint.y };
        }
    }

    /**
     * True if a grid point lies inside any node's obstacle box — including the edge's own source
     * and target nodes, so routes can't cut through them (e.g. loop-back edges).
     * sourceId / targetId are kept for signature compatibility; start and goal points are pushed
     * outside the source/target boxes by getGridEntry.
     */
    isBlocked(x, y, sourceId, targetId, obstacleMargin = 16) {
        for (const node of this.model.nodes) {
            const box = this.getNodeObstacleBox(node, obstacleMargin);

            if (x >= box.left && x <= box.right &&
                y >= box.top && y <= box.bottom) {
                return true;
            }
        }

        return false;
    }



    // ============================================================
    // 8. PORT / HANDLE GEOMETRY
    // ============================================================

    /**
     * Returns the port map for a node.
     * Delegates to diagram.getPorts if defined, otherwise falls back to the default four-port layout.
     */
    getPorts(node) {
        if (this.diagram.getPorts) {
            return this.diagram.getPorts(node);
        }

        return this.getHandlePositions(node);
    }

    /** Returns the default four-port layout (top, right, bottom, left) for a node. */
    getHandlePositions(node) {
        return {
            top:    { x: node.x + node.width  / 2, y: node.y                  },
            right:  { x: node.x + node.width,       y: node.y + node.height / 2 },
            bottom: { x: node.x + node.width  / 2, y: node.y + node.height    },
            left:   { x: node.x,                    y: node.y + node.height / 2 }
        };
    }

    /**
     * Returns the {x, y} coordinate of a named port on a node.
     * Falls back to the "right" port if the handle name is not found.
     */
    getHandlePoint(node, handleName) {
        const positions = this.getPorts(node);
        return positions[handleName] || positions.right;
    }

    /** Returns the unit direction vector for a handle name (e.g. "top" → {x:0, y:-1}). */
    getHandleDirection(handleName) {
        switch (handleName) {
            case "top":    return { x:  0, y: -1 };
            case "right":  return { x:  1, y:  0 };
            case "bottom": return { x:  0, y:  1 };
            case "left":   return { x: -1, y:  0 };
            default:       return { x:  1, y:  0 };
        }
    }

    /**
     * Returns a point offset from a handle position in its outward direction.
     * Used to create the "exit stub" before the orthogonal routing begins.
     * @param {object} point       {x, y} of the handle.
     * @param {string} handleName  Handle name ("top" | "right" | "bottom" | "left").
     * @param {number} distance    Offset distance in model units.
     */
    getHandleExitPoint(point, handleName, distance = 32) {
        const dir = this.getHandleDirection(handleName);
        return {
            x: point.x + dir.x * distance,
            y: point.y + dir.y * distance
        };
    }

    /**
     * Heuristic: given a source node, returns the name of the port on the
     * target node that faces the source (used when auto-connecting nodes).
     */
    getBestHandleForTargetNode(fromNode, targetNode) {
        const fromCenter   = this.getNodeCenter(fromNode);
        const targetCenter = this.getNodeCenter(targetNode);

        const dx = fromCenter.x - targetCenter.x;
        const dy = fromCenter.y - targetCenter.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            return dx >= 0 ? "right" : "left";
        }

        return dy >= 0 ? "bottom" : "top";
    }

    /**
     * Legacy auto-anchor: returns the edge attachment point on fromNode
     * facing toward toNode based on their relative center positions.
     * Prefer explicit handle names when available.
     */
    getEdgePoint(fromNode, toNode) {
        const fromCenterX = fromNode.x + fromNode.width  / 2;
        const fromCenterY = fromNode.y + fromNode.height / 2;
        const toCenterX   = toNode.x   + toNode.width   / 2;
        const toCenterY   = toNode.y   + toNode.height  / 2;

        const dx = toCenterX - fromCenterX;
        const dy = toCenterY - fromCenterY;

        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx >= 0) {
                return { x: fromNode.x + fromNode.width, y: fromNode.y + fromNode.height / 2 };
            } else {
                return { x: fromNode.x,                  y: fromNode.y + fromNode.height / 2 };
            }
        } else {
            if (dy >= 0) {
                return { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height };
            } else {
                return { x: fromNode.x + fromNode.width / 2, y: fromNode.y                   };
            }
        }
    }

    /**
     * Returns the anchor point for an edge end.
     * Uses the stored handle name if available; falls back to the auto-computed anchor.
     */
    getEdgeAnchorPoint(node, handleName, otherNode) {
        if (handleName) {
            return this.getHandlePoint(node, handleName);
        }

        return this.getEdgePoint(node, otherNode);
    }


    // ============================================================
    // 9. HIT TESTING & LOOKUP
    // ============================================================

    /** Returns the first node whose bounding box contains the given canvas point, or undefined. */
    findNodeAt(x, y) {
        return this.model.nodes.find(n =>
            x >= n.x &&
            x <= n.x + n.width &&
            y >= n.y &&
            y <= n.y + n.height
        );
    }

    /** Walks up the DOM from a target element to find a data-node-id and returns it, or null. */
    findNodeIdAtEventTarget(target) {
        if (!target) return null;

        const nodeGroup = target.closest("[data-node-id]");
        if (!nodeGroup) return null;

        return nodeGroup.getAttribute("data-node-id");
    }

    /** Returns the edge id from a data-edge-id attribute on the event target, or null. */
    findEdgeAtEventTarget(target) {
        if (!target) return null;

        const edgeId = target.getAttribute("data-edge-id");
        if (!edgeId) return null;

        return edgeId;
    }

    /**
     * Returns {nodeId, handle} if the event target is a connection handle circle,
     * or null otherwise.
     */
    findHandleAtEventTarget(target) {
        if (!target) return null;

        const handlePosition = target.getAttribute("data-handle-position");
        if (!handlePosition) return null;

        const nodeGroup = target.closest("[data-node-id]");
        if (!nodeGroup) return null;

        const nodeId = nodeGroup.getAttribute("data-node-id");
        if (!nodeId) return null;

        return { nodeId, handle: handlePosition };
    }

    /**
     * Returns {edgeId, side} if the event target is a draggable edge endpoint handle,
     * or null otherwise.
     */
    findEdgeEndpointAtEventTarget(target) {
        if (!target) return null;

        const edgeId = target.getAttribute("data-edge-endpoint-id");
        const side   = target.getAttribute("data-edge-endpoint-side");

        if (!edgeId || !side) return null;

        return { edgeId, side };
    }

    /** Returns the edge id from a data-edge-control-id attribute, or null. */
    findEdgeControlAtEventTarget(target) {
        if (!target) return null;

        const edgeId = target.getAttribute("data-edge-control-id");
        if (!edgeId) return null;

        return edgeId;
    }

    findEdgeSegmentHandleAtEventTarget(target) {
        if (!target) return null;

        const edgeId = target.getAttribute("data-edge-segment-id");
        const segmentIndex = target.getAttribute("data-edge-segment-index");
        const orientation = target.getAttribute("data-edge-segment-orientation");

        if (!edgeId || segmentIndex === null || !orientation) {
            return null;
        }

        return {
            edgeId,
            segmentIndex: parseInt(segmentIndex, 10),
            orientation
        };
    }

    /**
     * Finds the port on a node that is closest to (x, y) within maxDistance.
     * Returns the handle name ("top" | "right" | "bottom" | "left") or null.
     */
    findNearestHandleOnNode(node, x, y, maxDistance = 18) {
        if (!node) return null;

        const positions = this.getPorts(node);

        let bestHandle   = null;
        let bestDistance = Infinity;

        Object.keys(positions).forEach(handleName => {
            const p    = positions[handleName];
            const dx   = p.x - x;
            const dy   = p.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= maxDistance && dist < bestDistance) {
                bestHandle   = handleName;
                bestDistance = dist;
            }
        });

        return bestHandle;
    }


    // ============================================================
    // 10. COORDINATE UTILITIES
    // ============================================================

    /**
     * Converts a mouse event's client coordinates to canvas (model) coordinates,
     * accounting for the current pan and zoom transform.
     */
    getMousePosition(evt) {
        const pt = this.svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;

        const svgPoint = pt.matrixTransform(this.svg.getScreenCTM().inverse());

        return {
            x: (svgPoint.x - this.state.panX) / this.state.zoom,
            y: (svgPoint.y - this.state.panY) / this.state.zoom
        };
    }

    /**
     * Converts model-space coordinates to SVG viewport coordinates.
     * Used to position HTML overlay elements (node tool, inline inputs) over SVG content.
     */
    modelToView(x, y) {
        return {
            x: x * this.state.zoom + this.state.panX,
            y: y * this.state.zoom + this.state.panY
        };
    }

    /** Returns the centre point of a node in model coordinates. */
    getNodeCenter(node) {
        return {
            x: node.x + node.width  / 2,
            y: node.y + node.height / 2
        };
    }

    /** Returns the text anchor position for a node label (same as its centre). */
    getNodeLabelPosition(node) {
        return {
            x: node.x + node.width  / 2,
            y: node.y + node.height / 2
        };
    }

    /** Returns the midpoint of an edge route, used to position an edge label. */
    getEdgeLabelPosition(edge) {
        const sourceNode = this.model.nodes.find(n => n.id === edge.sourceNodeId);
        const targetNode = this.model.nodes.find(n => n.id === edge.targetNodeId);

        if (!sourceNode || !targetNode) return { x: 0, y: 0 };

        const sourcePoint = this.getHandlePoint(sourceNode, edge.sourceHandle);
        const targetPoint = this.getHandlePoint(targetNode, edge.targetHandle);

        const points = this.getEdgeRoute(
            sourcePoint,
            targetPoint,
            edge.sourceHandle,
            edge.targetHandle,
            edge
        );

        if (!points || points.length === 0) {
            return { x: 0, y: 0 };
        }

        return this.getEdgeMiddlePoint(points);
    }

    /** Returns true if the canvas point {x, y} is within the canvas bounds. */
    isInsideCanvas(pos) {
        return pos.x >= 0 &&
               pos.y >= 0 &&
               pos.x <= this.options.width &&
               pos.y <= this.options.height;
    }


    // ============================================================
    // 11. NODE CREATION FLOW
    // ============================================================

    /**
     * Begins the drag-to-place node creation mode.
     * Once active, the overlay renders a ghost node that follows the cursor
     * until the user clicks to confirm placement.
     * @param {string} nodeType  Must be a key defined in diagram.nodeTypes.
     * @param {number} width     Defaults to 140 if not provided.
     * @param {number} height    Defaults to 60 if not provided.
     */
    startNodeCreation(nodeType, width, height) {
        this.state.creatingNodeType   = nodeType;
        this.state.creatingNodeWidth  = width  || 140;
        this.state.creatingNodeHeight = height || 60;

        // Initialise the preview position to the last known cursor location,
        // or the canvas centre if the cursor has not been tracked yet.
        if (this.state.lastMouseX > 0 || this.state.lastMouseY > 0) {
            this.state.creationPreviewX = this.state.lastMouseX;
            this.state.creationPreviewY = this.state.lastMouseY;
        } else {
            this.state.creationPreviewX = this.options.width  / 2;
            this.state.creationPreviewY = this.options.height / 2;
        }

        this.render();
    }

    /**
     * Builds a ghost node object centred on the current creation preview position.
     * Optionally snaps to the grid when snapToGrid is enabled.
     */
    buildPreviewNode() {
        const g = this.options.gridSize;
        let x   = this.state.creationPreviewX;
        let y   = this.state.creationPreviewY;

        if (this.options.snapToGrid) {
            x = Math.round(x / g) * g;
            y = Math.round(y / g) * g;
        }

        return {
            id:     "__preview__",
            type:   this.state.creatingNodeType,
            x:      x - this.state.creatingNodeWidth  / 2,
            y:      y - this.state.creatingNodeHeight / 2,
            width:  this.state.creatingNodeWidth,
            height: this.state.creatingNodeHeight,
            label:  this.getDefaultLabelForType(this.state.creatingNodeType)
        };
    }

    /**
     * Creates a new node to the right of sourceNode and immediately connects them
     * with an edge from sourceNode.right → newNode.left.
     * @param {object} sourceNode  Existing node to connect from.
     * @param {string} nodeType    Type of the new node.
     */
    createConnectedNode(sourceNode, nodeType) {
        const newNode = {
            id:     crypto.randomUUID(),
            type:   nodeType,
            x:      sourceNode.x + 200,
            y:      sourceNode.y,
            width:  140,
            height: 60,
            label:  this.getDefaultLabelForType(nodeType)
        };

        this.model.nodes.push(newNode);

        this.model.edges.push({
            id:           crypto.randomUUID(),
            sourceNodeId: sourceNode.id,
            targetNodeId: newNode.id,
            sourceHandle: "right",
            targetHandle: "left",
            label:        ""
        });

        this.emitModelChanged();
        this.render();
    }


    // ============================================================
    // 12. CONTEXT ACTIONS & NODE TOOL
    // ============================================================

    /**
     * Central entry point for the node tool surface.
     * The engine resolves interaction mode, creates the shell,
     * asks the diagram/plugin to render the content, and mounts it.
     */
    renderNodeToolSurface(node) {
        this.clearNodeToolSurface();
        if (!node) return;

        const mode = this.getNodeInteractionMode(node) || "action-surface";
        if (mode !== "action-surface" && mode !== "docked-panel") {
            return;
        }

        const actions = this.getNodeContextActions(node);
        if (!actions || actions.length === 0) {
            return;
        }

        const surfaceEl = this.createToolSurfaceShell(node, mode);
        this.renderToolSurfaceContent(surfaceEl, node, actions);
        this.mountToolSurface(surfaceEl, node, mode);

        this.nodeToolEl = surfaceEl;
        this.state.nodeToolNodeId = node.id;
    }

    /**
     * Creates only the visual shell/container of the tool surface.
     * No action content is rendered here.
     */
    createToolSurfaceShell(node, mode) {
        const surfaceEl = document.createElement("div");

        surfaceEl.className = "weavle-tool-surface";
        surfaceEl.dataset.mode = mode;

        surfaceEl.style.position = mode === "docked-panel" ? "relative" : "absolute";
        surfaceEl.style.display = "flex";
        surfaceEl.style.flexDirection = "column";
        surfaceEl.style.gap = "6px";
        surfaceEl.style.padding = "8px";
        surfaceEl.style.background = "#ffffff";
        surfaceEl.style.border = "1px solid #e3e7ec";
        surfaceEl.style.borderRadius = "10px";
        surfaceEl.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)";
        surfaceEl.style.pointerEvents = "auto";
        surfaceEl.style.zIndex = "20";

        // Prevent the surface itself from triggering canvas mouse interactions.
        surfaceEl.addEventListener("mousedown", (e) => {
            e.stopPropagation();
        });

        return surfaceEl;
    }

    /**
     * Lets the diagram/plugin render the content.
     * Falls back to a default button list if no custom renderer is provided.
     */
    renderToolSurfaceContent(surfaceEl, node, actions) {
        const renderer = this.getNodeToolRenderer(node);

        if (typeof renderer === "function") {
            const content = renderer({
                node,
                actions,
                engine: this
            });

            // Preferred new contract:
            // renderer returns an HTMLElement or DocumentFragment
            if (content instanceof HTMLElement || content instanceof DocumentFragment) {
                surfaceEl.appendChild(content);
                return;
            }

            // Backward compatibility:
            // existing renderer mutates surfaceEl directly and returns nothing
            if (surfaceEl.childNodes.length > 0) {
                return;
            }
        }

        actions.forEach(action => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = action.label || action.type;
            btn.style.whiteSpace = "nowrap";
            btn.style.cursor = "pointer";

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.handleContextAction(action, node);
            });

            surfaceEl.appendChild(btn);
        });
    }

    /**
     * Mounts the surface in the correct host.
     * For now, action-surface goes to the overlay layer.
     * Docked-panel is prepared for later extension.
     */
    mountToolSurface(surfaceEl, node, mode) {
        if (mode === "docked-panel") {
            const dockHost = this.getToolSurfaceDockHost?.();

            if (dockHost) {
                dockHost.innerHTML = "";
                dockHost.appendChild(surfaceEl);
                return;
            }
        }

        const pos = this.getToolSurfacePosition(node, mode);
        surfaceEl.style.left = `${pos.x}px`;
        surfaceEl.style.top = `${pos.y}px`;

        this.uiLayer.appendChild(surfaceEl);
    }

    /**
     * Resolves the tool surface position in view coordinates.
     * This keeps all positioning logic in one place.
     */
    getToolSurfacePosition(node, mode) {
        const topRight = this.modelToView(
            node.x + node.width,
            node.y + node.height / 2
        );

        return {
            x: topRight.x + 10,
            y: topRight.y - 40
        };
    }

    /** Removes the node tool from the DOM and clears the related state. */
    clearNodeToolSurface() {
        if (this.nodeToolEl) {
            this.nodeToolEl.remove();
            this.nodeToolEl = null;
        }

        const dockHost = this.getToolSurfaceDockHost?.();
        if (dockHost) {
            dockHost.innerHTML = "";
        }

        this.state.nodeToolNodeId = null;
    }

    /**
     * Re-renders the current tool surface for the selected node, if any.
     * Handy for future pan/zoom/selection refresh scenarios.
     */
    refreshNodeToolSurface() {
        const nodeId = this.state.nodeToolNodeId;
        if (!nodeId) return;

        const node = this.getNode(nodeId);
        if (!node) {
            this.clearNodeToolSurface();
            return;
        }

        this.renderNodeToolSurface(node);
    }

    getToolSurfaceDockHost() {
    const host = this.options.toolSurfaceDockHost;

    if (!host) return null;

    if (typeof host === "string") {
        return document.querySelector(host);
    }

    if (host instanceof HTMLElement) {
        return host;
    }

    return null;
}


    getNodeInteractionMode(node) {
        if (this.diagram && typeof this.diagram.getNodeInteractionMode === "function") {
            return this.diagram.getNodeInteractionMode(node, this);
        }

        return null;
    }

    getNodeContextActions(node) {
        if (this.diagram && typeof this.diagram.getContextActions === "function") {
            return this.diagram.getContextActions(node, this) || [];
        }

        return [];
    }

    getNodeToolRenderer(node) {
        if (this.diagram.getNodeToolRenderer) {
            return this.diagram.getNodeToolRenderer(node, this) || null;
        }
        return null;
    }

    handleContextAction(action, node) {
        if (!action || !node) return;

        if (action.type === "addConnectedNode") {
            this.createConnectedNode(node, action.nodeType);

            const newNode = this.model.nodes[this.model.nodes.length - 1];
            if (newNode) {
                this.selectSingleNode(newNode.id);
                this.renderNodeToolSurface(newNode);
                this.emitSelectionChanged();
            }

            this.pushHistory();
            this.emit("weavle:modelchanged", { model: this.getData() });
            this.render();
            return;
        }

        if (action.type === "deleteNode") {
            const nodeId = node.id;

            this.model.nodes = this.model.nodes.filter(n => n.id !== nodeId);
            this.model.edges = this.model.edges.filter(e =>
                e.sourceNodeId !== nodeId &&
                e.targetNodeId !== nodeId
            );

            this.clearSelection();
            this.clearNodeToolSurface();

            this.pushHistory();
            this.emitSelectionChanged();
            this.emit("weavle:modelchanged", { model: this.getData() });
            this.render();
            return;
        }
    }


    // ============================================================
    // 13. LABEL EDITING
    // ============================================================

    /**
     * Shows a floating <input> element over the node or edge label for inline editing.
     * Commits on Enter or blur; cancels on Escape.
     * @param {string} type  "node" or "edge"
     * @param {string} id    Id of the element to edit.
     */
    startInlineLabelEdit(type, id) {

        this.cancelInlineLabelEdit();

        let value    = "";
        let modelPos = { x: 0, y: 0 };
        let width    = 120;

        if (type === "node") {
            const node = this.model.nodes.find(n => n.id === id);
            if (!node) return;

            value    = node.label || "";
            modelPos = this.getNodeLabelPosition(node);
            width    = node.width - 20;
        }

        if (type === "edge") {
            const edge = this.model.edges.find(e => e.id === id);
            if (!edge) return;

            value    = edge.label || "";
            modelPos = this.getEdgeLabelPosition(edge);
            width    = 120;
        }

        const view = this.modelToView(modelPos.x, modelPos.y);

        const input           = document.createElement("input");
        input.type            = "text";
        input.value           = value;
        input.style.position  = "absolute";
        input.style.left      = `${view.x - width / 2}px`;
        input.style.top       = `${view.y - 14}px`;
        input.style.width     = `${width}px`;
        input.style.height    = "28px";
        input.style.fontSize  = "14px";
        input.style.textAlign = "center";
        input.style.border    = "1px solid #eb6c4c";
        input.style.borderRadius = "4px";
        input.style.zIndex    = "1000";
        input.style.background = "white";
        input.style.boxShadow  = "0 0 6px rgba(0,0,0,0.15)";
        input.style.pointerEvents = "auto";

        this.uiLayer.appendChild(input);

        this.state.editingLabel = { type, id, element: input };

        input.focus();
        input.select();

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter")  this.commitInlineLabelEdit();
            if (e.key === "Escape") this.cancelInlineLabelEdit();
        });

        // Use an ignoreBlur flag to prevent the blur handler from firing
        // immediately after focus (some browsers trigger blur synchronously).
        this.state.ignoreBlur = true;

        input.addEventListener("blur", () => {
            if (this.state.ignoreBlur) return;
            this.commitInlineLabelEdit();
        });

        setTimeout(() => {
            this.state.ignoreBlur = false;
        }, 50);

        // Prevent canvas mouse events from firing when clicking inside the input.
        input.addEventListener("mousedown", (e) => {
            e.stopPropagation();
        });
    }

    /** Saves the current input value to the model and closes the inline editor. */
    commitInlineLabelEdit() {
        const edit = this.state.editingLabel;
        if (!edit) return;

        const value = edit.element.value.trim();

        if (edit.type === "node") {
            const node = this.model.nodes.find(n => n.id === edit.id);
            if (node) node.label = value;
        }

        if (edit.type === "edge") {
            const edge = this.model.edges.find(e => e.id === edit.id);
            if (edge) edge.label = value;
        }

        edit.element.remove();
        this.state.editingLabel = null;

        this.pushHistory();
        this.emit("weavle:modelchanged", {
            model: this.getData()
        });

        this.render();
    }

    /** Discards any pending inline label edit and removes the input element. */
    cancelInlineLabelEdit() {
        const edit = this.state.editingLabel;
        if (!edit) return;

        edit.element.remove();
        this.state.editingLabel = null;
    }

    /**
     * Prompt-based label editor used as a fallback (e.g. from onDoubleClick).
     * @param {string} type  "node" or "edge"
     * @param {string} id    Id of the element to edit.
     */
    editLabel(type, id) {
        if (type === "edge") {
            const edge = this.model.edges.find(e => e.id === id);
            if (!edge) return;

            const newLabel = window.prompt("Edge label:", edge.label || "");
            if (newLabel === null) return;

            edge.label = newLabel.trim();
            this.selectSingleEdge(edge.id);
            this.state.primarySelectedNodeId  = null;

            this.pushHistory();
            this.emit("weavle:modelchanged", { model: this.getData() });
            this.render();
            return;
        }

        if (type === "node") {
            const node = this.model.nodes.find(n => n.id === id);
            if (!node) return;

            const newLabel = window.prompt("Node label:", node.label || "");
            if (newLabel === null) return;

            node.label = newLabel.trim();

            this.state.selectedEdgeId  = null;
            this.selectSingleNode(node.id);

            this.pushHistory();
            this.emit("weavle:modelchanged", { model: this.getData() });
            this.render();
        }
    }

    /**
     * Detects a double-click by comparing the current click with the previous one.
     * If a double-click is detected, opens the inline label editor and returns true.
     * Resets the tracking state after a confirmed double-click so a third click
     * does not re-trigger the editor.
     *
     * @param {string} type  "node" or "edge"
     * @param {string} id    Id of the clicked element.
     * @returns {boolean}    True if a double-click was detected and handled.
     */
    handlePossibleDoubleClick(type, id) {
        const now                  = Date.now();
        const doubleClickThreshold = 350;

        const isDoubleClick =
            this.state.lastClickType === type &&
            this.state.lastClickId   === id   &&
            (now - this.state.lastClickTime) <= doubleClickThreshold;

        this.state.lastClickTime = now;
        this.state.lastClickType = type;
        this.state.lastClickId   = id;

        if (isDoubleClick) {
            // Reset so a third rapid click doesn't re-trigger.
            this.state.lastClickTime = 0;
            this.state.lastClickType = null;
            this.state.lastClickId   = null;
            this.startInlineLabelEdit(type, id);
            return true;
        }

        return false;
    }


    // ============================================================
    // 14. ALIGNMENT / SNAP
    // ============================================================

    /**
     * Searches all other nodes for centre-alignment with the active (dragging) node.
     * Returns the X and/or Y snap guide coordinates when the centres are within
     * the given threshold.
     *
     * @param {object} activeNode  The node currently being dragged.
     * @param {number} threshold   Maximum distance (in model units) to snap.
     * @returns {{ snapGuideX: number|null, snapGuideY: number|null }}
     */
    findAlignmentGuides(activeNode, threshold = 8) {
        const activeCenter = this.getNodeCenter(activeNode);

        let snapGuideX  = null;
        let snapGuideY  = null;
        let bestDeltaX  = Infinity;
        let bestDeltaY  = Infinity;

        this.model.nodes.forEach(node => {
            if (node.id === activeNode.id) return;

            const otherCenter = this.getNodeCenter(node);
            const deltaX      = Math.abs(activeCenter.x - otherCenter.x);
            const deltaY      = Math.abs(activeCenter.y - otherCenter.y);

            if (deltaX <= threshold && deltaX < bestDeltaX) {
                snapGuideX = otherCenter.x;
                bestDeltaX = deltaX;
            }

            if (deltaY <= threshold && deltaY < bestDeltaY) {
                snapGuideY = otherCenter.y;
                bestDeltaY = deltaY;
            }
        });

        return { snapGuideX, snapGuideY };
    }

    /** Clears the current snap-guide coordinates in state. */
    resetSnapGuides() {
        this.state.snapGuideX = null;
        this.state.snapGuideY = null;
    }


    // ============================================================
    // 15. STATE RESET HELPERS
    // ============================================================

    /** Clears all hover-related state fields. */
    resetHoverState() {
        this.state.hoverNodeId       = null;
        this.state.hoverHandleNodeId = null;
        this.state.hoverHandleName   = null;
    }

    /** Clears the state used while drawing a new edge connection. */
    resetConnectionState() {
        this.state.connectingNodeId    = null;
        this.state.connectingHandle    = null;
        this.state.connectionPreviewX  = 0;
        this.state.connectionPreviewY  = 0;
        this.resetHoverState();
    }

    /** Clears the state used while reconnecting an existing edge endpoint. */
    resetReconnectionState() {
        this.state.reconnectingEdgeId    = null;
        this.state.reconnectingSide      = null;
        this.state.reconnectionPreviewX  = 0;
        this.state.reconnectionPreviewY  = 0;
        this.resetHoverState();
    }

    /** Clears the state used while placing a new node on the canvas. */
    resetCreationState() {
        this.state.creatingNodeType   = null;
        this.state.creatingNodeWidth  = 0;
        this.state.creatingNodeHeight = 0;
        this.state.creationPreviewX   = 0;
        this.state.creationPreviewY   = 0;
    }

    resetMarqeeState(){
        this.state.isMarqueeSelecting = false;
        this.state.marqueeStartX = 0;
        this.state.marqueeStartY = 0;
        this.state.marqueeCurrentX = 0;
        this.state.marqueeCurrentY = 0;
        this.state.marqueeAdditive = false;
    }

    resetDraggingState(){
        this.state.draggingNodeIds = null;
        this.state.dragStartPositions = null;
        this.state.dragStartMouseX = 0;
        this.state.dragStartMouseY = 0;
    }


    // ============================================================
    // 16. UNDO/REDO
    // ============================================================

    //push to snapshot history
    pushHistory() {
        if (this.isRestoringHistory) return;

        // Alles ná de huidige positie weggooien (redo-stack leegmaken)
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        // Snapshot toevoegen
        this.history.push(JSON.parse(JSON.stringify(this.model)));
        this.historyIndex = this.history.length - 1;

        // Stack begrenzen (voorkomt geheugengroei)
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }

    undo() {
        this.debug('undo triggered');
        if (this.historyIndex <= 0) return;
        this.historyIndex--;
        this.isRestoringHistory = true;
        this.model = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        this.isRestoringHistory = false;
        this.clearTransientStateAfterHistoryRestore();
        this.render();
        this.emit("weavle:modelchanged", { model: this.getData() });
    }

    redo() {
        this.debug('redo triggered');
        if (this.historyIndex >= this.history.length - 1) return;
        this.historyIndex++;
        this.isRestoringHistory = true;
        this.model = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        this.isRestoringHistory = false;
        this.clearTransientStateAfterHistoryRestore();
        this.render();
        this.emit("weavle:modelchanged", { model: this.getData() });
    }


    clearTransientStateAfterHistoryRestore() {
        this.state.selectedNodeIds = [];
        this.state.primarySelectedNodeId = null;
        this.state.selectedEdgeId = null;

        this.state.draggingNodeId = null;
        this.state.draggingEdgeHandleId = null;

        this.clearNodeToolSurface();
        this.cancelInlineLabelEdit();

        this.resetHoverState();
        this.resetConnectionState();
        this.resetReconnectionState();
        this.resetCreationState();
        this.resetSnapGuides();

        this.state.isPanning = false;
    }



    // ============================================================
    // 17. MISCELLANEOUS UTILITIES
    // ============================================================

    /**
     * Returns the defaultLabel for a node type from the diagram definition.
     * Falls back to "Node" if the type is not found.
     */
    getDefaultLabelForType(nodeType) {
        const typeDef = this.diagram.nodeTypes && this.diagram.nodeTypes[nodeType];
        return typeDef ? typeDef.defaultLabel : "Node";
    }

    /**
     * Returns the fill and stroke colors for a node type from the diagram definition.
     * Falls back to neutral grey if the type is not found.
     */
    getNodeColors(nodeType) {
        const typeDef = this.diagram.nodeTypes && this.diagram.nodeTypes[nodeType];
        return typeDef
            ? typeDef.colors
            : { fill: "#eeeeee", stroke: "#999999" };
    }

    /** Generates a random UUID using the browser's crypto API. */
    generateId() {
        return crypto.randomUUID();
    }

    // /** Generates a prefixed unique id for a new node. */
    // generateNodeId() {
    //     return "n_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    // }

    // /** Generates a prefixed unique id for a new edge. */
    // generateEdgeId() {
    //     return "e_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    // }

    /**
     * Enables or disables text selection on the <body> element.
     * Disabled during node drag operations to prevent accidental browser text selection.
     */
    setTextSelectionEnabled(enabled) {
        document.body.style.userSelect = enabled ? "" : "none";
    }

    /** Clears any active browser text selection. */
    clearTextSelection() {
        if (window.getSelection) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
            }
        }
    }

    /** Returns the topmost DOM element at the given client coordinates. */
    getElementUnderMouse(evt) {
        return document.elementFromPoint(evt.clientX, evt.clientY);
    }

    /** Console.log wrapper — useful for toggling debug output centrally. */
    debug(...args) {
        console.log(...args);
    }

    getCallerMethodName() {
        const stack = new Error().stack.split("\n");

        // [0] Error
        // [1] deze method
        // [2] caller
        const line = stack[2] || "";

        const match = line.match(/at\s+([^\s]+)/);
        return match ? match[1] : "unknown";
    }


    // ============================================================
    // 18. SELECTION LOGIC
    // ============================================================


    isNodeSelected(nodeId) {
        return this.state.selectedNodeIds.includes(nodeId);
    }

    getSelectedNodeIds() {
        return [...this.state.selectedNodeIds];
    }

    getPrimarySelectedNodeId() {
        return this.state.primarySelectedNodeId || null;
    }

    getPrimarySelectedNode() {
        const id = this.getPrimarySelectedNodeId();
        return id ? this.getNode(id) : null;
    }

    clearSelection() {
        this.state.selectedNodeIds = [];
        this.state.primarySelectedNodeId = null;
        this.state.selectedEdgeId = null;
    }

    selectSingleNode(nodeId) {
        this.state.selectedNodeIds = nodeId ? [nodeId] : [];
        this.state.primarySelectedNodeId = nodeId || null;
        this.state.selectedEdgeId = null;
    }

    toggleNodeSelection(nodeId) {
        if (!nodeId) return;

        const ids = [...this.state.selectedNodeIds];
        const index = ids.indexOf(nodeId);

        if (index >= 0) {
            ids.splice(index, 1);
        } else {
            ids.push(nodeId);
        }

        this.state.selectedNodeIds = ids;
        this.state.primarySelectedNodeId = ids.length > 0 ? ids[ids.length - 1] : null;
        this.state.selectedEdgeId = null;
    }

    selectSingleEdge(edgeId) {
        this.state.selectedEdgeId = edgeId || null;
        this.state.selectedNodeIds = [];
        this.state.primarySelectedNodeId = null;
    }

    emitSelectionChanged() {
        this.emit("weavle:selectionchanged", {
            selectedNodeIds: this.getSelectedNodeIds(),
            primarySelectedNodeId: this.getPrimarySelectedNodeId(),
            selectedEdgeId: this.state.selectedEdgeId
        });
    }

    getMarqueeRect() {
    const x1 = this.state.marqueeStartX;
    const y1 = this.state.marqueeStartY;
    const x2 = this.state.marqueeCurrentX;
    const y2 = this.state.marqueeCurrentY;

    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1)
    };
}

    isNodeInsideRect(node, rect) {
        return (
            node.x >= rect.x &&
            node.y >= rect.y &&
            node.x + node.width <= rect.x + rect.width &&
            node.y + node.height <= rect.y + rect.height
        );
    }

    selectNodesInRect(rect, additive = false) {
        const hits = this.model.nodes
            .filter(node => this.isNodeInsideRect(node, rect))
            .map(node => node.id);

        if (additive) {
            const merged = new Set([...this.state.selectedNodeIds, ...hits]);
            this.state.selectedNodeIds = [...merged];
        } else {
            this.state.selectedNodeIds = hits;
        }

        this.state.primarySelectedNodeId =
            this.state.selectedNodeIds.length > 0
                ? this.state.selectedNodeIds[this.state.selectedNodeIds.length - 1]
                : null;

        this.state.selectedEdgeId = null;
    }


    // ============================================================
    // 19. EVENT HANDLERS
    // ============================================================

    /**
     * Handles mousedown on the SVG canvas.
     *
     * Priority order:
     *   Ctrl+click                – start pan
     *   Click on handle           – start new connection
     *   Click on edge endpoint    – start edge reconnection
     *   Click on edge             – select edge
     *   Click on node             – select node + start drag
     *   Click on empty canvas     – deselect all
     *
     * Double-click on a node or edge opens the inline label editor.
     */
    onMouseDown(evt) {

        // Do not interfere while an inline label edit is active.
        if (this.state.editingLabel) return;

        // Ctrl + left-click → start panning.
        if (evt.button === 1) {
            evt.preventDefault();
            this.clearNodeToolSurface?.();
            this.state.isPanning  = true;
            this.state.panStartX  = evt.clientX;
            this.state.panStartY  = evt.clientY;
            this.state.panOriginX = this.state.panX;
            this.state.panOriginY = this.state.panY;
            this.svg.style.cursor = "grabbing";
            return;
        }


        if (this.options.readOnly) return;

        const handleInfo        = this.findHandleAtEventTarget(evt.target);
        const edgeEndpointInfo  = this.findEdgeEndpointAtEventTarget(evt.target);
        const edgeSegmentInfo   = this.findEdgeSegmentHandleAtEventTarget(evt.target);
        const edgeId            = this.findEdgeAtEventTarget(evt.target);
        const pos               = this.getMousePosition(evt);
        const node              = this.findNodeAt(pos.x, pos.y);
        const isCtrlToggle     = evt.ctrlKey || evt.metaKey;

        // Double-click detection for edges.
        if (edgeId) {
            if (this.handlePossibleDoubleClick("edge", edgeId)) return;
        }

        // Double-click detection for nodes.
        if (node) {
            if (this.handlePossibleDoubleClick("node", node.id)) return;
        }

        // 1. Click on a connection handle → start drawing a new edge.
        if (handleInfo) {
            this.clearNodeToolSurface();
            this.state.connectingNodeId   = handleInfo.nodeId;
            this.state.connectingHandle   = handleInfo.handle;
            this.state.connectionPreviewX = pos.x;
            this.state.connectionPreviewY = pos.y;
            this.selectSingleNode(handleInfo.nodeId);

            this.render();
            this.emitSelectionChanged();
            return;
        }

        // 2. Click on a draggable edge endpoint → start reconnecting.
        if (edgeEndpointInfo) {
            this.clearNodeToolSurface();
            this.selectSingleEdge(edgeEndpointInfo.edgeId);

            this.state.reconnectingEdgeId    = edgeEndpointInfo.edgeId;
            this.state.reconnectingSide      = edgeEndpointInfo.side;
            this.state.reconnectionPreviewX  = pos.x;
            this.state.reconnectionPreviewY  = pos.y;
            this.state.draggingNodeId        = null;
            this.state.draggingEdgeHandleId  = null;

            this.render();
            this.emitSelectionChanged();
            return;
        }

        // 3. Click on an edge segment handle
        if (edgeSegmentInfo) {
            const edge = this.model.edges.find(e => e.id === edgeSegmentInfo.edgeId);
            if (!edge) return;

            this.clearNodeToolSurface();

            this.selectSingleEdge(edge.id);

            this.state.draggingSegmentEdgeId = edge.id;
            this.state.draggingSegmentIndex = edgeSegmentInfo.segmentIndex;
            this.state.draggingSegmentOrientation = edgeSegmentInfo.orientation;
            this.state.draggingSegmentStartMouseX = pos.x;
            this.state.draggingSegmentStartMouseY = pos.y;
            this.state.draggingSegmentOriginalPoints = JSON.parse(JSON.stringify(edge.routePoints || []));

            this.render();
            this.emitSelectionChanged();
            return;
        }

         // 4. Click on an edge body → select the edge.
        if (edgeId) {
            this.clearNodeToolSurface();

            this.selectSingleEdge(edgeId);
            this.state.draggingNodeId = null;
            this.state.draggingEdgeHandleId = null;

            this.render();
            this.emitSelectionChanged();
            return;
        }

        // 5. Click on empty canvas → start marquee selection.
        if (!node) {
            this.state.draggingNodeId = null;
            this.state.draggingNodeIds = null;
            this.state.draggingEdgeHandleId = null;
            this.state.reconnectingEdgeId = null;
            this.state.reconnectingSide = null;

            this.resetSnapGuides();
            this.clearNodeToolSurface();

            this.state.isMarqueeSelecting = true;
            this.state.marqueeStartX = pos.x;
            this.state.marqueeStartY = pos.y;
            this.state.marqueeCurrentX = pos.x;
            this.state.marqueeCurrentY = pos.y;
            this.state.marqueeAdditive = evt.ctrlKey || evt.metaKey;

            if (!this.state.marqueeAdditive) {
                this.clearSelection();
                this.emitSelectionChanged();
            }

            this.render();
            return;
        }

        // 6. Click on a node
        if (isCtrlToggle) {
            this.toggleNodeSelection(node.id);

            this.state.draggingNodeId       = null;
            this.state.draggingEdgeHandleId = null;
            this.state.reconnectingEdgeId   = null;
            this.state.reconnectingSide     = null;

            const primaryNode = this.getPrimarySelectedNode();

            this.renderNodeToolSurface(primaryNode);

            this.render();
            this.emitSelectionChanged();
            return;
        }

        // Normal click on node
        // Keep the current multi-selection if the clicked node is already selected.
        // Only collapse to single selection when clicking a node outside the selection.
        if (!this.isNodeSelected(node.id)) {
            this.selectSingleNode(node.id);
        }

        if (this.getSelectedNodeIds().length === 1) {
            this.renderNodeToolSurface(node);
        } else {
            this.clearNodeToolSurface();
        }

        //this.state.draggingNodeId       = node.id;
        this.state.draggingEdgeHandleId = null;
        this.state.reconnectingEdgeId   = null;
        this.state.reconnectingSide     = null;

        //this.state.offsetX = pos.x - node.x;
        //this.state.offsetY = pos.y - node.y;

        const selectedIds = this.getSelectedNodeIds();

        // als meerdere geselecteerd → group drag
        if (selectedIds.length > 1 && selectedIds.includes(node.id)) {

            this.state.draggingNodeIds = [...selectedIds];
            this.state.draggingNodeId = null;

            this.state.dragStartMouseX = pos.x;
            this.state.dragStartMouseY = pos.y;

            const startPositions = {};
            selectedIds.forEach(id => {
                const n = this.getNode(id);
                if (n) {
                    startPositions[id] = { x: n.x, y: n.y };
                }
            });

            this.state.dragStartPositions = startPositions;
        }
        else {
            // single drag (oude gedrag)
            this.state.draggingNodeId = node.id;
            this.state.draggingNodeIds = null;

            this.state.offsetX = pos.x - node.x;
            this.state.offsetY = pos.y - node.y;
        }

        this.clearTextSelection();
        this.setTextSelectionEnabled(false);

        this.render();
        this.emitSelectionChanged();

    }

    /**
     * Handles mousemove across the window.
     * Drives: panning, connection preview, reconnection preview, node dragging.
     */
    onMouseMove(evt) {

        const pos = this.getMousePosition(evt);

        // Pan mode.
        if (this.state.isPanning) {
            this.svg.style.cursor = "grabbing";
            const dx = evt.clientX - this.state.panStartX;
            const dy = evt.clientY - this.state.panStartY;
            this.state.panX = this.state.panOriginX + dx;
            this.state.panY = this.state.panOriginY + dy;
            this.render();
            return;
        }

        // Marquee selection preview
        if (this.state.isMarqueeSelecting) {
            this.state.marqueeCurrentX = pos.x;
            this.state.marqueeCurrentY = pos.y;
            this.render();
            return;
        }

        this.state.lastMouseX = pos.x;
        this.state.lastMouseY = pos.y;

        // Drawing a new edge connection.
        if (this.state.connectingNodeId) {
            const hoveredNode              = this.findNodeAt(pos.x, pos.y);
            this.state.hoverNodeId         = hoveredNode ? hoveredNode.id : null;

            if (hoveredNode) {
                const nearestHandle            = this.findNearestHandleOnNode(hoveredNode, pos.x, pos.y, 18);
                this.state.hoverHandleNodeId   = nearestHandle ? hoveredNode.id : null;
                this.state.hoverHandleName     = nearestHandle;
            } else {
                this.state.hoverHandleNodeId   = null;
                this.state.hoverHandleName     = null;
            }

            this.state.connectionPreviewX  = pos.x;
            this.state.connectionPreviewY  = pos.y;
            this.render();
            return;
        }

        // Reconnecting an existing edge endpoint.
        if (this.state.reconnectingEdgeId) {
            const hoveredNode              = this.findNodeAt(pos.x, pos.y);
            this.state.hoverNodeId         = hoveredNode ? hoveredNode.id : null;

            if (hoveredNode) {
                const nearestHandle            = this.findNearestHandleOnNode(hoveredNode, pos.x, pos.y, 18);
                this.state.hoverHandleNodeId   = nearestHandle ? hoveredNode.id : null;
                this.state.hoverHandleName     = nearestHandle;
            } else {
                this.state.hoverHandleNodeId   = null;
                this.state.hoverHandleName     = null;
            }

            this.state.reconnectionPreviewX = pos.x;
            this.state.reconnectionPreviewY = pos.y;
            this.render();
            return;
        }

        //dragging egde segment
        if (this.state.draggingSegmentEdgeId) {
            const edge = this.model.edges.find(e => e.id === this.state.draggingSegmentEdgeId);
            if (!edge || !Array.isArray(this.state.draggingSegmentOriginalPoints)) {
                return;
            }

            const dx = pos.x - this.state.draggingSegmentStartMouseX;
            const dy = pos.y - this.state.draggingSegmentStartMouseY;

            const originalPoints = JSON.parse(JSON.stringify(this.state.draggingSegmentOriginalPoints));
            edge.routePoints = originalPoints;

            this.moveSegment(
                edge,
                this.state.draggingSegmentIndex,
                dx,
                dy
            );

            this.render();
            return;
        }

        // Clear hover state when not in a connect / reconnect interaction.
        this.state.hoverNodeId       = null;
        this.state.hoverHandleNodeId = null;
        this.state.hoverHandleName   = null;


        // Group drag
        if (this.state.draggingNodeIds) {

            const dx = pos.x - this.state.dragStartMouseX;
            const dy = pos.y - this.state.dragStartMouseY;

            this.state.draggingNodeIds.forEach(id => {
                const node = this.getNode(id);
                const start = this.state.dragStartPositions[id];
                if (!node || !start) return;

                let newX = start.x + dx;
                let newY = start.y + dy;

                if (this.options.snapToGrid) {
                    const g = this.options.gridSize || 20;
                    newX = this.snapToGrid(newX, g);
                    newY = this.snapToGrid(newY, g);
                }

                node.x = newX;
                node.y = newY;
            });


            const primaryNode = this.getPrimarySelectedNode();

            if (primaryNode) {
                const guides = this.findAlignmentGuides(primaryNode, 8);
                this.state.snapGuideX = guides.snapGuideX;
                this.state.snapGuideY = guides.snapGuideY;

                let snapDx = 0;
                let snapDy = 0;

                if (guides.snapGuideX !== null) {
                    const desiredX = guides.snapGuideX - primaryNode.width / 2;
                    snapDx = desiredX - primaryNode.x;
                }

                if (guides.snapGuideY !== null) {
                    const desiredY = guides.snapGuideY - primaryNode.height / 2;
                    snapDy = desiredY - primaryNode.y;
                }

                if (snapDx !== 0 || snapDy !== 0) {
                    this.state.draggingNodeIds.forEach(id => {
                        const node = this.getNode(id);
                        if (!node) return;

                        node.x += snapDx;
                        node.y += snapDy;
                    });
                }
            } else {
                this.resetSnapGuides();
            }

            // reroute edges
            this.rerouteEdgesForNodes(this.state.draggingNodeIds);

            this.render();
            return;
        }


        // Singel drag
        if (this.state.draggingNodeId) {

            const node = this.getNode(this.state.draggingNodeId);
            if (!node) return;

            let newX = pos.x - this.state.offsetX;
            let newY = pos.y - this.state.offsetY;

            if (this.options.snapToGrid) {
                const g = this.options.gridSize || 20;
                newX = this.snapToGrid(newX, g);
                newY = this.snapToGrid(newY, g);
            }

            node.x = newX;
            node.y = newY;

            const guides = this.findAlignmentGuides(node, 8);
            this.state.snapGuideX = guides.snapGuideX;
            this.state.snapGuideY = guides.snapGuideY;

            if (guides.snapGuideX !== null) {
                node.x = guides.snapGuideX - node.width / 2;
            }

            if (guides.snapGuideY !== null) {
                node.y = guides.snapGuideY - node.height / 2;
            }

            //this.rerouteEdgesForNodes([node.id]);

            this.render();
            return;
        }


//  //       if (!this.state.draggingNodeId) return;

//         // Dragging a node.
//         const node = this.model.nodes.find(n => n.id === this.state.draggingNodeId);
//         if (!node) return;

//         node.x = pos.x - this.state.offsetX;
//         node.y = pos.y - this.state.offsetY;

//         // Apply grid snap first.
//         if (this.options.snapToGrid) {
//             const g = this.options.gridSize;
//             node.x  = Math.round(node.x / g) * g;
//             node.y  = Math.round(node.y / g) * g;
//         }

//         // Then look for alignment guides and snap to them if found.
//         const guides             = this.findAlignmentGuides(node, 8);
//         this.state.snapGuideX    = guides.snapGuideX;
//         this.state.snapGuideY    = guides.snapGuideY;

//         if (guides.snapGuideX !== null) node.x = guides.snapGuideX - node.width  / 2;
//         if (guides.snapGuideY !== null) node.y = guides.snapGuideY - node.height / 2;

//         this.render();
    }

    /**
     * Handles mouseup across the window.
     * Finalises: pan, edge reconnection, new edge connection, node placement, node drag.
     */
    onMouseUp(evt) {

        // End pan mode.
        if (this.state.isPanning) {
            this.state.isPanning  = false;
            this.svg.style.cursor = "";
            return;
        }

        this.setTextSelectionEnabled(true);

        if (this.state.draggingSegmentEdgeId) {
            const edge = this.model.edges.find(e => e.id === this.state.draggingSegmentEdgeId);

            this.state.draggingSegmentEdgeId = null;
            this.state.draggingSegmentIndex = null;
            this.state.draggingSegmentOrientation = null;
            this.state.draggingSegmentStartMouseX = 0;
            this.state.draggingSegmentStartMouseY = 0;
            this.state.draggingSegmentOriginalPoints = null;

            if (edge) {
                edge.isAutoRoute = false;
                edge.routingMeta = { algorithm: "manual", found: true };
                this.pushHistory();
                this.emit("weavle:modelchanged", { model: this.getData() });
            }

            this.render();
            return;
        }

        // Finalise edge reconnection.
        if (this.state.reconnectingEdgeId) {
            const edge             = this.model.edges.find(e => e.id === this.state.reconnectingEdgeId);
            const reconnectingSide = this.state.reconnectingSide;
            const targetNodeId     = this.state.hoverHandleNodeId;
            const targetHandle     = this.state.hoverHandleName;

            this.resetReconnectionState();

            if (edge && targetNodeId && targetHandle) {
                if (reconnectingSide === "source") {
                    edge.sourceNodeId = targetNodeId;
                    edge.sourceHandle = targetHandle;
                } else if (reconnectingSide === "target") {
                    edge.targetNodeId = targetNodeId;
                    edge.targetHandle = targetHandle;
                }
                
                // Reconnect means: give auto-routing a fresh chance
                edge.isAutoRoute = true;

                // Optional: clear old manual path data
                edge.routePoints = [];
                edge.bendPoints = [];

                this.updateEdgeRoute(edge);

                this.pushHistory();
                this.emit("weavle:modelchanged", { model: this.getData() });
            }

            this.render();
            return;
        }

        // Finalise placing a new node.
        if (this.state.creatingNodeType) {
            const previewNode = this.buildPreviewNode();

            const newNode = {
                id:     this.generateId(),
                type:   previewNode.type,
                x:      previewNode.x,
                y:      previewNode.y,
                width:  previewNode.width,
                height: previewNode.height,
                label:  previewNode.label
            };

            this.model.nodes.push(newNode);
            this.resetCreationState();

            this.selectSingleNode(newNode.id);
            this.emitSelectionChanged();
            
            this.pushHistory();



            this.emit("weavle:modelchanged", { model: this.getData() });
            this.render();
            return;
        }

        // Finalise drawing a new connection.
        if (this.state.connectingNodeId) {
            const sourceNodeId = this.state.connectingNodeId;
            const sourceHandle = this.state.connectingHandle;

            let targetNodeId = this.state.hoverHandleNodeId;
            let targetHandle = this.state.hoverHandleName;


            if (!targetNodeId ) {
                const pos = this.getMousePosition(evt);
                const targetNode = this.findNodeAt(pos.x, pos.y);

                if (targetNode) {
                    targetNodeId = targetNode.id;
                }
            }

            if (targetNodeId && !targetHandle) {
                const sourceNode = this.getNode(sourceNodeId);
                const targetNode = this.getNode(targetNodeId);

                if (sourceNode && targetNode) {
                    targetHandle = this.getBestHandleForTargetNode(sourceNode, targetNode);
                }
            }


            this.resetConnectionState();

            if (targetNodeId && targetHandle && targetNodeId !== sourceNodeId) {
                const newEdge = {
                    id:           this.generateId(),
                    sourceNodeId: sourceNodeId,
                    targetNodeId: targetNodeId,
                    sourceHandle: sourceHandle,
                    targetHandle: targetHandle,
                    label:        "",
                    bendPoints:   [],
                    isAutoRoute: true
                };

                this.updateEdgeRoute(newEdge);
                this.model.edges.push(newEdge);
                this.pushHistory();
                this.emit("weavle:modelchanged", { model: this.getData() });
            }

            this.render();
            return;
        }

        // Finalise marquee selection.
        if (this.state.isMarqueeSelecting) {
            const rect = this.getMarqueeRect();
            const additive = this.state.marqueeAdditive;

            this.state.isMarqueeSelecting = false;
            this.state.marqueeStartX = 0;
            this.state.marqueeStartY = 0;
            this.state.marqueeCurrentX = 0;
            this.state.marqueeCurrentY = 0;
            this.state.marqueeAdditive = false;

            // Ignore tiny click-like rectangles if desired
            if (rect.width > 2 || rect.height > 2) {
                this.selectNodesInRect(rect, additive);
            }

            this.emitSelectionChanged();
            this.render();
            return;
        }

        // Finalise group drag.
        if (this.state.draggingNodeIds && this.state.draggingNodeIds.length > 0) {
            const movedNodeIds = [...this.state.draggingNodeIds];

            this.state.draggingNodeIds = null;
            this.state.dragStartPositions = null;
            this.state.dragStartMouseX = 0;
            this.state.dragStartMouseY = 0;

            this.resetSnapGuides();

            movedNodeIds.forEach(nodeId => {
                this.model.edges
                    .filter(e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId)
                    .forEach(e => this.updateEdgeRoute(e));
            });

            this.pushHistory();
            this.emit("weavle:modelchanged", { model: this.getData() });
            this.render();
            return;
        }

        // Finalise single node drag.
        if (!this.state.draggingNodeId) {
            this.resetSnapGuides();
            return;
        }

        const node = this.model.nodes.find(n => n.id === this.state.draggingNodeId);
        this.state.draggingNodeId = null;

        this.resetSnapGuides();

        if (node) {
            this.model.edges
                .filter(e => e.sourceNodeId === node.id || e.targetNodeId === node.id)
                .forEach(e => this.updateEdgeRoute(e));

            this.emit("weavle:nodemoved", {
                node: JSON.parse(JSON.stringify(node)),
                model: this.getData()
            });
        }

        this.pushHistory();
        this.emit("weavle:modelchanged", { model: this.getData() });
        this.render();

    }

    /**
     * Handles keydown events.
     * - Escape: cancels any active interaction (connect, reconnect, create, drag).
     * - Delete / Backspace: removes the selected edge or node (with its connected edges).
     * Ignored while the user is typing in an input or contenteditable element.
     */
    onKeyDown(evt) {

        if (this.options.readOnly) return;

        // Do not intercept keys when the user is typing in an input field.
        const tagName = evt.target && evt.target.tagName ? evt.target.tagName.toLowerCase() : "";
        const isTypingTarget =
            tagName === "input" ||
            tagName === "textarea" ||
            (evt.target && evt.target.isContentEditable);

        if (isTypingTarget) return;

        // ESC — cancel the current interaction.
        if (evt.key === "Escape") {
            let didCancel = false;

            if (this.state.connectingNodeId) {
                this.resetConnectionState();
                didCancel = true;
            }

            if (this.state.reconnectingEdgeId) {
                this.resetReconnectionState();
                didCancel = true;
            }

            if (this.state.creatingNodeType) {
                this.resetCreationState();
                didCancel = true;
            }

            if (this.state.draggingNodeId) {
                this.state.draggingNodeId = null;
                didCancel = true;
            }

            if (this.state.draggingNodeIds) {
                this.resetDraggingState();
                didCancel = true;
            }


            if(this.state.isMarqueeSelecting){
                this.resetMarqeeState();
                didCancel = true; 
            }

            if (didCancel) {
                this.setTextSelectionEnabled(true);
                this.render();
                evt.preventDefault();
            }

            return;
        }

        // Delete / Backspace — remove the selected element.
        if (evt.key === "Delete" || evt.key === "Backspace") {

            // Remove selected edge first.
            if (this.state.selectedEdgeId) {
                const edgeId = this.state.selectedEdgeId;

                this.model.edges = this.model.edges.filter(e => e.id !== edgeId);
                this.state.selectedEdgeId = null;

                this.pushHistory();
                this.emit("weavle:modelchanged", { model: this.getData() });
                this.render();
                evt.preventDefault();
                return;
            }

            // Remove selected node(s) and all edges connected to it.
            const selectedNodeIds = this.getSelectedNodeIds();

            if (selectedNodeIds.length > 0) {
                const selectedSet = new Set(selectedNodeIds);

                this.model.nodes = this.model.nodes.filter(n => !selectedSet.has(n.id));
                this.model.edges = this.model.edges.filter(e =>
                    !selectedSet.has(e.sourceNodeId) &&
                    !selectedSet.has(e.targetNodeId)
                );

                this.clearSelection();
                this.clearNodeToolSurface();

                this.pushHistory();
                this.emitSelectionChanged();
                this.emit("weavle:modelchanged", { model: this.getData() });
                this.render();
                evt.preventDefault();
                return;
            }
        }

        //Undo if ctrl+z
        if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === "z" && !evt.shiftKey) {
            if (this.undo()) {
                evt.preventDefault();
            }
            return;
        }

        //Redo if ctrl+y
        if (
            ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === "y") ||
            ((evt.ctrlKey || evt.metaKey) && evt.shiftKey && evt.key.toLowerCase() === "z")
            ) {
            if (this.redo()) {
                evt.preventDefault();
            }
            return;
        }
    }

    /**
     * Handles the mouse wheel event for zooming.
     * Only activates when Ctrl is held. Keeps the canvas point under the cursor
     * visually stable during zoom by adjusting panX / panY accordingly.
     */
    onWheel(evt) {

        if (!evt.ctrlKey) return;

        evt.preventDefault();
        this.clearNodeToolSurface();

        const mouseBeforeZoom = this.getMousePosition(evt);

        const zoomFactor = evt.deltaY < 0 ? 1.1 : 0.9;
        const newZoom    = Math.max(0.3, Math.min(3, this.state.zoom * zoomFactor));
        const oldZoom    = this.state.zoom;

        if (newZoom === oldZoom) return;

        // Compute the SVG-space point under the cursor before applying the new zoom.
        const pt       = this.svg.createSVGPoint();
        pt.x           = evt.clientX;
        pt.y           = evt.clientY;
        const svgPoint = pt.matrixTransform(this.svg.getScreenCTM().inverse());

        // Adjust pan so the point under the cursor remains at the same screen position.
        this.state.zoom = newZoom;
        this.state.panX = svgPoint.x - mouseBeforeZoom.x * newZoom;
        this.state.panY = svgPoint.y - mouseBeforeZoom.y * newZoom;

        this.render();
    }

    /**
     * Handles double-click events on nodes and edges.
     * Currently not wired via bindEvents (commented out); kept as a named method
     * so it can be enabled if the inline double-click detector is removed.
     */
    onDoubleClick(evt) {

        if (this.options.readOnly) return;
        if (this.state.isPanning)  return;

        const edgeId = this.findEdgeAtEventTarget(evt.target);
        const nodeId = this.findNodeIdAtEventTarget(evt.target);

        // Edit edge label.
        if (edgeId) {
            const edge = this.model.edges.find(e => e.id === edgeId);
            if (!edge) return;

            this.selectSingleEdge(edge.id);
            this.state.primarySelectedNodeId  = null;

            this.emit("weavle:modelchanged", { model: this.getData() });
            this.render();
            return;
        }

        // Edit node label.
        if (nodeId) {
            const node = this.model.nodes.find(n => n.id === nodeId);
            if (!node) return;

            const newLabel = window.prompt("Node label:", node.label || "");
            if (newLabel === null) return;

            node.label = newLabel;

            this.selectSingleNode(node.id);
            this.state.selectedEdgeId  = null;

            this.emit("weavle:modelchanged", { model: this.getData() });
            this.render();
        }
    }

}
