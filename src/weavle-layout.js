/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — layered graph layout (Sugiyama style), used by engine.optimizeLayout().

  Pure function: knows nothing about the DOM, the engine or diagram types. Input is a plain graph,
  output is a centre position per node. Phases:
    1. break cycles     — a DFS finds back edges (loops) and leaves them out, so the graph flows one way
    2. assign layers    — longest path from the sources; sources are pulled next to their successors
    3. dummy nodes      — edges spanning several layers get a virtual node per layer in between
    4. order layers     — barycenter sweeps (down / up) to minimise crossings, best result kept
    5. coordinates      — layers along the flow axis; across it every node is pulled towards its
                          neighbours with order and spacing kept (isotonic regression), so chains run straight
  Separate components are laid out one by one and stacked across the flow.
  computeGroupedLayout() keeps nodes in bands (BPMN lanes) while the layers run through all of them.
*/

/**
 * @param {object}   graph
 * @param {Array<{id: string, width: number, height: number, x?: number, y?: number}>} graph.nodes
 *        x / y (current centre) only steer the initial order, so the result stays recognisable
 * @param {Array<{source: string, target: string, secondary?: boolean}>} graph.edges
 *        secondary: a side branch (e.g. from a BPMN boundary event) — laid out after the main flow
 * @param {object}   [options]
 * @param {"LR"|"TB"} [options.direction="LR"]
 * @param {number}   [options.layerGap=80]  free space between layers (along the flow)
 * @param {number}   [options.nodeGap=50]   free space between nodes in a layer (across the flow)
 * @param {number}   [options.componentGap=80]
 * @returns {Map<string, {x: number, y: number}>} centre per node id, relative to (0, 0) top-left
 */
export function computeLayeredLayout(graph, options = {}) {
    const opts = { direction: "LR", layerGap: 80, nodeGap: 50, componentGap: 80, ...options };
    const horizontal = opts.direction !== "TB";

    // Size along the flow axis and across it.
    const along  = n => horizontal ? n.width  : n.height;
    const across = n => horizontal ? n.height : n.width;
    const posAcross = n => horizontal ? n.y : n.x;

    const result = new Map();
    let offset = 0;

    for (const component of splitComponents(graph)) {
        const layout = layoutComponent(component, opts, along, across, posAcross);

        // Stack components across the flow: this one starts where the previous one ended.
        let min = Infinity;
        let max = -Infinity;
        for (const [id, p] of layout.positions) {
            const half = across(component.nodeById.get(id)) / 2;
            min = Math.min(min, p.across - half);
            max = Math.max(max, p.across + half);
        }
        for (const [id, p] of layout.positions) {
            const a = p.across - min + offset;
            result.set(id, horizontal ? { x: p.along, y: a } : { x: a, y: p.along });
        }
        offset += max - min + opts.componentGap;
    }

    // Normalise so the top-left corner of the whole layout is (0, 0).
    let minX = Infinity, minY = Infinity;
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    for (const [id, p] of result) {
        const n = byId.get(id);
        minX = Math.min(minX, p.x - n.width / 2);
        minY = Math.min(minY, p.y - n.height / 2);
    }
    for (const p of result.values()) {
        p.x -= minX;
        p.y -= minY;
    }
    return result;
}

/**
 * Layered layout with groups (e.g. BPMN lanes): layers run through all groups, but every node stays
 * in its own group, a band across the flow. Within a band nodes line up with their neighbours in
 * the same band; edges between bands just connect. Unlike computeLayeredLayout the graph is not
 * split into components (they share the bands).
 *
 * @param {object}   graph            as for computeLayeredLayout
 * @param {object}   options          as for computeLayeredLayout, plus:
 * @param {(id: string) => number} options.groupOf  band index of a node (0 = first band)
 * @param {number}   options.groupCount
 * @returns {{ positions: Map<string, {along: number, across: number}>, groupSizes: number[] }}
 *          along: centre along the flow from 0; across: centre within its band, measured from the
 *          band's content start (0); groupSizes: content extent of each band across the flow (0 if empty)
 */
export function computeGroupedLayout(graph, options = {}) {
    const opts = { direction: "LR", layerGap: 80, nodeGap: 50, ...options };
    const horizontal = opts.direction !== "TB";

    const along  = n => horizontal ? n.width  : n.height;
    const across = n => horizontal ? n.height : n.width;
    const posAcross = n => horizontal ? n.y : n.x;

    const nodes    = graph.nodes;
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const edges    = graph.edges.filter(e => nodeById.has(e.source) && nodeById.has(e.target) && e.source !== e.target);

    const dag    = breakCycles(nodes, edges, posAcross);
    const layer  = assignLayers(nodes, dag);
    const chains = insertDummies(nodes, dag, layer, opts.groupOf);

    // Band first, then the usual order within the band.
    const layers = orderLayers(chains, layer, nodeById, posAcross, id => chains.sortGroup(id));

    // Along the flow: shared by all bands.
    const depth = layers.map(ids => Math.max(0, ...ids.map(id => chains.isDummy(id) ? 0 : along(nodeById.get(id)))));
    const layerCentre = [];
    let cursor = 0;
    depth.forEach((d, i) => {
        layerCentre[i] = cursor + d / 2;
        cursor += d + opts.layerGap;
    });

    // Across the flow: each band on its own, only looking at neighbours in the same band.
    const positions  = new Map();
    const groupSizes = [];

    for (let g = 0; g < opts.groupCount; g++) {
        const inGroup = id => chains.group(id) === g;
        const sub = layers.map(ids => ids.filter(inGroup));

        const view = {
            ...chains,
            up:   new Map([...chains.up].map(([id, ns]) => [id, ns.filter(inGroup)])),
            down: new Map([...chains.down].map(([id, ns]) => [id, ns.filter(inGroup)]))
        };
        const acrossPos = assignAcross(sub, view, nodeById, across, opts.nodeGap);

        // Measure the band's content and shift it to start at 0.
        let min = Infinity;
        let max = -Infinity;
        sub.forEach(ids => ids.forEach(id => {
            if (chains.isDummy(id)) return;
            const half = across(nodeById.get(id)) / 2;
            min = Math.min(min, acrossPos.get(id) - half);
            max = Math.max(max, acrossPos.get(id) + half);
        }));

        groupSizes[g] = max > min ? max - min : 0;

        sub.forEach((ids, i) => ids.forEach(id => {
            if (!chains.isDummy(id)) positions.set(id, { along: layerCentre[i], across: acrossPos.get(id) - min });
        }));
    }

    return { positions, groupSizes };
}

// ── Components ──────────────────────────────────────────────

function splitComponents(graph) {
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
    const adjacent = new Map(graph.nodes.map(n => [n.id, []]));
    const edges = graph.edges.filter(e => nodeById.has(e.source) && nodeById.has(e.target) && e.source !== e.target);

    edges.forEach(e => {
        adjacent.get(e.source).push(e.target);
        adjacent.get(e.target).push(e.source);
    });

    const seen = new Set();
    const components = [];

    // Components in the order of their current position across the flow (top / left first).
    for (const start of graph.nodes) {
        if (seen.has(start.id)) continue;

        const ids = [];
        const stack = [start.id];
        seen.add(start.id);
        while (stack.length) {
            const id = stack.pop();
            ids.push(id);
            for (const next of adjacent.get(id)) {
                if (!seen.has(next)) { seen.add(next); stack.push(next); }
            }
        }

        const set = new Set(ids);
        components.push({
            nodes: ids.map(id => nodeById.get(id)),
            edges: edges.filter(e => set.has(e.source)),
            nodeById
        });
    }
    return components;
}

// ── One component ───────────────────────────────────────────

function layoutComponent(component, opts, along, across, posAcross) {
    const { nodes, edges, nodeById } = component;

    const dag    = breakCycles(nodes, edges, posAcross);
    const layer  = assignLayers(nodes, dag);
    const chains = insertDummies(nodes, dag, layer);

    const layers = orderLayers(chains, layer, nodeById, posAcross);

    // Along the flow: each layer as deep as its largest node.
    const depth = layers.map(ids => Math.max(0, ...ids.map(id => chains.isDummy(id) ? 0 : along(nodeById.get(id)))));
    const layerCentre = [];
    let cursor = 0;
    depth.forEach((d, i) => {
        layerCentre[i] = cursor + d / 2;
        cursor += d + opts.layerGap;
    });

    const acrossPos = assignAcross(layers, chains, nodeById, across, opts.nodeGap);

    const positions = new Map();
    layers.forEach((ids, i) => ids.forEach(id => {
        if (!chains.isDummy(id)) positions.set(id, { along: layerCentre[i], across: acrossPos.get(id) });
    }));
    return { positions };
}

/** DFS from the sources (in current order); edges back to a node on the stack are reversed. */
function breakCycles(nodes, edges, posAcross) {
    const out = new Map(nodes.map(n => [n.id, []]));
    const indegree = new Map(nodes.map(n => [n.id, 0]));
    edges.forEach(e => {
        out.get(e.source).push(e);
        indegree.set(e.target, indegree.get(e.target) + 1);
    });

    const state = new Map();   // 1 = on stack, 2 = done
    const reversed = new Set();
    const order = [...nodes].sort((a, b) =>
        (indegree.get(a.id) === 0 ? 0 : 1) - (indegree.get(b.id) === 0 ? 0 : 1) || posAcross(a) - posAcross(b));

    const visit = (id) => {
        state.set(id, 1);
        for (const e of out.get(id)) {
            const s = state.get(e.target);
            if (s === 1) reversed.add(e);
            else if (!s) visit(e.target);
        }
        state.set(id, 2);
    };
    order.forEach(n => { if (!state.get(n.id)) visit(n.id); });

    // Loops (back edges) are left out: they would add long dummy chains that pull the main line
    // aside. The edge router draws them around the finished layout.
    return edges.filter(e => !reversed.has(e)).map(e => ({ source: e.source, target: e.target, secondary: !!e.secondary }));
}

/** Longest path from the sources; a source is then pulled up to just before its nearest successor. */
function assignLayers(nodes, dag) {
    const preds = new Map(nodes.map(n => [n.id, []]));
    const succs = new Map(nodes.map(n => [n.id, []]));
    dag.forEach(e => {
        preds.get(e.target).push(e.source);
        succs.get(e.source).push(e.target);
    });

    const layer = new Map();
    const resolve = (id) => {
        if (layer.has(id)) return layer.get(id);
        layer.set(id, 0);   // guard (the graph is acyclic, but stay safe)
        const value = preds.get(id).length ? Math.max(...preds.get(id).map(p => resolve(p) + 1)) : 0;
        layer.set(id, value);
        return value;
    };
    nodes.forEach(n => resolve(n.id));

    // A secondary start (no predecessors) sits right before the node it feeds.
    nodes.forEach(n => {
        if (!preds.get(n.id).length && succs.get(n.id).length) {
            layer.set(n.id, Math.max(0, Math.min(...succs.get(n.id).map(s => layer.get(s))) - 1));
        }
    });
    return layer;
}

/** Splits edges that span more than one layer with dummy nodes; returns adjacency between neighbouring layers. */
function insertDummies(nodes, dag, layer, groupOf = null) {
    const dummies = new Set();
    const secondary = new Set();   // dummies on secondary edges, and nodes only reached through them
    // Groups (bands): a real node has its own; a dummy belongs to a band only when its edge stays
    // inside that band (an edge between bands must not take room in either). sortGroup always has one.
    const group     = new Map(groupOf ? nodes.map(n => [n.id, groupOf(n.id)]) : []);
    const sortGroup = new Map(group);
    const up   = new Map(nodes.map(n => [n.id, []]));   // neighbours in the previous layer
    const down = new Map(nodes.map(n => [n.id, []]));   // neighbours in the next layer
    let counter = 0;

    const link = (a, b) => { down.get(a).push(b); up.get(b).push(a); };

    dag.forEach(e => {
        let from = e.source;
        for (let l = layer.get(e.source) + 1; l < layer.get(e.target); l++) {
            const id = `__dummy_${counter++}`;
            dummies.add(id);
            if (e.secondary) secondary.add(id);
            if (groupOf) {
                const same = group.get(e.source) === group.get(e.target);
                group.set(id, same ? group.get(e.source) : null);
                sortGroup.set(id, group.get(e.source));
            }
            layer.set(id, l);
            up.set(id, []);
            down.set(id, []);
            link(from, id);
            from = id;
        }
        link(from, e.target);
    });

    nodes.forEach(n => {
        const incoming = dag.filter(e => e.target === n.id);
        if (incoming.length && incoming.every(e => e.secondary)) secondary.add(n.id);
    });

    return {
        up, down, layer,
        isDummy:     id => dummies.has(id),
        isSecondary: id => secondary.has(id),
        group:       id => group.get(id) ?? null,
        sortGroup:   id => sortGroup.get(id) ?? 0
    };
}

/** Barycenter sweeps; the ordering with the fewest crossings wins. */
function orderLayers(chains, layer, nodeById, posAcross, groupRank = () => 0) {
    const count = Math.max(...layer.values()) + 1;
    const layers = Array.from({ length: count }, () => []);
    for (const [id, l] of layer) layers[l].push(id);

    // Initial order: current position across the flow (dummies follow their source); secondary
    // branches (e.g. exception paths) go last, below / right of the main flow.
    const initial = new Map();
    const position = (id) => {
        if (initial.has(id)) return initial.get(id);
        const value = chains.isSecondary(id) ? Infinity : chains.isDummy(id)
            ? position(chains.up.get(id)[0])
            : posAcross(nodeById.get(id));
        initial.set(id, value);
        return value;
    };
    layers.forEach(ids => ids.sort((a, b) =>
        groupRank(a) - groupRank(b) || (position(a) === position(b) ? 0 : position(a) - position(b))));

    const index = new Map();
    const reindex = () => layers.forEach(ids => ids.forEach((id, i) => index.set(id, i)));
    reindex();

    let best = layers.map(ids => [...ids]);
    let bestCrossings = countCrossings(layers, chains, index);

    for (let iter = 0; iter < 12 && bestCrossings > 0; iter++) {
        const downward = iter % 2 === 0;
        const range = downward ? [...Array(count).keys()].slice(1) : [...Array(count).keys()].reverse().slice(1);

        for (const l of range) {
            const neighbours = downward ? chains.up : chains.down;
            const bary = new Map();
            layers[l].forEach(id => {
                const ns = neighbours.get(id);
                bary.set(id, ns.length ? ns.reduce((s, n) => s + index.get(n), 0) / ns.length : index.get(id));
            });
            layers[l].sort((a, b) => groupRank(a) - groupRank(b) || bary.get(a) - bary.get(b) || index.get(a) - index.get(b));
            layers[l].forEach((id, i) => index.set(id, i));
        }

        const crossings = countCrossings(layers, chains, index);
        if (crossings < bestCrossings) {
            bestCrossings = crossings;
            best = layers.map(ids => [...ids]);
        }
    }

    best.forEach((ids, l) => { layers[l] = ids; });
    reindex();
    return layers;
}

function countCrossings(layers, chains, index) {
    let total = 0;
    for (let l = 0; l < layers.length - 1; l++) {
        const pairs = [];
        layers[l].forEach(id => chains.down.get(id).forEach(t => pairs.push([index.get(id), index.get(t)])));
        for (let i = 0; i < pairs.length; i++) {
            for (let j = i + 1; j < pairs.length; j++) {
                const [a1, b1] = pairs[i];
                const [a2, b2] = pairs[j];
                if ((a1 - a2) * (b1 - b2) < 0) total++;
            }
        }
    }
    return total;
}

/**
 * Positions across the flow. Start packed; then alternately pull each layer towards the average of
 * its neighbours in the previous / next layer, keeping order and spacing (weighted isotonic
 * regression). Dummies weigh more, so long edges stay straight.
 */
function assignAcross(layers, chains, nodeById, across, gap) {
    const size = id => chains.isDummy(id) ? 0 : across(nodeById.get(id));
    const pos = new Map();

    layers.forEach(ids => {
        let cursor = 0;
        ids.forEach(id => {
            pos.set(id, cursor + size(id) / 2);
            cursor += size(id) + gap;
        });
    });

    const place = (ids, desired, weight) => {
        // Offsets turn "pos[i] >= pos[i-1] + spacing" into plain "z[i] >= z[i-1]".
        const offsets = [];
        let acc = 0;
        ids.forEach((id, i) => {
            if (i > 0) acc += (size(ids[i - 1]) + size(id)) / 2 + gap;
            offsets.push(acc);
        });
        const z = isotonic(ids.map((id, i) => desired.get(id) - offsets[i]), ids.map(weight));
        ids.forEach((id, i) => pos.set(id, z[i] + offsets[i]));
    };

    // Long edges stay straight (dummies weigh more); secondary branches give way to the main line.
    const weight = id => chains.isSecondary(id) ? 0.05 : (chains.isDummy(id) ? 4 : 1);

    // Median of the neighbours' positions (with two: their middle), so one far-off neighbour
    // doesn't drag a node off its main line.
    const median = (ns) => {
        const values = ns.map(n => pos.get(n)).sort((a, b) => a - b);
        const mid = Math.floor(values.length / 2);
        return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    };

    // Alternate down / up sweeps and finish with a downward one: everything then lines up behind
    // its predecessors, so a split's branches sit symmetric around the main line and a join
    // returns to it.
    for (let iter = 0; iter < 9; iter++) {
        const downward = iter % 2 === 0;
        const order = downward ? layers.slice(1) : layers.slice(0, -1).reverse();
        const neighbours = downward ? chains.up : chains.down;

        order.forEach(ids => {
            const desired = new Map();
            ids.forEach(id => {
                const ns = neighbours.get(id);
                desired.set(id, ns.length ? median(ns) : pos.get(id));
            });
            place(ids, desired, weight);
        });
    }

    return pos;
}

/** Weighted isotonic regression (pool adjacent violators): the non-decreasing sequence closest to values. */
function isotonic(values, weights) {
    const blocks = [];
    values.forEach((v, i) => {
        blocks.push({ value: v, weight: weights[i], count: 1 });
        while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
            const b = blocks.pop();
            const a = blocks.pop();
            const w = a.weight + b.weight;
            blocks.push({ value: (a.value * a.weight + b.value * b.weight) / w, weight: w, count: a.count + b.count });
        }
    });
    const result = [];
    blocks.forEach(b => { for (let i = 0; i < b.count; i++) result.push(b.value); });
    return result;
}
