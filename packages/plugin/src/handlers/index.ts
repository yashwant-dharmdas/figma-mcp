// ============================================================
// Handler registry — register all command handlers.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { registerDocumentHandlers } from "./document.js";
import { registerCreationHandlers } from "./creation.js";
import { registerModificationHandlers } from "./modification.js";
import { registerTextHandlers } from "./text.js";
import { registerComponentHandlers } from "./component.js";
import { registerSvgHandlers } from "./svg.js";
import { registerVariableHandlers } from "./variable.js";
import { registerPageHandlers } from "./page.js";
import { registerBatchHandlers } from "./batch.js";

export function registerHandlers(dispatcher: Dispatcher): void {
  registerDocumentHandlers(dispatcher);
  registerCreationHandlers(dispatcher);
  registerModificationHandlers(dispatcher);
  registerTextHandlers(dispatcher);
  registerComponentHandlers(dispatcher);
  registerSvgHandlers(dispatcher);
  registerVariableHandlers(dispatcher);
  registerPageHandlers(dispatcher);
  registerBatchHandlers(dispatcher);
}
