/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  Complex BPMN sample: "Bestelling tot levering" (order to delivery).

  Three participants — Klant, Webshop (lanes Verkoop / Magazijn / Financiën) and Vervoerder —
  with message flows between them, exclusive and parallel gateways, data, an annotation and a
  broad mix of event and activity types. Nodes are placed by their centre, on the 20px grid.
*/

const task  = (id, type, cx, cy, label) => ({ id, type, x: cx - 70, y: cy - 40, width: 140, height: 80, label });
const event = (id, type, cx, cy, label) => ({ id, type, x: cx - 20, y: cy - 20, width: 40,  height: 40, label });
const gate  = (id, type, cx, cy, label) => ({ id, type, x: cx - 30, y: cy - 30, width: 60,  height: 60, label });
const edge  = (id, sourceNodeId, sourceHandle, targetNodeId, targetHandle, label = "") =>
    ({ id, sourceNodeId, sourceHandle, targetNodeId, targetHandle, label });

const POOL_X = 40;
const POOL_W = 2400;

export function createOrderProcessSample() {
    const nodes = [
        // ── Pools and lanes ──────────────────────────────────
        { id: "p_klant",      type: "pool",     x: POOL_X,      y: 40,  width: POOL_W,      height: 160, label: "Klant" },

        { id: "p_webshop",    type: "pool",     x: POOL_X,      y: 260, width: POOL_W,      height: 660, label: "Webshop" },
        { id: "l_verkoop",    type: "swimlane", x: POOL_X + 30, y: 260, width: POOL_W - 30, height: 260, label: "Verkoop" },
        { id: "l_magazijn",   type: "swimlane", x: POOL_X + 30, y: 520, width: POOL_W - 30, height: 200, label: "Magazijn" },
        { id: "l_financien",  type: "swimlane", x: POOL_X + 30, y: 720, width: POOL_W - 30, height: 200, label: "Financiën" },

        { id: "p_vervoerder", type: "pool",     x: POOL_X,      y: 980, width: POOL_W,      height: 160, label: "Vervoerder" },

        // ── Klant ────────────────────────────────────────────
        event("k_start",  "startEvent",        160,  120, "Product nodig"),
        task ("k_order",  "userTask",          340,  120, "Bestelling plaatsen"),
        event("k_conf",   "messageCatchEvent", 1420, 120, "Bevestiging ontvangen"),
        event("k_pakket", "messageCatchEvent", 2140, 120, "Pakket ontvangen"),
        event("k_end",    "endEvent",          2320, 120, "Klaar"),

        // ── Webshop / Verkoop ────────────────────────────────
        event("w_start",   "messageStartEvent", 340,  440, "Order ontvangen"),
        task ("w_check",   "serviceTask",       520,  440, "Voorraad controleren"),
        gate ("w_gw",      "exclusiveGateway",  700,  440, "Op voorraad?"),
        task ("w_inform",  "sendTask",          880,  320, "Klant informeren"),
        event("w_cancel",  "terminateEndEvent", 1060, 320, "Order geannuleerd"),
        gate ("w_split",   "parallelGateway",   880,  440, ""),
        task ("w_confirm", "sendTask",          1420, 440, "Bevestiging sturen"),
        { id: "d_order", type: "dataObject", x: 400, y: 290, width: 40, height: 60, label: "Order" },
        { id: "a_note",  type: "annotation", x: 1690, y: 290, width: 180, height: 60, label: "Ophalen uiterlijk 16:00" },

        // ── Webshop / Magazijn ───────────────────────────────
        { id: "d_db", type: "dataStore", x: 490, y: 595, width: 60, height: 50, label: "Voorraad" },
        task ("w_pick",    "userTask",          1060, 620, "Order picken"),
        task ("w_pack",    "manualTask",        1240, 620, "Inpakken"),
        gate ("w_join",    "parallelGateway",   1420, 620, ""),
        task ("w_ship",    "sendTask",          1600, 620, "Verzending aanmelden"),
        event("w_wait",    "timerCatchEvent",   1780, 620, "Wacht op ophalen"),
        event("w_done",    "endEvent",          1960, 620, "Order afgerond"),

        // ── Webshop / Financiën ──────────────────────────────
        task ("w_invoice",  "businessRuleTask", 1060, 820, "Factuurbedrag bepalen"),
        task ("w_send_inv", "sendTask",         1240, 820, "Factuur versturen"),

        // ── Vervoerder ───────────────────────────────────────
        event("v_start",   "messageStartEvent", 1600, 1060, "Aanmelding ontvangen"),
        task ("v_pickup",  "task",              1960, 1060, "Pakket ophalen"),
        task ("v_deliver", "task",              2140, 1060, "Pakket bezorgen"),
        event("v_end",     "endEvent",          2320, 1060, "Bezorgd")
    ];

    // Edge types (sequence / message flow, (data) association) are derived by the BPMN definition.
    const edges = [
        // Klant
        edge("e_k1", "k_start",  "right",  "k_order",  "left"),
        edge("e_k2", "k_order",  "right",  "k_conf",   "left"),
        edge("e_k3", "k_conf",   "right",  "k_pakket", "left"),
        edge("e_k4", "k_pakket", "right",  "k_end",    "left"),

        // Webshop
        edge("e_w1",  "w_start",    "right",  "w_check",    "left"),
        edge("e_w2",  "w_check",    "right",  "w_gw",       "left"),
        edge("e_w3",  "w_gw",       "top",    "w_inform",   "left", "nee"),
        edge("e_w4",  "w_inform",   "right",  "w_cancel",   "left"),
        edge("e_w5",  "w_gw",       "right",  "w_split",    "left", "ja"),
        edge("e_w6",  "w_split",    "bottom", "w_pick",     "left"),
        edge("e_w7",  "w_split",    "bottom", "w_invoice",  "left"),
        edge("e_w8",  "w_pick",     "right",  "w_pack",     "left"),
        edge("e_w9",  "w_pack",     "right",  "w_join",     "left"),
        edge("e_w10", "w_invoice",  "right",  "w_send_inv", "left"),
        edge("e_w11", "w_send_inv", "right",  "w_join",     "bottom"),
        edge("e_w12", "w_join",     "top",    "w_confirm",  "bottom"),
        edge("e_w13", "w_confirm",  "right",  "w_ship",     "top"),
        edge("e_w14", "w_ship",     "right",  "w_wait",     "left"),
        edge("e_w15", "w_wait",     "right",  "w_done",     "left"),

        // Data and annotation
        edge("e_d1", "w_check", "top",    "d_order", "right"),   // side port: stays clear of the label below
        edge("e_d2", "w_check", "bottom", "d_db",    "top"),
        edge("e_a1", "a_note",  "bottom", "w_wait",  "top"),

        // Vervoerder
        edge("e_v1", "v_start",  "right", "v_pickup",  "left"),
        edge("e_v2", "v_pickup", "right", "v_deliver", "left"),
        edge("e_v3", "v_deliver", "right", "v_end",    "left"),

        // Message flows between the participants
        edge("m_1", "k_order",   "bottom", "w_start",  "top"),
        edge("m_2", "w_confirm", "top",    "k_conf",   "bottom"),
        edge("m_3", "w_ship",    "bottom", "v_start",  "top"),
        edge("m_4", "v_deliver", "top",    "k_pakket", "bottom")
    ];

    return { nodes, edges };
}
