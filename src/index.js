/*!
 * WeavleJS — https://github.com/michasulman2025/WeavleJS
 * Copyright (c) 2026 Micha Sulman
 * Released under the MIT License (see LICENSE).
 */

/*
  WeavleJS — library entry point.

  ES module:    import { WeavleJS, createBpmnDefinition } from "weavle.es.js";
  Script tag:   <script src="weavle.iife.js"></script>  →  window.Weavle.WeavleJS, Weavle.mount(...), ...
*/

import "./weavle.css";

export { WeavleJS } from "./weavle.js";
export { createBpmnDefinition } from "./weavle-bpmn.js";
export { createFlowchartDefinition } from "./weavle-flowchart.js";
export { mount, getInstance, registerDiagramType, getDiagramTypes } from "./weavle-outsystems.js";

export const version = "0.9.0";
