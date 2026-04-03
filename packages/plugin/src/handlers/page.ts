// ============================================================
// Page handlers — create, delete, rename, navigate pages.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { requirePage } from "../utils/node-helpers.js";

export function registerPageHandlers(dispatcher: Dispatcher): void {

  // ── get_pages ─────────────────────────────────────────────

  dispatcher.register("get_pages", async () => {
    return figma.root.children.map((p) => ({
      id: p.id,
      name: p.name,
      childCount: ("children" in p) ? p.children.length : 0,
      isCurrent: p.id === figma.currentPage.id,
    }));
  });

  // ── create_page ───────────────────────────────────────────

  dispatcher.register("create_page", async (params) => {
    const name = params["name"] as string;
    const page = figma.createPage();
    page.name = name;
    return { id: page.id, name: page.name };
  });

  // ── delete_page ───────────────────────────────────────────

  dispatcher.register("delete_page", async (params) => {
    const pageId = params["pageId"] as string;
    if (figma.root.children.length <= 1) {
      throw new Error("Cannot delete the last page in the document.");
    }
    const page = requirePage(pageId);
    const id = page.id;
    page.remove();
    return { id };
  });

  // ── rename_page ───────────────────────────────────────────

  dispatcher.register("rename_page", async (params) => {
    const pageId = params["pageId"] as string;
    const name = params["name"] as string;
    const page = requirePage(pageId);
    page.name = name;
    return { id: page.id, name: page.name };
  });

  // ── set_current_page ──────────────────────────────────────

  dispatcher.register("set_current_page", async (params) => {
    const pageId = params["pageId"] as string;
    const page = requirePage(pageId);
    figma.currentPage = page;
    return { id: page.id, name: page.name };
  });

  // ── duplicate_page ────────────────────────────────────────

  dispatcher.register("duplicate_page", async (params) => {
    const pageId = params["pageId"] as string;
    const newName = params["name"] as string | undefined;
    const page = requirePage(pageId);

    const clone = page.clone();
    if (newName) clone.name = newName;
    else clone.name = `${page.name} Copy`;

    return { id: clone.id, name: clone.name };
  });
}
