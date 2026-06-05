import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

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

type Suggestion = {
  id: string;
  title: string;
  note: string;
  kind: NodeKind;
  color: string;
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    invoke<NametreeDocument>('load_sample_tree').then((tree) => {
      const normalizedTree = normalizeTreeLayout(tree);
      setDocument(normalizedTree);
      setSelectedNodeId(normalizedTree.nodes[0]?.id ?? null);
    });
  }, []);

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

    const nextDocument = normalizeTreeLayout({
      ...document,
      nodes: [...document.nodes, newNode],
      tree_edges: [...document.tree_edges, { parent_id: suggestion.parentId, child_id: newNode.id }],
    });

    setDocument(nextDocument);
    setSelectedNodeId(newNode.id);
  }

  if (!document) {
    return <main className="app-shell">Loading Nametree...</main>;
  }

  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  const mainRoot = document.nodes.find((node) => node.kind === 'main_root');
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));

  return (
    <main className="app-shell">
      <section className="canvas-panel">
        <div className="brand-card">
          <img className="app-logo" src={nametreeLogo} alt="Nametree logo" />
          <div>
            <p className="eyebrow">NameTree</p>
            <p className="slogan">{document.slogan}</p>
          </div>
        </div>

        <div className="zoom-controls">
          <button onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(1))))}>缩小</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(1))))}>放大</button>
          <button onClick={() => setZoom(1)}>重置</button>
        </div>

        <svg className="tree-canvas" viewBox="0 0 900 700" role="img" aria-label="Nametree knowledge tree">
          <g transform={`translate(450 350) scale(${zoom}) translate(-450 -350)`}>
          <text className="zone-label" x="450" y="52" textAnchor="middle">树冠 / 输出</text>
          <text className="zone-label" x="450" y="650" textAnchor="middle">树根 / 输入</text>

          {!mainTrunk && !mainRoot && seed && (
            <g
              className={`start-guide ${selectedNodeId === seed.id ? 'selected' : ''}`}
              transform={`translate(${seed.x}, ${seed.y})`}
              onClick={() => {
                setSelectedNodeId(seed.id);
              }}
            >
              <circle r="42" />
              <text textAnchor="middle" y="-4">开始</text>
              <text className="node-kind" textAnchor="middle" y="18">点击生长</text>
            </g>
          )}

          {mainTrunk && (
            <g
              className={`tree-structure ${selectedNodeId === mainTrunk.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedNodeId(mainTrunk.id);
              }}
            >
              <path className="trunk-shape" d={createTrunkPath(shape)} />
              <path className="trunk-axis" d={createTrunkAxisPath(shape)} />
              <rect className="structure-hitbox" x="380" y="130" width="80" height="300" rx="12" />
            </g>
          )}

          {mainRoot && (
            <g
              className={`tree-structure ${selectedNodeId === mainRoot.id ? 'selected' : ''}`}
              onClick={() => {
                setSelectedNodeId(mainRoot.id);
              }}
            >
              <path className="main-root-shape" d={createMainRootPath(shape)} />
              <rect className="structure-hitbox" x="340" y="390" width="180" height="230" rx="12" />
            </g>
          )}

          {document.tree_edges.map((edge) => {
            const parent = nodeById.get(edge.parent_id);
            const child = nodeById.get(edge.child_id);
            if (!parent || !child || !isKnowledgeNode(child)) return null;

            return (
              <path
                key={`${edge.parent_id}-${edge.child_id}`}
                className={parent.kind === 'main_trunk' ? 'trunk-edge' : child.kind === 'root_branch' ? 'root-edge' : 'tree-edge'}
                d={createCurve(getConnectionPoint(parent, child, shape), child)}
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
              <g key={suggestion.id} className="suggestion-group" onClick={() => createSuggestedNode(suggestion)}>
                <path className="suggestion-edge" d={createCurve(getConnectionPoint(parent, suggestion, shape), suggestion)} />
                <g transform={`translate(${suggestion.x}, ${suggestion.y})`}>
                  <rect x="-58" y="-18" width="116" height="36" rx="6" fill="#ffffff" stroke={suggestion.color} />
                  <text textAnchor="middle" y="5">{suggestion.title}</text>
                </g>
              </g>
            );
          })}

          {visibleKnowledgeNodes.map((node) => (
            <g
              key={node.id}
              className={`tree-node ${selectedNodeId === node.id ? 'selected' : ''}`}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => {
                setSelectedNodeId(node.id);
              }}
              onDoubleClick={() => {
                setSelectedNodeId(node.id);
                setEditingNodeId(node.id);
              }}
            >
              <rect x="-54" y="-17" width="108" height="34" rx="6" fill="#ffffff" stroke={node.color} />
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
                <div className="color-row">
                  <span>节点颜色</span>
                  <i style={{ background: selectedNode.color }} />
                </div>
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
      </aside>
    </main>
  );
}

function isKnowledgeNode(node: TreeNode): boolean {
  return node.kind === 'branch' || node.kind === 'leaf' || node.kind === 'root_branch';
}

function getTreeShape(document: NametreeDocument): TreeShape {
  const outputCount = document.nodes.filter((node) => node.kind === 'branch' || node.kind === 'leaf').length;
  const rootCount = document.nodes.filter((node) => node.kind === 'root_branch').length;

  return {
    centerX: 450,
    groundY: 390,
    trunkTopY: Math.max(120, 340 - outputCount * 34),
    trunkWidth: Math.min(96, 46 + outputCount * 9),
    rootEndY: Math.min(660, 535 + rootCount * 30),
    rootWidth: Math.min(120, 64 + rootCount * 10),
  };
}

function getSuggestions(document: NametreeDocument, selectedNode: TreeNode, shape: TreeShape): Suggestion[] {
  const hasMainTrunk = document.nodes.some((node) => node.kind === 'main_trunk');
  const hasMainRoot = document.nodes.some((node) => node.kind === 'main_root');
  const childNodes = document.tree_edges
    .filter((edge) => edge.parent_id === selectedNode.id)
    .map((edge) => document.nodes.find((node) => node.id === edge.child_id))
    .filter((node): node is TreeNode => Boolean(node));

  if (selectedNode.kind === 'seed_root') {
    return [
      !hasMainTrunk && createSuggestion(selectedNode, 'main_trunk', '主干', 0, -130),
      !hasMainRoot && createSuggestion(selectedNode, 'main_root', '主根', 0, 130),
    ].filter((suggestion): suggestion is Suggestion => Boolean(suggestion));
  }

  if (selectedNode.kind === 'main_trunk') {
    const leftCount = countSideChildren(childNodes, 'left');
    const rightCount = countSideChildren(childNodes, 'right');

    return [
      !hasMainRoot && createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.groundY }, 'main_root', '主根', 0, 120),
      createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.trunkTopY + 112 + leftCount * 64 }, 'branch', '左树枝', -260 - leftCount * 54, 10, 'left'),
      createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.trunkTopY + 112 + rightCount * 64 }, 'branch', '右树枝', 260 + rightCount * 54, 10, 'right'),
    ].filter((suggestion): suggestion is Suggestion => Boolean(suggestion));
  }

  if (selectedNode.kind === 'branch') {
    const leftCount = countSideChildren(childNodes, 'left');
    const rightCount = countSideChildren(childNodes, 'right');

    return [
      createSuggestion(selectedNode, 'branch', '左分叉', -180 - leftCount * 44, -104 - leftCount * 56, 'left'),
      createSuggestion(selectedNode, 'branch', '右分叉', 180 + rightCount * 44, -104 - rightCount * 56, 'right'),
      createSuggestion(selectedNode, 'leaf', '左叶子', -180 - leftCount * 44, -50 - leftCount * 56, 'left'),
      createSuggestion(selectedNode, 'leaf', '右叶子', 180 + rightCount * 44, -50 - rightCount * 56, 'right'),
    ];
  }

  if (selectedNode.kind === 'main_root') {
    const leftCount = countSideChildren(childNodes, 'left');
    const rightCount = countSideChildren(childNodes, 'right');

    return [
      !hasMainTrunk && createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.groundY }, 'main_trunk', '主干', 0, -120),
      createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.rootEndY - 40 + leftCount * 64 }, 'root_branch', '根系', -260 - leftCount * 54, 70, 'left'),
      createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.rootEndY - 40 + rightCount * 64 }, 'root_branch', '根系', 260 + rightCount * 54, 70, 'right'),
    ].filter((suggestion): suggestion is Suggestion => Boolean(suggestion));
  }

  if (selectedNode.kind === 'root_branch') {
    const leftCount = countSideChildren(childNodes, 'left');
    const rightCount = countSideChildren(childNodes, 'right');

    return [
      createSuggestion(selectedNode, 'root_branch', '左根系', -180 - leftCount * 44, 104 + leftCount * 56, 'left'),
      createSuggestion(selectedNode, 'root_branch', '右根系', 180 + rightCount * 44, 104 + rightCount * 56, 'right'),
    ];
  }

  return [];
}

function createSuggestion(parent: TreeNode, kind: NodeKind, title: string, offsetX: number, offsetY: number, side?: GrowthSide): Suggestion {
  return {
    id: `${parent.id}-${kind}-${title}-${offsetX}-${offsetY}-${side ?? 'center'}`,
    title,
    note: `这是一个${title}节点，可以继续编辑名称、颜色和备注。`,
    kind,
    color: defaultColorByKind[kind],
    x: parent.x + offsetX,
    y: parent.y + offsetY,
    parentId: parent.id,
    side,
  };
}

function countSideChildren(nodes: TreeNode[], side: GrowthSide): number {
  return nodes.filter((node) => node.side === side).length;
}

function normalizeTreeLayout(document: NametreeDocument): NametreeDocument {
  const shape = getTreeShape(document);
  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  const mainRoot = document.nodes.find((node) => node.kind === 'main_root');
  const parentById = new Map(document.tree_edges.map((edge) => [edge.child_id, edge.parent_id]));
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

  const trunkChildren = laidOutNodes.filter((node) => {
    const parent = nodeById.get(parentById.get(node.id) ?? '');
    return parent?.kind === 'main_trunk' && (node.kind === 'branch' || node.kind === 'leaf');
  });

  layoutSideChildren(trunkChildren, 'left', shape.centerX, shape.trunkTopY + 122, -1, -64, 245, 72);
  layoutSideChildren(trunkChildren, 'right', shape.centerX, shape.trunkTopY + 122, 1, -64, 245, 72);

  const nestedOutputNodes = laidOutNodes.filter((node) => {
    const parent = nodeById.get(parentById.get(node.id) ?? '');
    return parent?.kind === 'branch' && (node.kind === 'branch' || node.kind === 'leaf');
  });

  nestedOutputNodes.forEach((node) => {
    const parent = laidOutById.get(parentById.get(node.id) ?? '');
    if (!parent) return;

    const side = node.side ?? 'right';
    const sideFactor = side === 'left' ? -1 : 1;
    const siblings = nestedOutputNodes.filter((item) => parentById.get(item.id) === parent.id && (item.side ?? 'right') === side);
    const index = siblings.findIndex((item) => item.id === node.id);

    node.x = parent.x + sideFactor * (170 + index * 52);
    node.y = parent.y - 104 - index * 58;
  });

  const rootBranches = laidOutNodes.filter((node) => node.kind === 'root_branch');
  const mainRootChildren = rootBranches.filter((node) => {
    const parent = nodeById.get(parentById.get(node.id) ?? '');
    return parent?.kind === 'main_root';
  });

  layoutSideChildren(mainRootChildren, 'left', shape.centerX, shape.rootEndY + 28, -1, 64, 245, 72);
  layoutSideChildren(mainRootChildren, 'right', shape.centerX, shape.rootEndY + 28, 1, 64, 245, 72);

  const nestedRootNodes = rootBranches.filter((node) => {
    const parent = nodeById.get(parentById.get(node.id) ?? '');
    return parent?.kind === 'root_branch';
  });

  nestedRootNodes.forEach((node) => {
    const parent = laidOutById.get(parentById.get(node.id) ?? '');
    if (!parent) return;

    const side = node.side ?? 'right';
    const sideFactor = side === 'left' ? -1 : 1;
    const siblings = nestedRootNodes.filter((item) => parentById.get(item.id) === parent.id && (item.side ?? 'right') === side);
    const index = siblings.findIndex((item) => item.id === node.id);

    node.x = parent.x + sideFactor * (170 + index * 52);
    node.y = parent.y + 104 + index * 58;
  });

  return { ...document, nodes: laidOutNodes };
}

function layoutSideChildren(
  nodes: TreeNode[],
  side: GrowthSide,
  originX: number,
  startY: number,
  sideFactor: -1 | 1,
  yStep: number,
  xDistance: number,
  xStep: number,
) {
  nodes
    .filter((node) => (node.side ?? 'right') === side)
    .forEach((node, index) => {
      node.x = originX + sideFactor * (xDistance + index * xStep);
      node.y = startY + index * yStep;
    });
}

function getConnectionPoint(node: TreeNode, child: Pick<TreeNode, 'x' | 'y' | 'kind'>, shape: TreeShape): Pick<TreeNode, 'x' | 'y'> {
  if (node.kind === 'main_trunk') {
    const side = child.x < shape.centerX ? -1 : 1;
    return {
      x: shape.centerX + side * 70,
      y: Math.min(shape.groundY - 40, Math.max(shape.trunkTopY + 90, child.y + 32)),
    };
  }

  if (node.kind === 'main_root') {
    const side = child.x < shape.centerX ? -1 : 1;
    return {
      x: shape.centerX + side * 58,
      y: shape.groundY + 156,
    };
  }

  return node;
}

function createTrunkPath(shape: TreeShape): string {
  const baseHalf = Math.max(14, shape.trunkWidth * 0.22);
  const topHalf = Math.max(5, shape.trunkWidth * 0.08);
  const ground = shape.groundY + 8;
  const top = shape.trunkTopY + 24;
  const middle = (ground + top) / 2;

  return `M ${shape.centerX - baseHalf} ${ground}
    C ${shape.centerX - baseHalf * 0.6} ${middle + 58}, ${shape.centerX - topHalf * 1.8} ${middle - 46}, ${shape.centerX - topHalf} ${top}
    M ${shape.centerX + baseHalf} ${ground}
    C ${shape.centerX + baseHalf * 0.58} ${middle + 58}, ${shape.centerX + topHalf * 1.7} ${middle - 46}, ${shape.centerX + topHalf} ${top}`;
}

function createTrunkAxisPath(shape: TreeShape): string {
  return `M ${shape.centerX} ${shape.groundY + 10}
    C ${shape.centerX - 6} ${shape.groundY - 56}, ${shape.centerX + 6} ${shape.trunkTopY + 108}, ${shape.centerX} ${shape.trunkTopY + 32}`;
}

function createMainRootPath(shape: TreeShape): string {
  return `M ${shape.centerX} ${shape.groundY + 10}
    C ${shape.centerX - 8} ${shape.groundY + 82}, ${shape.centerX + 9} ${shape.rootEndY - 104}, ${shape.centerX} ${shape.rootEndY}`;
}

function createCurve(parent: Pick<TreeNode, 'x' | 'y'>, child: Pick<TreeNode, 'x' | 'y'>): string {
  return `M ${parent.x} ${parent.y} C ${parent.x} ${(parent.y + child.y) / 2}, ${child.x} ${(parent.y + child.y) / 2}, ${child.x} ${child.y}`;
}

export default App;
