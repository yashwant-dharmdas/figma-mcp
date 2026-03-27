// ============================================================
// Vitest global setup — mocks the Figma Plugin API globals.
// ============================================================

import { vi } from "vitest";

// ── Mock SceneNode factory ────────────────────────────────────

function makeNode(type: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  let _fills: Paint[] = [];
  let _strokes: Paint[] = [];
  let _effects: Effect[] = [];
  let _layoutGrids: LayoutGrid[] = [];
  let _annotations: Annotation[] = [];
  let _children: unknown[] = [];
  const _id = overrides.id as string ?? `mock-${type}-${Math.random().toString(36).slice(2, 7)}`;

  const node: Record<string, unknown> = {
    id: _id,
    name: type,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    blendMode: "NORMAL",
    strokeWeight: 1,
    cornerRadius: 0,
    topLeftRadius: 0,
    topRightRadius: 0,
    bottomRightRadius: 0,
    bottomLeftRadius: 0,
    layoutMode: "NONE",
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    itemSpacing: 0,
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    layoutWrap: "NO_WRAP",
    characters: "",
    fontSize: 16,
    fontName: { family: "Inter", style: "Regular" },
    textAlignHorizontal: "LEFT",
    textAlignVertical: "TOP",
    textCase: "ORIGINAL",
    textDecoration: "NONE",
    letterSpacing: { value: 0, unit: "PIXELS" },
    lineHeight: { value: 16, unit: "PIXELS" },
    paragraphSpacing: 0,
    layoutGrids: [],
    effectStyleId: "",
    textStyleId: "",
    annotations: [],
    constraints: { horizontal: "MIN", vertical: "MIN" },
    exportSettings: [],
    get fills() { return _fills; },
    set fills(v: Paint[]) { _fills = v; },
    get strokes() { return _strokes; },
    set strokes(v: Paint[]) { _strokes = v; },
    get effects() { return _effects; },
    set effects(v: Effect[]) { _effects = v; },
    get annotations() { return _annotations; },
    set annotations(v: Annotation[]) { _annotations = v; },
    get children() { return _children; },
    get layoutGrids() { return _layoutGrids; },
    set layoutGrids(v: LayoutGrid[]) { _layoutGrids = v; },
    parent: { children: [], insertChild: vi.fn(), appendChild: vi.fn() } as unknown,
    remove: vi.fn(),
    clone: vi.fn(() => makeNode(type, { ...overrides, id: undefined })),
    resize: vi.fn(function(w: number, h: number) { node.width = w; node.height = h; }),
    appendChild: vi.fn((child: unknown) => { _children.push(child); }),
    insertChild: vi.fn((idx: number, child: unknown) => { _children.splice(idx, 0, child); }),
    indexOf: vi.fn((child: unknown) => _children.indexOf(child)),
    findAll: vi.fn(() => []),
    findAllWithCriteria: vi.fn(() => []),
    exportAsync: vi.fn(async () => new Uint8Array([60, 115, 118, 103, 62])), // "<svg>"
    getStyledTextSegments: vi.fn(() => []),
    setProperties: vi.fn(),
    setBoundVariable: vi.fn(),
    setExplicitVariableModeForCollection: vi.fn(),
    ...overrides,
  };

  return node;
}

// ── figma global mock ─────────────────────────────────────────

const _nodes = new Map<string, Record<string, unknown>>();

function registerNode(node: Record<string, unknown>): Record<string, unknown> {
  _nodes.set(node.id as string, node);
  return node;
}

const mockPage = makeNode("PAGE", { id: "page-1", name: "Page 1" });
(mockPage as Record<string, unknown>).findAll = vi.fn(() => []);
(mockPage as Record<string, unknown>).findAllWithCriteria = vi.fn(() => []);
registerNode(mockPage);

// @ts-ignore — global figma mock
globalThis.figma = {
  root: {
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    children: [mockPage],
    findAll: vi.fn(() => []),
    findAllWithCriteria: vi.fn(() => []),
  },
  currentPage: mockPage,
  showUI: vi.fn(),
  ui: {
    postMessage: vi.fn(),
    onmessage: null,
  },

  // Node creation
  createFrame: vi.fn(() => registerNode(makeNode("FRAME"))),
  createRectangle: vi.fn(() => registerNode(makeNode("RECTANGLE"))),
  createEllipse: vi.fn(() => registerNode(makeNode("ELLIPSE"))),
  createPolygon: vi.fn(() => {
    const n = registerNode(makeNode("POLYGON", { pointCount: 3 }));
    return n;
  }),
  createStar: vi.fn(() => {
    const n = registerNode(makeNode("STAR", { pointCount: 5, innerRadius: 0.5 }));
    return n;
  }),
  createText: vi.fn(() => registerNode(makeNode("TEXT"))),
  createVector: vi.fn(() => registerNode(makeNode("VECTOR"))),
  createComponent: vi.fn(() => registerNode(makeNode("COMPONENT", { key: "mock-key" }))),
  createImage: vi.fn((_bytes: Uint8Array) => ({ hash: "mock-image-hash" })),
  createNodeFromSvg: vi.fn((_svg: string) => registerNode(makeNode("FRAME", { name: "SVG" }))),

  // Group / flatten / boolean operations
  group: vi.fn((nodes: unknown[]) => {
    const g = registerNode(makeNode("GROUP"));
    return g;
  }),
  ungroup: vi.fn((group: Record<string, unknown>) => {
    const children = (group as { children: unknown[] }).children ?? [];
    group.remove?.();
    return children;
  }),
  flatten: vi.fn((nodes: unknown[]) => {
    const v = registerNode(makeNode("VECTOR"));
    for (const n of nodes) {
      (n as { remove?: () => void }).remove?.();
    }
    return v;
  }),
  union: vi.fn((_nodes: unknown[], _parent: unknown) => registerNode(makeNode("BOOLEAN_OPERATION", { booleanOperation: "UNION" }))),
  subtract: vi.fn((_nodes: unknown[], _parent: unknown) => registerNode(makeNode("BOOLEAN_OPERATION", { booleanOperation: "SUBTRACT" }))),
  intersect: vi.fn((_nodes: unknown[], _parent: unknown) => registerNode(makeNode("BOOLEAN_OPERATION", { booleanOperation: "INTERSECT" }))),
  exclude: vi.fn((_nodes: unknown[], _parent: unknown) => registerNode(makeNode("BOOLEAN_OPERATION", { booleanOperation: "EXCLUDE" }))),
  combineAsVariants: vi.fn((_components: unknown[], _parent: unknown) =>
    registerNode(makeNode("COMPONENT_SET", { name: "ComponentSet" }))
  ),
  createComponentFromNode: vi.fn((node: Record<string, unknown>) =>
    registerNode(makeNode("COMPONENT", { name: node.name, key: "mock-component-key" }))
  ),

  // Node lookup
  getNodeById: vi.fn((id: string) => _nodes.get(id) ?? null),

  // Fonts
  loadFontAsync: vi.fn(async () => {}),

  // Styles
  getLocalPaintStyles: vi.fn(() => []),
  getLocalTextStyles: vi.fn(() => []),
  getLocalEffectStyles: vi.fn(() => []),
  getLocalGridStyles: vi.fn(() => []),

  // Components
  importComponentByKeyAsync: vi.fn(async (key: string) => {
    const component = registerNode(makeNode("COMPONENT", { key, name: "ImportedComponent" }));
    (component as Record<string, unknown>).createInstance = vi.fn(() =>
      registerNode(makeNode("INSTANCE", { name: "ImportedComponent" }))
    );
    return component;
  }),

  // Variables
  variables: {
    getLocalVariableCollections: vi.fn(() => []),
    getLocalVariables: vi.fn((_type?: string) => []),
    getVariableCollectionById: vi.fn((_id: string) => null),
    getVariableById: vi.fn((_id: string) => null),
    createVariableCollection: vi.fn((name: string) => ({
      id: `col-${name}`,
      name,
      defaultModeId: "mode-default",
      modes: [{ modeId: "mode-default", name: "Mode 1" }],
      variableIds: [],
    })),
    createVariable: vi.fn((name: string, collection: unknown, resolvedType: string) => ({
      id: `var-${name}`,
      name,
      resolvedType,
      variableCollectionId: (collection as { id: string }).id,
      setValueForMode: vi.fn(),
    })),
  },

  // Mixed symbol
  mixed: Symbol("figma.mixed"),
};

// Register the mock page's parent
(_nodes.get("page-1") as Record<string, unknown>).parent = figma.root;

// ── Test helper — register a node for getNodeById lookup ─────

export function registerTestNode(
  type: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return registerNode(makeNode(type, overrides));
}

export function clearNodes(): void {
  _nodes.clear();
  _nodes.set("page-1", mockPage);
}

export { makeNode };
