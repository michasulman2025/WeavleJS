/*
  Sample fault tree for the playground: why a data centre goes down. Uses every gate type except XOR
  and priority AND, and every event type. Positions don't matter — the FTA definition lays everything
  out on load.
*/

const TREE = {
    type: "topEvent", label: "Datacenter valt uit", gate: "orGate", inputs: [
        { type: "event", label: "Stroomvoorziening valt weg", gate: "andGate", inputs: [
            { type: "basicEvent", label: "Netstroom valt uit" },
            { type: "event", label: "Noodstroom faalt", gate: "orGate", inputs: [
                { type: "basicEvent", label: "Aggregaat start niet", style: { preset: "critical" } },
                { type: "basicEvent", label: "UPS-accu leeg" },
                { type: "undevelopedEvent", label: "Brandstof op" },
                { type: "houseEvent", label: "Aggregaat in onderhoud" }
            ] }
        ] },
        { type: "event", label: "Koeling schiet tekort", gate: "votingGate", k: 2, inputs: [
            { type: "basicEvent", label: "Koelunit A defect" },
            { type: "basicEvent", label: "Koelunit B defect" },
            { type: "basicEvent", label: "Koelunit C defect" }
        ] },
        { type: "event", label: "Brand in serverruimte", gate: "inhibitGate", inputs: [
            { type: "basicEvent", label: "Kortsluiting in rack" }
        ], condition: "Blusinstallatie buiten werking" },
        { type: "transfer", label: "Netwerkstoring (zie boom N1)" }
    ]
};

export function createDatacenterOutageSample() {
    const nodes = [];
    const edges = [];
    let n = 0;

    // style: a preset of the theme (shown only when the theme has it, e.g. the playground's house style).
    const add = (type, label, parent, extra = {}) => {
        const id = `${type}-${++n}`;
        nodes.push({ id, type, label, x: 0, y: 0, width: 0, height: 0, ...extra });
        if (parent) {
            edges.push({ id: `link-${n}`, sourceNodeId: id, targetNodeId: parent, sourceHandle: "top", targetHandle: "bottom" });
        }
        return id;
    };

    const addEvent = (event, parent) => {
        const id = add(event.type, event.label, parent, event.style ? { style: event.style } : {});
        if (!event.gate) return id;

        const gate = add(event.gate, "", id, event.k ? { k: event.k } : {});
        event.inputs.forEach(input => addEvent(input, gate));
        if (event.condition) add("conditionEvent", event.condition, gate);
        return id;
    };

    addEvent(TREE, null);
    Object.assign(nodes[0], { x: 600, y: 60 });

    return { nodes, edges };
}
