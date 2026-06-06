import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';

const treeReferenceImage = new URL('../images/tree1.jpg', import.meta.url).href;
const nametreeLogo = treeReferenceImage;

type NodeKind = 'seed_root' | 'main_trunk' | 'main_root' | 'branch' | 'leaf' | 'root_branch';
type LinkDirection = 'one_way' | 'two_way';

type GrowthSide = 'left' | 'right';

type TreeNode = {
  id: string;
  title: string;
  note: string;
  kind: NodeKind;
  color: string;
  fillColor?: string;
  x: number;
  y: number;
  side?: GrowthSide;
};

type TreeEdge = {
  parent_id: string;
  child_id: string;
};

type ReferenceLink = {
  id: string;
  source_id: string;
  target_id: string;
  direction: LinkDirection;
  label: string;
};

type NametreeDocument = {
  id: string;
  title: string;
  slogan: string;
  nodes: TreeNode[];
  tree_edges: TreeEdge[];
  reference_links: ReferenceLink[];
};

type OpenedNtFile = {
  path: string;
  document: NametreeDocument;
};

type Suggestion = {
  id: string;
  title: string;
  note: string;
  kind: NodeKind;
  color: string;
  fillColor: string;
  x: number;
  y: number;
  parentId: string;
  side?: GrowthSide;
};

type TreeShape = {
  centerX: number;
  groundY: number;
  trunkTopY: number;
  trunkWidth: number;
  rootEndY: number;
  rootWidth: number;
};

const kindLabel: Record<NodeKind, string> = {
  seed_root: '开始',
  main_trunk: '主干',
  main_root: '主根',
  branch: '树枝',
  leaf: '叶子',
  root_branch: '根系',
};

const defaultColorByKind: Record<NodeKind, string> = {
  seed_root: '#7b6b55',
  main_trunk: '#5f7f45',
  main_root: '#8b6f47',
  branch: '#d9a441',
  leaf: '#7fb069',
  root_branch: '#9a7b4f',
};

function App() {
  const [document, setDocument] = useState<NametreeDocument | null>(null);
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [detailPanelWidth, setDetailPanelWidth] = useState(238);
  const [panelResizeStart, setPanelResizeStart] = useState<{ pointerX: number; width: number } | null>(null);

  useEffect(() => {
    invoke<NametreeDocument>('load_sample_tree').then((tree) => {
      const normalizedTree = normalizeTreeLayout(tree);
      setDocument(normalizedTree);
      setSelectedNodeId(normalizedTree.nodes[0]?.id ?? null);
      setCanvasOffset({ x: 0, y: 0 });
      setZoom(1);
    });
  }, []);

  useEffect(() => {
    if (!panelResizeStart) return;

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = panelResizeStart.width - (event.clientX - panelResizeStart.pointerX);
      setDetailPanelWidth(Math.min(420, Math.max(190, nextWidth)));
    };

    const handlePointerUp = () => {
      setPanelResizeStart(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [panelResizeStart]);

  useEffect(() => {
    if (!document) return;

    void getCurrentWindow().setTitle(getDocumentFileName(document, documentPath));
  }, [document, documentPath]);

  const selectedNode = useMemo(
    () => document?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [document, selectedNodeId],
  );

  const shape = useMemo(
    () => (document ? getTreeShape(document) : getTreeShape({ nodes: [], tree_edges: [], reference_links: [], id: '', title: '', slogan: '' })),
    [document],
  );

  const visibleKnowledgeNodes = useMemo(
    () => (document ? document.nodes.filter((node) => isKnowledgeNode(node)) : []),
    [document],
  );

  const suggestions = useMemo(
    () => (document && selectedNode ? getSuggestions(document, selectedNode, shape) : []),
    [document, selectedNode, shape],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void createNewDocument();
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveCurrentDocument();
      }

      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openDocumentFile();
      }
    };

    const unlistenNew = listen('menu-new-document', () => void createNewDocument());
    const unlistenOpen = listen('menu-open-document', () => void openDocumentFile());
    const unlistenSave = listen('menu-save-document', () => void saveCurrentDocument());

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      void unlistenNew.then((unlisten) => unlisten());
      void unlistenOpen.then((unlisten) => unlisten());
      void unlistenSave.then((unlisten) => unlisten());
    };
  }, [document, documentPath]);

  async function createNewDocument() {
    const tree = await invoke<NametreeDocument>('load_sample_tree');
    const normalizedTree = normalizeTreeLayout({
      ...tree,
      id: crypto.randomUUID(),
      title: '未保存',
    });
    setDocument(normalizedTree);
    setDocumentPath(null);
    setSelectedNodeId(normalizedTree.nodes[0]?.id ?? null);
    setEditingNodeId(null);
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
  }

  async function saveCurrentDocument() {
    if (!document) return;

    const targetPath = documentPath ?? await save({
      defaultPath: getDocumentFileName(document),
      filters: [{ name: 'Nametree', extensions: ['nt'] }],
    });
    if (!targetPath) return;

    const savedPath = await invoke<string>('save_nt_file', { path: targetPath, document });
    setDocumentPath(savedPath);
  }

  async function openDocumentFile() {
    const selectedPath = await open({
      multiple: false,
      filters: [{ name: 'Nametree', extensions: ['nt'] }],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;

    const openedFile = await invoke<OpenedNtFile>('open_nt_file', { path: selectedPath });
    const normalizedTree = normalizeTreeLayout(openedFile.document);
    setDocument(normalizedTree);
    setDocumentPath(openedFile.path);
    setSelectedNodeId(normalizedTree.nodes[0]?.id ?? null);
    setEditingNodeId(null);
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
  }

  function updateSelectedNode(patch: Partial<TreeNode>) {
    if (!document || !selectedNodeId || !selectedNode || !isKnowledgeNode(selectedNode)) return;

    updateNode(selectedNodeId, patch);
  }

  function updateNode(nodeId: string, patch: Partial<TreeNode>) {
    if (!document) return;

    setDocument(normalizeTreeLayout({
      ...document,
      nodes: document.nodes.map((node) => (
        node.id === nodeId ? { ...node, ...patch } : node
      )),
    }));
  }

  function createSuggestedNode(suggestion: Suggestion) {
    if (!document) return;

    const newNode: TreeNode = {
      id: crypto.randomUUID(),
      title: suggestion.title,
      note: suggestion.note,
      kind: suggestion.kind,
      color: suggestion.color,
      x: suggestion.x,
      y: suggestion.y,
      side: suggestion.side,
    };

    const nextEdges = suggestion.kind === 'main_trunk'
      ? document.tree_edges
      : [...document.tree_edges, { parent_id: suggestion.parentId, child_id: newNode.id }];

    const nextDocument = normalizeTreeLayout({
      ...document,
      nodes: [...document.nodes, newNode],
      tree_edges: nextEdges,
    });

    setDocument(nextDocument);
    setSelectedNodeId(newNode.id);
  }

  if (!document) {
    return <main className="app-shell">Loading Nametree...</main>;
  }

  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));

  return (
    <main className="app-shell" style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${detailPanelWidth}px` }}>
      <div className="window-title-bar" data-tauri-drag-region>{getDocumentFileName(document, documentPath)}</div>
      <section className="canvas-panel">
        <img className="canvas-logo" src={nametreeLogo} alt="Nametree logo" />

        <svg
          className="tree-canvas"
          viewBox="0 0 900 700"
          role="img"
          aria-label="Nametree knowledge tree"
          onWheel={(event) => {
            event.preventDefault();

            if (event.metaKey || event.ctrlKey) {
              const delta = event.deltaY > 0 ? -0.04 : 0.04;
              setZoom((value) => Math.min(1.8, Math.max(0.25, Number((value + delta).toFixed(2)))));
              return;
            }

            setCanvasOffset((value) => ({
              x: value.x - event.deltaX,
              y: value.y - event.deltaY,
            }));
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;

            setPanStart({
              pointerX: event.clientX,
              pointerY: event.clientY,
              offsetX: canvasOffset.x,
              offsetY: canvasOffset.y,
            });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!panStart) return;

            const nextX = panStart.offsetX + event.clientX - panStart.pointerX;
            const nextY = panStart.offsetY + event.clientY - panStart.pointerY;
            setIsPanning(Math.abs(nextX - panStart.offsetX) > 3 || Math.abs(nextY - panStart.offsetY) > 3);
            setCanvasOffset({ x: nextX, y: nextY });
          }}
          onPointerUp={() => {
            window.setTimeout(() => setIsPanning(false), 0);
            setPanStart(null);
          }}
          onPointerLeave={() => {
            window.setTimeout(() => setIsPanning(false), 0);
            setPanStart(null);
          }}
        >
          <g transform={`translate(${450 + canvasOffset.x} ${350 + canvasOffset.y}) scale(${zoom}) translate(-450 -350)`}>

          {!mainTrunk && seed && (
            <g
              className={`start-guide ${selectedNodeId === seed.id ? 'selected' : ''}`}
              transform={`translate(${seed.x}, ${seed.y})`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setSelectedNodeId(seed.id);
              }}
            >
              <circle r="42" />
              <text textAnchor="middle" y="-4">开始</text>
              <text className="node-kind" textAnchor="middle" y="18">点击生长</text>
            </g>
          )}

          {document.tree_edges.map((edge) => {
            const parent = nodeById.get(edge.parent_id);
            const child = nodeById.get(edge.child_id);
            if (!parent || !child || !isKnowledgeNode(child)) return null;

            return (
              <path
                key={`${edge.parent_id}-${edge.child_id}`}
                className={child.kind === 'root_branch' ? 'root-edge' : parent.kind === 'main_trunk' ? 'trunk-edge' : 'tree-edge'}
                d={isOutputEdge(parent, child) ? createOutputEdgePath(parent, child, shape) : createCurve(getConnectionPoint(parent, child, shape), child)}
              />
            );
          })}

          {document.reference_links.map((link) => {
            const source = nodeById.get(link.source_id);
            const target = nodeById.get(link.target_id);
            if (!source || !target) return null;

            return (
              <path
                key={link.id}
                className={`reference-link ${link.direction}`}
                d={createCurve(source, target)}
              />
            );
          })}

          {suggestions.map((suggestion) => {
            const parent = nodeById.get(suggestion.parentId);
            if (!parent) return null;

            return (
              <g
                key={suggestion.id}
                className="suggestion-group"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  createSuggestedNode(suggestion);
                }}
              >
                <path className="suggestion-edge" d={isOutputEdge(parent, suggestion) ? createOutputEdgePath(parent, suggestion, shape) : createCurve(getConnectionPoint(parent, suggestion, shape), suggestion)} />
                <g transform={`translate(${suggestion.x}, ${suggestion.y})`}>
                  {suggestion.kind === 'leaf' ? (
                    <path className="leaf-node-shape" d={createLeafShapePath()} fill="#ffffff" stroke={suggestion.color} />
                  ) : (
                    <rect x="-58" y="-18" width="116" height="36" rx="6" fill="#ffffff" stroke={suggestion.color} />
                  )}
                  <text textAnchor="middle" y="5">{suggestion.title}</text>
                </g>
              </g>
            );
          })}

          {mainTrunk && (
            <g
              className={`tree-structure ${selectedNodeId === mainTrunk.id ? 'selected' : ''}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setSelectedNodeId(mainTrunk.id);
              }}
            >
              <rect
                className="trunk-shape"
                x={shape.centerX - 10}
                y={getTrunkTopY(shape, document.nodes, suggestions)}
                width="20"
                height={shape.groundY + 12 - getTrunkTopY(shape, document.nodes, suggestions)}
                rx="10"
              />
              <rect
                className="structure-hitbox"
                x={shape.centerX - 18}
                y={getTrunkTopY(shape, document.nodes, suggestions)}
                width="36"
                height={shape.groundY + 12 - getTrunkTopY(shape, document.nodes, suggestions)}
                rx="12"
              />
            </g>
          )}

          {visibleKnowledgeNodes.map((node) => (
            <g
              key={node.id}
              className={`tree-node ${selectedNodeId === node.id ? 'selected' : ''}`}
              transform={`translate(${node.x}, ${node.y})`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                if (isPanning) return;
                setSelectedNodeId(node.id);
              }}
              onDoubleClick={() => {
                setSelectedNodeId(node.id);
                setEditingNodeId(node.id);
              }}
            >
              {node.kind === 'leaf' ? (
                <path className="leaf-node-shape" d={createLeafShapePath()} fill="#ffffff" stroke={node.color} />
              ) : (
                <rect x="-54" y="-17" width="108" height="34" rx="6" fill={node.fillColor ?? '#ffffff'} stroke={node.color} />
              )}
              {editingNodeId === node.id ? (
                <foreignObject x="-50" y="-14" width="100" height="28">
                  <input
                    className="node-title-input"
                    autoFocus
                    value={node.title}
                    onChange={(event) => updateNode(node.id, { title: event.target.value })}
                    onBlur={() => setEditingNodeId(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </foreignObject>
              ) : (
                <text textAnchor="middle" y="5">{node.title}</text>
              )}
            </g>
          ))}
          </g>
        </svg>
      </section>

      <div
        className="panel-resizer"
        onPointerDown={(event) => {
          event.preventDefault();
          setPanelResizeStart({ pointerX: event.clientX, width: detailPanelWidth });
        }}
      />

      <aside className="detail-panel">
        {selectedNode ? (
          <>
            <div className="panel-heading">
              <p className="eyebrow">当前选择</p>
            </div>

            {isKnowledgeNode(selectedNode) ? (
              <>
                <h2>{selectedNode.title}</h2>
                <span className="kind-pill">{kindLabel[selectedNode.kind]}</span>
                <label className="color-row">
                  <span>边框颜色</span>
                  <input
                    type="color"
                    value={selectedNode.color}
                    onChange={(event) => updateSelectedNode({ color: event.target.value })}
                  />
                </label>
                <label className="color-row">
                  <span>填充颜色</span>
                  <input
                    type="color"
                    value={selectedNode.fillColor ?? '#ffffff'}
                    onChange={(event) => updateSelectedNode({ fillColor: event.target.value })}
                  />
                </label>
                <h3>可生长</h3>
                <p className="note">{suggestions.length > 0 ? suggestions.map((suggestion) => suggestion.title).join('、') : '当前选择暂无可选生长方向。'}</p>
                <h3>内容</h3>
                <textarea
                  className="node-note-editor"
                  value={selectedNode.note}
                  onChange={(event) => updateSelectedNode({ note: event.target.value })}
                />
              </>
            ) : (
              <>
                <h2>{selectedNode.title}</h2>
                <span className="kind-pill">{kindLabel[selectedNode.kind]}</span>
                <p className="note structure-note">这是树的结构或起点，不作为普通知识节点编辑。</p>
                <h3>可生长</h3>
                <p className="note">{suggestions.length > 0 ? suggestions.map((suggestion) => suggestion.title).join('、') : '当前选择暂无可选生长方向。'}</p>
              </>
            )}
          </>
        ) : (
          <p>选择一个节点查看或编辑。</p>
        )}

        <div className="brand-card">
          <img className="app-logo" src={nametreeLogo} alt="Nametree logo" />
          <div className="brand-copy">
            <p className="eyebrow">NameTree</p>
            <p className="slogan">{document.slogan}</p>
          </div>
        </div>
      </aside>
    </main>
  );
}

function isKnowledgeNode(node: TreeNode): boolean {
  return node.kind === 'branch' || node.kind === 'leaf' || node.kind === 'root_branch';
}

function getDocumentFileName(document: NametreeDocument, documentPath?: string | null): string {
  if (documentPath) {
    return documentPath.split(/[\\/]/).pop() ?? '未保存.nt';
  }

  const title = document.title.trim() || '未保存';
  return title.endsWith('.nt') ? title : `${title}.nt`;
}

function getTreeShape(document: NametreeDocument): TreeShape {
  const outputNodes = document.nodes.filter((node) => node.kind === 'branch' || node.kind === 'leaf');
  const outputCount = outputNodes.length;
  const rootCount = document.nodes.filter((node) => node.kind === 'root_branch').length;
  const groundY = 390;
  const highestOutputY = outputNodes.length > 0 ? Math.min(...outputNodes.map((node) => node.y)) : 340;
  const trunkTopY = outputNodes.length > 0 ? highestOutputY - 48 : 340;

  return {
    centerX: 450,
    groundY,
    trunkTopY: Math.max(16, trunkTopY),
    trunkWidth: Math.min(96, 46 + outputCount * 9),
    rootEndY: Math.min(660, 535 + rootCount * 30),
    rootWidth: Math.min(120, 64 + rootCount * 10),
  };
}

function getSuggestions(document: NametreeDocument, selectedNode: TreeNode, shape: TreeShape): Suggestion[] {
  const hasMainTrunk = document.nodes.some((node) => node.kind === 'main_trunk');
  const childNodes = document.tree_edges
    .filter((edge) => edge.parent_id === selectedNode.id)
    .map((edge) => document.nodes.find((node) => node.id === edge.child_id))
    .filter((node): node is TreeNode => Boolean(node));

  if (selectedNode.kind === 'seed_root') {
    return [
      !hasMainTrunk && createSuggestion(selectedNode, 'main_trunk', '主干', 0, -130),
    ].filter((suggestion): suggestion is Suggestion => Boolean(suggestion));
  }

  if (selectedNode.kind === 'main_trunk' || selectedNode.kind === 'branch') {
    return getOutputSuggestions(document, selectedNode, shape);
  }

  if (selectedNode.kind === 'main_root') {
    return [];
  }

  if (selectedNode.kind === 'root_branch') {
    const leftCount = countSideChildren(childNodes, 'left');
    const rightCount = countSideChildren(childNodes, 'right');
    const parentSideFactor = selectedNode.x < shape.centerX ? -1 : 1;

    return [
      createSuggestion(selectedNode, 'root_branch', '左根系', parentSideFactor * (142 + leftCount * 48) - 16, 82 + leftCount * 54, 'left'),
      createSuggestion(selectedNode, 'root_branch', '右根系', parentSideFactor * (142 + rightCount * 48) + 16, 82 + rightCount * 54, 'right'),
    ];
  }

  return [];
}

function getOutputSuggestions(document: NametreeDocument, selectedNode: TreeNode, shape: TreeShape): Suggestion[] {
  if (selectedNode.kind === 'main_trunk') {
    const leftX = shape.centerX - 238;
    const rightX = shape.centerX + 238;
    const placed: TreeNode[] = [...document.nodes];
    const leftY = findFreeOutputSuggestionY(placed, leftX, shape.groundY - 112);
    placed.push({ ...selectedNode, id: `${selectedNode.id}-left-candidate`, kind: 'branch', x: leftX, y: leftY, side: 'left' });
    const rightY = findFreeOutputSuggestionY(placed, rightX, shape.groundY - 112);
    const rootChildren = document.tree_edges
      .filter((edge) => edge.parent_id === selectedNode.id)
      .map((edge) => document.nodes.find((node) => node.id === edge.child_id))
      .filter((node): node is TreeNode => node?.kind === 'root_branch');
    const rootIndex = rootChildren.length;
    const rootSide: GrowthSide = rootIndex % 2 === 0 ? 'left' : 'right';
    const rootSideFactor = rootSide === 'left' ? -1 : 1;
    const rootX = shape.centerX + rootSideFactor * (118 + Math.floor(rootIndex / 2) * 92);
    const rootY = shape.groundY + 88 + Math.floor(rootIndex / 2) * 36;

    return [
      createSuggestionAt(selectedNode, 'root_branch', '根系', rootX, rootY, rootSide),
      createSuggestionAt(selectedNode, 'branch', '左树枝', leftX, leftY, 'left'),
      createSuggestionAt(selectedNode, 'branch', '右树枝', rightX, rightY, 'right'),
    ];
  }

  const parentSide = selectedNode.side ?? (selectedNode.x < shape.centerX ? 'left' : 'right');
  const parentSideFactor = parentSide === 'left' ? -1 : 1;
  const childX = selectedNode.x + parentSideFactor * 178;
  const placed: TreeNode[] = [...document.nodes];
  const branchY = findFreeOutputSuggestionY(placed, childX, selectedNode.y);
  placed.push({ ...selectedNode, id: `${selectedNode.id}-branch-candidate`, kind: 'branch', x: childX, y: branchY, side: parentSide });
  const leafY = findFreeOutputSuggestionY(placed, childX, selectedNode.y - 76);

  return [
    createSuggestionAt(selectedNode, 'branch', '子分支', childX, branchY, parentSide),
    createSuggestionAt(selectedNode, 'leaf', '叶子', childX, leafY, parentSide),
  ];
}

function createSuggestion(parent: TreeNode, kind: NodeKind, title: string, offsetX: number, offsetY: number, side?: GrowthSide): Suggestion {
  return {
    id: `${parent.id}-${kind}-${title}-${offsetX}-${offsetY}-${side ?? 'center'}`,
    title,
    note: `这是一个${title}节点，可以继续编辑名称、颜色和备注。`,
    kind,
    color: defaultColorByKind[kind],
    fillColor: '#ffffff',
    x: parent.x + offsetX,
    y: parent.y + offsetY,
    parentId: parent.id,
    side,
  };
}

function createSuggestionAt(parent: TreeNode, kind: NodeKind, title: string, x: number, y: number, side?: GrowthSide): Suggestion {
  return {
    id: `${parent.id}-${kind}-${title}-${x}-${y}-${side ?? 'center'}`,
    title,
    note: `这是一个${title}节点，可以继续编辑名称、颜色和备注。`,
    kind,
    color: defaultColorByKind[kind],
    fillColor: '#ffffff',
    x,
    y,
    parentId: parent.id,
    side,
  };
}

function findFreeOutputSuggestionY(nodes: TreeNode[], x: number, preferredY: number): number {
  let y = preferredY;
  const nodeHeight = 58;
  const xTolerance = 120;

  while (nodes.some((node) => Math.abs(node.x - x) < xTolerance && Math.abs(node.y - y) < nodeHeight)) {
    y -= nodeHeight + 18;
  }

  return y;
}

function countSideChildren(nodes: TreeNode[], side: GrowthSide): number {
  return nodes.filter((node) => node.side === side).length;
}

function normalizeTreeLayout(document: NametreeDocument): NametreeDocument {
  const shape = getTreeShape(document);
  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  const mainRoot = document.nodes.find((node) => node.kind === 'main_root');
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));

  const laidOutNodes = document.nodes.map((node) => ({ ...node }));
  const laidOutById = new Map(laidOutNodes.map((node) => [node.id, node]));
  const update = (id: string | undefined, x: number, y: number) => {
    const node = id ? laidOutById.get(id) : undefined;
    if (node) {
      node.x = x;
      node.y = y;
    }
  };

  update(seed?.id, shape.centerX, shape.groundY);
  update(mainTrunk?.id, shape.centerX, shape.groundY - 55);
  update(mainRoot?.id, shape.centerX, shape.groundY + 55);

  const outputChildrenByParent = new Map<string, TreeNode[]>();
  const rootChildrenByParent = new Map<string, TreeNode[]>();

  document.tree_edges.forEach((edge) => {
    const parent = nodeById.get(edge.parent_id);
    const child = laidOutById.get(edge.child_id);
    if (!parent || !child) return;

    if ((parent.kind === 'main_trunk' || parent.kind === 'branch') && (child.kind === 'branch' || child.kind === 'leaf')) {
      outputChildrenByParent.set(parent.id, [...(outputChildrenByParent.get(parent.id) ?? []), child]);
    }

    if ((parent.kind === 'main_trunk' || parent.kind === 'main_root' || parent.kind === 'root_branch') && child.kind === 'root_branch') {
      rootChildrenByParent.set(parent.id, [...(rootChildrenByParent.get(parent.id) ?? []), child]);
    }
  });

  layoutOutputTree(mainTrunk, outputChildrenByParent, shape);

  const laidOutOutputNodes = laidOutNodes.filter((node) => node.kind === 'branch' || node.kind === 'leaf');
  if (laidOutOutputNodes.length > 0) {
    const highestOutputY = Math.min(...laidOutOutputNodes.map((node) => node.y));
    shape.trunkTopY = Math.min(shape.trunkTopY, Math.max(16, highestOutputY - 72));
  }

  const getRootSpan = (node: TreeNode): number => {
    const children = rootChildrenByParent.get(node.id) ?? [];
    if (children.length === 0) return 96;

    return Math.max(96, children.reduce((total, child) => total + getRootSpan(child), 0) + (children.length - 1) * 28);
  };

  const layoutRootSubtree = (node: TreeNode, sideFactor: -1 | 1, x: number, y: number) => {
    node.x = x;
    node.y = y;

    const children = rootChildrenByParent.get(node.id) ?? [];
    if (children.length === 0) return;

    const totalSpan = children.reduce((total, child) => total + getRootSpan(child), 0) + (children.length - 1) * 28;
    let cursor = x - sideFactor * totalSpan / 2;

    children.forEach((child, index) => {
      const span = getRootSpan(child);
      const childX = cursor + sideFactor * span / 2;
      const childY = y + 96 + index * 28;
      layoutRootSubtree(child, sideFactor, childX, childY);
      cursor += sideFactor * (span + 28);
    });
  };

  const layoutRootSide = (side: GrowthSide, sideFactor: -1 | 1) => {
    const trunkRoots = (rootChildrenByParent.get(mainTrunk?.id ?? '') ?? []).filter((node) => (node.side ?? 'right') === side);
    const legacyRoots = (rootChildrenByParent.get(mainRoot?.id ?? '') ?? []).filter((node) => (node.side ?? 'right') === side);
    const children = [...trunkRoots, ...legacyRoots];
    const totalSpan = children.reduce((total, child) => total + getRootSpan(child), 0) + Math.max(0, children.length - 1) * 36;
    let cursor = shape.centerX + sideFactor * 140 - sideFactor * totalSpan / 2;

    children.forEach((child, index) => {
      const span = getRootSpan(child);
      const childX = cursor + sideFactor * span / 2;
      const childY = shape.groundY + 82 + index * 24;
      layoutRootSubtree(child, sideFactor, childX, childY);
      cursor += sideFactor * (span + 36);
    });
  };

  layoutRootSide('left', -1);
  layoutRootSide('right', 1);

  return { ...document, nodes: laidOutNodes };
}

function layoutOutputTree(
  mainTrunk: TreeNode | undefined,
  childrenByParent: Map<string, TreeNode[]>,
  shape: TreeShape,
) {
  if (!mainTrunk) return;

  const nodeHeight = 44;
  const siblingGap = 12;
  const levelDistance = 178;

  const getSpan = (node: TreeNode): number => {
    const children = childrenByParent.get(node.id) ?? [];
    if (children.length === 0) return nodeHeight;

    const total = children.reduce((sum, child) => sum + getSpan(child), 0) + Math.max(0, children.length - 1) * siblingGap;
    return Math.max(nodeHeight, total);
  };

  const layoutStack = (nodes: TreeNode[], sideFactor: -1 | 1, x: number, startY: number) => {
    let cursor = startY;

    nodes.forEach((node) => {
      const span = getSpan(node);
      layoutSubtree(node, sideFactor, x, cursor + span / 2);
      cursor += span + siblingGap;
    });
  };

  const layoutSubtree = (node: TreeNode, sideFactor: -1 | 1, x: number, y: number) => {
    node.x = x;
    node.y = y;

    const children = childrenByParent.get(node.id) ?? [];
    if (children.length === 0) return;

    const totalSpan = children.reduce((sum, child) => sum + getSpan(child), 0) + Math.max(0, children.length - 1) * siblingGap;
    layoutStack(children, sideFactor, x + sideFactor * levelDistance, y - totalSpan / 2);
  };

  const layoutTrunkSide = (side: GrowthSide, sideFactor: -1 | 1) => {
    const children = (childrenByParent.get(mainTrunk.id) ?? [])
      .filter((node) => (node.side ?? 'right') === side)
      .reverse();

    const totalSpan = children.reduce((sum, child) => sum + getSpan(child), 0) + Math.max(0, children.length - 1) * siblingGap;
    const lowestAllowedY = shape.groundY - 82;
    const sideYOffset = side === 'left' ? 0 : -(nodeHeight + siblingGap) / 2;
    const startY = lowestAllowedY - totalSpan + sideYOffset;

    layoutStack(children, sideFactor, shape.centerX + sideFactor * 238, startY);
  };

  layoutTrunkSide('left', -1);
  layoutTrunkSide('right', 1);
}

function getConnectionPoint(node: TreeNode, child: Pick<TreeNode, 'x' | 'y' | 'kind'>, shape: TreeShape): Pick<TreeNode, 'x' | 'y'> {
  if (node.kind === 'main_trunk') {
    const side = child.x < shape.centerX ? -1 : 1;

    if (child.kind === 'root_branch') {
      return {
        x: shape.centerX + side * 14,
        y: shape.groundY + 8,
      };
    }

    return {
      x: shape.centerX + side * 18,
      y: child.y,
    };
  }

  if (node.kind === 'main_root') {
    const side = child.x < shape.centerX ? -1 : 1;
    const attachY = Math.min(shape.rootEndY - 36, Math.max(shape.groundY + 58, child.y - 54));
    const progress = (attachY - shape.groundY) / Math.max(1, shape.rootEndY - shape.groundY);

    return {
      x: shape.centerX + side * Math.max(8, 24 - progress * 10),
      y: attachY,
    };
  }

  return node;
}

function getTrunkTopY(shape: TreeShape, nodes: TreeNode[], suggestions: Suggestion[]): number {
  const outputItems = [...nodes, ...suggestions].filter((node) => node.kind === 'branch' || node.kind === 'leaf');
  if (outputItems.length === 0) return shape.trunkTopY;

  return Math.min(...outputItems.map((node) => node.y)) - 36;
}

function createLeafShapePath(): string {
  return `M -52 0
    C -28 -26, 22 -24, 54 0
    C 22 24, -28 26, -52 0
    M -35 0 C -8 -4, 22 -3, 42 0`;
}

function isOutputEdge(parent: Pick<TreeNode, 'kind'>, child: Pick<TreeNode, 'kind'>): boolean {
  return (parent.kind === 'main_trunk' || parent.kind === 'branch') && (child.kind === 'branch' || child.kind === 'leaf');
}

function createOutputEdgePath(parent: Pick<TreeNode, 'kind' | 'x' | 'y'>, child: Pick<TreeNode, 'kind' | 'x' | 'y'>, shape: TreeShape): string {
  const sideFactor = child.x < shape.centerX ? -1 : 1;
  const parentEdgeX = parent.kind === 'main_trunk' ? shape.centerX : parent.x + sideFactor * 54;
  const parentEdgeY = parent.kind === 'main_trunk' ? child.y : parent.y;
  const childEdgeX = child.x - sideFactor * 54;
  const middleX = (parentEdgeX + childEdgeX) / 2;

  return `M ${parentEdgeX} ${parentEdgeY} L ${middleX} ${parentEdgeY} L ${middleX} ${child.y} L ${childEdgeX} ${child.y}`;
}

function createCurve(parent: Pick<TreeNode, 'x' | 'y'>, child: Pick<TreeNode, 'x' | 'y'>): string {
  const middleX = (parent.x + child.x) / 2;
  return `M ${parent.x} ${parent.y} C ${middleX} ${parent.y}, ${middleX} ${child.y}, ${child.x} ${child.y}`;
}

export default App;
