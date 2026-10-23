/*
  Sample Ishikawa diagram for the playground: causes of late deliveries (6M).
  Positions don't matter — the Ishikawa definition lays everything out on load.
*/

const TREE = {
    label: "Bestellingen worden te laat geleverd",
    categories: [
        { label: "Mens", causes: [
            { label: "Te weinig planners", subs: ["Vacatures niet ingevuld", "Ziekteverzuim"] },
            { label: "Onvoldoende opleiding" }
        ] },
        { label: "Machine", causes: [
            { label: "Storingen sorteerband", subs: ["Achterstallig onderhoud"] },
            { label: "Scanners verouderd" }
        ] },
        { label: "Methode", causes: [
            { label: "Handmatige orderinvoer" },
            { label: "Geen vaste pickroute" }
        ] },
        { label: "Materiaal", causes: [
            { label: "Verpakking niet op voorraad" }
        ] },
        { label: "Meting", causes: [
            { label: "Voorraad in systeem klopt niet", subs: ["Geen cyclustelling"] }
        ] },
        { label: "Milieu", causes: [
            { label: "Files rond het DC" },
            { label: "Weersomstandigheden" }
        ] }
    ]
};

export function createLateDeliverySample() {
    const nodes = [];
    const edges = [];
    let n = 0;

    const add = (type, label, parent) => {
        const id = `${type}-${++n}`;
        nodes.push({ id, type, label, x: 0, y: 0, width: 0, height: 0 });
        if (parent) {
            edges.push({ id: `edge-${n}`, sourceNodeId: id, targetNodeId: parent, sourceHandle: "right", targetHandle: "left" });
        }
        return id;
    };

    const effect = add("effect", TREE.label, null);
    Object.assign(nodes[0], { x: 1100, y: 360, width: 200, height: 90 });

    for (const category of TREE.categories) {
        const categoryId = add("category", category.label, effect);
        for (const cause of category.causes || []) {
            const causeId = add("cause", cause.label, categoryId);
            for (const sub of cause.subs || []) add("subCause", sub, causeId);
        }
    }

    return { nodes, edges };
}
