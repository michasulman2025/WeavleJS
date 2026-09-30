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


function createToolIcon(action, engine) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 40 40");

    if (action.type === "deleteNode") {
        const line1 = document.createElementNS(NS, "line");
        line1.setAttribute("x1", "10");
        line1.setAttribute("y1", "10");
        line1.setAttribute("x2", "30");
        line1.setAttribute("y2", "30");
        line1.setAttribute("stroke", "#d11a2a");
        line1.setAttribute("stroke-width", "3");
        line1.setAttribute("stroke-linecap", "round");

        const line2 = document.createElementNS(NS, "line");
        line2.setAttribute("x1", "30");
        line2.setAttribute("y1", "10");
        line2.setAttribute("x2", "10");
        line2.setAttribute("y2", "30");
        line2.setAttribute("stroke", "#d11a2a");
        line2.setAttribute("stroke-width", "3");
        line2.setAttribute("stroke-linecap", "round");

        svg.appendChild(line1);
        svg.appendChild(line2);
        return svg;
    }

    const colors = engine.getNodeColors(action.nodeType);

    switch (action.nodeType) {
        case "process": {
            const rect = document.createElementNS(NS, "rect");
            rect.setAttribute("x", "6");
            rect.setAttribute("y", "10");
            rect.setAttribute("width", "28");
            rect.setAttribute("height", "20");
            rect.setAttribute("rx", "4");
            rect.setAttribute("fill", colors.fill);
            rect.setAttribute("stroke", colors.stroke);
            rect.setAttribute("stroke-width", "2");
            svg.appendChild(rect);
            break;
        }

        case "decision": {
            const polygon = document.createElementNS(NS, "polygon");
            polygon.setAttribute("points", "20,6 34,20 20,34 6,20");
            polygon.setAttribute("fill", colors.fill);
            polygon.setAttribute("stroke", colors.stroke);
            polygon.setAttribute("stroke-width", "2");
            svg.appendChild(polygon);
            break;
        }

        case "terminator": {
            const rect = document.createElementNS(NS, "rect");
            rect.setAttribute("x", "6");
            rect.setAttribute("y", "10");
            rect.setAttribute("width", "28");
            rect.setAttribute("height", "20");
            rect.setAttribute("rx", "10");
            rect.setAttribute("fill", colors.fill);
            rect.setAttribute("stroke", colors.stroke);
            rect.setAttribute("stroke-width", "2");
            svg.appendChild(rect);
            break;
        }

        case "inputOutput": {
            const polygon = document.createElementNS(NS, "polygon");
            polygon.setAttribute("points", "12,10 34,10 28,30 6,30");
            polygon.setAttribute("fill", colors.fill);
            polygon.setAttribute("stroke", colors.stroke);
            polygon.setAttribute("stroke-width", "2");
            svg.appendChild(polygon);
            break;
        }

        case "document": {
            const path = document.createElementNS(NS, "path");
            path.setAttribute(
                "d",
                "M 8 10 L 32 10 L 32 26 Q 26 32 20 26 Q 14 20 8 26 Z"
            );
            path.setAttribute("fill", colors.fill);
            path.setAttribute("stroke", colors.stroke);
            path.setAttribute("stroke-width", "2");
            svg.appendChild(path);
            break;
        }

        case "database": {
            const body = document.createElementNS(NS, "rect");
            body.setAttribute("x", "8");
            body.setAttribute("y", "12");
            body.setAttribute("width", "24");
            body.setAttribute("height", "16");
            body.setAttribute("fill", colors.fill);
            body.setAttribute("stroke", colors.stroke);
            body.setAttribute("stroke-width", "2");

            const top = document.createElementNS(NS, "ellipse");
            top.setAttribute("cx", "20");
            top.setAttribute("cy", "12");
            top.setAttribute("rx", "12");
            top.setAttribute("ry", "5");
            top.setAttribute("fill", colors.fill);
            top.setAttribute("stroke", colors.stroke);
            top.setAttribute("stroke-width", "2");

            const bottom = document.createElementNS(NS, "ellipse");
            bottom.setAttribute("cx", "20");
            bottom.setAttribute("cy", "28");
            bottom.setAttribute("rx", "12");
            bottom.setAttribute("ry", "5");
            bottom.setAttribute("fill", "none");
            bottom.setAttribute("stroke", colors.stroke);
            bottom.setAttribute("stroke-width", "2");

            svg.appendChild(body);
            svg.appendChild(top);
            svg.appendChild(bottom);
            break;
        }

        case "subProcess": {
            const rect = document.createElementNS(NS, "rect");
            rect.setAttribute("x", "6");
            rect.setAttribute("y", "10");
            rect.setAttribute("width", "28");
            rect.setAttribute("height", "20");
            rect.setAttribute("rx", "4");
            rect.setAttribute("fill", colors.fill);
            rect.setAttribute("stroke", colors.stroke);
            rect.setAttribute("stroke-width", "2");

            const leftLine = document.createElementNS(NS, "line");
            leftLine.setAttribute("x1", "11");
            leftLine.setAttribute("y1", "12");
            leftLine.setAttribute("x2", "11");
            leftLine.setAttribute("y2", "28");
            leftLine.setAttribute("stroke", colors.stroke);
            leftLine.setAttribute("stroke-width", "2");

            const rightLine = document.createElementNS(NS, "line");
            rightLine.setAttribute("x1", "29");
            rightLine.setAttribute("y1", "12");
            rightLine.setAttribute("x2", "29");
            rightLine.setAttribute("y2", "28");
            rightLine.setAttribute("stroke", colors.stroke);
            rightLine.setAttribute("stroke-width", "2");

            svg.appendChild(rect);
            svg.appendChild(leftLine);
            svg.appendChild(rightLine);
            break;
        }

        default: {
            const fallback = document.createElementNS(NS, "rect");
            fallback.setAttribute("x", "8");
            fallback.setAttribute("y", "8");
            fallback.setAttribute("width", "24");
            fallback.setAttribute("height", "24");
            fallback.setAttribute("rx", "4");
            fallback.setAttribute("fill", "#ffffff");
            fallback.setAttribute("stroke", "#999");
            fallback.setAttribute("stroke-width", "2");
            svg.appendChild(fallback);
            break;
        }
    }

    return svg;
}

function createToolItem(action, node, engine, variant = "normal") {
    const item = document.createElement("div");

    const isDanger = variant === "danger";

    item.style.width = "32px";
    item.style.height = "32px";
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.justifyContent = "center";
    item.style.border = isDanger ? "1px solid #f1b0b7" : "1px solid #d9d9d9";
    item.style.borderRadius = "6px";
    item.style.background = "#fff";
    item.style.cursor = "pointer";
    item.style.transition = "all 0.15s ease";
    item.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
    item.title = action.label || action.type;

    const icon = createToolIcon(action, engine);
    item.appendChild(icon);

    item.addEventListener("mouseenter", () => {
        item.style.background = isDanger ? "#fff5f5" : "#f3f6fa";
        item.style.borderColor = isDanger ? "#d11a2a" : "#eb6c4c";
        item.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
        item.style.transform = "scale(1.05)";
    });

    item.addEventListener("mouseleave", () => {
        item.style.background = "#fff";
        item.style.borderColor = isDanger ? "#f1b0b7" : "#d9d9d9";
        item.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
        item.style.transform = "scale(1)";
    });

    item.addEventListener("click", (e) => {
        e.stopPropagation();
        engine.handleContextAction(action, node);
    });

    return item;
}

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
            return [
                { type: "addConnectedNode", nodeType: "process", label: "Processtap" },
                { type: "addConnectedNode", nodeType: "decision", label: "Beslissing" },
                { type: "addConnectedNode", nodeType: "terminator", label: "Start / Stop" },
                { type: "addConnectedNode", nodeType: "inputOutput", label: "Input / Output" },
                { type: "addConnectedNode", nodeType: "database", label: "Database" },
                { type: "addConnectedNode", nodeType: "document", label: "Document" },
                { type: "addConnectedNode", nodeType: "subProcess", label: "Subprocess" },
                { type: "deleteNode", label: "Verwijderen" }
            ];
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
        },

        getNodeToolRenderer(node, engine) {
            return ({ node, actions, engine }) => {
                const wrap = document.createElement("div");
                wrap.style.display = "flex";
                wrap.style.flexDirection = "column";
                wrap.style.gap = "6px";

                const primaryActions = actions.filter(a => a.type !== "deleteNode");
                const dangerActions = actions.filter(a => a.type === "deleteNode");

                primaryActions.forEach(action => {
                    wrap.appendChild(createToolItem(action, node, engine, "normal"));
                });

                if (primaryActions.length > 0 && dangerActions.length > 0) {
                    const divider = document.createElement("div");
                    divider.style.width = "100%";
                    divider.style.height = "1px";
                    divider.style.background = "#eee";
                    divider.style.margin = "4px 0";
                    wrap.appendChild(divider);
                }

                dangerActions.forEach(action => {
                    wrap.appendChild(createToolItem(action, node, engine, "danger"));
                });

                return wrap;
            };
        }
    };


}