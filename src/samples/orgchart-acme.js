/*
  Sample org chart for the playground: a small company as a flat list (as a host app would keep it),
  with a vacancy, a team that is stacked (only leaf reports) and one that is laid out in a row.
  Positions don't matter — the org chart definition lays everything out on load.
*/

import { orgChartFromList } from "../weavle-orgchart.js";

const PEOPLE = [
    { id: "ceo",   name: "Sanne de Vries",   role: "Algemeen directeur" },

    { id: "cfo",   managerId: "ceo", name: "Ahmed El Amrani", role: "Financieel directeur" },
    { id: "fin1",  managerId: "cfo", name: "Lotte Bakker",    role: "Controller" },
    { id: "fin2",  managerId: "cfo", name: "Tim Jansen",      role: "Boekhouder" },
    { id: "fin3",  managerId: "cfo", name: "Priya Ramdin",    role: "Salarisadministratie" },

    { id: "coo",   managerId: "ceo", name: "Joost Visser",    role: "Operationeel directeur" },
    { id: "ops1",  managerId: "coo", name: "Emma Smit",       role: "Teamleider logistiek" },
    { id: "ops11", managerId: "ops1", name: "Daan Mulder",    role: "Planner" },
    { id: "ops12", managerId: "ops1", name: "Noor Hendriks",  role: "Magazijnmedewerker" },
    { id: "ops2",  managerId: "coo", name: "Kees de Boer",    role: "Teamleider productie" },
    { id: "ops21", managerId: "ops2", name: "Fatima Yilmaz",  role: "Operator" },
    { id: "ops22", managerId: "ops2", vacancy: true,          role: "Operator" },

    { id: "cto",   managerId: "ceo", name: "Mila Peters",     role: "Hoofd IT" },
    { id: "it1",   managerId: "cto", name: "Ruben Koster",    role: "Ontwikkelaar" },
    { id: "it2",   managerId: "cto", name: "Sophie Meijer",   role: "Ontwikkelaar" },
    { id: "it3",   managerId: "cto", name: "Bram van Dijk",   role: "Beheerder" },
    { id: "it4",   managerId: "cto", vacancy: true,           role: "Security officer" }
];

export function createAcmeOrgChartSample() {
    const model = orgChartFromList(PEOPLE);
    // Anchor the chart: the top card's centre and top stay where the layout found them.
    Object.assign(model.nodes[0], { x: 520, y: 60 });
    return model;
}
