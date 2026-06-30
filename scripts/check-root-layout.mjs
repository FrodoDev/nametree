import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const fixturesDir = path.join(rootDir, 'debug-fixtures');
const outputDir = path.join(rootDir, 'debug-output');

const nodeWidth = 108;
const nodeHeight = 34;
const rootLabelHalfWidth = 58;

function readNtFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return raw.document ?? raw;
}

function getTreeShape(document) {
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

function getRootAngleSlots(count) {
  if (count <= 1) return [12];
  if (count === 2) return [24, 8];
  if (count === 3) return [68, 36, 10];
  if (count === 4) return [76, 56, 30, 8];
  if (count <= 6) return [80, 66, 48, 28, 12, 2];
  return [82, 70, 58, 42, 26, 12, 0, -8];
}

function getDynamicRootOffset(index, count) {
  const slots = getRootAngleSlots(count);
  const angle = slots[Math.min(index, slots.length - 1)] - Math.max(0, index - slots.length + 1) * 4;
  const length = count <= 2 ? 250 + index * 170 : 250 + index * 135 + Math.max(0, index - 3) * 42;
  const radians = angle * Math.PI / 180;

  return {
    x: Math.max(Math.cos(radians) * length, index < 2 ? 88 : 0),
    y: Math.sin(radians) * length,
  };
}

function avoidRootCollision(offset, sideFactor, occupied, span = 44) {
  const next = { ...offset };

  while (occupied.some((node) => Math.abs(node.x - sideFactor * next.x) < 230 && Math.abs(node.y - next.y) < (node.span + span) / 2 + 34)) {
    const angle = Math.atan2(next.y, Math.max(1, next.x));
    next.x += Math.cos(angle) * 86;
    next.y += Math.sin(angle) * 86;
  }

  occupied.push({ x: sideFactor * next.x, y: next.y, span });
  return next;
}

function normalizeTreeLayout(document) {
  const shape = getTreeShape(document);
  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  const mainRoot = document.nodes.find((node) => node.kind === 'main_root');
  const sourceById = new Map(document.nodes.map((node) => [node.id, node]));
  const nodes = document.nodes.map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const update = (id, x, y) => {
    const node = id ? byId.get(id) : undefined;
    if (node) {
      node.x = x;
      node.y = y;
    }
  };

  update(seed?.id, shape.centerX, shape.groundY);
  update(mainTrunk?.id, shape.centerX, shape.groundY - 55);
  update(mainRoot?.id, shape.centerX, shape.groundY + 55);

  const rootChildrenByParent = new Map();
  document.tree_edges.forEach((edge) => {
    const parent = sourceById.get(edge.parent_id);
    const child = byId.get(edge.child_id);
    if (!parent || !child) return;

    if ((parent.kind === 'main_trunk' || parent.kind === 'main_root' || parent.kind === 'root_branch') && child.kind === 'root_branch') {
      rootChildrenByParent.set(parent.id, [...(rootChildrenByParent.get(parent.id) ?? []), child]);
    }
  });

  const rootNodeHeight = 44;
  const rootSiblingGap = 26;
  const rootLevelDistance = 250;
  const rootTopY = shape.groundY + 56;

  const getRootSpan = (node) => {
    const children = rootChildrenByParent.get(node.id) ?? [];
    if (children.length === 0) return rootNodeHeight;

    const total = children.reduce((sum, child) => sum + getRootSpan(child), 0) + Math.max(0, children.length - 1) * rootSiblingGap;
    return Math.max(rootNodeHeight, total);
  };

  const layoutRootSubtree = (node, sideFactor, x, y) => {
    node.x = x;
    node.y = Math.max(rootTopY, y);
    node.side = sideFactor === -1 ? 'left' : 'right';

    const children = rootChildrenByParent.get(node.id) ?? [];
    if (children.length === 0) return;

    const totalSpan = children.reduce((sum, child) => sum + getRootSpan(child), 0) + Math.max(0, children.length - 1) * rootSiblingGap;
    layoutRootStack(children, sideFactor, x + sideFactor * rootLevelDistance, Math.max(rootTopY, node.y - totalSpan / 2));
  };

  const layoutRootStack = (items, sideFactor, x, startY) => {
    let cursor = Math.max(rootTopY, startY);

    items.forEach((node) => {
      const span = getRootSpan(node);
      layoutRootSubtree(node, sideFactor, x, Math.max(rootTopY, cursor + span / 2));
      cursor += span + rootSiblingGap;
    });
  };

  const layoutRootSide = (side, sideFactor) => {
    const trunkRoots = (rootChildrenByParent.get(mainTrunk?.id ?? '') ?? []).filter((node) => (node.side ?? 'right') === side);
    const legacyRoots = (rootChildrenByParent.get(mainRoot?.id ?? '') ?? []).filter((node) => (node.side ?? 'right') === side);
    const children = [...trunkRoots, ...legacyRoots];
    const occupied = [];
    const addDescendantOccupancy = (node) => {
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
      layoutRootSubtree(child, sideFactor, shape.centerX + sideFactor * (offset.x + 8), Math.max(rootTopY, shape.groundY + offset.y));
      addDescendantOccupancy(child);
    });
  };

  layoutRootSide('left', -1);
  layoutRootSide('right', 1);

  return { ...document, nodes };
}

function getRootCrownAttachPoint(child, shape) {
  const sideFactor = child.x < shape.centerX ? -1 : 1;
  const dx = Math.abs(child.x - shape.centerX);
  const dy = Math.max(0, child.y - shape.groundY);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const fanIndex = angle > 72 ? 0 : angle > 56 ? 1 : angle > 36 ? 2 : angle > 16 ? 3 : 4;
  const crownSlots = [
    { x: 0, y: 22 },
    { x: 4, y: 17 },
    { x: 8, y: 11 },
    { x: 8, y: 5 },
    { x: 5, y: 0 },
  ];
  const slot = crownSlots[Math.min(fanIndex, crownSlots.length - 1)];

  return {
    x: shape.centerX + sideFactor * slot.x,
    y: shape.groundY + slot.y,
  };
}

function createTrunkSpinePath(shape, trunkTopY) {
  const x = shape.centerX;
  const y = shape.groundY;
  return `M ${x} ${trunkTopY + 6} C ${x - 1} ${trunkTopY + 80}, ${x + 2} ${y - 98}, ${x} ${y + 30}`;
}

function createTrunkRootFusePath(shape, sideFactor) {
  const x = shape.centerX;
  const y = shape.groundY;
  return `M ${x} ${y + 20} C ${x + sideFactor * 18} ${y + 27}, ${x + sideFactor * 42} ${y + 30}, ${x + sideFactor * 76} ${y + 34}`;
}

function createTrunkSpineFootPath(shape) {
  const x = shape.centerX;
  const y = shape.groundY;
  return `M ${x} ${y + 9} C ${x - 6} ${y + 18}, ${x - 8} ${y + 25}, ${x} ${y + 34} C ${x + 8} ${y + 25}, ${x + 6} ${y + 18}, ${x} ${y + 9}`;
}

function createRootCrownPath(shape) {
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

function createRootEdgePath(parent, child, shape) {
  const sideFactor = child.x < shape.centerX ? -1 : 1;

  if (parent.kind === 'main_trunk' || parent.kind === 'main_root') {
    const parentEdge = getRootCrownAttachPoint(child, shape);
    const labelEdge = {
      x: child.x - sideFactor * rootLabelHalfWidth,
      y: child.y,
    };
    const verticalDrop = Math.max(1, labelEdge.y - parentEdge.y);
    const horizontalReach = Math.max(1, Math.abs(labelEdge.x - parentEdge.x));
    const firstControl = { x: parentEdge.x + sideFactor * Math.min(20, horizontalReach * 0.08), y: parentEdge.y + verticalDrop * 0.56 };
    const secondControl = { x: labelEdge.x - sideFactor * Math.min(180, Math.max(72, horizontalReach * 0.42)), y: labelEdge.y - verticalDrop * 0.34 };

    return `M ${parentEdge.x} ${parentEdge.y} C ${firstControl.x} ${firstControl.y}, ${secondControl.x} ${secondControl.y}, ${labelEdge.x} ${labelEdge.y}`;
  }

  const parentEdgeX = parent.x + sideFactor * 54;
  const childEdgeX = child.x - sideFactor * 54;
  const middleX = (parentEdgeX + childEdgeX) / 2;
  return `M ${parentEdgeX} ${parent.y} L ${middleX} ${parent.y} L ${middleX} ${child.y} L ${childEdgeX} ${child.y}`;
}

function createOutputEdgePath(parent, child, shape) {
  const sideFactor = child.x < shape.centerX ? -1 : 1;
  const childEdgeX = child.x - sideFactor * (nodeWidth / 2);

  if (parent.kind === 'main_trunk') {
    const parentEdgeX = shape.centerX;
    const parentEdgeY = child.y + 42;

    return `M ${parentEdgeX} ${parentEdgeY} L ${childEdgeX} ${child.y}`;
  }

  const parentEdgeX = parent.x + sideFactor * (nodeWidth / 2);
  const middleX = (parentEdgeX + childEdgeX) / 2;
  return `M ${parentEdgeX} ${parent.y} L ${middleX} ${parent.y} L ${middleX} ${child.y} L ${childEdgeX} ${child.y}`;
}

function angleFromHorizontal(shape, node) {
  const dx = Math.abs(node.x - shape.centerX);
  const dy = node.y - shape.groundY;
  return Number((Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1));
}

function rectFor(node) {
  return {
    left: node.x - nodeWidth / 2,
    right: node.x + nodeWidth / 2,
    top: node.y - nodeHeight / 2,
    bottom: node.y + nodeHeight / 2,
  };
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function countOverlaps(nodes) {
  let count = 0;
  const pairs = [];
  const rootNodes = nodes.filter((node) => node.kind === 'root_branch');
  for (let i = 0; i < rootNodes.length; i += 1) {
    for (let j = i + 1; j < rootNodes.length; j += 1) {
      if (overlaps(rectFor(rootNodes[i]), rectFor(rootNodes[j]))) {
        count += 1;
        pairs.push([
          { id: rootNodes[i].id, title: rootNodes[i].title, side: rootNodes[i].side, x: round(rootNodes[i].x), y: round(rootNodes[i].y) },
          { id: rootNodes[j].id, title: rootNodes[j].title, side: rootNodes[j].side, x: round(rootNodes[j].x), y: round(rootNodes[j].y) },
        ]);
      }
    }
  }
  return { count, pairs };
}

function segmentIntersects(a, b, c, d) {
  const ccw = (p1, p2, p3) => (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function countRootCrossings(document, shape) {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const mainRootEdges = document.tree_edges
    .map((edge) => ({ parent: byId.get(edge.parent_id), child: byId.get(edge.child_id) }))
    .filter(({ parent, child }) => parent && child?.kind === 'root_branch' && (parent.kind === 'main_trunk' || parent.kind === 'main_root'))
    .map(({ child }) => ({
      start: getRootCrownAttachPoint(child, shape),
      end: { x: child.x, y: child.y },
      side: child.side ?? (child.x < shape.centerX ? 'left' : 'right'),
    }));

  let count = 0;
  for (let i = 0; i < mainRootEdges.length; i += 1) {
    for (let j = i + 1; j < mainRootEdges.length; j += 1) {
      if (mainRootEdges[i].side !== mainRootEdges[j].side && segmentIntersects(mainRootEdges[i].start, mainRootEdges[i].end, mainRootEdges[j].start, mainRootEdges[j].end)) {
        count += 1;
      }
    }
  }
  return count;
}

function getTrunkTopY(document, shape) {
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  if (!mainTrunk) return shape.trunkTopY;

  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const trunkOutputItems = document.tree_edges
    .filter((edge) => edge.parent_id === mainTrunk.id)
    .map((edge) => byId.get(edge.child_id))
    .filter((node) => node?.kind === 'branch' || node?.kind === 'leaf');

  if (trunkOutputItems.length === 0) return shape.trunkTopY;

  const highestConnectionY = Math.min(...trunkOutputItems.map((node) => node.y + 42));
  return highestConnectionY - 34;
}

function getDetachedTrunkBranches(document, shape) {
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  if (!mainTrunk) return [];

  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const trunkTopY = getTrunkTopY(document, shape);

  return document.tree_edges
    .filter((edge) => edge.parent_id === mainTrunk.id)
    .map((edge) => byId.get(edge.child_id))
    .filter((node) => (node?.kind === 'branch' || node?.kind === 'leaf') && node.y + 42 < trunkTopY)
    .map((node) => ({ title: node.title, connectionY: round(node.y + 42), trunkTopY: round(trunkTopY) }));
}

function analyze(document) {
  const normalized = normalizeTreeLayout(document);
  const shape = getTreeShape(normalized);
  const mainTrunk = normalized.nodes.find((node) => node.kind === 'main_trunk');
  const byId = new Map(normalized.nodes.map((node) => [node.id, node]));
  const mainRoots = normalized.tree_edges
    .map((edge) => ({ parent: byId.get(edge.parent_id), child: byId.get(edge.child_id) }))
    .filter(({ parent, child }) => parent?.kind === 'main_trunk' && child?.kind === 'root_branch')
    .map(({ child }) => child);
  const leftRoots = mainRoots.filter((node) => (node.side ?? 'right') === 'left');
  const rightRoots = mainRoots.filter((node) => (node.side ?? 'right') === 'right');
  const angles = mainRoots.map((node) => ({ title: node.title, side: node.side, angle: angleFromHorizontal(shape, node), x: round(node.x), y: round(node.y) }));
  const highBandRoots = mainRoots.filter((node) => node.y <= shape.groundY + 120).length;
  const overlaps = countOverlaps(normalized.nodes);
  const crossingRisk = countRootCrossings(normalized, shape);
  const detachedTrunkBranches = getDetachedTrunkBranches(normalized, shape);
  const bounds = normalized.nodes.reduce((box, node) => ({
    minX: Math.min(box.minX, node.x - nodeWidth / 2),
    maxX: Math.max(box.maxX, node.x + nodeWidth / 2),
    minY: Math.min(box.minY, node.y - nodeHeight / 2),
    maxY: Math.max(box.maxY, node.y + nodeHeight / 2),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

  return {
    document: normalized,
    shape,
    mainTrunk: mainTrunk ? { x: mainTrunk.x, y: mainTrunk.y } : null,
    rootCount: { left: leftRoots.length, right: rightRoots.length, total: mainRoots.length },
    angles,
    highBandRoots,
    overlaps,
    crossingRisk,
    detachedTrunkBranches,
    bounds: Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, round(value)])),
    warnings: [
      highBandRoots > Math.max(2, Math.ceil(mainRoots.length * 0.35)) ? `高位主根偏多：${highBandRoots}/${mainRoots.length}` : null,
      overlaps.count > 0 ? `根节点重叠：${overlaps.count}` : null,
      crossingRisk > 0 ? `左右主根可能交叉：${crossingRisk}` : null,
      detachedTrunkBranches.length > 0 ? `树枝脱离树干：${detachedTrunkBranches.length}` : null,
    ].filter(Boolean),
  };
}

function round(value) {
  return Number(value.toFixed(1));
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function renderSvg(name, analysis) {
  const { document, shape, bounds } = analysis;
  const trunkTopY = getTrunkTopY(document, shape);
  const padding = 120;
  const minX = Math.min(bounds.minX, shape.centerX - 500) - padding;
  const minY = Math.min(bounds.minY, 0) - padding;
  const width = Math.max(900, bounds.maxX - minX + padding);
  const height = Math.max(700, bounds.maxY - minY + padding);
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const edgePaths = document.tree_edges.map((edge) => {
    const parent = byId.get(edge.parent_id);
    const child = byId.get(edge.child_id);
    if (!parent || !child) return '';
    if (child.kind === 'root_branch') {
      return `<path d="${createRootEdgePath(parent, child, shape)}" fill="none" stroke="#6d6d6d" stroke-width="1.4"/>`;
    }
    if (child.kind === 'branch' || child.kind === 'leaf') {
      return `<path d="${createOutputEdgePath(parent, child, shape)}" fill="none" stroke="#6d6d6d" stroke-width="1.4"/>`;
    }
    return '';
  }).join('\n');

  const nodes = document.nodes.filter((node) => node.kind !== 'seed_root').map((node) => {
    if (node.kind === 'main_trunk') {
      return `<path d="${createTrunkSpinePath(shape, trunkTopY)}" fill="none" stroke="#705e51" stroke-width="8" stroke-linecap="round" opacity="0.84"/><path d="${createTrunkRootFusePath(shape, -1)}" fill="none" stroke="#705e51" stroke-width="5.2" stroke-linecap="round" opacity="0.62"/><path d="${createTrunkRootFusePath(shape, 1)}" fill="none" stroke="#705e51" stroke-width="5.2" stroke-linecap="round" opacity="0.62"/><path d="${createTrunkSpineFootPath(shape)}" fill="rgba(112, 94, 81, 0.28)" stroke="none"/>`;
    }

    const fill = node.fillColor ?? '#ffffff';
    const stroke = node.color ?? '#9a7b4f';
    return `<g transform="translate(${node.x} ${node.y})"><rect x="-54" y="-17" width="108" height="34" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><text text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="#232323">${escapeXml(node.title)}</text></g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#fffcf6"/>
  <text x="${minX + 24}" y="${minY + 36}" font-size="18" font-weight="700" fill="#2f241b">${escapeXml(name)}</text>
  <line x1="${minX}" y1="${shape.groundY}" x2="${minX + width}" y2="${shape.groundY}" stroke="#d8cab7" stroke-dasharray="6 6"/>
  ${edgePaths}
  ${nodes}
</svg>
`;
}

fs.mkdirSync(outputDir, { recursive: true });
const fixtureFiles = fs.readdirSync(fixturesDir).filter((file) => file.endsWith('.nt')).sort();
const report = [];

for (const file of fixtureFiles) {
  const filePath = path.join(fixturesDir, file);
  const document = readNtFile(filePath);
  const analysis = analyze(document);
  const baseName = path.basename(file, '.nt');
  fs.writeFileSync(path.join(outputDir, `${baseName}.svg`), renderSvg(file, analysis));
  report.push({ file, ...analysis, document: undefined, shape: undefined });
}

fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

for (const item of report) {
  console.log(`${item.file}`);
  console.log(`  roots: left=${item.rootCount.left}, right=${item.rootCount.right}, total=${item.rootCount.total}`);
  console.log(`  angles: ${item.angles.map((root) => `${root.side}:${root.angle}°`).join(', ')}`);
  console.log(`  highBandRoots: ${item.highBandRoots}`);
  console.log(`  overlaps: ${item.overlaps.count}`);
  console.log(`  crossingRisk: ${item.crossingRisk}`);
  console.log(`  warnings: ${item.warnings.length > 0 ? item.warnings.join('; ') : 'none'}`);
}
