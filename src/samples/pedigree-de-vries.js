/*
  Sample family tree for the playground (fictional): the host's data as { focusId, persons, families }.
  Focus Jan Hendrik de Vries with his wife, four siblings, three generations of ancestors on both sides
  (with gaps: unknown parents, a single known parent, one whose parents the host has but did not send) and a
  fourth generation that stays hidden, plus children and grandchildren — one daughter with three relationships
  (the second preferred), one great-grandchild out of range.
  Positions don't matter — the pedigree definition lays everything out on load.
*/

import { pedigreeFromList } from "../weavle-pedigree.js";

export const DE_VRIES_FAMILY = {
    focusId: "jan",
    persons: [
        // Generation 0: the focus, his wife and his siblings.
        { id: "jan",      name: "Jan Hendrik de Vries", gender: "male",   birthYear: 1932, deathYear: 2004, refId: "KN6Q-LXY", parentFamilyId: "f-hendrik-antje" },
        { id: "grietje",  name: "Grietje Bakker",       gender: "female", birthYear: 1935, deathYear: 2019, refId: "LZC1-Z54", parentFamilyId: "f-willem-neeltje" },
        { id: "klaas",    name: "Klaas de Vries",       gender: "male",   birthYear: 1929, deathYear: 2010, parentFamilyId: "f-hendrik-antje" },
        { id: "aaltje",   name: "Aaltje de Vries",      gender: "female", birthYear: 1930, deathYear: 1999, parentFamilyId: "f-hendrik-antje" },
        { id: "sjoukje",  name: "Sjoukje de Vries",     gender: "female", birthYear: 1936, living: true,    parentFamilyId: "f-hendrik-antje" },
        { id: "pieter",   name: "Pieter de Vries",      gender: "male",   birthYear: 1939, deathYear: 2015, parentFamilyId: "f-hendrik-antje" },

        // Generation 1.
        { id: "hendrik",  name: "Hendrik de Vries",     gender: "male",   birthYear: 1901, deathYear: 1975, parentFamilyId: "f-jan-trijntje" },
        { id: "antje",    name: "Antje Visser",         gender: "female", birthYear: 1904, deathYear: 1990, parentFamilyId: "f-pieter-geertje" },
        { id: "willem",   name: "Willem Bakker",        gender: "male",   birthYear: 1905, deathYear: 1980, parentFamilyId: "f-gerrit-hiltje" },
        { id: "neeltje",  name: "Neeltje de Boer",      gender: "female", birthYear: 1908, deathYear: 1995 },

        // Generation 2.
        { id: "jan1870",  name: "Jan de Vries",         gender: "male",   birthYear: 1870, deathYear: 1940, parentFamilyId: "f-hendrik-aukje" },
        { id: "trijntje", name: "Trijntje Meijer",      gender: "female", birthYear: 1873, deathYear: 1951 },
        { id: "pieterv",  name: "Pieter Visser",        gender: "male",   birthYear: 1875, deathYear: 1948, parentFamilyId: "f-klaas" },
        { id: "geertje",  name: "Geertje Postma",       gender: "female", birthYear: 1878, deathYear: 1960, parentFamilyId: "f-douwe-baukje" },
        { id: "gerrit",   name: "Gerrit Bakker",        gender: "male",   birthYear: 1872, deathYear: 1944 },
        { id: "hiltje",   name: "Hiltje Kuipers",       gender: "female", birthYear: 1876, deathYear: 1939, hasMoreAncestors: true },

        // Generation 3.
        { id: "hendrik1838", name: "Hendrik de Vries",  gender: "male",   birthYear: 1838, deathYear: 1901, parentFamilyId: "f-jan-sjoerdtje" },
        { id: "aukje",    name: "Aukje Dijkstra",       gender: "female", birthYear: 1842, deathYear: 1910 },
        { id: "klaasv",   name: "Klaas Visser",         gender: "male",   birthYear: 1846, deathYear: 1920 },
        { id: "douwe",    name: "Douwe Postma",         gender: "male",   birthYear: 1850, deathYear: 1917 },
        { id: "baukje",   name: "Baukje Hoekstra",      gender: "female", birthYear: 1852, deathYear: 1925 },

        // Generation 4: beyond the default range, hidden.
        { id: "jan1805",  name: "Jan de Vries",         gender: "male",   birthYear: 1805, deathYear: 1870 },
        { id: "sjoerdtje", name: "Sjoerdtje de Jong",   gender: "female", birthYear: 1809, deathYear: 1885 },

        // Children of Jan and Grietje, with partners.
        { id: "hendrik57", name: "Hendrik de Vries",    gender: "male",   birthYear: 1957, living: true, parentFamilyId: "f-jan-grietje" },
        { id: "marieke",  name: "Marieke Smit",         gender: "female", birthYear: 1959, living: true },
        { id: "anna",     name: "Anna de Vries",        gender: "female", birthYear: 1960, living: true, parentFamilyId: "f-jan-grietje",
          preferredFamilyId: "f-erik-anna" },
        { id: "peter",    name: "Peter Jansen",         gender: "male",   birthYear: 1958, living: true },
        { id: "erik",     name: "Erik Mulder",          gender: "male",   birthYear: 1962, living: true },
        { id: "bram",     name: "Bram Visser",          gender: "male",   birthYear: 1965, living: true },
        { id: "willem64", name: "Willem de Vries",      gender: "male",   birthYear: 1964, living: true, parentFamilyId: "f-jan-grietje" },

        // Grandchildren.
        { id: "jan85",    name: "Jan de Vries",         gender: "male",   birthYear: 1985, living: true, parentFamilyId: "f-hendrik-marieke" },
        { id: "lisa",     name: "Lisa de Vries",        gender: "female", birthYear: 1988, living: true, parentFamilyId: "f-hendrik-marieke" },
        { id: "thomas",   name: "Thomas Jansen",        gender: "male",   birthYear: 1983, living: true, parentFamilyId: "f-anna-peter" },
        { id: "sanne",    name: "Sanne Mulder",         gender: "female", birthYear: 1995, living: true, parentFamilyId: "f-erik-anna" },

        // Great-grandchild: beyond the default range, hidden.
        { id: "noah",     name: "Noah Bos",             gender: "male",   birthYear: 2015, living: true, parentFamilyId: "f-lisa" }
    ],
    families: [
        { id: "f-jan-grietje",     partner1Id: "jan",         partner2Id: "grietje",  marriageDate: "12 mei 1956",  marriagePlace: "Leeuwarden" },
        { id: "f-hendrik-antje",   partner1Id: "hendrik",     partner2Id: "antje",    marriageDate: "3 juni 1928",  marriagePlace: "Sneek" },
        { id: "f-willem-neeltje",  partner1Id: "willem",      partner2Id: "neeltje",  marriageDate: "1931",         marriagePlace: "Harlingen" },
        { id: "f-jan-trijntje",    partner1Id: "jan1870",     partner2Id: "trijntje", marriageDate: "28 feb 1895",  marriagePlace: "Franeker" },
        { id: "f-pieter-geertje",  partner1Id: "pieterv",     partner2Id: "geertje",  marriageDate: "9 mei 1900",   marriagePlace: "Bolsward" },
        { id: "f-gerrit-hiltje",   partner1Id: "gerrit",      partner2Id: "hiltje",   marriageDate: "1899" },
        { id: "f-hendrik-aukje",   partner1Id: "hendrik1838", partner2Id: "aukje",    marriageDate: "21 mei 1863",  marriagePlace: "Franekeradeel" },
        { id: "f-klaas",           partner1Id: "klaasv",      partner2Id: "" },
        { id: "f-douwe-baukje",    partner1Id: "douwe",       partner2Id: "baukje",   marriagePlace: "Wonseradeel" },
        { id: "f-jan-sjoerdtje",   partner1Id: "jan1805",     partner2Id: "sjoerdtje", marriageDate: "1834" },
        { id: "f-hendrik-marieke", partner1Id: "hendrik57",   partner2Id: "marieke",  marriageDate: "1983",         marriagePlace: "Groningen" },
        { id: "f-anna-peter",      partner1Id: "peter",       partner2Id: "anna",     marriageDate: "1982" },
        { id: "f-erik-anna",       partner1Id: "erik",        partner2Id: "anna",     marriageDate: "1992",         marriagePlace: "Zwolle" },
        { id: "f-anna-bram",       partner1Id: "bram",        partner2Id: "anna",     marriageDate: "2012",         marriagePlace: "Deventer" },
        { id: "f-lisa",            partner1Id: "",            partner2Id: "lisa" }
    ]
};

/** The sample as a pedigree model. */
export function createDeVriesPedigreeSample() {
    return pedigreeFromList(DE_VRIES_FAMILY);
}
