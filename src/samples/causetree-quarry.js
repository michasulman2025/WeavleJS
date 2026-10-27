/*
  Sample cause tree for the playground: example 2 of the INRS brochure "La méthode de l'arbre des causes"
  (ED 6163) — a mechanic in a quarry loses a leg in the return drum of a conveyor belt. Shows a chain,
  conjunctions (three facts into "De voet glijdt weg" and into "Been gegrepen"), a disjunction (the
  blocked hopper leads to two facts), a state and an uncertain link. Positions don't matter — the cause
  tree definition lays everything out on load (the damage keeps its place).
*/

// [id, type, label]
const FACTS = [
    ["damage",   "damage",    "Ernstig letsel aan het been"],
    ["grabbed",  "variation", "Been gegrepen"],
    ["fall",     "variation", "Valt op de trommel van de transportband"],
    ["moving",   "state",     "Trommel draait"],
    ["open",     "variation", "Trommel is bereikbaar"],
    ["running",  "variation", "Transportband blijft draaien"],
    ["slips",    "variation", "De voet glijdt weg"],
    ["standing", "variation", "Staat tegen de trechter"],
    ["effort",   "variation", "Oefent kracht uit met een metalen staaf"],
    ["floor",    "variation", "De vloer is glad"],
    ["tunnel",   "variation", "Gaat direct naar de tunnel van de trechter"],
    ["manual",   "variation", "Probeert de stenen met een metalen staaf los te steken"],
    ["blocked",  "variation", "Trechter verstopt met stenen"]
];

// [antecedent, consequent, uncertain?]
const LINKS = [
    ["grabbed",  "damage"],
    ["moving",   "grabbed"],
    ["fall",     "grabbed"],
    ["open",     "grabbed"],
    ["running",  "moving"],
    ["slips",    "fall"],
    ["standing", "slips"],
    ["effort",   "slips"],
    ["floor",    "slips", true],
    ["tunnel",   "standing"],
    ["manual",   "effort"],
    ["blocked",  "tunnel"],
    ["blocked",  "manual"]
];

export function createQuarryCauseTreeSample() {
    return {
        nodes: FACTS.map(([id, type, label]) => ({
            id, type, label,
            x: type === "damage" ? 1300 : 0, y: type === "damage" ? 260 : 0, width: 0, height: 0
        })),
        edges: LINKS.map(([source, target, uncertain], i) => ({
            id: `link-${i + 1}`,
            sourceNodeId: source,
            targetNodeId: target,
            sourceHandle: "right",
            targetHandle: "left",
            type: uncertain ? "uncertain" : "link"
        }))
    };
}
