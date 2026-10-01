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

const bpmnShapes = {

    // ── Events ──────────────────────────────────────────────

    startEvent(node, engine) {
        const r  = Math.min(node.width, node.height) / 2;
        const cx = node.x + node.width  / 2;
        const cy = node.y + node.height / 2;
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", cx);
        circle.setAttribute("cy", cy);
        circle.setAttribute("r",  r);
        engine.applyNodeStyle(circle, node);
        return circle;
    },

    endEvent(node, engine) {
        const r  = Math.min(node.width, node.height) / 2;
        const cx = node.x + node.width  / 2;
        const cy = node.y + node.height / 2;
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", cx);
        circle.setAttribute("cy", cy);
        circle.setAttribute("r",  r);
        engine.applyNodeStyle(circle, node);
        circle.setAttribute("stroke-width", node.id === engine.state.selectedNodeId ? "3.5" : "3");
        return circle;
    },

    intermediateEvent(node, engine) {
        const group  = document.createElementNS(NS, "g");
        const rOuter = Math.min(node.width, node.height) / 2;
        const rInner = Math.max(rOuter - 5, 4);
        const cx = node.x + node.width  / 2;
        const cy = node.y + node.height / 2;

        const outer = document.createElementNS(NS, "circle");
        outer.setAttribute("cx", cx); outer.setAttribute("cy", cy); outer.setAttribute("r", rOuter);
        engine.applyNodeStyle(outer, node);

        const inner = document.createElementNS(NS, "circle");
        inner.setAttribute("cx", cx); inner.setAttribute("cy", cy); inner.setAttribute("r", rInner);
        inner.setAttribute("fill", "none");
        inner.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
        inner.setAttribute("stroke-width", node.id === engine.state.selectedNodeId ? "2.5" : "1.5");

        group.appendChild(outer);
        group.appendChild(inner);
        return group;
    },

    // Message start event — circle + envelope icon
    messageStartEvent(node, engine) {
        const group = document.createElementNS(NS, "g");
        const r  = Math.min(node.width, node.height) / 2;
        const cx = node.x + node.width  / 2;
        const cy = node.y + node.height / 2;

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", r);
        engine.applyNodeStyle(circle, node);

        const colors = engine.getNodeColors(node.type);
        const ew = r * 1.0, eh = r * 0.65;
        const ex = cx - ew / 2, ey = cy - eh / 2;

        const env = document.createElementNS(NS, "rect");
        env.setAttribute("x", ex); env.setAttribute("y", ey);
        env.setAttribute("width", ew); env.setAttribute("height", eh);
        env.setAttribute("fill", "none");
        env.setAttribute("stroke", colors.stroke); env.setAttribute("stroke-width", "1.5");

        const line = document.createElementNS(NS, "polyline");
        line.setAttribute("points", `${ex},${ey} ${cx},${cy} ${ex + ew},${ey}`);
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", colors.stroke); line.setAttribute("stroke-width", "1.5");

        group.appendChild(circle); group.appendChild(env); group.appendChild(line);
        return group;
    },

    // Timer start event — circle + clock icon
    timerStartEvent(node, engine) {
        const group = document.createElementNS(NS, "g");
        const r  = Math.min(node.width, node.height) / 2;
        const cx = node.x + node.width  / 2;
        const cy = node.y + node.height / 2;

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", r);
        engine.applyNodeStyle(circle, node);

        const colors = engine.getNodeColors(node.type);
        const cr = r * 0.6;

        const clock = document.createElementNS(NS, "circle");
        clock.setAttribute("cx", cx); clock.setAttribute("cy", cy); clock.setAttribute("r", cr);
        clock.setAttribute("fill", "none");
        clock.setAttribute("stroke", colors.stroke); clock.setAttribute("stroke-width", "1.5");

        const hand1 = document.createElementNS(NS, "line");
        hand1.setAttribute("x1", cx); hand1.setAttribute("y1", cy);
        hand1.setAttribute("x2", cx); hand1.setAttribute("y2", cy - cr * 0.7);
        hand1.setAttribute("stroke", colors.stroke); hand1.setAttribute("stroke-width", "1.5");
        hand1.setAttribute("stroke-linecap", "round");

        const hand2 = document.createElementNS(NS, "line");
        hand2.setAttribute("x1", cx); hand2.setAttribute("y1", cy);
        hand2.setAttribute("x2", cx + cr * 0.5); hand2.setAttribute("y2", cy);
        hand2.setAttribute("stroke", colors.stroke); hand2.setAttribute("stroke-width", "1.5");
        hand2.setAttribute("stroke-linecap", "round");

        group.appendChild(circle); group.appendChild(clock);
        group.appendChild(hand1); group.appendChild(hand2);
        return group;
    },

    // Error end event — circle + lightning bolt
    errorEndEvent(node, engine) {
        const group = document.createElementNS(NS, "g");
        const r  = Math.min(node.width, node.height) / 2;
        const cx = node.x + node.width  / 2;
        const cy = node.y + node.height / 2;

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", r);
        engine.applyNodeStyle(circle, node);
        circle.setAttribute("stroke-width", "3");

        const colors = engine.getNodeColors(node.type);
        const s = r * 0.55;
        const bolt = document.createElementNS(NS, "polyline");
        bolt.setAttribute("points", `${cx + s * 0.2},${cy - s} ${cx - s * 0.2},${cy} ${cx + s * 0.3},${cy} ${cx - s * 0.2},${cy + s}`);
        bolt.setAttribute("fill", "none");
        bolt.setAttribute("stroke", colors.stroke); bolt.setAttribute("stroke-width", "1.5");
        bolt.setAttribute("stroke-linejoin", "round");

        group.appendChild(circle); group.appendChild(bolt);
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
// TOOL ICON FACTORY  (used inside the floating action rail)
// ============================================================

function createToolIcon(action, engine) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "20"); svg.setAttribute("height", "20"); svg.setAttribute("viewBox", "0 0 40 40");

    if (action.type === "deleteNode") {
        [["10","10","30","30"],["30","10","10","30"]].forEach(([x1,y1,x2,y2]) => {
            const l = document.createElementNS(NS, "line");
            l.setAttribute("x1",x1); l.setAttribute("y1",y1); l.setAttribute("x2",x2); l.setAttribute("y2",y2);
            l.setAttribute("stroke", "#d11a2a"); l.setAttribute("stroke-width", "3"); l.setAttribute("stroke-linecap", "round");
            svg.appendChild(l);
        });
        return svg;
    }

    const colors = engine.getNodeColors(action.nodeType);

    const iconMap = {
        task:              () => _iconRoundedRect(svg, colors, 6, 10, 28, 20, 4),
        userTask:          () => _iconRoundedRect(svg, colors, 6, 10, 28, 20, 4),
        serviceTask:       () => _iconRoundedRect(svg, colors, 6, 10, 28, 20, 4),
        sendTask:          () => _iconRoundedRect(svg, colors, 6, 10, 28, 20, 4),
        receiveTask:       () => _iconRoundedRect(svg, colors, 6, 10, 28, 20, 4),
        scriptTask:        () => _iconRoundedRect(svg, colors, 6, 10, 28, 20, 4),
        callActivity:      () => _iconRoundedRect(svg, colors, 6, 10, 28, 20, 4, 3),
        subProcess:        () => _iconRoundedRect(svg, colors, 6, 10, 28, 20, 4),
        startEvent:        () => _iconCircle(svg, colors, 20, 20, 12),
        endEvent:          () => _iconCircle(svg, colors, 20, 20, 12, 3),
        messageStartEvent: () => _iconCircle(svg, colors, 20, 20, 12),
        timerStartEvent:   () => _iconCircle(svg, colors, 20, 20, 12),
        errorEndEvent:     () => _iconCircle(svg, colors, 20, 20, 12, 3),
        intermediateEvent: () => _iconCircle(svg, colors, 20, 20, 12),
        gateway:           () => _iconDiamond(svg, colors),
        exclusiveGateway:  () => _iconDiamond(svg, colors),
        parallelGateway:   () => _iconDiamond(svg, colors),
        inclusiveGateway:  () => _iconDiamond(svg, colors),
        dataObject:        () => _iconRoundedRect(svg, colors, 12, 8, 18, 24, 2),
        dataStore:         () => _iconRoundedRect(svg, colors, 8, 10, 24, 20, 2),
        annotation:        () => _iconRoundedRect(svg, colors, 8, 8, 24, 24, 2),
        swimlane:          () => _iconRoundedRect(svg, colors, 4, 6, 32, 28, 4),
        pool:              () => _iconRoundedRect(svg, colors, 4, 6, 32, 28, 4),
    };

    (iconMap[action.nodeType] || (() => _iconRoundedRect(svg, colors, 8, 8, 24, 24, 4)))();
    return svg;
}

function _iconRoundedRect(svg, colors, x, y, w, h, rx, sw = 2) {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", w); r.setAttribute("height", h); r.setAttribute("rx", rx);
    r.setAttribute("fill", colors.fill); r.setAttribute("stroke", colors.stroke); r.setAttribute("stroke-width", sw);
    svg.appendChild(r);
}

function _iconCircle(svg, colors, cx, cy, r, sw = 2) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r);
    c.setAttribute("fill", colors.fill); c.setAttribute("stroke", colors.stroke); c.setAttribute("stroke-width", sw);
    svg.appendChild(c);
}

function _iconDiamond(svg, colors) {
    const p = document.createElementNS(NS, "polygon");
    p.setAttribute("points", "20,6 34,20 20,34 6,20");
    p.setAttribute("fill", colors.fill); p.setAttribute("stroke", colors.stroke); p.setAttribute("stroke-width", "2");
    svg.appendChild(p);
}


// ============================================================
// TOOL ITEM FACTORY  (clickable button in the floating rail)
// ============================================================

function createToolItem(action, node, engine, variant = "normal") {
    const item = document.createElement("div");
    const isDanger = variant === "danger";

    Object.assign(item.style, {
        width: "32px", height: "32px", display: "flex",
        alignItems: "center", justifyContent: "center",
        border: isDanger ? "1px solid #f1b0b7" : "1px solid #d9d9d9",
        borderRadius: "6px", background: "#fff", cursor: "pointer",
        transition: "all 0.15s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
    });
    item.title = action.label || action.type;
    item.appendChild(createToolIcon(action, engine));

    item.addEventListener("mouseenter", () => {
        item.style.background   = isDanger ? "#fff5f5" : "#f3f6fa";
        item.style.borderColor  = isDanger ? "#d11a2a" : "#eb6c4c";
        item.style.boxShadow    = "0 2px 6px rgba(0,0,0,0.15)";
        item.style.transform    = "scale(1.05)";
    });
    item.addEventListener("mouseleave", () => {
        item.style.background   = "#fff";
        item.style.borderColor  = isDanger ? "#f1b0b7" : "#d9d9d9";
        item.style.boxShadow    = "0 1px 3px rgba(0,0,0,0.08)";
        item.style.transform    = "scale(1)";
    });
    item.addEventListener("click", e => {
        e.stopPropagation();
        engine.handleContextAction(action, node);
    });

    return item;
}


// ============================================================
// EXPORTED DEFINITION
// ============================================================

export function createBpmnDefinition() {
    return {
        id: "bpmn",

        shapes: bpmnShapes,

        // ── Node type catalogue ──────────────────────────────
        nodeTypes: {

            // Events
            startEvent:        { defaultLabel: "Start",               colors: { fill: "#ffffff", stroke: "#1B5278" }, shape: "startEvent"        },
            messageStartEvent: { defaultLabel: "Message start",       colors: { fill: "#EAF4FB", stroke: "#1B5278" }, shape: "messageStartEvent"  },
            timerStartEvent:   { defaultLabel: "Timer start",         colors: { fill: "#FFF9EC", stroke: "#B07A00" }, shape: "timerStartEvent"    },
            intermediateEvent: { defaultLabel: "Intermediate event",  colors: { fill: "#ffffff", stroke: "#4A8DB5" }, shape: "intermediateEvent"  },
            endEvent:          { defaultLabel: "End",                 colors: { fill: "#ffffff", stroke: "#0d2d44" }, shape: "endEvent"           },
            errorEndEvent:     { defaultLabel: "Error end",           colors: { fill: "#FFF0F0", stroke: "#C0392B" }, shape: "errorEndEvent"      },

            // Tasks
            task:              { defaultLabel: "Task",                colors: { fill: "#FDF7E7", stroke: "#0d2d44" }, shape: "task"               },
            userTask:          { defaultLabel: "User task",           colors: { fill: "#EDF7FD", stroke: "#1B5278" }, shape: "userTask"           },
            serviceTask:       { defaultLabel: "Service task",        colors: { fill: "#F3EDF7", stroke: "#6C3483" }, shape: "serviceTask"        },
            sendTask:          { defaultLabel: "Send task",           colors: { fill: "#EBF5EC", stroke: "#1E8449" }, shape: "sendTask"           },
            receiveTask:       { defaultLabel: "Receive task",        colors: { fill: "#EBF5EC", stroke: "#1E8449" }, shape: "receiveTask"        },
            scriptTask:        { defaultLabel: "Script task",         colors: { fill: "#FDF7E7", stroke: "#7D6608" }, shape: "scriptTask"         },
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
            { type: "startEvent" },
            { type: "task" },
            { type: "userTask" },
            { type: "serviceTask" },
            { type: "exclusiveGateway" },
            { type: "parallelGateway" },
            { type: "endEvent" },
            { type: "dataObject" },
            { type: "annotation" },
            { type: "pool" },
            { type: "swimlane" },
        ],

        // Default sizes per node type
        getDefaultSize(nodeType) {
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
                swimlane:          { width: 600, height: 160 },
                pool:              { width: 700, height: 400 },
            };
            return sizes[nodeType] || { width: 120, height: 60 };
        },

        // ── Port layout ──────────────────────────────────────
        // Containers (swimlane / pool) expose no ports — you connect to nodes inside them.
        getPorts(node) {
            const def = this.nodeTypes[node.type];
            if (def && def.isContainer) return {};

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
        getContextActions(node) {
            const def = this.nodeTypes[node.type];

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

            return [
                { type: "addConnectedNode", nodeType: "task",             label: "Task"              },
                { type: "addConnectedNode", nodeType: "userTask",         label: "User task"         },
                { type: "addConnectedNode", nodeType: "serviceTask",      label: "Service task"      },
                { type: "addConnectedNode", nodeType: "exclusiveGateway", label: "Exclusive gateway" },
                { type: "addConnectedNode", nodeType: "parallelGateway",  label: "Parallel gateway"  },
                { type: "addConnectedNode", nodeType: "intermediateEvent",label: "Intermediate event"},
                { type: "addConnectedNode", nodeType: "endEvent",         label: "End event"         },
                { type: "addConnectedNode", nodeType: "annotation",       label: "Annotation"        },
                { type: "deleteNode",       label: "Verwijderen" }
            ];
        },

        getNodeInteractionMode(node) {
            return "action-rail";
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
                const firstBottom = first.y + first.height;
                const top    = Math.min(container.y, contentTop(first) - pad,
                                        first === last ? Infinity : firstBottom - min);
                const bottom = Math.max(container.y + container.height, contentBottom(last) + pad,
                                        first === last ? -Infinity : last.y + min);

                if (first === last) {
                    // Single lane: it is the inner area of the pool.
                    first.y      = top;
                    first.height = Math.max(min, bottom - top);
                } else {
                    first.y      = top;
                    first.height = firstBottom - top;
                    last.height  = bottom - last.y;
                }

                container.y      = first.y;
                container.height = last.y + last.height - first.y;
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

        handleAction(action, node, engine) {
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

        // ── Node tool renderer ───────────────────────────────
        getNodeToolRenderer(node, engine) {
            return ({ node, actions, engine, surfaceEl }) => {
                const primaryActions = actions.filter(a => a.type !== "deleteNode");
                const dangerActions  = actions.filter(a => a.type === "deleteNode");

                primaryActions.forEach(a => surfaceEl.appendChild(createToolItem(a, node, engine, "normal")));

                if (primaryActions.length && dangerActions.length) {
                    const div = document.createElement("div");
                    Object.assign(div.style, { width: "100%", height: "1px", background: "#eee", margin: "4px 0" });
                    surfaceEl.appendChild(div);
                }

                dangerActions.forEach(a => surfaceEl.appendChild(createToolItem(a, node, engine, "danger")));
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