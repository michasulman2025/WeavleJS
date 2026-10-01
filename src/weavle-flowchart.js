const NS = "http://www.w3.org/2000/svg";

const flowchartShapes = {
    process(node, engine) {
        const rect = document.createElementNS(NS, "rect");

        rect.setAttribute("x", node.x);
        rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width);
        rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 8);

        engine.applyNodeStyle(rect, node);
        return rect;
    },

    decision(node, engine) {
        const polygon = document.createElementNS(NS, "polygon");

        const cx = node.x + node.width / 2;
        const cy = node.y + node.height / 2;

        const points = [
            `${cx},${node.y}`,
            `${node.x + node.width},${cy}`,
            `${cx},${node.y + node.height}`,
            `${node.x},${cy}`
        ].join(" ");

        polygon.setAttribute("points", points);

        engine.applyNodeStyle(polygon, node);
        return polygon;
    },

    terminator(node, engine) {
        const rect = document.createElementNS(NS, "rect");

        rect.setAttribute("x", node.x);
        rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width);
        rect.setAttribute("height", node.height);
        rect.setAttribute("rx", Math.min(node.height / 2, 30));

        engine.applyNodeStyle(rect, node);
        return rect;
    },

    inputOutput(node, engine) {
        const polygon = document.createElementNS(NS, "polygon");
        const skew = 18;

        const points = [
            `${node.x + skew},${node.y}`,
            `${node.x + node.width},${node.y}`,
            `${node.x + node.width - skew},${node.y + node.height}`,
            `${node.x},${node.y + node.height}`
        ].join(" ");

        polygon.setAttribute("points", points);

        engine.applyNodeStyle(polygon, node);
        return polygon;
    },

    subProcess(node, engine) {
        const group = document.createElementNS(NS, "g");

        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", node.x);
        rect.setAttribute("y", node.y);
        rect.setAttribute("width", node.width);
        rect.setAttribute("height", node.height);
        rect.setAttribute("rx", 8);
        engine.applyNodeStyle(rect, node);

        const leftLine = document.createElementNS(NS, "line");
        leftLine.setAttribute("x1", node.x + 10);
        leftLine.setAttribute("y1", node.y + 6);
        leftLine.setAttribute("x2", node.x + 10);
        leftLine.setAttribute("y2", node.y + node.height - 6);
        leftLine.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
        leftLine.setAttribute("stroke-width", "1.5");

        const rightLine = document.createElementNS(NS, "line");
        rightLine.setAttribute("x1", node.x + node.width - 10);
        rightLine.setAttribute("y1", node.y + 6);
        rightLine.setAttribute("x2", node.x + node.width - 10);
        rightLine.setAttribute("y2", node.y + node.height - 6);
        rightLine.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
        rightLine.setAttribute("stroke-width", "1.5");

        group.appendChild(rect);
        group.appendChild(leftLine);
        group.appendChild(rightLine);

        return group;
    },

    document(node, engine) {
        const path = document.createElementNS(NS, "path");

        const x = node.x;
        const y = node.y;
        const w = node.width;
        const h = node.height;
        const wave = 8;

        const d = [
            `M ${x} ${y}`,
            `L ${x + w} ${y}`,
            `L ${x + w} ${y + h - wave}`,
            `Q ${x + w * 0.75} ${y + h + wave} ${x + w * 0.5} ${y + h - wave}`,
            `Q ${x + w * 0.25} ${y + h - 3 * wave} ${x} ${y + h - wave}`,
            `Z`
        ].join(" ");

        path.setAttribute("d", d);

        engine.applyNodeStyle(path, node);
        return path;
    },

    database(node, engine) {
        const group = document.createElementNS(NS, "g");

        const rx = node.width / 2;
        const ry = 10;
        const cx = node.x + node.width / 2;

        const body = document.createElementNS(NS, "rect");
        body.setAttribute("x", node.x);
        body.setAttribute("y", node.y + ry);
        body.setAttribute("width", node.width);
        body.setAttribute("height", node.height - ry * 2);
        engine.applyNodeStyle(body, node);

        const top = document.createElementNS(NS, "ellipse");
        top.setAttribute("cx", cx);
        top.setAttribute("cy", node.y + ry);
        top.setAttribute("rx", rx);
        top.setAttribute("ry", ry);
        engine.applyNodeStyle(top, node);

        const bottom = document.createElementNS(NS, "ellipse");
        bottom.setAttribute("cx", cx);
        bottom.setAttribute("cy", node.y + node.height - ry);
        bottom.setAttribute("rx", rx);
        bottom.setAttribute("ry", ry);
        bottom.setAttribute("fill", "none");
        bottom.setAttribute("stroke", engine.getNodeColors(node.type).stroke);
        bottom.setAttribute("stroke-width", "1.5");

        group.appendChild(body);
        group.appendChild(top);
        group.appendChild(bottom);

        return group;
    }
};


export function createFlowchartDefinition() {
    return {

        id: "flowchart",
        shapes: flowchartShapes,
        nodeTypes: {
            process: {
                defaultLabel: "Processtap",
                colors: {
                    fill: "#F6D6B4",
                    stroke: "#0d2d44"
                },
                shape: "process"
            },
            decision: {
                defaultLabel: "Beslissing?",
                colors: {
                    fill: "#FFB366",
                    stroke: "#F57100"
                },
                shape: "decision"
            },
            terminator: {
                defaultLabel: "Start / Stop",
                colors: {
                    fill: "#E8F3EC",
                    stroke: "#1B5278"
                },
                shape: "terminator"
            },
            inputOutput: {
                defaultLabel: "Input / Output",
                colors: {
                    fill: "#F6D6B4",
                    stroke: "#4A8DB5"
                },
                shape: "inputOutput"
            },
            document: {
                defaultLabel: "Document",
                colors: {
                    fill: "#FFF4E8",
                    stroke: "#4A8DB5"
                },
                shape: "document"
            },
            subProcess: {
                defaultLabel: "Subproces",
                colors: {
                    fill: "#8aa8b9",
                    stroke: "#4A8DB5"
                },
                shape: "subProcess"
            },
            database: {
                defaultLabel: "Database",
                colors: {
                    fill: "#EAF4FB",
                    stroke: "#1B5278"
                },
                shape: "database"
            }
        },
        palette: [
            { type: "process" },
            { type: "decision" },
            { type: "terminator" }
        ],

        getPorts(node) {
            return {
                top: {
                    x: node.x + node.width / 2,
                    y: node.y
                },
                right: {
                    x: node.x + node.width,
                    y: node.y + node.height / 2
                },
                bottom: {
                    x: node.x + node.width / 2,
                    y: node.y + node.height
                },
                left: {
                    x: node.x,
                    y: node.y + node.height / 2
                }
            };
        },

        routeEdge({ sourcePoint, targetPoint, sourceHandle, targetHandle, edge, engine }) {
            return engine.buildRoutedEdgePoints(
                sourcePoint,
                targetPoint,
                sourceHandle,
                targetHandle,
                edge
            );
        },

        getContextActions(node) {
            const types = ["process", "decision", "terminator", "inputOutput", "document", "subProcess", "database"];

            return [
                {
                    type: "group", label: "Stap toevoegen", nodeType: "process",
                    children: types.map(t => ({ type: "addConnectedNode", nodeType: t, label: this.nodeTypes[t].defaultLabel }))
                },
                { type: "deleteNode", label: "Verwijderen" }
            ];
        },

        getDefaultSize(nodeType) {
            const sizes = {
                process:     { width: 140, height: 70 },
                decision:    { width: 120, height: 90 },
                terminator:  { width: 140, height: 60 },
                inputOutput: { width: 140, height: 70 },
                document:    { width: 140, height: 80 },
                subProcess:  { width: 140, height: 70 },
                database:    { width: 120, height: 80 }
            };
            return sizes[nodeType] || { width: 140, height: 70 };
        },

        getNodeInteractionMode(node) {
            return "docked-panel";
        },

        // Usable text area per shape: a diamond only has room around its middle,
        // a parallelogram loses its slanted sides, a cylinder its top ellipse.
        getLabelLayout(node) {
            switch (node.type) {
                case "decision":    return { widthFactor: 0.7, heightFactor: 0.6, paddingX: 4, paddingY: 2 };
                case "inputOutput": return { paddingX: 22 };
                case "database":    return { paddingY: 14 };
                case "subProcess":  return { paddingX: 16 };
                default:            return {};
            }
        },

        getResizeRules(node) {
            switch (node.type) {
                case "decision": return { minWidth: 80, minHeight: 60 };
                case "database": return { minWidth: 60, minHeight: 50 };
                default:         return { minWidth: 80, minHeight: 40 };
            }
        },

        getRoutingConfig(edge, engine) {
            return {
                gridSize: 20,
                stubLength: 20,
                obstacleMargin: 16,
                turnPenalty: 25,
                proximityPenalty: 2,
                preferredDirection: null,
                backtrackPenalty: 0,
                allowedDirections: ["up", "right", "down", "left"],
                searchMargin: 200,
                maxIterations: 3000,
                storeRoutingMeta: true
            };
        }
    };


}