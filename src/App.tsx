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

function getRootAngleSlots(count: number): number[] {
  if (count <= 1) return [12];
  if (count === 2) return [24, 8];
  if (count === 3) return [68, 36, 10];
  if (count === 4) return [76, 56, 30, 8];
  if (count <= 6) return [80, 66, 48, 28, 12, 2];
  return [82, 70, 58, 42, 26, 12, 0, -8];
}

function getDynamicRootOffset(index: number, count: number): { x: number; y: number } {
  const slots = getRootAngleSlots(count);
  const angle = slots[Math.min(index, slots.length - 1)] - Math.max(0, index - slots.length + 1) * 4;
  const length = count <= 2 ? 250 + index * 170 : 250 + index * 135 + Math.max(0, index - 3) * 42;
  const radians = angle * Math.PI / 180;

  return {
    x: Math.max(Math.cos(radians) * length, index < 2 ? 88 : 0),
    y: Math.sin(radians) * length,
  };
}

function avoidRootCollision(
  offset: { x: number; y: number },
  sideFactor: -1 | 1,
  occupied: Array<{ x: number; y: number; span: number }>,
  span = 44,
): { x: number; y: number } {
  let next = { ...offset };

  while (occupied.some((node) => Math.abs(node.x - sideFactor * next.x) < 230 && Math.abs(node.y - next.y) < (node.span + span) / 2 + 34)) {
    const angle = Math.atan2(next.y, Math.max(1, next.x));
    next.x += Math.cos(angle) * 86;
    next.y += Math.sin(angle) * 86;
  }

  occupied.push({ x: sideFactor * next.x, y: next.y, span });
  return next;
}

function App() {
  const [document, setDocument] = useState<NametreeDocument | null>(null);
  const [undoStack, setUndoStack] = useState<NametreeDocument[]>([]);
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
      setUndoStack([]);
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
    const isTextEditingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const isTextInput = isTextEditingTarget(event.target);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoLastChange();
        return;
      }

      if (!isTextInput && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        deleteSelectedNode();
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void createNewDocument();
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveCurrentDocument(event.shiftKey);
      }

      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openDocumentFile();
      }
    };

    const handleCopy = (event: ClipboardEvent) => {
      if (isTextEditingTarget(event.target)) return;

      const text = getSelectedNodeCopyText();
      if (!text) return;

      event.preventDefault();
      event.clipboardData?.setData('text/plain', text);
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (isTextEditingTarget(event.target)) return;

      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) return;

      event.preventDefault();
      pasteTextIntoSelectedNode(text);
    };

    const unlistenNew = listen('menu-new-document', () => void createNewDocument());
    const unlistenOpen = listen('menu-open-document', () => void openDocumentFile());
    const unlistenSave = listen('menu-save-document', () => void saveCurrentDocument());
    const unlistenSaveAs = listen('menu-save-as-document', () => void saveCurrentDocument(true));
    const unlistenUndo = listen('menu-undo-document', () => undoLastChange());
    const unlistenDelete = listen('menu-delete-node', () => deleteSelectedNode());

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
      void unlistenNew.then((unlisten) => unlisten());
      void unlistenOpen.then((unlisten) => unlisten());
      void unlistenSave.then((unlisten) => unlisten());
      void unlistenSaveAs.then((unlisten) => unlisten());
      void unlistenUndo.then((unlisten) => unlisten());
      void unlistenDelete.then((unlisten) => unlisten());
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
    setUndoStack([]);
    setDocumentPath(null);
    setSelectedNodeId(normalizedTree.nodes[0]?.id ?? null);
    setEditingNodeId(null);
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
  }

  async function saveCurrentDocument(saveAs = false) {
    if (!document) return;

    try {
      const targetPath = !saveAs && documentPath ? documentPath : await save({
        defaultPath: getDocumentFileName(document),
        filters: [{ name: 'Nametree', extensions: ['nt'] }],
      });
      if (!targetPath) return;

      const savedPath = await invoke<string>('save_nt_file', { path: targetPath, document });
      setDocumentPath(savedPath);
    } catch (error) {
      console.error('Failed to save Nametree document', error);
    }
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
    setUndoStack([]);
    setDocumentPath(openedFile.path);
    setSelectedNodeId(normalizedTree.nodes[0]?.id ?? null);
    setEditingNodeId(null);
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
  }

  function commitDocument(nextDocument: NametreeDocument, nextSelectedNodeId = selectedNodeId) {
    if (!document) return;

    setUndoStack((stack) => [...stack.slice(-49), document]);
    setDocument(normalizeTreeLayout(nextDocument));
    setSelectedNodeId(nextSelectedNodeId ?? null);
  }

  function undoLastChange() {
    setUndoStack((stack) => {
      const previousDocument = stack[stack.length - 1];
      if (!previousDocument) return stack;

      setDocument(previousDocument);
      setSelectedNodeId((currentId) => previousDocument.nodes.some((node) => node.id === currentId) ? currentId : previousDocument.nodes[0]?.id ?? null);
      setEditingNodeId(null);
      return stack.slice(0, -1);
    });
  }

  function deleteSelectedNode() {
    if (!document || !selectedNode || selectedNode.kind === 'seed_root') return;

    const idsToDelete = collectDescendantNodeIds(document, selectedNode.id);
    const nextDocument = {
      ...document,
      nodes: document.nodes.filter((node) => !idsToDelete.has(node.id)),
      tree_edges: document.tree_edges.filter((edge) => !idsToDelete.has(edge.parent_id) && !idsToDelete.has(edge.child_id)),
      reference_links: document.reference_links.filter((link) => !idsToDelete.has(link.source_id) && !idsToDelete.has(link.target_id)),
    };
    const parentEdge = document.tree_edges.find((edge) => edge.child_id === selectedNode.id);
    const nextSelectedNodeId = parentEdge && !idsToDelete.has(parentEdge.parent_id)
      ? parentEdge.parent_id
      : nextDocument.nodes[0]?.id ?? null;

    setEditingNodeId(null);
    commitDocument(nextDocument, nextSelectedNodeId);
  }

  function getSelectedNodeCopyText(): string {
    if (!selectedNode || !isKnowledgeNode(selectedNode)) return '';

    return selectedNode.note.trim()
      ? `${selectedNode.title}\n${selectedNode.note}`
      : selectedNode.title;
  }

  function pasteTextIntoSelectedNode(text: string) {
    if (!selectedNode || !isKnowledgeNode(selectedNode)) return;

    updateSelectedNode({ note: selectedNode.note ? `${selectedNode.note}\n${text}` : text });
  }

  function updateSelectedNode(patch: Partial<TreeNode>) {
    if (!document || !selectedNodeId || !selectedNode || !isKnowledgeNode(selectedNode)) return;

    updateNode(selectedNodeId, patch);
  }

  function updateNode(nodeId: string, patch: Partial<TreeNode>) {
    if (!document) return;

    commitDocument({
      ...document,
      nodes: document.nodes.map((node) => (
        node.id === nodeId ? { ...node, ...patch } : node
      )),
    });
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

    const nextDocument = {
      ...document,
      nodes: [...document.nodes, newNode],
      tree_edges: nextEdges,
    };

    commitDocument(nextDocument, newNode.id);
  }

  if (!document) {
    return <main className="app-shell">Loading Nametree...</main>;
  }

  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));

  return (
    <main className="app-shell" style={{ gridTemplateColumns: `minmax(0, 1fr) 6px ${detailPanelWidth}px` }}>
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
                d={isOutputEdge(parent, child) ? createOutputEdgePath(parent, child, shape) : isRootEdge(parent, child) ? createRootEdgePath(parent, child, shape) : createCurve(getConnectionPoint(parent, child, shape), child)}
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
                <path className="suggestion-edge" d={isOutputEdge(parent, suggestion) ? createOutputEdgePath(parent, suggestion, shape) : isRootEdge(parent, suggestion) ? createRootEdgePath(parent, suggestion, shape) : createCurve(getConnectionPoint(parent, suggestion, shape), suggestion)} />
                <g transform={`translate(${suggestion.x}, ${suggestion.y})`}>
                  {suggestion.kind === 'leaf' ? (
                    <path className="leaf-node-shape" d={createLeafShapePath()} fill={suggestion.fillColor} stroke={suggestion.color} />
                  ) : (
                    <rect x="-58" y="-18" width="116" height="36" rx="6" fill={suggestion.fillColor} stroke={suggestion.color} />
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
              <path className="root-crown-shape" d={createRootCrownPath(shape)} />
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
                <path className="leaf-node-shape" d={createLeafShapePath()} fill={node.fillColor ?? '#ffffff'} stroke={node.color} />
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
              <div className="panel-actions">
                <button type="button" onClick={undoLastChange} disabled={undoStack.length === 0}>撤销</button>
                <button type="button" className="danger-action" onClick={deleteSelectedNode} disabled={selectedNode.kind === 'seed_root'}>删除</button>
              </div>
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

function collectDescendantNodeIds(document: NametreeDocument, nodeId: string): Set<string> {
  const ids = new Set([nodeId]);
  let changed = true;

  while (changed) {
    changed = false;
    document.tree_edges.forEach((edge) => {
      if (ids.has(edge.parent_id) && !ids.has(edge.child_id)) {
        ids.add(edge.child_id);
        changed = true;
      }
    });
  }

  return ids;
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
    const parentSide = selectedNode.side ?? (selectedNode.x < shape.centerX ? 'left' : 'right');
    const parentSideFactor = parentSide === 'left' ? -1 : 1;
    const childX = selectedNode.x + parentSideFactor * 178;
    const siblingCount = document.tree_edges.filter((edge) => edge.parent_id === selectedNode.id).length;
    const childY = findFreeRootSuggestionY(document.nodes, childX, Math.max(shape.groundY + 56, selectedNode.y + siblingCount * 70));

    return [
      createSuggestionAt(selectedNode, 'root_branch', '子根系', childX, childY, parentSide),
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
    const leftRootCount = rootChildren.filter((node) => (node.side ?? 'right') === 'left').length;
    const rightRootCount = rootChildren.filter((node) => (node.side ?? 'right') === 'right').length;
    const leftRootTotal = leftRootCount + 1;
    const rightRootTotal = rightRootCount + 1;
    const leftRootOffset = getDynamicRootOffset(leftRootCount, leftRootTotal);
    const rightRootOffset = getDynamicRootOffset(rightRootCount, rightRootTotal);
    const leftRootX = shape.centerX - leftRootOffset.x - 8;
    const rightRootX = shape.centerX + rightRootOffset.x + 8;
    const leftRootY = shape.groundY + leftRootOffset.y;
    const rightRootY = shape.groundY + rightRootOffset.y;

    return [
      createSuggestionAt(selectedNode, 'root_branch', '左主根', leftRootX, leftRootY, 'left'),
      createSuggestionAt(selectedNode, 'root_branch', '右主根', rightRootX, rightRootY, 'right'),
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

function findFreeRootSuggestionY(nodes: TreeNode[], x: number, preferredY: number): number {
  let y = preferredY;
  const nodeHeight = 66;
  const xTolerance = 150;

  while (nodes.some((node) => Math.abs(node.x - x) < xTolerance && Math.abs(node.y - y) < nodeHeight)) {
    y += nodeHeight + 18;
  }

  return y;
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

  const rootNodeHeight = 44;
  const rootSiblingGap = 26;
  const rootLevelDistance = 250;
  const rootTopY = shape.groundY + 56;

  const getRootSpan = (node: TreeNode): number => {
    const children = rootChildrenByParent.get(node.id) ?? [];
    if (children.length === 0) return rootNodeHeight;

    const total = children.reduce((sum, child) => sum + getRootSpan(child), 0) + Math.max(0, children.length - 1) * rootSiblingGap;
    return Math.max(rootNodeHeight, total);
  };

  const layoutRootStack = (nodes: TreeNode[], sideFactor: -1 | 1, x: number, startY: number) => {
    let cursor = Math.max(rootTopY, startY);

    nodes.forEach((node) => {
      const span = getRootSpan(node);
      layoutRootSubtree(node, sideFactor, x, Math.max(rootTopY, cursor + span / 2));
      cursor += span + rootSiblingGap;
    });
  };

  const layoutRootSubtree = (node: TreeNode, sideFactor: -1 | 1, x: number, y: number) => {
    node.x = x;
    node.y = Math.max(rootTopY, y);
    node.side = sideFactor === -1 ? 'left' : 'right';

    const children = rootChildrenByParent.get(node.id) ?? [];
    if (children.length === 0) return;

    const totalSpan = children.reduce((sum, child) => sum + getRootSpan(child), 0) + Math.max(0, children.length - 1) * rootSiblingGap;
    layoutRootStack(children, sideFactor, x + sideFactor * rootLevelDistance, Math.max(rootTopY, node.y - totalSpan / 2));
  };

  const layoutRootSide = (side: GrowthSide, sideFactor: -1 | 1) => {
    const trunkRoots = (rootChildrenByParent.get(mainTrunk?.id ?? '') ?? []).filter((node) => (node.side ?? 'right') === side);
    const legacyRoots = (rootChildrenByParent.get(mainRoot?.id ?? '') ?? []).filter((node) => (node.side ?? 'right') === side);
    const children = [...trunkRoots, ...legacyRoots];
    if (children.length === 0) return;

    const occupied: Array<{ x: number; y: number; span: number }> = [];
    const addDescendantOccupancy = (node: TreeNode) => {
      const descendants = rootChildrenByParent.get(node.id) ?? [];
      descendants.forEach((descendant) => {
        occupied.push({
          x: sideFactor * Math.abs(descendant.x - shape.centerX),
          y: descendant.y - shape.groundY,
          span: getRootSpan(descendant),
        });
        addDescendantOccupancy(descendant);
      });
    };

    children.forEach((child, index) => {
      const offset = avoidRootCollision(getDynamicRootOffset(index, children.length), sideFactor, occupied, getRootSpan(child));
      const childX = shape.centerX + sideFactor * (offset.x + 8);
      const childY = Math.max(rootTopY, shape.groundY + offset.y);
      layoutRootSubtree(child, sideFactor, childX, childY);
      addDescendantOccupancy(child);
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

  const trunkChildren = childrenByParent.get(mainTrunk.id) ?? [];

  const layoutTrunkSide = (side: GrowthSide, sideFactor: -1 | 1) => {
    const children = trunkChildren.filter((node) => (node.side ?? 'right') === side);
    let cursor = shape.groundY - 82 + (side === 'right' ? -22 : 0);

    children.forEach((node) => {
      const span = getSpan(node);
      layoutSubtree(node, sideFactor, shape.centerX + sideFactor * 238, cursor - span / 2);
      cursor -= span + siblingGap;
    });
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

function createRootCrownPath(shape: TreeShape): string {
  const x = shape.centerX;
  const y = shape.groundY + 3;

  return `M ${x - 11} ${y - 12} C ${x - 16} ${y - 3}, ${x - 24} ${y + 7}, ${x - 34} ${y + 15} C ${x - 18} ${y + 12}, ${x - 8} ${y + 12}, ${x} ${y + 16} C ${x + 8} ${y + 12}, ${x + 18} ${y + 12}, ${x + 34} ${y + 15} C ${x + 24} ${y + 7}, ${x + 16} ${y - 3}, ${x + 11} ${y - 12} Z`;
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

function isRootEdge(parent: Pick<TreeNode, 'kind'>, child: Pick<TreeNode, 'kind'>): boolean {
  return (parent.kind === 'main_trunk' || parent.kind === 'root_branch' || parent.kind === 'main_root') && child.kind === 'root_branch';
}

function createOutputEdgePath(parent: Pick<TreeNode, 'kind' | 'x' | 'y'>, child: Pick<TreeNode, 'kind' | 'x' | 'y'>, shape: TreeShape): string {
  const sideFactor = child.x < shape.centerX ? -1 : 1;
  const childEdgeX = child.x - sideFactor * 54;

  if (parent.kind === 'main_trunk') {
    const parentEdgeX = shape.centerX + sideFactor * 10;
    const parentEdgeY = child.y + 42;

    return `M ${parentEdgeX} ${parentEdgeY} L ${childEdgeX} ${child.y}`;
  }

  const parentEdgeX = parent.x + sideFactor * 54;
  const parentEdgeY = parent.y;
  const middleX = (parentEdgeX + childEdgeX) / 2;

  return `M ${parentEdgeX} ${parentEdgeY} L ${middleX} ${parentEdgeY} L ${middleX} ${child.y} L ${childEdgeX} ${child.y}`;
}

function getRootCrownAttachPoint(child: Pick<TreeNode, 'x' | 'y'>, shape: TreeShape): Pick<TreeNode, 'x' | 'y'> {
  const side: GrowthSide = child.x < shape.centerX ? 'left' : 'right';
  const sideFactor = side === 'left' ? -1 : 1;
  const dx = Math.abs(child.x - shape.centerX);
  const dy = Math.max(0, child.y - shape.groundY);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const fanIndex = angle > 72 ? 0 : angle > 56 ? 1 : angle > 36 ? 2 : angle > 16 ? 3 : 4;
  const crownSlots = [
    { x: 8, y: 12 },
    { x: 12, y: 8 },
    { x: 14, y: 4 },
    { x: 11, y: 1 },
    { x: 7, y: -2 },
  ];
  const slot = crownSlots[Math.min(fanIndex, crownSlots.length - 1)];

  return {
    x: shape.centerX + sideFactor * slot.x,
    y: shape.groundY + slot.y,
  };
}

function createRootEdgePath(parent: Pick<TreeNode, 'kind' | 'x' | 'y'>, child: Pick<TreeNode, 'kind' | 'x' | 'y'>, shape: TreeShape): string {
  const sideFactor = child.x < shape.centerX ? -1 : 1;

  if (parent.kind === 'main_trunk' || parent.kind === 'main_root') {
    const parentEdge = getRootCrownAttachPoint(child, shape);
    const labelEdge = {
      x: child.x - sideFactor * 58,
      y: child.y,
    };
    const verticalDrop = Math.max(1, labelEdge.y - parentEdge.y);
    const horizontalReach = Math.max(1, Math.abs(labelEdge.x - parentEdge.x));
    const firstControl = {
      x: parentEdge.x + sideFactor * Math.min(20, horizontalReach * 0.08),
      y: parentEdge.y + verticalDrop * 0.56,
    };
    const secondControl = {
      x: labelEdge.x - sideFactor * Math.min(180, Math.max(72, horizontalReach * 0.42)),
      y: labelEdge.y - verticalDrop * 0.34,
    };

    return `M ${parentEdge.x} ${parentEdge.y} C ${firstControl.x} ${firstControl.y}, ${secondControl.x} ${secondControl.y}, ${labelEdge.x} ${labelEdge.y}`;
  }

  const parentEdgeX = parent.x + sideFactor * 54;
  const parentEdgeY = parent.y;
  const childEdgeX = child.x - sideFactor * 54;
  const middleX = (parentEdgeX + childEdgeX) / 2;

  return `M ${parentEdgeX} ${parentEdgeY} L ${middleX} ${parentEdgeY} L ${middleX} ${child.y} L ${childEdgeX} ${child.y}`;
}

function createCurve(parent: Pick<TreeNode, 'x' | 'y'>, child: Pick<TreeNode, 'x' | 'y'>): string {
  const middleX = (parent.x + child.x) / 2;
  return `M ${parent.x} ${parent.y} C ${middleX} ${parent.y}, ${middleX} ${child.y}, ${child.x} ${child.y}`;
}

export default App;
