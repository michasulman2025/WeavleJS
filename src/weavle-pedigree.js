/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — Pedigree (family tree) diagram definition. Design: ARCHITECTURE.md section 6, "Pedigree".

  Derived diagram: the host owns the data (persons and families, GEDCOM-like) and hands it over as
  { focusId, persons, families } — pedigreeFromList() turns that into nodes and edges:

      person        a card per person (name = node.label; gender, birthYear, deathYear, living, refId,
                    photoUrl on the node; node.hostId = the host's id)
      family        the junction where the partners meet and the child lines start; carries the
                    marriage details (marriageDate, marriagePlace)

      partner       edge person → family (edge.slot 1 | 2 = partner1 / partner2)
      child         edge child → its parent family

  Node ids are prefixed ("p:<id>", "f:<id>") because host apps often number persons and families
  separately. The focus person has node.focus = true.

  The definition owns the layout (layoutDiagram): an hourglass around the focus person. Generation 0
  holds the focus with its partners and (showSiblings) its siblings; ancestors of the focus and its
  partner(s) go one way, descendants the other. Persons and families outside the range are hidden
  (isNodeHidden). The layout works in two abstract axes — generation (ancestors +) and spread (order
  within a generation) — and an orientation maps them to x / y: HORIZONTAL (ancestors to the right,
  partners stacked) or VERTICAL (ancestors at the top, partners side by side, standing cards). Lines are
  elbows computed by the layout (routeEdge). setOrientation(o, engine) switches without an undo step.

  A person is shown with one relationship at a time (shownFamily); a badge says how many there are and
  switches. Empty slots ("Vader toevoegen", ...) are generated nodes (addPlaceholders). The chart changes no
  data: adding, editing and removing go to the host as diagram events with a requestId, e.g.
      addparent { requestId, personId, role, familyId }     addchild { requestId, personId, familyId }
      addpartner, addsibling, editperson, removeperson      preferredpartnerchanged { personId, familyId }
  Dragging, connecting, inline editing and deleting are off.
*/

const NS = "http://www.w3.org/2000/svg";

// ── Layout constants ────────────────────────────────────────

// Horizontal: generations are columns, ancestors to the right; partners are stacked with a band between
// them that holds the marriage details.
const HORIZONTAL = {
    depth:   240,    // card size along the generation axis
    extent:  56,     // card size along the spread axis
    band:    22,     // gap between two partners (marriage details)
    genGap:  64,     // gap between two generations
    gap:     26,     // spread gap between neighbouring units / subtrees (more than the band: partners group)
    point:   (a, s) => ({ x: a, y: s }),
    rect:    (base, s0, depth, extent) => ({ x: base, y: s0, width: depth, height: extent })
};

// Vertical: generations are rows, ancestors at the top; partners side by side with a narrow band (a ring
// icon) between them. The generation axis points up, so a = base … base + depth maps to y = -(base + depth) … -base.
const VERTICAL = {
    depth:   150,
    extent:  120,
    band:    18,
    genGap:  64,
    gap:     26,
    point:   (a, s) => ({ x: s, y: -a }),
    rect:    (base, s0, depth, extent) => ({ x: s0, y: -(base + depth), width: extent, height: depth })
};

const ORIENTATIONS = { horizontal: HORIZONTAL, vertical: VERTICAL };
const orientationOf = name => ORIENTATIONS[name] || HORIZONTAL;

const JUNCTION_GAP  = 14;   // the family junction sits this far out on the descendant side of its couple
const JUNCTION_STEP = 8;    // further families of the same person step out by this much each

const FAMILY_SIZE   = 2;    // the family node is a small box on its junction
const FRAME_PAD     = 5;    // the frame around partners reaches this far past their cards
const MARGIN        = 40;   // a fresh chart starts this far from the canvas's top-left; it never sticks out there
const LANE_STEP     = 16;   // distance between the vertical lanes of child lines in one gap
const LANE_ROOM     = 32;   // at most this much room for all lanes together

// Card contents (horizontal).
const BAR          = 5;     // gender bar on the left
const RADIUS       = 5;
const AVATAR_R     = 18;
const AVATAR_X     = 33;    // avatar centre from the card's left edge
const TEXT_LEFT    = 60;    // name and dates start here
const TEXT_RIGHT   = 28;    // room for the "+" button in the top-right corner
const NAME_SIZE    = 13;
const DATES_SIZE   = 11;
const MARRIAGE_SIZE = 10.5;

// Card contents (vertical).
const V_AVATAR_R   = 26;
const V_AVATAR_Y   = 42;    // avatar centre from the card's top
const V_NAME_Y     = 92;    // centre of the name block (up to two lines)
const V_DATES_Y    = 124;   // baseline of the years line; the reference id goes below it
const V_PAD        = 8;

const DEFAULT_OPTIONS = {
    ancestorGenerations:   3,
    descendantGenerations: 2,
    showSiblings:          true,
    showPlaceholders:      true,
    orientation:           "horizontal"
};

// Two rings (the relationship badge), around (0, 0).
const RINGS_PATH = "M -6.6 -0.8 a 3.4 3.4 0 1 0 6.8 0 a 3.4 3.4 0 1 0 -6.8 0 M -0.2 0.8 a 3.4 3.4 0 1 0 6.8 0 a 3.4 3.4 0 1 0 -6.8 0";

let instanceCount = 0;

// ── Small helpers ───────────────────────────────────────────

function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

const personNodeId = id => `p:${id}`;
const familyNodeId = id => `f:${id}`;

const isPerson      = node => node.type === "person";
const isFamily      = node => node.type === "family";
const isPlaceholder = node => node.type === "placeholder";
const isCard        = node => isPerson(node) || isPlaceholder(node);

/** "1870–1943", "1870–?", "Levend" — empty when nothing is known. */
function lifespan(person) {
    if (person.living) return person.birthYear ? `${person.birthYear} – Levend` : "Levend";
    if (!person.birthYear && !person.deathYear) return "";
    return `${person.birthYear || "?"}–${person.deathYear || "?"}`;
}

function marriageText(family) {
    const parts = [family.marriageDate, family.marriagePlace].filter(Boolean);
    return parts.length ? `Huwelijk: ${parts.join(" • ")}` : "";
}

// ── Reading the model ───────────────────────────────────────

/**
 * Persons and families as stored in the model: partners per family (by slot), the families of a
 * person (model order), the parent family of a person and the children of a family (by birth year,
 * then model order).
 */
function readPedigree(engine) {
    const nodes    = engine.model.nodes;
    const byId     = new Map(nodes.map(n => [n.id, n]));
    const order    = new Map(nodes.map((n, i) => [n.id, i]));
    const partners = new Map();   // family id → [partner1, partner2]
    const families = new Map();   // person id → [family]
    const parents  = new Map();   // person id → family
    const children = new Map();   // family id → [person]

    for (const edge of engine.model.edges) {
        const person = byId.get(edge.sourceNodeId);
        const family = byId.get(edge.targetNodeId);
        if (!person || !family || !isCard(person) || !isFamily(family)) continue;

        if (edge.type === "partner") {
            const slots = partners.get(family.id) || [null, null];
            slots[edge.slot === 2 ? 1 : 0] = person;
            partners.set(family.id, slots);
            if (!families.has(person.id)) families.set(person.id, []);
            families.get(person.id).push(family);
        } else if (edge.type === "child" && !parents.has(person.id)) {
            parents.set(person.id, family);
            if (!children.has(family.id)) children.set(family.id, []);
            children.get(family.id).push(person);
        }
    }

    const byModelOrder = (a, b) => order.get(a.id) - order.get(b.id);
    const byBirth      = (a, b) => (Number(a.birthYear) || Infinity) - (Number(b.birthYear) || Infinity) || byModelOrder(a, b);
    for (const list of families.values()) list.sort(byModelOrder);
    for (const list of children.values()) list.sort(byBirth);

    const persons    = nodes.filter(isPerson);
    const familiesOf = person => families.get(person.id) || [];

    return {
        focus:        persons.find(p => p.focus) || persons[0] || null,
        slotsOf:      family => partners.get(family.id) || [null, null],
        partnersOf:   family => (partners.get(family.id) || [null, null]).filter(Boolean),
        familiesOf,
        parentFamily: person => parents.get(person.id) || null,
        childrenOf:   family => children.get(family.id) || [],
        otherPartner: (family, person) => (partners.get(family.id) || []).find(p => p && p !== person) || null,

        // The one family shown with a person (one partner at a time): the one picked in the chart
        // (view state), else the host's preferred one, else the last.
        shownFamily:  person => {
            const list = familiesOf(person);
            const find = id => id && list.find(f => f.id === id);
            return find(person.shownFamilyId) || find(person.preferredFamilyId) || list.at(-1) || null;
        }
    };
}

// ── Placeholders ────────────────────────────────────────────

/*
  Empty slots ("Vader toevoegen", ...) are generated nodes (node.generated) that the layout adds before
  every pass and that never reach the host's lists: placeholder cards, plus a generated family where
  there is none yet (unknown parents, a focus without partner) and the partner / child edges that hang
  them into the tree. The normal layout then places them like persons.
*/

const PLACEHOLDER_TEXT = {
    father:  "Vader toevoegen",
    mother:  "Moeder toevoegen",
    partner: "Partner toevoegen",
    child:   "Kind toevoegen"
};

/**
 * Replaces the generated nodes and edges: within the ancestor range, two empty parents for a person
 * whose parents are unknown (unless the host has more), the missing parent of a single-parent family;
 * for the focus, an empty partner without a family and an empty child in a family without children.
 */
function addPlaceholders(engine, options) {
    engine.model.nodes = engine.model.nodes.filter(n => !n.generated);
    engine.model.edges = engine.model.edges.filter(e => !e.generated);
    if (engine.options.readOnly || !options.showPlaceholders) return;

    const data  = readPedigree(engine);
    const focus = data.focus;
    if (!focus) return;

    const o     = orientationOf(options.orientation);
    const nodes = [];
    const edges = [];

    const family = id => {
        const node = { id, type: "family", generated: true, label: "", x: 0, y: 0, width: FAMILY_SIZE, height: FAMILY_SIZE };
        nodes.push(node);
        return node;
    };
    const slot = (role, forId, familyNode, edgeType, slotNo) => {
        const node = {
            id: `ph:${forId}:${role}`, type: "placeholder", generated: true, role, forId,
            label: PLACEHOLDER_TEXT[role], x: 0, y: 0, ...o.rect(0, 0, o.depth, o.extent)
        };
        nodes.push(node);
        edges.push(link(node, familyNode, edgeType, slotNo));
        return node;
    };
    const link = (card, familyNode, type, slotNo) => ({
        id: `ph:e:${card.id}:${familyNode.id}`, type, generated: true, ...(slotNo ? { slot: slotNo } : {}),
        sourceNodeId: card.id, targetNodeId: familyNode.id, sourceHandle: "right", targetHandle: "left"
    });

    // The focus: a partner slot when it has no family yet, a child slot when the shown family has no children.
    let shown = data.shownFamily(focus);
    if (!shown) {
        shown = family(`ph:f:${focus.id}:partner`);
        const own = focus.gender === "female" ? 2 : 1;
        edges.push(link(focus, shown, "partner", own));
        slot("partner", focus.id, shown, "partner", own === 1 ? 2 : 1);
    }
    if (!data.childrenOf(shown).length) slot("child", focus.id, shown, "child");

    // Ancestors of the focus and its shown partner, as far as the range goes.
    const seen = new Set();
    const walk = (person, gen) => {
        if (!person || seen.has(person.id) || gen >= options.ancestorGenerations) return;
        seen.add(person.id);

        const parents = data.parentFamily(person);
        if (!parents) {
            if (person.hasMoreAncestors) return;   // the host has them: a chevron, not an empty slot (step 4)
            const fam = family(`ph:f:${person.id}:parents`);
            edges.push(link(person, fam, "child"));
            slot("father", person.id, fam, "partner", 1);
            slot("mother", person.id, fam, "partner", 2);
            return;
        }

        const [p1, p2] = data.slotsOf(parents);
        if (!p1 && p2) slot("father", person.id, parents, "partner", 1);
        if (p1 && !p2) slot("mother", person.id, parents, "partner", 2);
        walk(p1, gen + 1);
        walk(p2, gen + 1);
    };
    walk(focus, 0);
    walk(data.otherPartner(data.shownFamily(focus) || shown, focus), 0);

    // Families first (their frames lie under the cards).
    engine.model.nodes = [...nodes.filter(isFamily), ...engine.model.nodes, ...nodes.filter(n => !isFamily(n))];
    engine.model.edges.push(...edges);
}

// ── Layout ──────────────────────────────────────────────────

/*
  Units are what the layout stacks along the spread axis: a couple (ancestors), a person with its
  partners (generation 0 and descendants) or a single card (a sibling). A unit is a list of cards with
  a band between two partners, plus its families: which cards are the partners and where the family's
  junction is (in the band, or on the single parent's card).
*/

/** Measures a unit along the spread axis: card offsets, band centres, total extent. */
function measureUnit(unit, o) {
    let s = 0;
    unit.offsets = unit.cards.map((card, i) => {
        if (i > 0) s += unit.bandAfter.has(i - 1) ? o.band : 0;
        const at = s;
        s += o.extent;
        return at;
    });
    unit.extent = s;

    for (const fam of unit.families) {
        const [first, second] = fam.members;
        fam.offset = second == null
            ? unit.offsets[first] + o.extent / 2
            : (unit.offsets[first] + o.extent + unit.offsets[second]) / 2;
    }
    return unit;
}

/**
 * The layout of one pass: claims persons and families as it builds units (each is drawn once — an
 * ancestor reached twice shows up only at its first place), then places them generation by generation.
 */
function layoutPedigree(engine, options, out) {
    out.routes.clear();
    out.visible.clear();
    out.bands.clear();
    out.frames.clear();
    out.variants.clear();
    out.switchable.clear();
    out.relations.clear();

    addPlaceholders(engine, options);
    const data  = readPedigree(engine);
    const focus = data.focus;
    if (!focus) return;

    const o       = orientationOf(options.orientation);
    const step    = o.depth + o.genGap;
    const base    = gen => gen * step;
    const claimed = new Set();
    const cards   = new Map();   // person id → { gen, s0 }
    const joins   = new Map();   // family id → { gen, a, s }
    const free    = node => node && !claimed.has(node.id);
    const claim   = node => { claimed.add(node.id); return node; };

    // ── Units ──

    // An ancestor couple: the partners of a family, partner1 first.
    const coupleUnit = family => {
        claim(family);
        const cards = data.partnersOf(family).filter(free).map(claim);
        const unit  = { cards, bandAfter: new Set(), families: [] };
        if (cards.length === 2) unit.bandAfter.add(0);
        unit.families.push({ family, members: cards.length === 2 ? [0, 1] : [0] });
        return measureUnit(unit, o);
    };

    // A person with the partner of its shown family (one partner at a time, partner1 first as in a couple).
    // The person's other relationships — partners and their children — stay hidden; a badge on the card
    // says there are more (getNodeButtons) and its menu switches.
    const personUnit = person => {
        claim(person);
        out.switchable.add(person.id);
        const family  = data.shownFamily(person);
        const unit    = { cards: [person], self: 0, bandAfter: new Set(), families: [] };
        if (!free(family)) return measureUnit(unit, o);

        claim(family);
        const partner = data.otherPartner(family, person);
        if (!free(partner)) {
            unit.families.push({ family, members: [0] });   // single parent: the junction is on the card
            return measureUnit(unit, o);
        }

        claim(partner);
        unit.cards = data.slotsOf(family)[0] === partner ? [partner, person] : [person, partner];
        unit.self  = unit.cards.indexOf(person);
        unit.bandAfter.add(0);
        unit.families.push({ family, members: [0, 1] });
        return measureUnit(unit, o);
    };

    const singleUnit = person => measureUnit({ cards: [claim(person)], self: 0, bandAfter: new Set(), families: [] }, o);

    /** Puts a unit's cards and family junctions in place; spread start s0. */
    const placeUnit = (unit, gen, s0) => {
        unit.cards.forEach((card, i) => cards.set(card.id, { gen, s0: s0 + unit.offsets[i] }));
        unit.families.forEach((fam, i) => {
            joins.set(fam.family.id, { gen, a: base(gen) - JUNCTION_GAP - JUNCTION_STEP * i, s: s0 + fam.offset });
            if (fam.members.length === 2) {
                out.bands.set(fam.family.id, o.rect(base(gen), s0 + unit.offsets[fam.members[0]] + o.extent, o.depth, o.band));
            }
        });

        // One frame around all partners of the unit (drawn by its first family with two partners), so a
        // couple reads as a pair and not as two siblings.
        const owner = unit.families.find(f => f.members.length === 2);
        if (owner && unit.cards.some(isPerson)) {
            out.frames.set(owner.family.id, o.rect(base(gen) - FRAME_PAD, s0 - FRAME_PAD,
                                                   o.depth + 2 * FRAME_PAD, unit.extent + 2 * FRAME_PAD));
        }
    };

    // ── Ancestors: per person, the couple of its parents, recursively ──

    const ancestorBlock = (person, gen) => {
        if (gen > options.ancestorGenerations) return null;
        const family = data.parentFamily(person);
        if (!free(family)) return null;

        const unit = coupleUnit(family);
        if (!unit.cards.length) return null;   // both parents are already drawn elsewhere
        const block = { unit, gen, parents: [] };
        unit.cards.forEach((card, i) => {
            const parent = ancestorBlock(card, gen + 1);
            if (parent) block.parents.push({ block: parent, card: i });
        });
        return block;
    };

    // ── Descendants: per person, the person with its partners and their children, recursively ──

    const descendantBlock = (person, gen) => {
        const unit  = personUnit(person);
        const block = { unit, gen, kids: [] };
        if (gen - 1 >= -options.descendantGenerations) {
            unit.families.forEach((fam, f) => {
                for (const child of data.childrenOf(fam.family)) {
                    if (free(child)) block.kids.push({ block: descendantBlock(child, gen - 1), family: f });
                }
            });
        }
        return block;
    };

    // Subtree size along the spread axis, bottom-up (parents for ancestors, kids for descendants).
    const measure = block => {
        const below = (block.parents || block.kids).map(k => measure(k.block));
        const row   = below.reduce((sum, w) => sum + w, 0) + o.gap * Math.max(0, below.length - 1);
        block.span  = Math.max(block.unit.extent, row);
        return block.span;
    };

    const clampStart = (block, s0, wanted) => Math.min(Math.max(wanted, s0), s0 + block.span - block.unit.extent);

    // Places an ancestor block in [s0, s0 + span]; returns the spread position of its junction.
    const placeAncestors = (block, s0) => {
        const row = block.parents.reduce((sum, p) => sum + p.block.span, 0) + o.gap * Math.max(0, block.parents.length - 1);
        let s     = s0 + (block.span - row) / 2;
        const wants = [];
        for (const p of block.parents) {
            const join = placeAncestors(p.block, s);
            wants.push(join - (block.unit.offsets[p.card] + o.extent / 2));   // card centre on its parents' junction
            s += p.block.span + o.gap;
        }
        const wanted = wants.length ? wants.reduce((a, b) => a + b, 0) / wants.length : s0 + (block.span - block.unit.extent) / 2;
        const start  = clampStart(block, s0, wanted);
        placeUnit(block.unit, block.gen, start);
        return start + (block.unit.families[0]?.offset ?? block.unit.extent / 2);
    };

    // Places a descendant block in [s0, s0 + span]; returns the spread centre of its own card.
    const placeDescendants = (block, s0) => {
        const row = block.kids.reduce((sum, k) => sum + k.block.span, 0) + o.gap * Math.max(0, block.kids.length - 1);
        let s     = s0 + (block.span - row) / 2;
        const centres = block.unit.families.map(() => []);
        for (const kid of block.kids) {
            centres[kid.family].push(placeDescendants(kid.block, s));
            s += kid.block.span + o.gap;
        }
        // Each family's junction centred over its children.
        const wants = block.unit.families
            .map((fam, f) => centres[f].length ? (centres[f][0] + centres[f].at(-1)) / 2 - fam.offset : null)
            .filter(w => w != null);
        const wanted = wants.length ? wants.reduce((a, b) => a + b, 0) / wants.length : s0 + (block.span - block.unit.extent) / 2;
        const start  = clampStart(block, s0, wanted);
        placeUnit(block.unit, block.gen, start);
        return start + block.unit.offsets[block.unit.self] + o.extent / 2;
    };

    /**
     * Places a row of blocks side by side so that their anchor points (returned by place) end up, on
     * average, at `target`: first at 0 to learn where the anchors fall, then again at the shifted start.
     */
    const placeRow = (blocks, place, target) => {
        if (!blocks.length) return;
        const run = start => {
            let s = start;
            return blocks.map(b => { const at = place(b, s); s += b.span + o.gap; return at; });
        };
        const anchors = run(0);
        const mean    = anchors.reduce((a, b) => a + b, 0) / anchors.length;
        run(target - mean);
    };

    // ── Generation 0: the focus with its partners, between its siblings ──

    const focusUnit   = personUnit(focus);
    const parents     = data.parentFamily(focus);
    const siblings    = options.showSiblings && parents ? data.childrenOf(parents) : [focus];
    const row         = siblings.includes(focus) ? siblings : [focus];
    const rowUnits    = row.map(p => p === focus ? focusUnit : (free(p) ? singleUnit(p) : null)).filter(Boolean);

    let s = 0;
    for (const unit of rowUnits) {
        placeUnit(unit, 0, s);
        s += unit.extent + o.gap;
    }

    const centre = card => cards.get(card.id).s0 + o.extent / 2;

    // Ancestors of every card in the focus unit. The focus's parents are centred over all their children
    // in the row (focus and siblings), a partner's parents over that partner.
    const ancestorRoots = focusUnit.cards
        .map(card => ({ card, block: ancestorBlock(card, 1) }))
        .filter(r => r.block);
    ancestorRoots.forEach(r => measure(r.block));

    const rowCards   = rowUnits.flatMap(u => u.cards).filter(c => row.includes(c));
    const anchorOf   = card => card === focus && rowCards.length
        ? (centre(rowCards[0]) + centre(rowCards.at(-1))) / 2
        : centre(card);
    if (ancestorRoots.length) {
        const target = ancestorRoots.reduce((sum, r) => sum + anchorOf(r.card), 0) / ancestorRoots.length;
        placeRow(ancestorRoots.map(r => r.block), placeAncestors, target);
    }

    // Descendants: the children of the focus unit's families, centred under those families' junctions.
    const kids     = [];
    const withKids = new Set();
    if (options.descendantGenerations >= 1) {
        for (const fam of focusUnit.families) {
            for (const child of data.childrenOf(fam.family)) {
                if (!free(child)) continue;
                kids.push(descendantBlock(child, -1));
                withKids.add(fam.family.id);
            }
        }
    }
    kids.forEach(measure);
    if (kids.length) {
        const target = [...withKids].reduce((sum, id) => sum + joins.get(id).s, 0) / withKids.size;
        placeRow(kids, placeDescendants, target);
    }

    // ── Geometry: cards, family nodes, routes ──

    const point = (a, sp) => o.point(a, sp);
    const all   = new Map(engine.model.nodes.map(n => [n.id, n]));
    // The focus card's centre stays put (also when the orientation changes its size).
    const centreOf = node => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
    const before   = centreOf(focus);
    const fresh    = out.normalize || (!focus.x && !focus.y);
    out.normalize  = false;

    for (const [id, at] of cards) {
        const node = all.get(id);
        Object.assign(node, o.rect(base(at.gen), at.s0, o.depth, o.extent));
        out.visible.add(id);
        if (isPerson(node)) {
            out.variants.set(id, node.gender === "male" || node.gender === "female" ? node.gender : "unknown");
            out.relations.set(id, data.familiesOf(node).filter(f => !f.generated).length);
        }
    }

    // A family with one partner shown and none of its children (a single parent at the edge of the range)
    // would only be a loose stub: it is left out.
    for (const id of joins.keys()) {
        const shown = engine.model.edges.filter(e => e.targetNodeId === id && cards.has(e.sourceNodeId));
        if (shown.length < 2) joins.delete(id);
    }

    for (const [id, join] of joins) {
        const node = all.get(id);
        const p    = point(join.a, join.s);
        Object.assign(node, { x: p.x - FAMILY_SIZE / 2, y: p.y - FAMILY_SIZE / 2, width: FAMILY_SIZE, height: FAMILY_SIZE });
        out.visible.add(id);
    }

    const lanes = childLanes(engine, cards, joins, o);

    for (const edge of engine.model.edges) {
        const card = cards.get(edge.sourceNodeId);
        const join = joins.get(edge.targetNodeId);
        if (!card || !join) continue;
        const mid = card.s0 + o.extent / 2;

        if (edge.type === "partner") {
            // From the card's descendant side straight out to the junction's level, then along to it.
            out.routes.set(edge.id, [point(base(card.gen), mid), point(join.a, mid), point(join.a, join.s)]);
        } else if (edge.type === "child") {
            // From the child's ancestor side to halfway between the generations (in the family's own lane),
            // then to the junction.
            const from = base(card.gen) + o.depth;
            const half = (from + join.a) / 2 + (lanes.get(edge.targetNodeId) || 0);
            out.routes.set(edge.id, mid === join.s
                ? [point(from, mid), point(join.a, join.s)]
                : [point(from, mid), point(half, mid), point(half, join.s), point(join.a, join.s)]);
        }
    }

    // Keep the focus card where it was; a fresh model (everything at 0, 0) or a new orientation (normalize)
    // starts at the top-left.
    const after = centreOf(focus);
    let dx = before.x - after.x;
    let dy = before.y - after.y;
    if (fresh) {
        const shown = [...out.visible].map(id => all.get(id));
        dx = MARGIN - Math.min(...shown.map(n => n.x));
        dy = MARGIN - Math.min(...shown.map(n => n.y));
    }
    shift(engine, out, dx, dy);

    // The canvas starts at 0, 0: a chart that would stick out at the top or left (vertical ancestors grow
    // upwards) moves back in, even if the focus card then moves.
    const boxes = [...[...out.visible].map(id => all.get(id)), ...out.frames.values()];
    const minX  = Math.min(...boxes.map(b => b.x));
    const minY  = Math.min(...boxes.map(b => b.y));
    shift(engine, out, minX < MARGIN / 2 ? MARGIN - minX : 0, minY < MARGIN / 2 ? MARGIN - minY : 0);

    // Hidden nodes sit on the focus card (never drawn, but kept near the chart).
    for (const node of engine.model.nodes) {
        if (!out.visible.has(node.id)) Object.assign(node, { x: focus.x, y: focus.y });
    }
}

/**
 * Child lines of different families in the same gap between two generations get their own vertical lane
 * where their spans overlap — otherwise a partner's line to its parents seems to continue the bus of the
 * siblings beside it. Returns family id → offset along the generation axis (0 for the usual middle).
 */
function childLanes(engine, cards, joins, o) {
    const spans = new Map();   // family id → { gen, lo, hi } along the spread axis
    for (const edge of engine.model.edges) {
        const card = cards.get(edge.sourceNodeId);
        const join = joins.get(edge.targetNodeId);
        if (edge.type !== "child" || !card || !join) continue;
        const mid  = card.s0 + o.extent / 2;
        const span = spans.get(edge.targetNodeId) || { gen: card.gen, lo: join.s, hi: join.s };
        spans.set(edge.targetNodeId, { gen: span.gen, lo: Math.min(span.lo, mid), hi: Math.max(span.hi, mid) });
    }

    const lanes = new Map();
    const byGen = new Map();
    for (const [id, span] of spans) {
        if (span.hi - span.lo < 1) continue;   // a straight line needs no lane
        if (!byGen.has(span.gen)) byGen.set(span.gen, []);
        byGen.get(span.gen).push({ id, ...span });
    }

    for (const list of byGen.values()) {
        list.sort((a, b) => a.lo - b.lo);
        const ends   = [];   // per lane: where its last span ends
        const picked = list.map(span => {
            let lane = ends.findIndex(end => end < span.lo - 1);
            if (lane < 0) lane = ends.length;
            ends[lane] = span.hi;
            return lane;
        });
        const step = Math.min(LANE_STEP, LANE_ROOM / Math.max(1, ends.length - 1));
        list.forEach((span, i) => lanes.set(span.id, (picked[i] - (ends.length - 1) / 2) * step));
    }
    return lanes;
}

/** Moves every visible node, marriage band and route by (dx, dy). */
function shift(engine, out, dx, dy) {
    if (!dx && !dy) return;
    const move = p => ({ ...p, x: p.x + dx, y: p.y + dy });
    for (const node of engine.model.nodes) {
        if (out.visible.has(node.id)) Object.assign(node, move(node));
    }
    for (const [id, points] of out.routes) out.routes.set(id, points.map(move));
    for (const [id, band] of out.bands) out.bands.set(id, move(band));
    for (const [id, frame] of out.frames) out.frames.set(id, move(frame));
}

// ── Shapes ──────────────────────────────────────────────────

function createShapes(out, settings, uid) {
    const person = (node, engine) => {
        const { x, y, width: w, height: h } = node;
        const style = engine.getNodeStyle(node);
        const group = svgEl("g", {});

        // The focus card stands out: a halo around it, a tint of its gender colour and a full-colour border.
        if (node.focus) {
            group.appendChild(svgEl("rect", {
                x: x - 4, y: y - 4, width: w + 8, height: h + 8, rx: RADIUS + 4,
                fill: "none", stroke: style.stroke, "stroke-width": "3", "stroke-opacity": "0.3",
                "pointer-events": "none", class: "weavle-pedigree-halo"
            }));
        }

        const rect = svgEl("rect", { x, y, width: w, height: h, rx: RADIUS, class: "weavle-pedigree-card" });
        engine.applyNodeStyle(rect, node);
        // The border is a soft version of the gender colour; the focus card gets the full colour.
        rect.setAttribute("stroke-opacity", node.focus ? "1" : "0.35");
        if (node.focus) rect.setAttribute("stroke-width", "2");
        group.appendChild(rect);

        if (node.focus) {
            group.appendChild(svgEl("rect", {
                x, y, width: w, height: h, rx: RADIUS, fill: style.stroke, "fill-opacity": "0.14",
                "pointer-events": "none", class: "weavle-pedigree-focus-tint"
            }));
        }

        // Gender bar, rounded with the card: on the left (horizontal) or along the top (vertical).
        const vertical = settings.orientation === "vertical";
        group.appendChild(svgEl("path", {
            d: vertical
                ? `M ${x} ${y + BAR} V ${y + RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${x + RADIUS} ${y} ` +
                  `H ${x + w - RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${x + w} ${y + RADIUS} V ${y + BAR} Z`
                : `M ${x + BAR} ${y} A ${RADIUS} ${RADIUS} 0 0 0 ${x} ${y + RADIUS} V ${y + h - RADIUS} ` +
                  `A ${RADIUS} ${RADIUS} 0 0 0 ${x + BAR} ${y + h} Z`,
            fill: style.stroke, "pointer-events": "none", class: "weavle-pedigree-bar"
        }));

        const clipId = `weavle-pedigree-${uid}-${node.id.replace(/[^\w-]/g, "_")}`;
        group.appendChild(vertical
            ? avatar(node, x + w / 2, y + V_AVATAR_Y, V_AVATAR_R, clipId)
            : avatar(node, x + AVATAR_X, y + h / 2, AVATAR_R, clipId));

        // Years and reference id below the name, cut off with "…": one line next to each other (horizontal) or
        // each on its own line (vertical, the card is narrow).
        const lines = vertical
            ? [lifespan(node), node.refId].filter(Boolean)
            : [[lifespan(node), node.refId].filter(Boolean).join(" • ")].filter(Boolean);
        const width = vertical ? w - 2 * V_PAD : w - TEXT_LEFT - TEXT_RIGHT;
        lines.forEach((value, i) => {
            const text = svgEl("text", {
                x: vertical ? x + w / 2 : x + TEXT_LEFT,
                y: vertical ? y + V_DATES_Y + i * (DATES_SIZE + 3) : y + h / 2 + 14,
                "text-anchor": vertical ? "middle" : "start", "font-size": DATES_SIZE,
                fill: style.textColor || "#1F2933", "fill-opacity": "0.65", "pointer-events": "none",
                class: "weavle-pedigree-dates"
            });
            text.textContent = engine.wrapLabel(value, width, 1, DATES_SIZE, { fontWeight: "normal" }).lines[0] || "";
            group.appendChild(text);
        });
        return group;
    };

    // The junction itself is not drawn. The frame around the partners (family nodes come before the persons
    // in the model, so it lies under their cards) and the marriage details in the band between them.
    const family = node => {
        const group = svgEl("g", {});
        const frame = out.frames.get(node.id);
        if (frame) {
            group.appendChild(svgEl("rect", {
                ...frame, rx: RADIUS + FRAME_PAD, fill: "#F2F4F7", stroke: "#D5DBE2",
                "pointer-events": "none", class: "weavle-pedigree-couple"
            }));
        }

        const band = out.bands.get(node.id);
        const text = marriageText(node);
        if (!band || !text) return group;

        // Vertical: no room for text between partners side by side — a ring icon, the details as its tooltip.
        if (settings.orientation === "vertical") {
            const cx   = band.x + band.width / 2;
            const cy   = band.y + band.height / 2;
            const ring = svgEl("g", { class: "weavle-pedigree-ring" });
            const tip  = svgEl("title", {});
            tip.textContent = text;
            ring.appendChild(tip);
            ring.appendChild(svgEl("circle", { cx, cy, r: 8, fill: "transparent" }));   // hover area
            ring.appendChild(svgEl("circle", { cx: cx - 2.6, cy, r: 4.2, fill: "none", stroke: "#8A94A3", "stroke-width": 1.3 }));
            ring.appendChild(svgEl("circle", { cx: cx + 2.6, cy, r: 4.2, fill: "none", stroke: "#8A94A3", "stroke-width": 1.3 }));
            group.appendChild(ring);
            return group;
        }

        const label = svgEl("text", {
            x: band.x + TEXT_LEFT,
            y: band.y + band.height / 2 + MARRIAGE_SIZE * 0.35,
            "font-size": MARRIAGE_SIZE, fill: "#5B6573", "pointer-events": "none", class: "weavle-pedigree-marriage"
        });
        label.textContent = text;
        group.appendChild(label);
        return group;
    };

    // An empty slot: a dashed card with a "+" where the avatar would be; the text is the engine label.
    const placeholder = (node, engine) => {
        const { x, y, width: w, height: h } = node;
        const style    = engine.getNodeStyle(node);
        const vertical = settings.orientation === "vertical";
        const group    = svgEl("g", {});

        const rect = svgEl("rect", { x, y, width: w, height: h, rx: RADIUS, class: "weavle-pedigree-placeholder" });
        engine.applyNodeStyle(rect, node);
        group.appendChild(rect);

        const cx = vertical ? x + w / 2 : x + AVATAR_X;
        const cy = vertical ? y + V_AVATAR_Y : y + h / 2;
        const r  = vertical ? V_AVATAR_R * 0.7 : AVATAR_R * 0.8;
        group.appendChild(svgEl("circle", { cx, cy, r, fill: "#E8ECF0", "pointer-events": "none" }));
        group.appendChild(svgEl("path", {
            d: `M ${cx - r * 0.45} ${cy} H ${cx + r * 0.45} M ${cx} ${cy - r * 0.45} V ${cy + r * 0.45}`,
            stroke: style.textColor || "#5B6573", "stroke-width": 2, "stroke-linecap": "round", "pointer-events": "none"
        }));
        return group;
    };

    return { person, family, placeholder };
}

/** A round photo, or a grey silhouette when there is none. */
function avatar(node, cx, cy, r, clipId) {
    const group = svgEl("g", { "pointer-events": "none", class: "weavle-pedigree-avatar" });
    group.appendChild(svgEl("circle", { cx, cy, r, fill: "#EEF1F4", stroke: "#D5DAE0" }));

    if (node.photoUrl) {
        const clip = svgEl("clipPath", { id: clipId });
        clip.appendChild(svgEl("circle", { cx, cy, r: r - 0.5 }));
        group.appendChild(clip);
        const image = svgEl("image", {
            href: node.photoUrl, x: cx - r, y: cy - r, width: 2 * r, height: 2 * r,
            preserveAspectRatio: "xMidYMid slice", "clip-path": `url(#${clipId})`
        });
        group.appendChild(image);
        return group;
    }

    group.appendChild(svgEl("circle", { cx, cy: cy - r * 0.22, r: r * 0.34, fill: "#B8C0CA" }));
    group.appendChild(svgEl("path", {
        d: `M ${cx - r * 0.62} ${cy + r * 0.72} A ${r * 0.62} ${r * 0.5} 0 0 1 ${cx + r * 0.62} ${cy + r * 0.72} Z`,
        fill: "#B8C0CA"
    }));
    return group;
}

// The definition's own colours (ARCHITECTURE.md 7.4). Variants come from the gender (getNodeVariant).
const PEDIGREE_THEME = {
    nodeTypes: {
        person: { fill: "#FFFFFF", stroke: "#8A94A3", textColor: "#1F2933", fontWeight: "600" },
        family: { fill: "none", stroke: "none" },
        placeholder: { fill: "#FAFBFC", stroke: "#A7B0BB", textColor: "#5B6573", fontWeight: "normal", dash: "5,4" }
    },
    nodeVariants: {
        male:    { stroke: "#3B82C4" },
        female:  { stroke: "#D9487A" },
        unknown: { stroke: "#8A94A3" }
    },
    edgeTypes: {
        partner: { stroke: "#9AA3AE" },
        child:   { stroke: "#9AA3AE" }
    }
};

// ── Flat lists ──────────────────────────────────────────────

const str = value => value == null ? "" : String(value);

/** A year as a number when it is one; 0, "" and null mean unknown (OutSystems sends 0 for empty). */
function year(value) {
    if (value == null || value === "" || value === 0 || value === "0") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
}

function gender(value) {
    const g = str(value).trim().toLowerCase();
    if (["male", "m", "man"].includes(g)) return "male";
    if (["female", "f", "v", "vrouw", "woman"].includes(g)) return "female";
    return "unknown";
}

/**
 * Builds a pedigree model from the host's data:
 *   { focusId, persons: [{ id, name, gender, birthYear, deathYear, living, refId, photoUrl, parentFamilyId,
 *     preferredFamilyId, hasMoreAncestors, hasMoreDescendants }], families: [{ id, partner1Id, partner2Id,
 *     marriageDate, marriagePlace }] }
 * preferredFamilyId: the relationship shown with a person that has several (default the last).
 * Unknown references are left out. Without focusId the first person is the focus. Positions don't
 * matter — the layout runs on load.
 */
export function pedigreeFromList(data) {
    const source   = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    const persons  = Array.isArray(source.persons) ? source.persons : [];
    const families = Array.isArray(source.families) ? source.families : [];

    const personIds = new Set(persons.map(p => str(p.id)));
    const familyIds = new Set(families.map(f => str(f.id)));
    const focusId   = personIds.has(str(source.focusId)) ? str(source.focusId) : str(persons[0]?.id);

    const nodes = [];
    const edges = [];

    for (const item of persons) {
        const id   = str(item.id);
        const node = {
            id: personNodeId(id), type: "person", hostId: id,
            label: str(item.name ?? item.label), gender: gender(item.gender),
            x: 0, y: 0, width: HORIZONTAL.depth, height: HORIZONTAL.extent
        };
        const born = year(item.birthYear);
        const died = year(item.deathYear);
        if (born !== undefined) node.birthYear = born;
        if (died !== undefined) node.deathYear = died;
        if (item.living === true) node.living = true;
        if (item.refId) node.refId = str(item.refId);
        if (item.photoUrl) node.photoUrl = str(item.photoUrl);
        if (item.hasMoreAncestors === true) node.hasMoreAncestors = true;
        if (item.hasMoreDescendants === true) node.hasMoreDescendants = true;
        if (item.preferredFamilyId && familyIds.has(str(item.preferredFamilyId))) {
            node.preferredFamilyId = familyNodeId(str(item.preferredFamilyId));
        }
        if (id === focusId) node.focus = true;
        nodes.push(node);

        const parentFamily = str(item.parentFamilyId);
        if (parentFamily && familyIds.has(parentFamily)) {
            edges.push({
                id: `child:${id}`, type: "child", sourceNodeId: node.id, targetNodeId: familyNodeId(parentFamily),
                sourceHandle: "right", targetHandle: "left"
            });
        }
    }

    for (const item of families) {
        const id   = str(item.id);
        const node = {
            id: familyNodeId(id), type: "family", hostId: id, label: "",
            x: 0, y: 0, width: FAMILY_SIZE, height: FAMILY_SIZE
        };
        if (item.marriageDate) node.marriageDate = str(item.marriageDate);
        if (item.marriagePlace) node.marriagePlace = str(item.marriagePlace);
        nodes.push(node);

        [item.partner1Id, item.partner2Id].forEach((partner, i) => {
            const pid = str(partner);
            if (!pid || !personIds.has(pid)) return;
            edges.push({
                id: `partner:${id}:${i + 1}`, type: "partner", slot: i + 1,
                sourceNodeId: personNodeId(pid), targetNodeId: node.id, sourceHandle: "left", targetHandle: "right"
            });
        });
    }

    // Families first: the engine draws in model order, and a family draws the frame under its partners' cards.
    return { nodes: [...nodes.filter(isFamily), ...nodes.filter(isPerson)], edges };
}

/**
 * The model as the host's data: { focusId, persons, families } (same fields as pedigreeFromList; unknown
 * years are 0, empty ids ""). View state (focus aside) is not part of it.
 */
export function pedigreeToList(model) {
    const nodes     = (model?.nodes || []).filter(n => !n.generated);   // empty slots are not data
    const byId      = new Map(nodes.map(n => [n.id, n]));
    const parentOf  = new Map();
    const partners  = new Map();

    for (const edge of (model?.edges || []).filter(e => !e.generated)) {
        const person = byId.get(edge.sourceNodeId);
        const family = byId.get(edge.targetNodeId);
        if (!person || !family) continue;
        if (edge.type === "child" && !parentOf.has(person.id)) parentOf.set(person.id, family.hostId);
        if (edge.type === "partner") {
            const slots = partners.get(family.id) || ["", ""];
            slots[edge.slot === 2 ? 1 : 0] = person.hostId;
            partners.set(family.id, slots);
        }
    }

    const focus = nodes.find(n => isPerson(n) && n.focus);

    return {
        focusId: focus?.hostId || "",
        persons: nodes.filter(isPerson).map(n => ({
            id:                 n.hostId,
            name:               n.label || "",
            gender:             n.gender || "unknown",
            birthYear:          n.birthYear || 0,
            deathYear:          n.deathYear || 0,
            living:             !!n.living,
            refId:              n.refId || "",
            photoUrl:           n.photoUrl || "",
            parentFamilyId:     parentOf.get(n.id) || "",
            preferredFamilyId:  byId.get(n.preferredFamilyId)?.hostId || "",
            hasMoreAncestors:   !!n.hasMoreAncestors,
            hasMoreDescendants: !!n.hasMoreDescendants
        })),
        families: nodes.filter(isFamily).map(n => {
            const [partner1Id, partner2Id] = partners.get(n.id) || ["", ""];
            return {
                id:            n.hostId,
                partner1Id,
                partner2Id,
                marriageDate:  n.marriageDate || "",
                marriagePlace: n.marriagePlace || ""
            };
        })
    };
}

// ── Actions and requests ────────────────────────────────────

const hostIdOf     = node => (node && !node.generated && node.hostId) || null;
const realFamilies = (person, data) => data.familiesOf(person).filter(f => !f.generated);

/** "met Peter Jansen (1982)", "zonder partner". */
function relationLabel(family, person, data) {
    const partner = data.otherPartner(family, person);
    const when    = family.marriageDate ? ` (${family.marriageDate})` : "";
    return isPerson(partner || {}) ? `met ${partner.label}${when}` : `zonder partner${when}`;
}

/** The add menu of a person (submenu rows): parents that are missing, a partner, a child, a brother or sister. */
function addActions(person, data) {
    const ask     = (request, label, detail, icon = "plus") => ({ type: "pdRequest", request, label, icon, detail });
    const parents = data.parentFamily(person);
    const [p1, p2] = parents ? data.slotsOf(parents) : [null, null];
    const parentId = hostIdOf(parents);
    const actions  = [];

    if (!isPerson(p1 || {})) actions.push(ask("addparent", "Vader toevoegen", { role: "father", familyId: parentId }));
    if (!isPerson(p2 || {})) actions.push(ask("addparent", "Moeder toevoegen", { role: "mother", familyId: parentId }));

    // A partner goes into a family of this person with an empty slot, else a new family.
    const families = realFamilies(person, data);
    const open     = families.find(f => !isPerson(data.otherPartner(f, person) || {}));
    actions.push(ask("addpartner", "Partner toevoegen", { familyId: hostIdOf(open) }));
    actions.push(ask("addsibling", "Broer of zus toevoegen", { familyId: parentId }));

    // A child: within the person's relationship, or (with several) chosen under a heading — last, so the
    // heading's rows end the menu.
    if (families.length > 1) {
        actions.push(
            { type: "heading", label: "Kind toevoegen" },
            ...families.map(f => ask("addchild", relationLabel(f, person, data), { familyId: hostIdOf(f) })),
            ask("addchild", "zonder (nieuwe) partner", { familyId: null })
        );
    } else {
        actions.push(ask("addchild", "Kind toevoegen", { familyId: hostIdOf(families[0]) }));
    }
    return actions;
}

/** One entry per relationship of a person; the one shown is marked. */
function relationActions(person, data) {
    const shown = data.shownFamily(person);
    return realFamilies(person, data).map(f => ({
        type: "pdShowFamily", familyId: f.id, label: relationLabel(f, person, data), active: f === shown
    }));
}

/** The request behind an empty slot: { name, payload } for the event. */
function placeholderRequest(node, engine) {
    const person = engine.getNode(node.forId);
    const edge   = engine.model.edges.find(e => e.sourceNodeId === node.id || e.targetNodeId === node.id);
    const family = edge && engine.getNode(edge.targetNodeId);
    if (!person) return null;

    switch (node.role) {
        case "father":
        case "mother":
            // The empty parent's family is the person's parent family (generated when both are unknown).
            return { name: "addparent", payload: { personId: person.hostId, role: node.role, familyId: hostIdOf(family) } };
        case "partner":
            return { name: "addpartner", payload: { personId: person.hostId, familyId: null } };
        case "child":
            return { name: "addchild", payload: { personId: person.hostId, familyId: hostIdOf(family) } };
        default:
            return null;
    }
}

// ── Definition ──────────────────────────────────────────────

/**
 * Pedigree (family tree): an hourglass around a focus person, laid out automatically. Options:
 *   ancestorGenerations    generations of ancestors shown (default 3)
 *   descendantGenerations  generations of descendants shown (default 2)
 *   showSiblings           the focus's siblings beside it (default true)
 *   orientation            "horizontal" (default, ancestors to the right) | "vertical" (ancestors at the top)
 */
export function createPedigreeDefinition(options = {}) {
    const settings = { ...DEFAULT_OPTIONS, ...options };
    if (!ORIENTATIONS[settings.orientation]) settings.orientation = "horizontal";

    // From the last layout: routes per edge id, visible node ids, marriage bands and couple frames per
    // family id, the gender variant and number of relationships per person, and the persons whose shown
    // relationship can be switched (focus and descendants).
    const out = { routes: new Map(), visible: new Set(), bands: new Map(), frames: new Map(), variants: new Map(),
                  relations: new Map(), switchable: new Set(), normalize: false };

    // Every request gets an id the host passes back (applyChanges, step 4).
    let requestCount = 0;
    const request = (engine, name, payload) => {
        engine.clearNodeToolSurface?.();
        engine.emitDiagramEvent(name, { requestId: `r${++requestCount}`, ...payload });
    };

    return {
        id: "pedigree",
        shapes: createShapes(out, settings, ++instanceCount),
        defaultTheme: PEDIGREE_THEME,

        nodeTypes: {
            person:      { defaultLabel: "Naam", title: "Persoon",   shape: "person" },
            family:      { defaultLabel: "",     title: "Gezin",     shape: "family" },
            placeholder: { defaultLabel: "",     title: "Lege plek", shape: "placeholder" }
        },

        // The host builds the tree; nothing to place freely.
        palette: [],

        interaction: { dragNodes: false, connect: false, selectEdges: false },

        defaultEdgeType: "child",

        edgeTypes: {
            // fixed: the engine keeps the type instead of re-deriving it from the endpoints.
            partner: { router: "straight", marker: "none", strokeWidth: 1.5, fixed: true },
            child:   { router: "straight", marker: "none", strokeWidth: 1.5, fixed: true }
        },

        getEdgeTypeForConnection() {
            return "child";
        },

        modelFromList: pedigreeFromList,
        modelToList:   pedigreeToList,

        createInitialModel() {
            return pedigreeFromList({ focusId: "1", persons: [{ id: "1", name: "Naam", gender: "unknown" }] });
        },

        layoutDiagram(engine) {
            layoutPedigree(engine, settings, out);
        },

        isNodeHidden(node) {
            return !out.visible.has(node.id);
        },

        getNodeVariant(node) {
            return out.variants.get(node.id) || null;
        },

        // Elbow lines from the last layout; an edge the layout did not place has no line.
        routeEdge({ sourcePoint, edge }) {
            return out.routes.get(edge?.id) || [sourcePoint, sourcePoint];
        },

        // The data belongs to the host: nothing is deleted, edited or resized in the chart.
        canDeleteNode() {
            return false;
        },

        getEditTarget() {
            return false;
        },

        getCanvasActions() {
            return [];
        },

        // Node tools of a person: everything (a click on the card), or the "+" button's add menu, or the
        // relationship badge's menu. Empty slots have none (a click on them is the request itself).
        getContextActions(node, engine, { menu } = {}) {
            if (!isPerson(node)) return [];
            const data      = readPedigree(engine);
            const add       = { type: "group", label: "Toevoegen", icon: "plus", children: addActions(node, data) };
            const relations = { type: "group", label: "Relatie tonen", icon: "branch", children: relationActions(node, data) };
            if (menu === "add") return [add];
            if (menu === "partners") return [relations];

            const actions = [add];
            if (relations.children.length > 1 && out.switchable.has(node.id)) actions.push(relations);
            actions.push(
                { type: "pdRequest", request: "editperson", label: "Bewerken", icon: "edit" },
                { type: "pdRequest", request: "removeperson", label: "Verwijderen", icon: "delete", danger: true }
            );
            return actions;
        },

        // A click on an empty slot asks the host to fill it.
        getNodeClickAction(node) {
            return isPlaceholder(node) ? { type: "pdPlaceholder" } : null;
        },

        // On a person: "+" (top right, while hovered or selected) opens the add menu; with several
        // relationships a badge on the top edge shows how many (also read-only and in the export) and opens
        // the menu to pick the one shown.
        getNodeButtons(node) {
            if (!isPerson(node) || !out.visible.has(node.id)) return [];
            const buttons = [{
                action: { type: "openNodeTools", menu: "add" }, icon: "plus", title: "Toevoegen", show: "hover",
                x: node.x + node.width - 13, y: node.y + 14
            }];

            const count = out.relations.get(node.id) || 0;
            if (count > 1) {
                const switchable = out.switchable.has(node.id);
                buttons.push({
                    action: switchable ? { type: "openNodeTools", menu: "partners" } : null,
                    x: node.x + node.width - 44, y: node.y, text: String(count), path: RINGS_PATH,
                    title: `${count} relaties` + (switchable ? " — klik om een andere te tonen" : ""),
                    fill: "#5B6573", readOnly: true, keepInExport: true
                });
            }
            return buttons;
        },

        // Requests go to the host as diagram events; the chart itself changes nothing (ARCHITECTURE.md 6,
        // "Events"). Showing another relationship is view state: a new layout without an undo step.
        handleAction(action, node, engine) {
            switch (action.type) {
                case "pdRequest":
                    request(engine, action.request, { personId: node.hostId, ...(action.detail || {}) });
                    return false;

                case "pdPlaceholder": {
                    const detail = placeholderRequest(node, engine);
                    if (detail) request(engine, detail.name, detail.payload);
                    return false;
                }

                case "pdShowFamily": {
                    const family = engine.getNode(action.familyId);
                    if (!family || node.shownFamilyId === family.id) return false;
                    node.shownFamilyId = family.id;
                    engine.applyDiagramLayout();
                    engine.render();
                    engine.refreshNodeToolSurface();
                    engine.emitDiagramEvent("preferredpartnerchanged", { personId: node.hostId, familyId: family.hostId || null });
                    return false;
                }

                default:
                    return false;
            }
        },

        getDefaultSize(type) {
            const o = orientationOf(settings.orientation);
            return type === "family"
                ? { width: FAMILY_SIZE, height: FAMILY_SIZE }
                : o.rect(0, 0, o.depth, o.extent);
        },

        /** "horizontal" (ancestors to the right) or "vertical" (ancestors at the top). */
        getOrientation() {
            return settings.orientation;
        },

        /**
         * Switches between "horizontal" and "vertical": a new layout without an undo step. The chart starts
         * again at the canvas's top-left and the view pans so the focus card stays where it was on screen.
         */
        setOrientation(orientation, engine) {
            if (!ORIENTATIONS[orientation] || orientation === settings.orientation) return false;
            const focus  = engine.model.nodes.find(n => isPerson(n) && n.focus);
            const centre = () => ({ x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 });
            const before = focus && centre();

            settings.orientation = orientation;
            out.normalize = true;
            engine.applyDiagramLayout();

            if (focus) {
                const after = centre();
                engine.state.panX += (before.x - after.x) * engine.state.zoom;
                engine.state.panY += (before.y - after.y) * engine.state.zoom;
            }
            engine.clearNodeToolSurface?.();
            engine.render();
            engine.emitDiagramEvent("orientationchanged", { orientation });
            return true;
        },

        getNodeInteractionMode() {
            return "action-surface";
        },

        // Horizontal: the name on the first line, right of the avatar. Vertical: up to two centred lines
        // below the avatar. The dates line is drawn by the shape.
        // An empty slot's text sits where a name would, centred on the card's height (horizontal).
        getLabelLayout(node) {
            if (isFamily(node)) return { placement: "inside", fontSize: 1, maxLines: 1 };
            const empty = isPlaceholder(node);
            if (settings.orientation === "vertical") {
                return {
                    placement: "inside", fontSize: NAME_SIZE, maxLines: 2, paddingX: V_PAD, paddingY: 0,
                    offsetY: V_NAME_Y - VERTICAL.depth / 2
                };
            }
            return {
                placement: "inside", align: "start", fontSize: NAME_SIZE, maxLines: 1,
                paddingX: (TEXT_LEFT + TEXT_RIGHT) / 2, paddingY: 0,
                offsetX: (TEXT_LEFT - TEXT_RIGHT) / 2, offsetY: empty ? 0 : -9
            };
        },

        getResizeRules() {
            return false;
        }
    };
}
