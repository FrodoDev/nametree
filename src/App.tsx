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

function App() {
  const [document, setDocument] = useState<NametreeDocument | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    invoke<NametreeDocument>('load_sample_tree').then((tree) => {
      setDocument(tree);
      setSelectedNodeId(tree.nodes[0]?.id ?? null);
    });
  }, []);

  const selectedNode = useMemo(
    () => document?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [document, selectedNodeId],
  );

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

        <div className="legend">
          <span><i className="dot root" />根 / 输入</span>
          <span><i className="dot trunk" />主干</span>
          <span><i className="dot branch" />枝叶 / 输出</span>
        </div>
      </section>

      <section className="canvas-panel">
        <svg className="tree-canvas" viewBox="0 0 900 620" role="img" aria-label="Nametree knowledge tree">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#6b7280" />
            </marker>
          </defs>

          {document.tree_edges.map((edge) => {
            const parent = nodeById.get(edge.parent_id);
            const child = nodeById.get(edge.child_id);
            if (!parent || !child) return null;

            return (
              <line
                key={`${edge.parent_id}-${edge.child_id}`}
                className="tree-edge"
                x1={parent.x}
                y1={parent.y}
                x2={child.x}
                y2={child.y}
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
              <circle r="44" fill={node.color} />
              <text textAnchor="middle" y="-3">{node.title}</text>
              <text className="node-kind" textAnchor="middle" y="17">{kindLabel[node.kind]}</text>
            </g>
          ))}
        </svg>
      </section>

      <aside className="detail-panel">
        {selectedNode ? (
          <>
            <p className="eyebrow">当前节点</p>
            <h2>{selectedNode.title}</h2>
            <span className="kind-pill">{kindLabel[selectedNode.kind]}</span>
            <div className="color-row">
              <span>节点颜色</span>
              <i style={{ background: selectedNode.color }} />
            </div>
            <h3>备注</h3>
            <p className="note">{selectedNode.note}</p>
          </>
        ) : (
          <p>选择一个节点查看备注。</p>
        )}
      </aside>
    </main>
  );
}

export default App;
