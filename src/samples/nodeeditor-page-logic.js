/*
  Sample node graph for the playground: page settings derived from the current user and the window
  size — a welcome title for logged-in users, a dashboard for admins on a wide screen, a sign-up link
  for visitors.
*/

import { nodeEditorNode as node, nodeEditorLink as link } from "../weavle-nodeeditor.js";

export function createPageLogicSample() {
    return {
        nodes: [
            node("currentUser", "user",   40,  60),
            node("window",      "window", 40, 330),
            node("joinText",    "join",  290,  40, { first: "Welkom, " }),
            node("chooseText",  "choose", 540, 40, { ifFalse: "Meld je hieronder aan!" }),
            node("and",         "and1",  290, 230),
            node("lessThan",    "narrow", 290, 380, { b: "960" }),
            node("not",         "wide",  540, 400),
            node("and",         "and2",  780, 300),
            node("not",         "guest", 540, 230),
            node("pageSettings", "page", 1020, 120)
        ],
        edges: [
            link("e1",  "user",   "fullName", "join",   "second"),
            link("e2",  "user",   "loggedIn", "choose", "test"),
            link("e3",  "join",   "result",   "choose", "ifTrue"),
            link("e4",  "choose", "result",   "page",   "title"),
            link("e5",  "user",   "loggedIn", "and1",   "a"),
            link("e6",  "user",   "admin",    "and1",   "b"),
            link("e7",  "window", "width",    "narrow", "a"),
            link("e8",  "narrow", "result",   "wide",   "value"),
            link("e9",  "and1",   "result",   "and2",   "a"),
            link("e10", "wide",   "result",   "and2",   "b"),
            link("e11", "and2",   "result",   "page",   "showDashboard"),
            link("e12", "user",   "loggedIn", "guest",  "value"),
            link("e13", "guest",  "result",   "page",   "showSignup")
        ]
    };
}
