/*
  Sample house-style theme for the playground (ARCHITECTURE.md 7.4).

  Palette:
    Primary – Navy Blue       #0D2D44   text areas, navigation, cards
    Secondary – Deep Navy     #042841   logo, titles and diagrams
    Accent – Orange           #F47200   buttons, highlights, active elements
    Supporting – Blue Grey    #AAC2CC   secondary charts and icons
    Background – Light Grey   #F2F2F2   general page background
    Surface – White           #FFFFFF   forms, cards and tables
    Warm Background           #F5DCC1   warm sections and accent backgrounds
*/

const NAVY      = "#0D2D44";
const DEEP_NAVY = "#042841";
const ORANGE    = "#F47200";
const BLUE_GREY = "#AAC2CC";
const LIGHT     = "#F2F2F2";
const WHITE     = "#FFFFFF";
const WARM      = "#F5DCC1";

// Decisions and gateways: the warm accent, with an orange outline.
const DECISION = { fill: WARM, stroke: ORANGE };

export const houseStyleTheme = {
    // Every node: white cards with a navy outline and deep navy text.
    node: { fill: WHITE, stroke: NAVY, textColor: DEEP_NAVY },

    nodeTypes: {
        // Flowchart
        terminator:       { fill: NAVY, stroke: DEEP_NAVY, textColor: WHITE },
        decision:         DECISION,
        annotation:       { fill: LIGHT, stroke: BLUE_GREY },

        // BPMN
        gateway:          DECISION,
        exclusiveGateway: DECISION,
        parallelGateway:  DECISION,
        inclusiveGateway: DECISION,
        subProcess:       { fill: LIGHT },
        pool:             { fill: WHITE, stroke: DEEP_NAVY },
        swimlane:         { fill: LIGHT, stroke: BLUE_GREY, textColor: DEEP_NAVY }
    },

    // Every line: navy.
    edge: { stroke: NAVY },

    edgeTypes: {
        association:     { stroke: BLUE_GREY },
        dataAssociation: { stroke: BLUE_GREY },
        comment:         { stroke: BLUE_GREY }
    },

    diagrams: {
        ishikawa: {
            nodeTypes: {
                effect:   { fill: NAVY, stroke: DEEP_NAVY, textColor: WHITE },
                category: { fill: WARM, stroke: ORANGE }
            },
            edgeTypes: {
                bone: { stroke: DEEP_NAVY }
            }
        },
        // Cause tree: the damage in navy, variations (what drives the accident) on the warm background.
        causetree: {
            nodeTypes: {
                damage:    { fill: NAVY, stroke: DEEP_NAVY, textColor: WHITE },
                variation: { fill: WARM, stroke: ORANGE },
                state:     { fill: WHITE, stroke: NAVY }
            }
        },
        // Org chart: the top in navy, managers on the warm background; everyone else a white card.
        orgchart: {
            nodeVariants: {
                top:     { fill: NAVY, stroke: DEEP_NAVY, textColor: WHITE },
                manager: { fill: WARM, stroke: NAVY }
            }
        }
    },

    // Named styles users can give a node or edge (node.style = { preset: "critical" }); label = menu name.
    presets: {
        accent:   { label: "Accent",   fill: NAVY,  stroke: DEEP_NAVY, textColor: WHITE },
        warning:  { label: "Let op",   fill: WARM,  stroke: ORANGE,    textColor: DEEP_NAVY },
        critical: { label: "Kritiek",  fill: ORANGE, stroke: ORANGE,   textColor: WHITE, fontWeight: "bold" },
        muted:    { label: "Gedempt",  fill: LIGHT, stroke: BLUE_GREY, textColor: NAVY, dash: "4,3" }
    },

    // Editor chrome: orange selection and highlights, navy handles, a light grey canvas.
    ui: {
        selection:        ORANGE,
        accent:           NAVY,
        hot:              ORANGE,
        canvasBackground: LIGHT,
        grid:             BLUE_GREY,
        uiText:           NAVY,
        uiBorder:         BLUE_GREY
    }
};
