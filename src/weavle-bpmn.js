const NS = "http://www.w3.org/2000/svg";

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
        const headerSize = 30; // width of the label strip

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
        const headerSize = 30;

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

        // ── Edge routing ─────────────────────────────────────
        routeEdge({ sourcePoint, targetPoint, sourceHandle, targetHandle, edge, engine }) {
            return engine.buildRoutedEdgePoints(sourcePoint, targetPoint, sourceHandle, targetHandle, edge);
        },

        // ── Context actions (floating rail) ──────────────────
        getContextActions(node) {
            const def = this.nodeTypes[node.type];

            // Containers only get a delete action
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
            if (type === "swimlane" || type === "pool") return { minWidth: 300, minHeight: 100 };

            return { minWidth: 80, minHeight: 50 };   // tasks, sub-processes, call activities
        },

        // ── Label layout ─────────────────────────────────────
        // BPMN convention: events, gateways and data elements carry their label below the shape.
        getLabelLayout(node) {
            const type = node.type || "";

            if (type.endsWith("Event") || type.endsWith("Gateway") || type === "gateway" ||
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