import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type NodeKind = 'root_input' | 'trunk' | 'branch_output';
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

const kindLabel: Record<NodeKind, string> = {
  root_input: '根 / 输入',
  trunk: '主干',
  branch_output: '枝叶 / 输出',
};

const defaultColorByKind: Record<NodeKind, string> = {
  root_input: '#8b6f47',
  trunk: '#5f7f45',
  branch_output: '#d9a441',
};

function App() {
  const [document, setDocument] = useState<NametreeDocument | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    invoke<NametreeDocument>('load_sample_tree').then((tree) => {
      setDocument(normalizeTreeLayout(tree));
      setSelectedNodeId(tree.nodes.find((node) => node.kind === 'trunk')?.id ?? tree.nodes[0]?.id ?? null);
    });
  }, []);

  const selectedNode = useMemo(
    () => document?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [document, selectedNodeId],
  );

  function updateSelectedNode(patch: Partial<TreeNode>) {
    if (!document || !selectedNodeId) return;

    setDocument({
      ...document,
      nodes: document.nodes.map((node) => (
        node.id === selectedNodeId ? { ...node, ...patch } : node
      )),
    });
  }

  function addBranchNode() {
    if (!document || !selectedNode) return;

    const newNode: TreeNode = {
      id: crypto.randomUUID(),
      title: '新枝叶',
      note: '在这里写下这个节点的备注。',
      kind: 'branch_output',
      color: defaultColorByKind.branch_output,
      x: selectedNode.x + 160,
      y: selectedNode.y - 160,
    };

    const nextDocument = normalizeTreeLayout({
      ...document,
      nodes: [...document.nodes, newNode],
      tree_edges: [...document.tree_edges, { parent_id: selectedNode.id, child_id: newNode.id }],
    });

    setDocument(nextDocument);
    setSelectedNodeId(newNode.id);
    setIsEditing(true);
  }

  function addRootNode() {
    if (!document) return;

    const trunk = document.nodes.find((node) => node.kind === 'trunk') ?? document.nodes[0];
    const newNode: TreeNode = {
      id: crypto.randomUUID(),
      title: '新输入',
      note: '在这里记录资料、问题、观察或练习。',
      kind: 'root_input',
      color: defaultColorByKind.root_input,
      x: trunk.x,
      y: trunk.y + 180,
    };

    const nextDocument = normalizeTreeLayout({
      ...document,
      nodes: [...document.nodes, newNode],
      tree_edges: trunk ? [...document.tree_edges, { parent_id: newNode.id, child_id: trunk.id }] : document.tree_edges,
    });

    setDocument(nextDocument);
    setSelectedNodeId(newNode.id);
    setIsEditing(true);
  }

  if (!document) {
    return <main className="app-shell">Loading Nametree...</main>;
  }

  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));

  return (
    <main className="app-shell">
      <section className="sidebar">
        <p className="eyebrow">Nametree</p>
        <h1>{document.title}</h1>
        <p className="slogan">{document.slogan}</p>

        <div className="toolbar">
          <button onClick={addRootNode}>新增根</button>
          <button onClick={addBranchNode} disabled={!selectedNode}>新增枝</button>
        </div>

        <div className="legend">
          <span><i className="dot root" />根 / 输入：资料、问题、练习</span>
          <span><i className="dot trunk" />主干：核心知识</span>
          <span><i className="dot branch" />枝叶 / 输出：理解、总结、作品</span>
        </div>
      </section>

      <section className="canvas-panel">
        <svg className="tree-canvas" viewBox="0 0 900 700" role="img" aria-label="Nametree knowledge tree">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#6b7280" />
            </marker>
          </defs>

          <text className="zone-label" x="450" y="52" textAnchor="middle">枝叶 / 输出</text>
          <text className="zone-label" x="450" y="645" textAnchor="middle">树根 / 输入</text>

          {document.tree_edges.map((edge) => {
            const parent = nodeById.get(edge.parent_id);
            const child = nodeById.get(edge.child_id);
            if (!parent || !child) return null;

            return (
              <path
                key={`${edge.parent_id}-${edge.child_id}`}
                className="tree-edge"
                d={`M ${parent.x} ${parent.y} C ${parent.x} ${(parent.y + child.y) / 2}, ${child.x} ${(parent.y + child.y) / 2}, ${child.x} ${child.y}`}
              />
            );
          })}

          {document.reference_links.map((link) => {
            const source = nodeById.get(link.source_id);
            const target = nodeById.get(link.target_id);
            if (!source || !target) return null;

            return (
              <g key={link.id}>
                <line
                  className="reference-link"
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  markerEnd="url(#arrow)"
                  markerStart={link.direction === 'two_way' ? 'url(#arrow)' : undefined}
                />
                <text className="link-label" x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 8}>
                  {link.label}
                </text>
              </g>
            );
          })}

          {document.nodes.map((node) => (
            <g
              key={node.id}
              className={`tree-node ${selectedNodeId === node.id ? 'selected' : ''}`}
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => setSelectedNodeId(node.id)}
            >
              <circle r="48" fill={node.color} />
              <text textAnchor="middle" y="-4">{node.title}</text>
              <text className="node-kind" textAnchor="middle" y="18">{kindLabel[node.kind]}</text>
            </g>
          ))}
        </svg>
      </section>

      <aside className="detail-panel">
        {selectedNode ? (
          <>
            <div className="panel-heading">
              <p className="eyebrow">当前节点</p>
              <button onClick={() => setIsEditing((editing) => !editing)}>{isEditing ? '完成' : '编辑'}</button>
            </div>

            {isEditing ? (
              <form className="editor" onSubmit={(event) => event.preventDefault()}>
                <label>
                  名称
                  <input value={selectedNode.title} onChange={(event) => updateSelectedNode({ title: event.target.value })} />
                </label>

                <label>
                  类型
                  <select
                    value={selectedNode.kind}
                    onChange={(event) => updateSelectedNode({
                      kind: event.target.value as NodeKind,
                      color: defaultColorByKind[event.target.value as NodeKind],
                    })}
                  >
                    <option value="root_input">根 / 输入</option>
                    <option value="trunk">主干</option>
                    <option value="branch_output">枝叶 / 输出</option>
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
                <div className="color-row">
                  <span>节点颜色</span>
                  <i style={{ background: selectedNode.color }} />
                </div>
                <h3>备注</h3>
                <p className="note">{selectedNode.note}</p>
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

function normalizeTreeLayout(document: NametreeDocument): NametreeDocument {
  const roots = document.nodes.filter((node) => node.kind === 'root_input');
  const trunks = document.nodes.filter((node) => node.kind === 'trunk');
  const branches = document.nodes.filter((node) => node.kind === 'branch_output');

  const placeRow = (nodes: TreeNode[], y: number, centerX = 450, gap = 190) => {
    const startX = centerX - ((nodes.length - 1) * gap) / 2;
    return nodes.map((node, index) => ({ ...node, x: startX + index * gap, y }));
  };

  const laidOutNodes = [
    ...placeRow(branches, 150),
    ...placeRow(trunks, 350, 450, 150),
    ...placeRow(roots, 560),
  ];

  return { ...document, nodes: laidOutNodes };
}

export default App;
