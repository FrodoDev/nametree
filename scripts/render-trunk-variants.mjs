import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const fixturePath = path.join(rootDir, 'debug-fixtures', 'sxfdl.nt');
const outputDir = path.join(rootDir, 'debug-output');
const nodeWidth = 108;
const nodeHeight = 34;
const rootLabelHalfWidth = 58;

function readDocument(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return raw.document ?? raw;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function getShape(document) {
  const outputNodes = document.nodes.filter((node) => node.kind === 'branch' || node.kind === 'leaf');
  const rootNodes = document.nodes.filter((node) => node.kind === 'root_branch');
  const groundY = 390;
  const highestConnectionY = getTrunkChildren(document).length > 0
    ? Math.min(...getTrunkChildren(document).map((node) => node.y + 42))
    : 318;

  return {
    centerX: 450,
    groundY,
    trunkTopY: highestConnectionY - 34,
    outputCount: outputNodes.length,
    rootCount: rootNodes.length,
  };
}

function getTrunkChildren(document) {
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  if (!mainTrunk) return [];
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  return document.tree_edges
    .filter((edge) => edge.parent_id === mainTrunk.id)
    .map((edge) => byId.get(edge.child_id))
    .filter((node) => node?.kind === 'branch' || node?.kind === 'leaf');
}

function boundsFor(document, shape) {
  const box = document.nodes.reduce((acc, node) => ({
    minX: Math.min(acc.minX, node.x - nodeWidth / 2),
    maxX: Math.max(acc.maxX, node.x + nodeWidth / 2),
    minY: Math.min(acc.minY, node.y - nodeHeight / 2),
    maxY: Math.max(acc.maxY, node.y + nodeHeight / 2),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  return {
    minX: Math.min(box.minX, shape.centerX - 520) - 110,
    minY: Math.min(box.minY, shape.trunkTopY) - 90,
    maxX: Math.max(box.maxX, shape.centerX + 520) + 110,
    maxY: Math.max(box.maxY, shape.groundY + 300) + 90,
  };
}

function rootAttachPoint(child, shape, variant) {
  const sideFactor = child.x < shape.centerX ? -1 : 1;
  const dx = Math.abs(child.x - shape.centerX);
  const dy = Math.max(0, child.y - shape.groundY);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const fanIndex = angle > 72 ? 0 : angle > 56 ? 1 : angle > 36 ? 2 : angle > 16 ? 3 : 4;
  const slotsByVariant = {
    lineOnly: [{ x: 5, y: 8 }, { x: 7, y: 6 }, { x: 8, y: 4 }, { x: 7, y: 2 }, { x: 5, y: 0 }],
    spineFine: [{ x: 0, y: 18 }, { x: 2, y: 14 }, { x: 3, y: 9 }, { x: 3, y: 4 }, { x: 2, y: 0 }],
    spineBold: [{ x: 0, y: 20 }, { x: 3, y: 15 }, { x: 5, y: 10 }, { x: 5, y: 4 }, { x: 3, y: 0 }],
    spineRootFuse: [{ x: 0, y: 22 }, { x: 4, y: 17 }, { x: 8, y: 11 }, { x: 8, y: 5 }, { x: 5, y: 0 }],
    organicPath: [{ x: 13, y: 22 }, { x: 19, y: 17 }, { x: 25, y: 11 }, { x: 24, y: 5 }, { x: 18, y: 0 }],
    fadedBackdrop: [{ x: 9, y: 14 }, { x: 13, y: 10 }, { x: 15, y: 6 }, { x: 13, y: 2 }, { x: 9, y: -1 }],
    fadeTop: [{ x: 10, y: 13 }, { x: 14, y: 9 }, { x: 16, y: 5 }, { x: 14, y: 1 }, { x: 9, y: -2 }],
    rootStrokes: [{ x: 4, y: 10 }, { x: 8, y: 7 }, { x: 12, y: 3 }, { x: 14, y: 0 }, { x: 12, y: -2 }],
  };
  const slots = slotsByVariant[variant.id] ?? slotsByVariant.organicPath;
  const slot = slots[Math.min(fanIndex, slots.length - 1)];
  return { x: shape.centerX + sideFactor * slot.x, y: shape.groundY + slot.y };
}

function rootEdgePath(parent, child, shape, variant) {
  const sideFactor = child.x < shape.centerX ? -1 : 1;

  if (parent.kind === 'main_trunk' || parent.kind === 'main_root') {
    const parentEdge = rootAttachPoint(child, shape, variant);
    const labelEdge = { x: child.x - sideFactor * rootLabelHalfWidth, y: child.y };
    const verticalDrop = Math.max(1, labelEdge.y - parentEdge.y);
    const horizontalReach = Math.max(1, Math.abs(labelEdge.x - parentEdge.x));
    const firstControl = { x: parentEdge.x + sideFactor * Math.min(34, horizontalReach * 0.12), y: parentEdge.y + verticalDrop * 0.58 };
    const secondControl = { x: labelEdge.x - sideFactor * Math.min(180, Math.max(76, horizontalReach * 0.42)), y: labelEdge.y - verticalDrop * 0.34 };
    return `M ${parentEdge.x} ${parentEdge.y} C ${firstControl.x} ${firstControl.y}, ${secondControl.x} ${secondControl.y}, ${labelEdge.x} ${labelEdge.y}`;
  }

  const parentEdgeX = parent.x + sideFactor * 54;
  const childEdgeX = child.x - sideFactor * 54;
  const middleX = (parentEdgeX + childEdgeX) / 2;
  return `M ${parentEdgeX} ${parent.y} L ${middleX} ${parent.y} L ${middleX} ${child.y} L ${childEdgeX} ${child.y}`;
}

function outputEdgePath(parent, child, shape) {
  const sideFactor = child.x < shape.centerX ? -1 : 1;
  const childEdgeX = child.x - sideFactor * (nodeWidth / 2);

  if (parent.kind === 'main_trunk') {
    const parentEdgeX = shape.centerX + sideFactor * 10;
    const parentEdgeY = child.y + 42;
    return `M ${parentEdgeX} ${parentEdgeY} L ${childEdgeX} ${child.y}`;
  }

  const parentEdgeX = parent.x + sideFactor * (nodeWidth / 2);
  const middleX = (parentEdgeX + childEdgeX) / 2;
  return `M ${parentEdgeX} ${parent.y} L ${middleX} ${parent.y} L ${middleX} ${child.y} L ${childEdgeX} ${child.y}`;
}

function trunkPath(shape, profile = {}) {
  const x = shape.centerX;
  const top = shape.trunkTopY;
  const y = shape.groundY;
  const halfTop = profile.halfTop ?? 9;
  const halfBody = profile.halfBody ?? 9;
  const flare = profile.flare ?? 70;
  const belly = profile.belly ?? 36;
  const rootTip = profile.rootTip ?? 34;
  const shoulderY = profile.shoulderY ?? 20;
  const topRound = profile.topRound ?? 10;

  return `M ${x - halfTop} ${top + topRound}
    C ${x - halfTop} ${top + 3}, ${x - 5} ${top}, ${x} ${top}
    C ${x + 5} ${top}, ${x + halfTop} ${top + 3}, ${x + halfTop} ${top + topRound}
    L ${x + halfBody} ${y - shoulderY}
    C ${x + halfBody + 6} ${y - 2}, ${x + belly} ${y + 9}, ${x + flare} ${y + 24}
    C ${x + Math.round(flare * 0.53)} ${y + 22}, ${x + 15} ${y + 20}, ${x} ${y + rootTip}
    C ${x - 15} ${y + 20}, ${x - Math.round(flare * 0.53)} ${y + 22}, ${x - flare} ${y + 24}
    C ${x - belly} ${y + 9}, ${x - halfBody - 6} ${y - 2}, ${x - halfBody} ${y - shoulderY}
    Z`;
}

function crownPath(shape) {
  const x = shape.centerX;
  const y = shape.groundY;
  return `M ${x - 10} ${y - 8}
    C ${x - 16} ${y - 1}, ${x - 26} ${y + 12}, ${x - 54} ${y + 24}
    C ${x - 34} ${y + 23}, ${x - 16} ${y + 20}, ${x} ${y + 32}
    C ${x + 16} ${y + 20}, ${x + 34} ${y + 23}, ${x + 54} ${y + 24}
    C ${x + 26} ${y + 12}, ${x + 16} ${y - 1}, ${x + 10} ${y - 8}
    C ${x + 7} ${y + 10}, ${x - 7} ${y + 10}, ${x - 10} ${y - 8}
    Z`;
}

function renderTrunk(shape, variant) {
  const x = shape.centerX;
  const top = shape.trunkTopY;
  const y = shape.groundY;

  if (variant.id === 'lineOnly') {
    return `<path d="M ${x} ${top + 4} L ${x} ${y + 18}" fill="none" stroke="#756355" stroke-width="15" stroke-linecap="round"/>`;
  }

  if (variant.id === 'spineFine') {
    return `<path d="M ${x} ${top + 6} C ${x - 2} ${top + 82}, ${x + 2} ${y - 110}, ${x} ${y + 24}" fill="none" stroke="#6f5d50" stroke-width="7" stroke-linecap="round" opacity="0.82"/>`;
  }

  if (variant.id === 'spineBold') {
    return `<path d="M ${x} ${top + 6} C ${x - 1} ${top + 78}, ${x + 3} ${y - 100}, ${x} ${y + 28}" fill="none" stroke="#705e51" stroke-width="10" stroke-linecap="round" opacity="0.86"/>
      <path d="M ${x} ${top + 18} C ${x} ${top + 90}, ${x + 1} ${y - 80}, ${x} ${y + 18}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2.2" stroke-linecap="round"/>`;
  }

  if (variant.id === 'spineRootFuse') {
    return `<path d="M ${x} ${top + 6} C ${x - 1} ${top + 80}, ${x + 2} ${y - 98}, ${x} ${y + 30}" fill="none" stroke="#705e51" stroke-width="8" stroke-linecap="round" opacity="0.84"/>
      <path d="M ${x} ${y + 20} C ${x - 18} ${y + 27}, ${x - 42} ${y + 30}, ${x - 76} ${y + 34}" fill="none" stroke="#705e51" stroke-width="5.2" stroke-linecap="round" opacity="0.62"/>
      <path d="M ${x} ${y + 20} C ${x + 18} ${y + 27}, ${x + 42} ${y + 30}, ${x + 76} ${y + 34}" fill="none" stroke="#705e51" stroke-width="5.2" stroke-linecap="round" opacity="0.62"/>
      <path d="M ${x} ${y + 9} C ${x - 6} ${y + 18}, ${x - 8} ${y + 25}, ${x} ${y + 34} C ${x + 8} ${y + 25}, ${x + 6} ${y + 18}, ${x} ${y + 9}" fill="rgba(112,94,81,0.28)" stroke="none"/>`;
  }

  if (variant.id === 'organicPath') {
    return `<path d="${trunkPath(shape)}" fill="#806b5d" stroke="rgba(47,36,27,0.24)" stroke-width="1"/>`;
  }

  if (variant.id === 'organicPathSlim') {
    return `<path d="${trunkPath(shape, { flare: 46, belly: 24, rootTip: 25, shoulderY: 16 })}" fill="#806b5d" stroke="rgba(47,36,27,0.24)" stroke-width="1"/>`;
  }

  if (variant.id === 'organicPathSoftTop') {
    return `<path d="${trunkPath(shape, { halfTop: 6, halfBody: 9, flare: 58, belly: 30, rootTip: 30, topRound: 5 })}" fill="#806b5d" stroke="rgba(47,36,27,0.22)" stroke-width="1"/>`;
  }

  if (variant.id === 'organicPathRootPorts') {
    return `<path d="${trunkPath(shape, { flare: 56, belly: 30, rootTip: 28, shoulderY: 17 })}" fill="#806b5d" stroke="rgba(47,36,27,0.22)" stroke-width="1"/>
      <path d="M ${x - 5} ${y + 5} C ${x - 15} ${y + 13}, ${x - 28} ${y + 18}, ${x - 42} ${y + 21}" fill="none" stroke="#5f5045" stroke-width="4.5" stroke-linecap="round" opacity="0.55"/>
      <path d="M ${x + 5} ${y + 5} C ${x + 15} ${y + 13}, ${x + 28} ${y + 18}, ${x + 42} ${y + 21}" fill="none" stroke="#5f5045" stroke-width="4.5" stroke-linecap="round" opacity="0.55"/>`;
  }

  if (variant.id === 'fadedBackdrop') {
    return `<path d="${crownPath(shape)}" fill="rgba(74,48,31,0.26)" stroke="none"/>
      <rect x="${x - 10}" y="${top}" width="20" height="${y + 12 - top}" rx="10" fill="rgba(74,48,31,0.34)" stroke="none"/>`;
  }

  if (variant.id === 'fadeTop') {
    return `<defs><linearGradient id="trunkFade" x1="0" y1="${top}" x2="0" y2="${y + 20}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7a6658" stop-opacity="0.48"/><stop offset="0.18" stop-color="#7a6658" stop-opacity="0.76"/><stop offset="1" stop-color="#7a6658" stop-opacity="0.72"/></linearGradient></defs>
      <path d="M ${x - 8} ${top + 8} C ${x - 8} ${top + 2}, ${x - 4} ${top}, ${x} ${top} C ${x + 4} ${top}, ${x + 8} ${top + 2}, ${x + 8} ${top + 8} L ${x + 10} ${y + 18} L ${x - 10} ${y + 18} Z" fill="url(#trunkFade)" stroke="rgba(47,36,27,0.18)" stroke-width="0.8"/>`;
  }

  if (variant.id === 'rootStrokes') {
    return `<path d="M ${x} ${top + 4} L ${x} ${y + 18}" fill="none" stroke="#796657" stroke-width="18" stroke-linecap="round"/>
      <path d="M ${x - 5} ${y - 2} C ${x - 20} ${y + 12}, ${x - 42} ${y + 20}, ${x - 66} ${y + 26}" fill="none" stroke="#796657" stroke-width="10" stroke-linecap="round"/>
      <path d="M ${x + 5} ${y - 2} C ${x + 20} ${y + 12}, ${x + 42} ${y + 20}, ${x + 66} ${y + 26}" fill="none" stroke="#796657" stroke-width="10" stroke-linecap="round"/>`;
  }

  return '';
}

function renderSvg(document, variant) {
  const shape = getShape(document);
  const bounds = boundsFor(document, shape);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const byId = new Map(document.nodes.map((node) => [node.id, node]));

  const rootUnderlays = document.tree_edges.map((edge) => {
    const parent = byId.get(edge.parent_id);
    const child = byId.get(edge.child_id);
    if (!parent || child?.kind !== 'root_branch' || !(parent.kind === 'main_trunk' || parent.kind === 'main_root')) return '';
    if (variant.id !== 'rootStrokes' && variant.id !== 'spineRootFuse') return '';
    const strokeWidth = variant.id === 'spineRootFuse' ? 5.4 : 7;
    const opacity = variant.id === 'spineRootFuse' ? 0.34 : 0.55;
    return `<path d="${rootEdgePath(parent, child, shape, variant)}" fill="none" stroke="#796657" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}"/>`;
  }).join('\n');

  const edgePaths = document.tree_edges.map((edge) => {
    const parent = byId.get(edge.parent_id);
    const child = byId.get(edge.child_id);
    if (!parent || !child) return '';
    if (child.kind === 'root_branch') {
      return `<path d="${rootEdgePath(parent, child, shape, variant)}" fill="none" stroke="#696969" stroke-width="1.45" stroke-linecap="round"/>`;
    }
    if (child.kind === 'branch' || child.kind === 'leaf') {
      return `<path d="${outputEdgePath(parent, child, shape)}" fill="none" stroke="#555" stroke-width="1.3"/>`;
    }
    return '';
  }).join('\n');

  const nodes = document.nodes.filter((node) => node.kind !== 'seed_root' && node.kind !== 'main_trunk').map((node) => {
    const fill = node.fillColor ?? '#fff';
    const stroke = node.color ?? '#8aa17a';
    return `<g transform="translate(${node.x} ${node.y})"><rect x="-54" y="-17" width="108" height="34" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/><text text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="#2d2d2d">${escapeXml(node.title)}</text></g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}" width="${width}" height="${height}">
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" fill="#ffffff"/>
  <rect x="${bounds.minX}" y="${shape.groundY}" width="${width}" height="${bounds.maxY - shape.groundY}" fill="#dedfdd"/>
  <text x="${bounds.minX + 26}" y="${bounds.minY + 34}" font-size="18" font-weight="800" fill="#1f2937">${escapeXml(variant.label)}</text>
  <text x="${bounds.minX + 26}" y="${bounds.minY + 58}" font-size="13" font-weight="600" fill="#68707d">${escapeXml(variant.note)}</text>
  ${renderTrunk(shape, variant)}
  ${rootUnderlays}
  ${edgePaths}
  ${nodes}
</svg>
`;
}

const variants = [
  { id: 'spineFine', label: '方向6A：生长脉络-细', note: '放弃实体树干，用克制的中轴线表达生长方向。' },
  { id: 'spineBold', label: '方向6B：生长脉络-强', note: '中轴更明显，并用细高光避免变成普通粗线。' },
  { id: 'spineRootFuse', label: '方向6C：生长脉络-根部融合', note: '中轴和根线在地平线附近汇聚，不再画根冠块。' },
  { id: 'lineOnly', label: '方向1：粗线主干', note: '弱化树形实体，只保留圆角主干线和自然根线。' },
  { id: 'organicPath', label: '方向2：一体有机树干', note: '用单个 path 同时表达树顶、树干和根部外扩。' },
  { id: 'organicPathSlim', label: '方向2A：有机树干-窄根部', note: '收窄根部外扩，减少裙摆和底座感。' },
  { id: 'organicPathSoftTop', label: '方向2B：有机树干-软树顶', note: '树顶更短更细，降低圆柱头的突兀感。' },
  { id: 'organicPathRootPorts', label: '方向2C：有机树干-根线出口', note: '保留一体树干，同时强调根线从底部出口长出。' },
  { id: 'fadedBackdrop', label: '方向3：淡化背景树干', note: '树干只做背景意象，让节点和连线成为主体。' },
  { id: 'fadeTop', label: '方向4：树顶淡出', note: '顶部降低存在感，像主干消失进树冠。' },
  { id: 'rootStrokes', label: '方向5：根线加粗出口', note: '取消根冠块，用根线起点的粗细变化表达发散。' },
];

fs.mkdirSync(outputDir, { recursive: true });
const document = readDocument(fixturePath);

for (const variant of variants) {
  const fileName = `sxfdl-trunk-${variant.id}.svg`;
  fs.writeFileSync(path.join(outputDir, fileName), renderSvg(document, variant));
  console.log(fileName);
}
