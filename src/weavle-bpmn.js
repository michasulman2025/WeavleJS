/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

const NS = "http://www.w3.org/2000/svg";

// Width of the label strip on the left of pools and lanes (shapes, label layout and lane stacking).
const POOL_HEADER = 30;

// Lanes never get smaller than this when a neighbour or the pool is resized.
const LANE_MIN_HEIGHT = 60;

// Pool / lane edges stop this far from the shapes inside them.
const CONTENT_PADDING = 10;

// ============================================================
// BPMN SHAPE RENDERERS
// Each function receives (node, engine) and returns an SVG element or group.
// ============================================================

// ============================================================
// EVENTS
//
// One generic event shape, driven by this table:
//   kind     start (thin circle) | intermediate (double circle) | end (thick circle)
//   trigger  none | message | timer | conditional | signal | escalation | error |
//            compensation | link | terminate
//   throw    intermediate throw events (end events always throw): filled marker;
//            catching events get an outlined marker
// ============================================================

const EVENT_TYPES = {
    // Start
    startEvent:             { kind: "start",        trigger: "none",         label: "Start" },
    messageStartEvent:      { kind: "start",        trigger: "message",      label: "Message start" },
    timerStartEvent:        { kind: "start",        trigger: "timer",        label: "Timer start" },
    conditionalStartEvent:  { kind: "start",        trigger: "conditional",  label: "Conditional start" },
    signalStartEvent:       { kind: "start",        trigger: "signal",       label: "Signal start" },

    // Intermediate — catching
    messageCatchEvent:      { kind: "intermediate", trigger: "message",      label: "Message catch" },
    timerCatchEvent:        { kind: "intermediate", trigger: "timer",        label: "Timer" },
    conditionalCatchEvent:  { kind: "intermediate", trigger: "conditional",  label: "Condition" },
    signalCatchEvent:       { kind: "intermediate", trigger: "signal",       label: "Signal catch" },
    linkCatchEvent:         { kind: "intermediate", trigger: "link",         label: "Link catch" },

    // Intermediate — throwing ("intermediateEvent" is the plain none event)
    intermediateEvent:      { kind: "intermediate", trigger: "none",         label: "Intermediate event", throw: true },
    messageThrowEvent:      { kind: "intermediate", trigger: "message",      label: "Message throw",      throw: true },
    signalThrowEvent:       { kind: "intermediate", trigger: "signal",       label: "Signal throw",       throw: true },
    escalationThrowEvent:   { kind: "intermediate", trigger: "escalation",   label: "Escalation",         throw: true },
    compensationThrowEvent: { kind: "intermediate", trigger: "compensation", label: "Compensation",       throw: true },
    linkThrowEvent:         { kind: "intermediate", trigger: "link",         label: "Link throw",         throw: true },

    // End
    endEvent:               { kind: "end",          trigger: "none",         label: "End" },
    messageEndEvent:        { kind: "end",          trigger: "message",      label: "Message end" },
    errorEndEvent:          { kind: "end",          trigger: "error",        label: "Error end" },
    escalationEndEvent:     { kind: "end",          trigger: "escalation",   label: "Escalation end" },
    signalEndEvent:         { kind: "end",          trigger: "signal",       label: "Signal end" },
    compensationEndEvent:   { kind: "end",          trigger: "compensation", label: "Compensation end" },
    terminateEndEvent:      { kind: "end",          trigger: "terminate",    label: "Terminate" },

    // Boundary — attached to the border of an activity (node.attachedToId), always catching.
    // node.interrupting === false draws the non-interrupting (dashed) variant; error and
    // compensation boundary events are always interrupting.
    messageBoundaryEvent:      { kind: "boundary", trigger: "message",      label: "Message" },
    timerBoundaryEvent:        { kind: "boundary", trigger: "timer",        label: "Timer" },
    conditionalBoundaryEvent:  { kind: "boundary", trigger: "conditional",  label: "Condition" },
    signalBoundaryEvent:       { kind: "boundary", trigger: "signal",       label: "Signal" },
    escalationBoundaryEvent:   { kind: "boundary", trigger: "escalation",   label: "Escalation" },
    errorBoundaryEvent:        { kind: "boundary", trigger: "error",        label: "Error",        alwaysInterrupting: true },
    compensationBoundaryEvent: { kind: "boundary", trigger: "compensation", label: "Compensation", alwaysInterrupting: true }
};

const EVENT_COLORS = {
    start:        { fill: "#ffffff", stroke: "#1B5278" },
    intermediate: { fill: "#ffffff", stroke: "#4A8DB5" },
    end:          { fill: "#ffffff", stroke: "#0d2d44" },
    boundary:     { fill: "#ffffff", stroke: "#4A8DB5" }
};

const ACTIVITY_TYPES = [
    "task", "userTask", "serviceTask", "sendTask", "receiveTask", "scriptTask",
    "manualTask", "businessRuleTask", "callActivity", "subProcess"
];

const GATEWAY_TYPES = ["exclusiveGateway", "parallelGateway", "inclusiveGateway", "gateway"];

/** Small helper: create an SVG element with attributes and append it to the parent. */
function _el(parent, tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
}

/**
 * Draws the trigger marker of an event inside the circle (cx, cy, r).
 * filled: throwing marker (solid), otherwise catching (outlined).
 */
function drawEventMarker(group, trigger, cx, cy, r, color, filled) {
    const s    = r * 0.52;   // half-size of the marker area
    const fill = filled ? color : "#ffffff";
    const base = { stroke: color, "stroke-width": 1.4, "stroke-linejoin": "round", fill };
    const pts  = list => list.map(([dx, dy]) => `${cx + dx * s},${cy + dy * s}`).join(" ");

    switch (trigger) {
        case "message": {
            const w = s * 1.5, h = s * 1.05, x = cx - w / 2, y = cy - h / 2;
            _el(group, "rect", { ...base, x, y, width: w, height: h });
            _el(group, "polyline", {
                points: `${x},${y} ${cx},${cy + h * 0.1} ${x + w},${y}`,
                fill: "none", stroke: filled ? "#ffffff" : color, "stroke-width": 1.2
            });
            break;
        }
        case "timer": {
            _el(group, "circle", { ...base, fill: "#ffffff", cx, cy, r: s * 0.95 });
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                _el(group, "line", {
                    x1: cx + Math.cos(a) * s * 0.72, y1: cy + Math.sin(a) * s * 0.72,
                    x2: cx + Math.cos(a) * s * 0.9,  y2: cy + Math.sin(a) * s * 0.9,
                    stroke: color, "stroke-width": 0.8
                });
            }
            _el(group, "polyline", {
                points: `${cx},${cy - s * 0.6} ${cx},${cy} ${cx + s * 0.45},${cy}`,
                fill: "none", stroke: color, "stroke-width": 1.2, "stroke-linecap": "round"
            });
            break;
        }
        case "conditional": {
            const w = s * 1.15, h = s * 1.45, x = cx - w / 2, y = cy - h / 2;
            _el(group, "rect", { ...base, fill: "#ffffff", x, y, width: w, height: h });
            [0.22, 0.42, 0.62, 0.82].forEach(f => _el(group, "line", {
                x1: x + w * 0.2, y1: y + h * f, x2: x + w * 0.8, y2: y + h * f,
                stroke: color, "stroke-width": 1
            }));
            break;
        }
        case "signal":
            _el(group, "polygon", { ...base, points: pts([[0, -1], [0.95, 0.65], [-0.95, 0.65]]) });
            break;
        case "escalation":
            _el(group, "polygon", { ...base, points: pts([[0, -1], [0.7, 0.85], [0, 0.25], [-0.7, 0.85]]) });
            break;
        case "error":
            _el(group, "polygon", { ...base, points: pts([[-0.75, 0.8], [-0.3, -0.75], [0.15, 0.15], [0.75, -0.8], [0.3, 0.75], [-0.15, -0.15]]) });
            break;
        case "compensation":
            _el(group, "polygon", { ...base, points: pts([[-1, 0], [-0.05, -0.62], [-0.05, 0.62]]) });
            _el(group, "polygon", { ...base, points: pts([[-0.05, 0], [0.9, -0.62], [0.9, 0.62]]) });
            break;
        case "link":
            _el(group, "polygon", { ...base, points: pts([[-0.8, -0.3], [0.1, -0.3], [0.1, -0.7], [0.9, 0], [0.1, 0.7], [0.1, 0.3], [-0.8, 0.3]]) });
            break;
        case "terminate":
            _el(group, "circle", { cx, cy, r: s * 0.9, fill: color, stroke: "none" });
            break;
    }
}

/**
 * Adds a boundary event of `type` to the bottom border of the activity `host`, in the first free
 * slot from the left (then the top border, if the bottom is full).
 */
function addBoundaryEvent(host, type, engine, definition) {
    const size     = 36;
    const step     = 60;   // room for the small label next to each event
    const attached = engine.getAttachedNodes(host);
    const taken    = (cx, cy) => attached.some(n => Math.abs(n.x + n.width / 2 - cx) < step / 2 && Math.abs(n.y + n.height / 2 - cy) < step / 2);

    let center = null;

    for (const cy of [host.y + host.height, host.y]) {
        for (let cx = host.x + 26; cx <= host.x + host.width - 18; cx += step) {
            if (!taken(cx, cy)) { center = { cx, cy }; break; }
        }
        if (center) break;
    }

    center ??= { cx: host.x + host.width / 2, cy: host.y + host.height };

    engine.model.nodes.push({
        id:           crypto.randomUUID(),
        type,
        x:            center.cx - size / 2,
        y:            center.cy - size / 2,
        width:        size,
        height:       size,
        label:        "",
        attachedToId: host.id,
        ...(host.parentId ? { parentId: host.parentId } : {})
    });

    return true;
}

const bpmnShapes = {

    // ── Events ──────────────────────────────────────────────
    // One shape for every event type; see EVENT_TYPES.
    event(node, engine) {
        const def   = EVENT_TYPES[node.type] || EVENT_TYPES.startEvent;
        const group = document.createElementNS(NS, "g");
        const r     = Math.min(node.width, node.height) / 2;
        const cx    = node.x + node.width  / 2;
        const cy    = node.y + node.height / 2;
        const color = engine.getNodeColors(node.type).stroke;

        const outer = _el(group, "circle", { cx, cy, r });
        engine.applyNodeStyle(outer, node);

        if (def.kind === "end") {
            outer.setAttribute("stroke-width", engine.isNodeSelected(node.id) ? "3.5" : "3");
        }

        if (def.kind === "intermediate" || def.kind === "boundary") {
            const inner = _el(group, "circle", { cx, cy, r: Math.max(2, r - Math.max(3, r * 0.15)), fill: "none", stroke: color, "stroke-width": 1.2 });

            // Non-interrupting boundary event: both circles dashed.
            if (def.kind === "boundary" && node.interrupting === false && !def.alwaysInterrupting) {
                outer.setAttribute("stroke-dasharray", "4 2.5");
                inner.setAttribute("stroke-dasharray", "4 2.5");
            }
        }

        if (def.trigger !== "none") {
            drawEventMarker(group, def.trigger, cx, cy, r, color, def.kind === "end" || !!def.throw);
        }

        return group;
    },

    // ── Tasks ────────────────────────────────────────────────

    task(node, engine) {
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x); rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width); rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 10);
        engine.applyNodeStyle(rect, node);
        return rect;
    },

    // User task — rounded rect + person icon in top-left corner
    userTask(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x); rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width); rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 10);
        engine.applyNodeStyle(rect, node);

        const colors = engine.getNodeColors(node.type);
        const ix = node.x + 8, iy = node.y + 6, is = 14;

        const head = document.createElementNS(NS, "circle");
        head.setAttribute("cx", ix + is / 2); head.setAttribute("cy", iy + 4);
        head.setAttribute("r", "4");
        head.setAttribute("fill", "none"); head.setAttribute("stroke", colors.stroke); head.setAttribute("stroke-width", "1.5");

        const body = document.createElementNS(NS, "path");
        body.setAttribute("d", `M ${ix + 2} ${iy + is} Q ${ix + is / 2} ${iy + 8} ${ix + is - 2} ${iy + is}`);
        body.setAttribute("fill", "none"); body.setAttribute("stroke", colors.stroke); body.setAttribute("stroke-width", "1.5");

        group.appendChild(rect); group.appendChild(head); group.appendChild(body);
        return group;
    },

    // Service task — rounded rect + gear icon in top-left corner
    serviceTask(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x); rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width); rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 10);
        engine.applyNodeStyle(rect, node);

        const colors = engine.getNodeColors(node.type);
        const gx = node.x + 8 + 7, gy = node.y + 6 + 7, gr = 4.5, tr = 7;
        const teeth = 8;

        let d = "";
        for (let i = 0; i < teeth; i++) {
            const a0 = (i / teeth) * Math.PI * 2 - Math.PI / teeth / 2;
            const a1 = a0 + Math.PI / teeth / 2;
            const a2 = a1 + Math.PI / teeth / 2;
            if (i === 0) d += `M ${gx + Math.cos(a0) * gr} ${gy + Math.sin(a0) * gr} `;
            d += `L ${gx + Math.cos(a1) * tr} ${gy + Math.sin(a1) * tr} `;
            d += `L ${gx + Math.cos(a2) * gr} ${gy + Math.sin(a2) * gr} `;
        }
        d += "Z";

        const gear = document.createElementNS(NS, "path");
        gear.setAttribute("d", d);
        gear.setAttribute("fill", "none"); gear.setAttribute("stroke", colors.stroke); gear.setAttribute("stroke-width", "1.5");
        gear.setAttribute("stroke-linejoin", "round");

        const hub = document.createElementNS(NS, "circle");
        hub.setAttribute("cx", gx); hub.setAttribute("cy", gy); hub.setAttribute("r", "2.5");
        hub.setAttribute("fill", "none"); hub.setAttribute("stroke", colors.stroke); hub.setAttribute("stroke-width", "1.5");

        group.appendChild(rect); group.appendChild(gear); group.appendChild(hub);
        return group;
    },

    // Send task — rounded rect + filled envelope (message sender)
    sendTask(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x); rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width); rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 10);
        engine.applyNodeStyle(rect, node);

        const colors = engine.getNodeColors(node.type);
        const ix = node.x + 7, iy = node.y + 7, ew = 14, eh = 10;

        const env = document.createElementNS(NS, "rect");
        env.setAttribute("x", ix); env.setAttribute("y", iy);
        env.setAttribute("width", ew); env.setAttribute("height", eh);
        env.setAttribute("fill", colors.stroke); env.setAttribute("stroke", colors.stroke); env.setAttribute("stroke-width", "1");

        const flap = document.createElementNS(NS, "polyline");
        flap.setAttribute("points", `${ix},${iy} ${ix + ew / 2},${iy + eh * 0.6} ${ix + ew},${iy}`);
        flap.setAttribute("fill", "none"); flap.setAttribute("stroke", colors.fill); flap.setAttribute("stroke-width", "1.5");

        group.appendChild(rect); group.appendChild(env); group.appendChild(flap);
        return group;
    },

    // Receive task — rounded rect + outline envelope (message receiver)
    receiveTask(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x); rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width); rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 10);
        engine.applyNodeStyle(rect, node);

        const colors = engine.getNodeColors(node.type);
        const ix = node.x + 7, iy = node.y + 7, ew = 14, eh = 10;

        const env = document.createElementNS(NS, "rect");
        env.setAttribute("x", ix); env.setAttribute("y", iy);
        env.setAttribute("width", ew); env.setAttribute("height", eh);
        env.setAttribute("fill", "none"); env.setAttribute("stroke", colors.stroke); env.setAttribute("stroke-width", "1.5");

        const flap = document.createElementNS(NS, "polyline");
        flap.setAttribute("points", `${ix},${iy} ${ix + ew / 2},${iy + eh * 0.6} ${ix + ew},${iy}`);
        flap.setAttribute("fill", "none"); flap.setAttribute("stroke", colors.stroke); flap.setAttribute("stroke-width", "1.5");

        group.appendChild(rect); group.appendChild(env); group.appendChild(flap);
        return group;
    },

    // Script task — rounded rect + scroll/script icon
    scriptTask(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x); rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width); rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 10);
        engine.applyNodeStyle(rect, node);

        const colors = engine.getNodeColors(node.type);
        const ix = node.x + 8, iy = node.y + 6, sw = 12, sh = 16;

        const scroll = document.createElementNS(NS, "path");
        scroll.setAttribute("d", `M ${ix + 3} ${iy} Q ${ix} ${iy} ${ix} ${iy + 3} L ${ix} ${iy + sh - 3} Q ${ix} ${iy + sh} ${ix + 3} ${iy + sh} L ${ix + sw} ${iy + sh} Q ${ix + sw + 3} ${iy + sh} ${ix + sw + 3} ${iy + sh - 3} Q ${ix + sw + 3} ${iy + sh - 6} ${ix + sw} ${iy + sh - 6} L ${ix + sw} ${iy + 3} Q ${ix + sw} ${iy} ${ix + sw - 3} ${iy} Z`);
        scroll.setAttribute("fill", "none"); scroll.setAttribute("stroke", colors.stroke); scroll.setAttribute("stroke-width", "1.5");

        [iy + 6, iy + 9, iy + 12].forEach(lineY => {
            const l = document.createElementNS(NS, "line");
            l.setAttribute("x1", ix + 3); l.setAttribute("y1", lineY);
            l.setAttribute("x2", ix + sw - 3); l.setAttribute("y2", lineY);
            l.setAttribute("stroke", colors.stroke); l.setAttribute("stroke-width", "1");
            group.appendChild(l);
        });

        group.appendChild(rect); group.appendChild(scroll);
        return group;
    },

    // Call activity — rounded rect with thick border (reusable process call)
    callActivity(node, engine) {
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x); rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width); rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 10);
        engine.applyNodeStyle(rect, node);
        rect.setAttribute("stroke-width", node.id === engine.state.selectedNodeId ? "4" : "3");
        return rect;
    },

    // Manual task — rounded rect + hand icon in top-left corner
    manualTask(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rect  = _el(group, "rect", { x: node.x, y: node.y, width: node.width, height: node.height, rx: 10 });
        engine.applyNodeStyle(rect, node);

        const c = engine.getNodeColors(node.type).stroke;
        const x = node.x + 8, y = node.y + 7;
        _el(group, "path", {
            d: `M ${x} ${y + 6} L ${x} ${y + 12} Q ${x} ${y + 14} ${x + 2} ${y + 14} L ${x + 11} ${y + 14} ` +
               `M ${x + 4} ${y + 8.5} L ${x + 13} ${y + 8.5} M ${x + 4} ${y + 11} L ${x + 12} ${y + 11} ` +
               `M ${x} ${y + 6} L ${x + 3} ${y + 6} L ${x + 5} ${y + 2} L ${x + 12} ${y + 2} M ${x + 4} ${y + 6} L ${x + 14} ${y + 6}`,
            fill: "none", stroke: c, "stroke-width": 1.2, "stroke-linecap": "round", "stroke-linejoin": "round"
        });
        return group;
    },

    // Business rule task — rounded rect + table icon in top-left corner
    businessRuleTask(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rect  = _el(group, "rect", { x: node.x, y: node.y, width: node.width, height: node.height, rx: 10 });
        engine.applyNodeStyle(rect, node);

        const c = engine.getNodeColors(node.type).stroke;
        const x = node.x + 8, y = node.y + 7, w = 16, h = 12;
        _el(group, "rect", { x, y, width: w, height: h, fill: "#ffffff", stroke: c, "stroke-width": 1.2 });
        _el(group, "rect", { x, y, width: w, height: 3.5, fill: c, stroke: c, "stroke-width": 1.2 });
        _el(group, "line", { x1: x, y1: y + 7.8, x2: x + w, y2: y + 7.8, stroke: c, "stroke-width": 1 });
        _el(group, "line", { x1: x + 5, y1: y + 3.5, x2: x + 5, y2: y + h, stroke: c, "stroke-width": 1 });
        return group;
    },

    // Collapsed sub-process — rounded rect with + marker at bottom
    subProcess(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x); rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width); rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 10);
        engine.applyNodeStyle(rect, node);

        const colors = engine.getNodeColors(node.type);
        const mx = node.x + node.width  / 2;
        const my = node.y + node.height - 14;
        const ms = 8;

        const box = document.createElementNS(NS, "rect");
        box.setAttribute("x", mx - ms / 2); box.setAttribute("y", my - ms / 2);
        box.setAttribute("width", ms); box.setAttribute("height", ms);
        box.setAttribute("rx", "2");
        box.setAttribute("fill", colors.fill); box.setAttribute("stroke", colors.stroke); box.setAttribute("stroke-width", "1.5");

        const h = document.createElementNS(NS, "line");
        h.setAttribute("x1", mx - ms / 2 + 2); h.setAttribute("y1", my);
        h.setAttribute("x2", mx + ms / 2 - 2); h.setAttribute("y2", my);
        h.setAttribute("stroke", colors.stroke); h.setAttribute("stroke-width", "1.5");

        const v = document.createElementNS(NS, "line");
        v.setAttribute("x1", mx); v.setAttribute("y1", my - ms / 2 + 2);
        v.setAttribute("x2", mx); v.setAttribute("y2", my + ms / 2 - 2);
        v.setAttribute("stroke", colors.stroke); v.setAttribute("stroke-width", "1.5");

        group.appendChild(rect); group.appendChild(box); group.appendChild(h); group.appendChild(v);
        return group;
    },

    // ── Gateways ─────────────────────────────────────────────

    gateway(node, engine) {
        const polygon = document.createElementNS(NS, "polygon");
        const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
        polygon.setAttribute("points", `${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}`);
        engine.applyNodeStyle(polygon, node);
        return polygon;
    },

    // Exclusive gateway (XOR) — diamond with X
    exclusiveGateway(node, engine) {
        const group  = document.createElementNS(NS, "g");
        const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
        const polygon = document.createElementNS(NS, "polygon");
        polygon.setAttribute("points", `${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}`);
        engine.applyNodeStyle(polygon, node);

        const colors = engine.getNodeColors(node.type);
        const s = Math.min(node.width, node.height) * 0.2;
        [[cx - s, cy - s, cx + s, cy + s], [cx + s, cy - s, cx - s, cy + s]].forEach(([x1, y1, x2, y2]) => {
            const l = document.createElementNS(NS, "line");
            l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
            l.setAttribute("stroke", colors.stroke); l.setAttribute("stroke-width", "2.5"); l.setAttribute("stroke-linecap", "round");
            group.appendChild(l);
        });
        group.insertBefore(polygon, group.firstChild);
        return group;
    },

    // Parallel gateway (AND) — diamond with +
    parallelGateway(node, engine) {
        const group  = document.createElementNS(NS, "g");
        const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
        const polygon = document.createElementNS(NS, "polygon");
        polygon.setAttribute("points", `${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}`);
        engine.applyNodeStyle(polygon, node);

        const colors = engine.getNodeColors(node.type);
        const s = Math.min(node.width, node.height) * 0.2;
        [[cx - s, cy, cx + s, cy], [cx, cy - s, cx, cy + s]].forEach(([x1, y1, x2, y2]) => {
            const l = document.createElementNS(NS, "line");
            l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
            l.setAttribute("stroke", colors.stroke); l.setAttribute("stroke-width", "2.5"); l.setAttribute("stroke-linecap", "round");
            group.appendChild(l);
        });
        group.insertBefore(polygon, group.firstChild);
        return group;
    },

    // Inclusive gateway (OR) — diamond with circle
    inclusiveGateway(node, engine) {
        const group  = document.createElementNS(NS, "g");
        const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
        const polygon = document.createElementNS(NS, "polygon");
        polygon.setAttribute("points", `${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}`);
        engine.applyNodeStyle(polygon, node);

        const colors = engine.getNodeColors(node.type);
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", cx); circle.setAttribute("cy", cy);
        circle.setAttribute("r", Math.min(node.width, node.height) * 0.18);
        circle.setAttribute("fill", "none"); circle.setAttribute("stroke", colors.stroke); circle.setAttribute("stroke-width", "2.5");

        group.appendChild(polygon); group.appendChild(circle);
        return group;
    },

    // ── Artifacts ────────────────────────────────────────────

    // Data object — document-style shape with folded corner
    dataObject(node, engine) {
        const fold = 14;
        const x = node.x, y = node.y, w = node.width, h = node.height;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", `M ${x} ${y} L ${x + w - fold} ${y} L ${x + w} ${y + fold} L ${x + w} ${y + h} L ${x} ${y + h} Z`);
        engine.applyNodeStyle(path, node);

        const colors = engine.getNodeColors(node.type);
        const corner = document.createElementNS(NS, "path");
        corner.setAttribute("d", `M ${x + w - fold} ${y} L ${x + w - fold} ${y + fold} L ${x + w} ${y + fold}`);
        corner.setAttribute("fill", "none"); corner.setAttribute("stroke", colors.stroke); corner.setAttribute("stroke-width", "1.5");

        const group = document.createElementNS(NS, "g");
        group.appendChild(path); group.appendChild(corner);
        return group;
    },

    // Data store — database cylinder
    dataStore(node, engine) {
        const group = document.createElementNS(NS, "g");
        const rx = node.width / 2, ry = 8;
        const cx = node.x + node.width / 2;

        const body = document.createElementNS(NS, "rect");
        body.setAttribute("x", node.x); body.setAttribute("y", node.y + ry);
        body.setAttribute("width", node.width); body.setAttribute("height", node.height - ry * 2);
        engine.applyNodeStyle(body, node);

        const top = document.createElementNS(NS, "ellipse");
        top.setAttribute("cx", cx); top.setAttribute("cy", node.y + ry);
        top.setAttribute("rx", rx); top.setAttribute("ry", ry);
        engine.applyNodeStyle(top, node);

        const colors = engine.getNodeColors(node.type);
        const bottom = document.createElementNS(NS, "ellipse");
        bottom.setAttribute("cx", cx); bottom.setAttribute("cy", node.y + node.height - ry);
        bottom.setAttribute("rx", rx); bottom.setAttribute("ry", ry);
        bottom.setAttribute("fill", "none"); bottom.setAttribute("stroke", colors.stroke); bottom.setAttribute("stroke-width", "1.5");

        // extra stripe to suggest stacking
        const stripe = document.createElementNS(NS, "ellipse");
        stripe.setAttribute("cx", cx); stripe.setAttribute("cy", node.y + ry * 3);
        stripe.setAttribute("rx", rx); stripe.setAttribute("ry", ry);
        stripe.setAttribute("fill", "none"); stripe.setAttribute("stroke", colors.stroke); stripe.setAttribute("stroke-width", "1");

        group.appendChild(body); group.appendChild(top); group.appendChild(bottom); group.appendChild(stripe);
        return group;
    },

    // Text annotation — open bracket shape
    annotation(node, engine) {
        const group = document.createElementNS(NS, "g");
        const colors = engine.getNodeColors(node.type);
        const bw = 12;

        const bg = document.createElementNS(NS, "rect");
        bg.setAttribute("x", node.x); bg.setAttribute("y", node.y);
        bg.setAttribute("width", node.width); bg.setAttribute("height", node.height);
        bg.setAttribute("fill", colors.fill); bg.setAttribute("stroke", "none");

        const bracket = document.createElementNS(NS, "path");
        bracket.setAttribute("d", `M ${node.x + bw} ${node.y} L ${node.x} ${node.y} L ${node.x} ${node.y + node.height} L ${node.x + bw} ${node.y + node.height}`);
        bracket.setAttribute("fill", "none"); bracket.setAttribute("stroke", colors.stroke); bracket.setAttribute("stroke-width", "2"); bracket.setAttribute("stroke-linecap", "round");

        group.appendChild(bg); group.appendChild(bracket);
        return group;
    },

    // ── Swimlane ─────────────────────────────────────────────
    //
    // A swimlane is a large container rendered BELOW regular nodes.
    // It has a header strip (left side for horizontal, top for vertical) and
    // a body area. Nodes "live" inside it visually but are not DOM children —
    // lane membership is tracked via node.laneId in the model.
    //
    // Orientation is controlled by node.data.orientation ("horizontal" | "vertical").
    // Default is "horizontal" (header on the left, content flows right).

    swimlane(node, engine) {
        const group = document.createElementNS(NS, "g");
        const colors = engine.getNodeColors(node.type);
        const orientation = (node.data && node.data.orientation) || "horizontal";
        const headerSize = POOL_HEADER;

        // Body background
        const body = document.createElementNS(NS, "rect");
        body.setAttribute("x", node.x); body.setAttribute("y", node.y);
        body.setAttribute("width", node.width); body.setAttribute("height", node.height);
        body.setAttribute("rx", "6");
        body.setAttribute("fill", colors.fill);
        body.setAttribute("stroke", colors.stroke);
        body.setAttribute("stroke-width", node.id === engine.state.selectedNodeId ? "2" : "1.5");

        group.appendChild(body);

        if (orientation === "horizontal") {
            // Header strip on the left
            const header = document.createElementNS(NS, "rect");
            header.setAttribute("x", node.x); header.setAttribute("y", node.y);
            header.setAttribute("width", headerSize); header.setAttribute("height", node.height);
            header.setAttribute("rx", "6");
            header.setAttribute("fill", colors.stroke);
            group.appendChild(header);

            // Cover right corners of header to make left side fully rounded, right side flat
            const headerCover = document.createElementNS(NS, "rect");
            headerCover.setAttribute("x", node.x + headerSize - 6); headerCover.setAttribute("y", node.y);
            headerCover.setAttribute("width", "6"); headerCover.setAttribute("height", node.height);
            headerCover.setAttribute("fill", colors.stroke);
            group.appendChild(headerCover);

            // Divider line between header and body
            const divider = document.createElementNS(NS, "line");
            divider.setAttribute("x1", node.x + headerSize); divider.setAttribute("y1", node.y);
            divider.setAttribute("x2", node.x + headerSize); divider.setAttribute("y2", node.y + node.height);
            divider.setAttribute("stroke", colors.stroke); divider.setAttribute("stroke-width", "1.5");
            group.appendChild(divider);

        } else {
            // Header strip on top
            const header = document.createElementNS(NS, "rect");
            header.setAttribute("x", node.x); header.setAttribute("y", node.y);
            header.setAttribute("width", node.width); header.setAttribute("height", headerSize);
            header.setAttribute("rx", "6");
            header.setAttribute("fill", colors.stroke);
            group.appendChild(header);

            const headerCover = document.createElementNS(NS, "rect");
            headerCover.setAttribute("x", node.x); headerCover.setAttribute("y", node.y + headerSize - 6);
            headerCover.setAttribute("width", node.width); headerCover.setAttribute("height", "6");
            headerCover.setAttribute("fill", colors.stroke);
            group.appendChild(headerCover);

            const divider = document.createElementNS(NS, "line");
            divider.setAttribute("x1", node.x); divider.setAttribute("y1", node.y + headerSize);
            divider.setAttribute("x2", node.x + node.width); divider.setAttribute("y2", node.y + headerSize);
            divider.setAttribute("stroke", colors.stroke); divider.setAttribute("stroke-width", "1.5");
            group.appendChild(divider);
        }

        return group;
    },

    // Pool — outer container that holds multiple swimlanes
    pool(node, engine) {
        const group = document.createElementNS(NS, "g");
        const colors = engine.getNodeColors(node.type);
        const headerSize = POOL_HEADER;

        const body = document.createElementNS(NS, "rect");
        body.setAttribute("x", node.x); body.setAttribute("y", node.y);
        body.setAttribute("width", node.width); body.setAttribute("height", node.height);
        body.setAttribute("rx", "8");
        body.setAttribute("fill", "none");
        body.setAttribute("stroke", colors.stroke);
        body.setAttribute("stroke-width", node.id === engine.state.selectedNodeId ? "2.5" : "2");
        group.appendChild(body);

        // Pool header on the left
        const header = document.createElementNS(NS, "rect");
        header.setAttribute("x", node.x); header.setAttribute("y", node.y);
        header.setAttribute("width", headerSize); header.setAttribute("height", node.height);
        header.setAttribute("rx", "8");
        header.setAttribute("fill", colors.stroke);
        group.appendChild(header);

        const headerCover = document.createElementNS(NS, "rect");
        headerCover.setAttribute("x", node.x + headerSize - 8); headerCover.setAttribute("y", node.y);
        headerCover.setAttribute("width", "8"); headerCover.setAttribute("height", node.height);
        headerCover.setAttribute("fill", colors.stroke);
        group.appendChild(headerCover);

        const divider = document.createElementNS(NS, "line");
        divider.setAttribute("x1", node.x + headerSize); divider.setAttribute("y1", node.y);
        divider.setAttribute("x2", node.x + headerSize); divider.setAttribute("y2", node.y + node.height);
        divider.setAttribute("stroke", colors.stroke); divider.setAttribute("stroke-width", "2");
        group.appendChild(divider);

        return group;
    }
};


// ============================================================
// EXPORTED DEFINITION
// ============================================================

export function createBpmnDefinition() {
    return {
        id: "bpmn",

        shapes: bpmnShapes,

        // ── Node type catalogue ──────────────────────────────
        nodeTypes: {

            // Events — generated from EVENT_TYPES, all drawn by the generic "event" shape
            ...Object.fromEntries(Object.entries(EVENT_TYPES).map(([type, def]) => [
                type, { defaultLabel: def.label, colors: EVENT_COLORS[def.kind], shape: "event" }
            ])),

            // Tasks
            task:              { defaultLabel: "Task",                colors: { fill: "#FDF7E7", stroke: "#0d2d44" }, shape: "task"               },
            userTask:          { defaultLabel: "User task",           colors: { fill: "#EDF7FD", stroke: "#1B5278" }, shape: "userTask"           },
            serviceTask:       { defaultLabel: "Service task",        colors: { fill: "#F3EDF7", stroke: "#6C3483" }, shape: "serviceTask"        },
            sendTask:          { defaultLabel: "Send task",           colors: { fill: "#EBF5EC", stroke: "#1E8449" }, shape: "sendTask"           },
            receiveTask:       { defaultLabel: "Receive task",        colors: { fill: "#EBF5EC", stroke: "#1E8449" }, shape: "receiveTask"        },
            scriptTask:        { defaultLabel: "Script task",         colors: { fill: "#FDF7E7", stroke: "#7D6608" }, shape: "scriptTask"         },
            manualTask:        { defaultLabel: "Manual task",         colors: { fill: "#FDF7E7", stroke: "#0d2d44" }, shape: "manualTask"         },
            businessRuleTask:  { defaultLabel: "Business rule task",  colors: { fill: "#FDF7E7", stroke: "#7D6608" }, shape: "businessRuleTask"   },
            callActivity:      { defaultLabel: "Call activity",       colors: { fill: "#FDF7E7", stroke: "#0d2d44" }, shape: "callActivity"       },
            subProcess:        { defaultLabel: "Sub-process",         colors: { fill: "#F8F9FA", stroke: "#566573" }, shape: "subProcess"         },

            // Gateways
            gateway:           { defaultLabel: "Gateway",             colors: { fill: "#FFF4E8", stroke: "#F57100" }, shape: "gateway"            },
            exclusiveGateway:  { defaultLabel: "Exclusive (XOR)",     colors: { fill: "#FFF4E8", stroke: "#F57100" }, shape: "exclusiveGateway"   },
            parallelGateway:   { defaultLabel: "Parallel (AND)",      colors: { fill: "#EBF5EC", stroke: "#1E8449" }, shape: "parallelGateway"    },
            inclusiveGateway:  { defaultLabel: "Inclusive (OR)",      colors: { fill: "#EAF4FB", stroke: "#1B5278" }, shape: "inclusiveGateway"   },

            // Artifacts & data
            dataObject:        { defaultLabel: "Data object",         colors: { fill: "#FDFEFE", stroke: "#717D7E" }, shape: "dataObject"         },
            dataStore:         { defaultLabel: "Data store",          colors: { fill: "#EAF4FB", stroke: "#1B5278" }, shape: "dataStore"          },
            annotation:        { defaultLabel: "Annotation",          colors: { fill: "#FFFDE7", stroke: "#999999" }, shape: "annotation"         },

            // Containers — rendered behind regular nodes
            swimlane:          { defaultLabel: "Lane",                colors: { fill: "#F4F6F7", stroke: "#85929E" }, shape: "swimlane", isContainer: true },
            pool:              { defaultLabel: "Pool",                colors: { fill: "#FDFEFE", stroke: "#2C3E50" }, shape: "pool",      isContainer: true },
        },

        // Palette shown in the side panel (curated subset)
        palette: [
            { group: "Start events", types: ["startEvent", "messageStartEvent", "timerStartEvent", "conditionalStartEvent", "signalStartEvent"] },
            { group: "Intermediate events", types: [
                "intermediateEvent", "messageCatchEvent", "messageThrowEvent", "timerCatchEvent", "conditionalCatchEvent",
                "signalCatchEvent", "signalThrowEvent", "escalationThrowEvent", "compensationThrowEvent", "linkCatchEvent", "linkThrowEvent"
            ] },
            { group: "End events", types: [
                "endEvent", "messageEndEvent", "errorEndEvent", "escalationEndEvent", "signalEndEvent", "compensationEndEvent", "terminateEndEvent"
            ] },
            { group: "Activities", types: ACTIVITY_TYPES },
            { group: "Gateways", types: GATEWAY_TYPES },
            { group: "Data & artifacts", types: ["dataObject", "dataStore", "annotation"] },
            { group: "Containers", types: ["pool", "swimlane"] }
        ],

        // Default sizes per node type
        getDefaultSize(nodeType) {
            if (EVENT_TYPES[nodeType]) return { width: 40, height: 40 };

            const sizes = {
                startEvent:        { width: 40,  height: 40  },
                messageStartEvent: { width: 40,  height: 40  },
                timerStartEvent:   { width: 40,  height: 40  },
                intermediateEvent: { width: 40,  height: 40  },
                endEvent:          { width: 40,  height: 40  },
                errorEndEvent:     { width: 40,  height: 40  },
                gateway:           { width: 60,  height: 60  },
                exclusiveGateway:  { width: 60,  height: 60  },
                parallelGateway:   { width: 60,  height: 60  },
                inclusiveGateway:  { width: 60,  height: 60  },
                dataObject:        { width: 40,  height: 60  },
                dataStore:         { width: 60,  height: 50  },
                annotation:        { width: 120, height: 60  },
                swimlane:          { width: 970, height: 250 },
                pool:              { width: 1000, height: 500 },   // gets two lanes on creation
            };
            return sizes[nodeType] || { width: 120, height: 60 };
        },

        // ── Port layout ──────────────────────────────────────
        // Containers (swimlane / pool) expose no ports — you connect to nodes inside them.
        getPorts(node) {
            const def = this.nodeTypes[node.type];
            if (def && def.isContainer) return {};

            // Events are drawn as a circle inside their box: put the ports on the circle itself,
            // so they stay right even if the box isn't square (e.g. older saved diagrams).
            if (EVENT_TYPES[node.type]) {
                const r  = Math.min(node.width, node.height) / 2;
                const cx = node.x + node.width  / 2;
                const cy = node.y + node.height / 2;

                return {
                    top:    { x: cx,     y: cy - r },
                    right:  { x: cx + r, y: cy     },
                    bottom: { x: cx,     y: cy + r },
                    left:   { x: cx - r, y: cy     }
                };
            }

            return {
                top:    { x: node.x + node.width  / 2, y: node.y                  },
                right:  { x: node.x + node.width,       y: node.y + node.height / 2 },
                bottom: { x: node.x + node.width  / 2, y: node.y + node.height    },
                left:   { x: node.x,                    y: node.y + node.height / 2 },
            };
        },

        // ── Edge types ───────────────────────────────────────
        //   sequenceFlow     solid, orthogonal, filled arrow — the flow between flow elements
        //   association      dotted, straight, no arrow      — annotation ↔ element
        //   dataAssociation  dotted, straight, open arrow    — data object / store ↔ activity
        defaultEdgeType: "sequenceFlow",

        //   messageFlow      dashed, orthogonal, open circle → open arrow — between two pools
        edgeTypes: {
            sequenceFlow:    { router: "orthogonal", marker: "arrow" },
            messageFlow:     { router: "orthogonal", marker: "openArrow", markerStart: "circle", dash: "6,4" },
            association:     { router: "straight",   marker: "none",      dash: "2,4" },
            dataAssociation: { router: "straight",   marker: "openArrow", dash: "2,4" }
        },

        getEdgeTypeForConnection({ source, target }, engine) {
            const isType = (node, ...types) => node && types.includes(node.type);

            if (isType(source, "annotation") || isType(target, "annotation")) return "association";
            if (isType(source, "dataObject", "dataStore") || isType(target, "dataObject", "dataStore")) return "dataAssociation";

            // Communication between participants: both ends in a pool, but not in the same one.
            const poolOf = node => {
                let current = node;
                while (current && current.type !== "pool") current = engine.getNode(current.parentId);
                return current || null;
            };

            const sourcePool = poolOf(source);
            const targetPool = poolOf(target);

            if (sourcePool && targetPool && sourcePool !== targetPool) return "messageFlow";

            return "sequenceFlow";
        },

        // ── Edge routing ─────────────────────────────────────
        routeEdge({ sourcePoint, targetPoint, sourceHandle, targetHandle, edge, engine }) {
            return engine.buildRoutedEdgePoints(sourcePoint, targetPoint, sourceHandle, targetHandle, edge);
        },

        // ── Context actions (floating rail) ──────────────────
        getContextActions(node, engine) {
            const def = this.nodeTypes[node.type];

            // Take the node out of its flow (A → node → B becomes A → B), to move it elsewhere.
            const detach = engine?.hasEdges(node) ? [{ type: "detachNode", label: "Losmaken" }] : [];

            // Pools can get lanes; lanes and pools can be deleted (with their contents)
            if (node.type === "pool") {
                return [
                    { type: "addLane",    nodeType: "swimlane", label: "Lane toevoegen" },
                    { type: "deleteNode", label: "Verwijderen" }
                ];
            }

            if (def && def.isContainer) {
                return [{ type: "deleteNode", label: "Verwijderen" }];
            }

            // Data objects, stores and annotations: nothing to add from there.
            if (["dataObject", "dataStore", "annotation"].includes(node.type)) {
                return [...detach, { type: "deleteNode", label: "Verwijderen" }];
            }

            const label  = type => this.nodeTypes[type].defaultLabel;
            const add    = type => ({ type: "addConnectedNode", nodeType: type, label: label(type) });
            const family = this.getTypeFamily(node.type);
            const actions = [];

            if (family) {
                actions.push({
                    type: "group", label: "Type wijzigen", icon: "wrench",
                    children: family.map(t => ({ type: "changeType", nodeType: t, label: label(t), active: t === node.type }))
                });
            }

            const event = EVENT_TYPES[node.type];

            // Boundary event: interrupting or not (error / compensation always interrupt).
            if (event?.kind === "boundary" && !event.alwaysInterrupting) {
                const interrupting = node.interrupting !== false;
                actions.push({
                    type: "group", label: "Gedrag", nodeType: node.type,
                    children: [
                        { type: "setInterrupting", value: true,  label: "Onderbrekend",      nodeType: node.type, active: interrupting },
                        { type: "setInterrupting", value: false, label: "Niet-onderbrekend", nodeType: node.type, active: !interrupting }
                    ]
                });
            }

            // Activities can get boundary events on their border.
            if (ACTIVITY_TYPES.includes(node.type)) {
                actions.push({
                    type: "group", label: "Boundary event", nodeType: "timerBoundaryEvent",
                    children: Object.keys(EVENT_TYPES)
                        .filter(t => EVENT_TYPES[t].kind === "boundary")
                        .map(t => ({ type: "addBoundaryEvent", nodeType: t, label: label(t) }))
                });
            }

            // Nothing follows an end event.
            if (event?.kind !== "end") {
                actions.push(
                    { type: "group", label: "Activiteit toevoegen", nodeType: "task",              children: ACTIVITY_TYPES.map(add) },
                    { type: "group", label: "Gateway toevoegen",    nodeType: "exclusiveGateway",  children: GATEWAY_TYPES.map(add) },
                    { type: "group", label: "Event toevoegen",      nodeType: "intermediateEvent",
                      children: Object.keys(EVENT_TYPES).filter(t => ["intermediate", "end"].includes(EVENT_TYPES[t].kind)).map(add) },
                    { type: "group", label: "Data & annotatie",     nodeType: "dataObject",
                      children: ["dataObject", "dataStore", "annotation"].map(add) }
                );
            }

            actions.push(...detach, { type: "deleteNode", label: "Verwijderen" });
            return actions;
        },

        // Node tools float next to the selected node (like the bpmn.io context pad).
        // BPMN processes read left to right; only sequence flows shape the layout
        // (message flows, associations and data associations just follow).
        getLayoutConfig() {
            return {
                direction: "LR",
                isFlowEdge: edge => (edge.type || "sequenceFlow") === "sequenceFlow",
                // Annotations above the flow, data objects and stores below it.
                getSatelliteSide: node => node.type === "annotation" ? "before" : "after"
            };
        },

        getNodeInteractionMode(node) {
            return "action-surface";
        },

        // ── Containers: pools and lanes ──────────────────────
        // A pool holds lanes and flow elements; a lane holds flow elements. No nested pools / lanes.
        canContain(container, child) {
            const childIsContainer = !!this.nodeTypes[child.type]?.isContainer;

            if (container.type === "pool")     return child.type === "swimlane" || !childIsContainer;
            if (container.type === "swimlane") return !childIsContainer;

            return false;
        },

        // Lanes always span the pool's width (right of its header) and tile it top to bottom.
        //  - Lane edge resized: an inner edge moves the boundary with the neighbouring lane (the pool
        //    keeps its size); the top edge of the first / bottom edge of the last lane moves the pool.
        //  - Pool edge resized: the first / last lane grows or shrinks (down to LANE_MIN_HEIGHT).
        //  - Anything else (lane added, removed or moved, node dropped): lanes are stacked in their
        //    vertical order from the pool top, taking their contents along; the pool fits the lanes.
        // In the two resize cases the contents stay where they are.
        layoutContainer(container, engine, { changedNode, previousRect, reason } = {}) {
            if (container.type !== "pool") return;

            // Lanes in vertical order of their centres. A lane that was just dragged onto the same
            // height as another one passes it in the direction it was dragged (reordering).
            const center    = lane => lane.y + lane.height / 2;
            const movedDown = reason === "move" && previousRect && changedNode && changedNode.y > previousRect.y;

            const lanes = engine.getChildren(container)
                .filter(n => n.type === "swimlane")
                .sort((a, b) => {
                    const diff = center(a) - center(b);
                    if (diff !== 0 || reason !== "move") return diff;
                    if (a === changedNode) return movedDown ? 1 : -1;
                    if (b === changedNode) return movedDown ? -1 : 1;
                    return 0;
                });

            const min      = LANE_MIN_HEIGHT;
            const pad      = CONTENT_PADDING;
            const first    = lanes[0];
            const last     = lanes[lanes.length - 1];
            const laneEdit = reason === "resize" && previousRect && lanes.includes(changedNode);
            const poolEdit = reason === "resize" && previousRect && changedNode === container;

            // Bounding box of nodes (null if none); used so edges never cut through the contents.
            const bounds = nodes => nodes.length === 0 ? null : {
                top:    Math.min(...nodes.map(n => n.y)),
                bottom: Math.max(...nodes.map(n => n.y + n.height)),
                left:   Math.min(...nodes.map(n => n.x)),
                right:  Math.max(...nodes.map(n => n.x + n.width))
            };
            const contentTop    = lane => bounds(engine.getDescendants(lane))?.top    ?? Infinity;
            const contentBottom = lane => bounds(engine.getDescendants(lane))?.bottom ?? -Infinity;

            if (poolEdit) {
                // Left / right edges stop before the contents (and the lane header).
                const content = bounds(engine.getDescendants(container).filter(n => n.type !== "swimlane"));

                if (content) {
                    const right = Math.max(container.x + container.width, content.right + pad);
                    const left  = Math.min(container.x, content.left - pad - POOL_HEADER - (lanes.length ? POOL_HEADER : 0));
                    container.x     = left;
                    container.width = right - left;
                }
            }

            if (lanes.length === 0) {
                // Pool without lanes: top / bottom edges stop before the contents.
                const content = poolEdit && bounds(engine.getDescendants(container));

                if (content) {
                    const top    = Math.min(container.y, content.top - pad);
                    const bottom = Math.max(container.y + container.height, content.bottom + pad);
                    container.y      = top;
                    container.height = bottom - top;
                }
                return;
            }

            if (laneEdit) {
                const lane = changedNode;
                const i    = lanes.indexOf(lane);

                if (lane.y !== previousRect.y) {
                    // Top edge dragged; the bottom edge stays.
                    const bottom = lane.y + lane.height;
                    const above  = lanes[i - 1];
                    let top      = Math.min(lane.y, bottom - min, contentTop(lane) - pad);

                    if (above) {
                        // Boundary with the lane above: both keep their minimum height and contents.
                        top = Math.max(top, above.y + min, contentBottom(above) + pad);
                        above.height = top - above.y;
                    } else {
                        container.height += container.y - top;
                        container.y       = top;
                    }

                    lane.y      = top;
                    lane.height = bottom - top;
                }

                if (lane.y + lane.height !== previousRect.y + previousRect.height) {
                    // Bottom edge dragged; the top edge stays.
                    const below  = lanes[i + 1];
                    let boundary = Math.max(lane.y + lane.height, lane.y + min, contentBottom(lane) + pad);

                    if (below) {
                        const belowBottom = below.y + below.height;
                        boundary     = Math.min(boundary, belowBottom - min, contentTop(below) - pad);
                        below.y      = boundary;
                        below.height = belowBottom - boundary;
                    } else {
                        container.height = boundary - container.y;
                    }

                    lane.height = boundary - lane.y;
                }
            } else if (poolEdit) {
                // The pool's height change is spread over all lanes in proportion to their height.
                // Boundaries then respect each lane's minimum height and contents (which stay put).
                const n           = lanes.length;
                const topMoved    = container.y !== previousRect.y;
                const bottomMoved = container.y + container.height !== previousRect.y + previousRect.height;

                // How far the pool can shrink: every lane keeps `min` height and its contents, which
                // don't move. Walk the lanes from the fixed edge towards the dragged one.
                let top    = container.y;
                let bottom = container.y + container.height;

                if (topMoved) {
                    let limit = bottomMoved ? Infinity : bottom;   // highest allowed top edge of lane i
                    for (let i = n - 1; i >= 0; i--) {
                        limit = Math.min(limit - min, contentTop(lanes[i]) - pad);
                    }
                    top = Math.min(top, limit);
                }

                if (bottomMoved) {
                    let limit = top;                               // lowest allowed bottom edge of lane i
                    for (let i = 0; i < n; i++) {
                        limit = Math.max(limit + min, contentBottom(lanes[i]) + pad);
                    }
                    bottom = Math.max(bottom, limit);
                }

                const oldTop    = first.y;
                const oldHeight = last.y + last.height - first.y;
                const scale     = (bottom - top) / oldHeight;

                // Growing the pool never shrinks a lane: if contents block a proportional share,
                // the extra space goes to the lanes that can take it.
                const oldHeights = lanes.map(lane => lane.height);
                const minH       = i => scale >= 1 ? Math.max(min, oldHeights[i]) : min;

                const grid = engine.options.snapToGrid ? (engine.options.gridSize || 20) : 1;
                const snap = v => Math.round(v / grid) * grid;

                // boundaries[i] = top edge of lane i; boundaries[n] = pool bottom.
                const boundaries = lanes.map(lane => snap(top + (lane.y - oldTop) * scale));
                boundaries[0] = top;
                boundaries.push(bottom);

                // Allowed range per inner boundary, taking every lane above / below into account:
                //   lo[i]: below the contents of lane i-1, and lane i-1's minimum below lo[i-1]
                //   hi[i]: above the contents of lane i, and lane i's minimum above hi[i+1]
                const lo = [top];
                const hi = [];
                hi[n] = bottom;

                for (let i = 1; i < n; i++) {
                    lo[i] = Math.max(lo[i - 1] + minH(i - 1), contentBottom(lanes[i - 1]) + pad);
                }
                for (let i = n - 1; i >= 1; i--) {
                    hi[i] = Math.min(hi[i + 1] - minH(i), contentTop(lanes[i]) - pad);
                }

                // Clamp the proportional boundaries into their range, keeping each lane's minimum.
                for (let i = 1; i < n; i++) {
                    boundaries[i] = Math.max(lo[i], Math.min(boundaries[i], hi[i]));
                    boundaries[i] = Math.max(boundaries[i], boundaries[i - 1] + minH(i - 1));
                }

                lanes.forEach((lane, i) => {
                    lane.y      = boundaries[i];
                    lane.height = boundaries[i + 1] - boundaries[i];
                });

                container.y      = top;
                container.height = bottom - top;
            } else {
                let y = container.y;

                for (const lane of lanes) {
                    engine.translateNodes(
                        [lane, ...engine.getDescendants(lane)],
                        container.x + POOL_HEADER - lane.x,
                        y - lane.y
                    );
                    y += lane.height;
                }

                container.height = y - container.y;
            }

            // Lanes always span the pool width; contents don't move when the pool is resized sideways.
            for (const lane of lanes) {
                lane.x     = container.x + POOL_HEADER;
                lane.width = container.width - POOL_HEADER;
            }
        },

        // Grabbing a lane by its header strip moves that lane (to reorder it within the pool);
        // grabbing it anywhere else drags the whole pool, as in bpmn.io.
        getDragTarget(node, engine, pos) {
            if (node.type !== "swimlane") return null;

            const parent = engine.getNode(node.parentId);
            if (!parent || parent.type !== "pool") return null;

            const onHeader = pos && pos.x <= node.x + POOL_HEADER;
            return onHeader ? node : parent;
        },

        // A lane being reordered only moves vertically, and its centre stays inside the pool.
        constrainNodePosition(node, { x, y }, engine) {
            if (node.type !== "swimlane") return null;

            const pool = engine.getNode(node.parentId);
            if (!pool || pool.type !== "pool") return null;

            const minY = pool.y - node.height / 2;
            const maxY = pool.y + pool.height - node.height / 2;

            return { x: pool.x + POOL_HEADER, y: Math.min(maxY, Math.max(minY, y)) };
        },

        // A new pool starts with two lanes that split its height.
        onNodeCreated(node, engine) {
            if (node.type !== "pool" || engine.getChildren(node).some(n => n.type === "swimlane")) return;

            const half = Math.round(node.height / 2);

            [0, 1].forEach(i => {
                engine.model.nodes.push({
                    id:       crypto.randomUUID(),
                    type:     "swimlane",
                    x:        node.x + POOL_HEADER,
                    y:        node.y + i * half,
                    width:    node.width - POOL_HEADER,
                    height:   i === 0 ? half : node.height - half,
                    label:    `${this.nodeTypes.swimlane.defaultLabel} ${i + 1}`,
                    parentId: node.id
                });
            });
        },

        // Types a node can be switched to via "Type wijzigen": the same kind of element.
        getTypeFamily(type) {
            const event = EVENT_TYPES[type];
            if (event) {
                return Object.keys(EVENT_TYPES).filter(t => EVENT_TYPES[t].kind === event.kind);
            }
            if (ACTIVITY_TYPES.includes(type)) return ACTIVITY_TYPES;
            if (GATEWAY_TYPES.includes(type))  return GATEWAY_TYPES;
            return null;
        },

        handleAction(action, node, engine) {
            if (action.type === "changeType") {
                if (!action.nodeType || action.nodeType === node.type) return false;

                // Keep a custom label; replace the default label of the old type.
                const oldDefault = this.nodeTypes[node.type]?.defaultLabel;
                node.type = action.nodeType;

                if (!node.label || node.label === oldDefault) {
                    node.label = this.nodeTypes[node.type].defaultLabel;
                }

                // Error / compensation boundary events can only interrupt.
                if (EVENT_TYPES[node.type]?.alwaysInterrupting) delete node.interrupting;
                return true;
            }

            if (action.type === "setInterrupting") {
                if (action.value) delete node.interrupting;
                else node.interrupting = false;
                return true;
            }

            if (action.type === "addBoundaryEvent") {
                return addBoundaryEvent(node, action.nodeType, engine, this);
            }

            if (action.type !== "addLane" || node.type !== "pool") return false;

            const lanes   = engine.getChildren(node).filter(n => n.type === "swimlane");
            const isFirst = lanes.length === 0;

            // The first lane fills the pool and adopts its flow elements; later lanes are added at
            // the bottom and the pool grows.
            const lane = {
                id:       crypto.randomUUID(),
                type:     "swimlane",
                x:        node.x + POOL_HEADER,
                y:        isFirst ? node.y : Math.max(...lanes.map(l => l.y + l.height)),
                width:    node.width - POOL_HEADER,
                height:   isFirst ? node.height : 120,
                label:    this.nodeTypes.swimlane.defaultLabel,
                parentId: node.id
            };

            if (isFirst) {
                engine.getChildren(node).forEach(child => { child.parentId = lane.id; });
            }

            engine.model.nodes.push(lane);
            engine.layoutContainers([node.id], { changedNode: lane, reason: "add" });
            return true;
        },

        // ── Resize rules ─────────────────────────────────────
        // Events and gateways keep their proportions (circle / diamond); containers stay large.
        getResizeRules(node) {
            const type = node.type || "";

            if (type.endsWith("Event"))    return { keepAspectRatio: true, minWidth: 30, minHeight: 30, maxWidth: 120, maxHeight: 120 };
            if (type.endsWith("Gateway") || type === "gateway")
                                           return { keepAspectRatio: true, minWidth: 40, minHeight: 40, maxWidth: 160, maxHeight: 160 };
            if (type === "dataObject")     return { keepAspectRatio: true, minWidth: 30, minHeight: 45 };
            if (type === "dataStore")      return { minWidth: 40, minHeight: 35 };
            if (type === "annotation")     return { minWidth: 60, minHeight: 30 };
            // Lanes follow the pool's width: only their top / bottom edge can be dragged.
            if (type === "swimlane")       return { minWidth: 300, minHeight: LANE_MIN_HEIGHT, handles: ["n", "s"] };
            if (type === "pool")           return { minWidth: 300, minHeight: LANE_MIN_HEIGHT,
                                                    handles: ["nw", "ne", "sw", "se", "n", "s", "e", "w"] };

            return { minWidth: 80, minHeight: 50 };   // tasks, sub-processes, call activities
        },

        // ── Label layout ─────────────────────────────────────
        // Plain events / gateways: label inside when it fits, otherwise below (BPMN convention).
        // Shapes with a marker in the middle (X, +, O, clock, envelope, ...) always label below,
        // so the text never covers the marker; data elements too.
        getLabelLayout(node) {
            const type = node.type || "";

            // Pools / lanes: vertical name in the dark header strip on the left.
            if (type === "pool" || type === "swimlane") {
                return { placement: "header-left", headerSize: POOL_HEADER, fontSize: 13, color: "#ffffff", paddingX: 8 };
            }

            // Boundary events: small label below-right, clear of the exception flow leaving downwards.
            if (EVENT_TYPES[type]?.kind === "boundary") {
                return { placement: "below-right", fontSize: 11, belowWidth: 56, maxLines: 2, belowGap: -2 };
            }

            if (type === "startEvent" || type === "endEvent" || type === "intermediateEvent") {
                return { placement: "auto", fontSize: 12, belowWidth: 110,
                         widthFactor: 0.8, heightFactor: 0.7, paddingX: 3, paddingY: 2 };
            }

            if (type === "gateway") {
                return { placement: "auto", fontSize: 12, belowWidth: 110,
                         widthFactor: 0.65, heightFactor: 0.5, paddingX: 2, paddingY: 1 };
            }

            if (type.endsWith("Event") || type.endsWith("Gateway") ||
                type === "dataObject" || type === "dataStore") {
                return { placement: "below", fontSize: 12, belowWidth: 110 };
            }

            if (type === "annotation") return { paddingX: 10, paddingY: 6, fontSize: 13 };

            return { paddingX: 10, paddingY: 10 };   // tasks: keep clear of the type icon in the corner
        },

        // ── Routing config ───────────────────────────────────
        getRoutingConfig(edge, engine) {
            return {
                gridSize: 20, stubLength: 20, obstacleMargin: 16,
                turnPenalty: 25, proximityPenalty: 2,
                preferredDirection: null, backtrackPenalty: 0,
                allowedDirections: ["up", "right", "down", "left"],
                searchMargin: 200, maxIterations: 3000, storeRoutingMeta: true
            };
        },

        // ── Render ordering ──────────────────────────────────
        // Containers must be drawn first (behind everything else).
        // The engine should call this to sort nodes before rendering.
        getSortedNodes(nodes) {
            const containers = nodes.filter(n => {
                const def = this.nodeTypes[n.type];
                return def && def.isContainer;
            });
            const regular = nodes.filter(n => {
                const def = this.nodeTypes[n.type];
                return !(def && def.isContainer);
            });
            return [...containers, ...regular];
        },
    };
}