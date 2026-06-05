import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const treeReferenceImage = new URL('../images/tree1.jpg', import.meta.url).href;
const nametreeLogo = treeReferenceImage;

type NodeKind = 'seed_root' | 'main_trunk' | 'main_root' | 'branch' | 'leaf' | 'root_branch';
type LinkDirection = 'one_way' | 'two_way';

type TreeNode = {
  id: string;
  title: string;
  note: string;
  kind: NodeKind;
  color: string;
  x: number;
  y: number;
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
  const [isEditing, setIsEditing] = useState(false);
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

    setDocument(normalizeTreeLayout({
      ...document,
      nodes: document.nodes.map((node) => (
        node.id === selectedNodeId ? { ...node, ...patch } : node
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
    };

    const nextDocument = normalizeTreeLayout({
      ...document,
      nodes: [...document.nodes, newNode],
      tree_edges: [...document.tree_edges, { parent_id: suggestion.parentId, child_id: newNode.id }],
    });

    setDocument(nextDocument);
    setSelectedNodeId(newNode.id);
    setIsEditing(isKnowledgeNode(newNode));
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
      <section className="sidebar">
        <img className="app-logo" src={nametreeLogo} alt="Nametree logo" />
        <p className="eyebrow">Nametree</p>
        <h1>{document.title}</h1>
        <p className="slogan">{document.slogan}</p>

        <div className="growth-hint">
          <strong>生长规则</strong>
          <p>起点只是引导，不是知识节点。主干和主根是可见形状，会随着树枝、叶子和根系变多而继续生长。</p>
        </div>

        <div className="legend">
          <span><i className="dot seed" />开始：只负责启动生长</span>
          <span><i className="dot trunk" />主干：输出方向的树体</span>
          <span><i className="dot root" />主根：输入方向的根体</span>
          <span><i className="dot branch" />树枝 / 叶子 / 根系：知识节点</span>
        </div>
      </section>

      <section className="canvas-panel">
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
                setIsEditing(false);
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
                setIsEditing(false);
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
                setIsEditing(false);
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
                setIsEditing(false);
              }}
            >
              <rect x="-54" y="-17" width="108" height="34" rx="6" fill="#ffffff" stroke={node.color} />
              <text textAnchor="middle" y="5">{node.title}</text>
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
              {isKnowledgeNode(selectedNode) && (
                <button onClick={() => setIsEditing((editing) => !editing)}>{isEditing ? '完成' : '编辑'}</button>
              )}
            </div>

            {isEditing && isKnowledgeNode(selectedNode) ? (
              <form className="editor" onSubmit={(event) => event.preventDefault()}>
                <label>
                  名称
                  <input value={selectedNode.title} onChange={(event) => updateSelectedNode({ title: event.target.value })} />
                </label>

                <label>
                  类型
                  <select
                    value={selectedNode.kind}
                    onChange={(event) => {
                      const kind = event.target.value as NodeKind;
                      updateSelectedNode({ kind, color: defaultColorByKind[kind] });
                    }}
                  >
                    <option value="branch">树枝</option>
                    <option value="leaf">叶子</option>
                    <option value="root_branch">根系</option>
                  </select>
                </label>

                <label>
                  颜色
                  <input type="color" value={selectedNode.color} onChange={(event) => updateSelectedNode({ color: event.target.value })} />
                </label>

                <label>
                  备注
                  <textarea value={selectedNode.note} onChange={(event) => updateSelectedNode({ note: event.target.value })} />
                </label>
              </form>
            ) : (
              <>
                <h2>{selectedNode.title}</h2>
                <span className="kind-pill">{kindLabel[selectedNode.kind]}</span>
                {!isKnowledgeNode(selectedNode) && <p className="note structure-note">这是树的结构或起点，不作为普通知识节点编辑。</p>}
                {isKnowledgeNode(selectedNode) && (
                  <div className="color-row">
                    <span>节点颜色</span>
                    <i style={{ background: selectedNode.color }} />
                  </div>
                )}
                <h3>可生长</h3>
                <p className="note">{suggestions.length > 0 ? suggestions.map((suggestion) => suggestion.title).join('、') : '当前选择暂无可选生长方向。'}</p>
                {isKnowledgeNode(selectedNode) && (
                  <>
                    <h3>备注</h3>
                    <p className="note">{selectedNode.note}</p>
                  </>
                )}
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
    return [
      !hasMainRoot && createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.groundY }, 'main_root', '主根', 0, 120),
      createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.trunkTopY + 92 }, 'branch', '树枝', -190, 6),
      createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.trunkTopY + 36 }, 'leaf', '叶子', 190, -6),
    ].filter((suggestion): suggestion is Suggestion => Boolean(suggestion));
  }

  if (selectedNode.kind === 'branch') {
    const hasBranch = childNodes.some((node) => node.kind === 'branch');
    const hasLeaf = childNodes.some((node) => node.kind === 'leaf');

    return [
      !hasBranch && createSuggestion(selectedNode, 'branch', '分叉', -145, -120),
      !hasLeaf && createSuggestion(selectedNode, 'leaf', '叶子', 145, -120),
    ].filter((suggestion): suggestion is Suggestion => Boolean(suggestion));
  }

  if (selectedNode.kind === 'main_root') {
    return [
      !hasMainTrunk && createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.groundY }, 'main_trunk', '主干', 0, -120),
      createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.rootEndY - 20 }, 'root_branch', '根系', -160, 45),
      createSuggestion({ ...selectedNode, x: shape.centerX, y: shape.rootEndY - 20 }, 'root_branch', '细根', 160, 45),
    ].filter((suggestion): suggestion is Suggestion => Boolean(suggestion));
  }

  if (selectedNode.kind === 'root_branch') {
    const rootChildren = childNodes.filter((node) => node.kind === 'root_branch');

    return rootChildren.length < 2
      ? [createSuggestion(selectedNode, 'root_branch', rootChildren.length === 0 ? '根系' : '细根', rootChildren.length === 0 ? -140 : 140, 120)]
      : [];
  }

  return [];
}

function createSuggestion(parent: TreeNode, kind: NodeKind, title: string, offsetX: number, offsetY: number): Suggestion {
  return {
    id: `${parent.id}-${kind}-${title}-${offsetX}-${offsetY}`,
    title,
    note: `这是一个${title}节点，可以继续编辑名称、颜色和备注。`,
    kind,
    color: defaultColorByKind[kind],
    x: parent.x + offsetX,
    y: parent.y + offsetY,
    parentId: parent.id,
  };
}

function normalizeTreeLayout(document: NametreeDocument): NametreeDocument {
  const shape = getTreeShape(document);
  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  const mainRoot = document.nodes.find((node) => node.kind === 'main_root');
  const rootBranches = document.nodes.filter((node) => node.kind === 'root_branch');
  const parentById = new Map(document.tree_edges.map((edge) => [edge.child_id, edge.parent_id]));
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));

  const laidOutNodes = document.nodes.map((node) => ({ ...node }));
  const update = (id: string | undefined, x: number, y: number) => {
    const node = laidOutNodes.find((item) => item.id === id);
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

  trunkChildren.forEach((node, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const level = Math.floor(index / 2);
    node.x = shape.centerX + side * (185 + level * 18);
    node.y = Math.min(shape.groundY - 96, shape.trunkTopY + 88 + level * 58);
  });

  const nestedOutputNodes = laidOutNodes.filter((node) => {
    const parent = nodeById.get(parentById.get(node.id) ?? '');
    return parent?.kind === 'branch' && (node.kind === 'branch' || node.kind === 'leaf');
  });

  nestedOutputNodes.forEach((node) => {
    const parentId = parentById.get(node.id);
    const parent = laidOutNodes.find((item) => item.id === parentId);
    if (!parent) return;

    const siblings = nestedOutputNodes.filter((item) => parentById.get(item.id) === parentId);
    const index = siblings.findIndex((item) => item.id === node.id);
    const side = index % 2 === 0 ? -1 : 1;
    const level = Math.floor(index / 2);

    node.x = parent.x + side * (135 + level * 34);
    node.y = parent.y - 118 - level * 24;
  });

  const mainRootChildren = rootBranches.filter((node) => {
    const parent = nodeById.get(parentById.get(node.id) ?? '');
    return parent?.kind === 'main_root';
  });

  mainRootChildren.forEach((node, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const level = Math.floor(index / 2);
    node.x = shape.centerX + side * (230 + level * 100);
    node.y = shape.rootEndY - 22 + level * 54;
  });

  const nestedRootNodes = rootBranches.filter((node) => {
    const parent = nodeById.get(parentById.get(node.id) ?? '');
    return parent?.kind === 'root_branch';
  });

  nestedRootNodes.forEach((node) => {
    const parentId = parentById.get(node.id);
    const parent = laidOutNodes.find((item) => item.id === parentId);
    if (!parent) return;

    const siblings = nestedRootNodes.filter((item) => parentById.get(item.id) === parentId);
    const index = siblings.findIndex((item) => item.id === node.id);
    const side = index % 2 === 0 ? -1 : 1;
    const level = Math.floor(index / 2);

    node.x = parent.x + side * (150 + level * 70);
    node.y = parent.y + 98 + level * 42;
  });

  return { ...document, nodes: laidOutNodes };
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
  const half = Math.max(22, shape.trunkWidth / 2);
  const topHalf = Math.max(10, half * 0.34);

  return `M ${shape.centerX - half} ${shape.groundY + 10}
    L ${shape.centerX - topHalf} ${shape.trunkTopY + 32}
    C ${shape.centerX - topHalf} ${shape.trunkTopY + 12}, ${shape.centerX + topHalf} ${shape.trunkTopY + 12}, ${shape.centerX + topHalf} ${shape.trunkTopY + 32}
    L ${shape.centerX + half} ${shape.groundY + 10}
    Z`;
}

function createTrunkAxisPath(shape: TreeShape): string {
  return `M ${shape.centerX} ${shape.groundY + 8}
    C ${shape.centerX - 4} ${shape.groundY - 76}, ${shape.centerX + 5} ${shape.trunkTopY + 92}, ${shape.centerX} ${shape.trunkTopY + 24}`;
}

function createMainRootPath(shape: TreeShape): string {
  return `M ${shape.centerX} ${shape.groundY + 8}
    C ${shape.centerX - 4} ${shape.groundY + 92}, ${shape.centerX + 5} ${shape.rootEndY - 88}, ${shape.centerX} ${shape.rootEndY}`;
}

function createCurve(parent: Pick<TreeNode, 'x' | 'y'>, child: Pick<TreeNode, 'x' | 'y'>): string {
  return `M ${parent.x} ${parent.y} C ${parent.x} ${(parent.y + child.y) / 2}, ${child.x} ${(parent.y + child.y) / 2}, ${child.x} ${child.y}`;
}

export default App;
