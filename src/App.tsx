import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';

const treeReferenceImage = new URL('../images/tree1.jpg', import.meta.url).href;
const nametreeLogo = treeReferenceImage;
const nodeLabelWidth = 108;
const singleLineNodeLabelHeight = 34;
const multiLineNodeLabelHeight = 48;
const nodeLabelPaddingX = 6;
const nodeLabelPaddingY = 4;

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
  titleTag?: string;
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

type NodeReparentDropTarget = {
  parentId: string;
  side?: GrowthSide;
};

type NodeReparentDrag = {
  nodeIds: string[];
  nodeId: string;
  startClientX: number;
  startClientY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
  dropTarget: NodeReparentDropTarget | null;
};

type MarqueeSelection = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

type TreeShape = {
  centerX: number;
  groundY: number;
  trunkTopY: number;
  trunkWidth: number;
  rootEndY: number;
  rootWidth: number;
};

type OutlineItem = {
  title: string;
  level: number;
  parent: OutlineItem | null;
};

type SelectionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const outputSiblingGapY = 8;
const rootSiblingGapY = outputSiblingGapY;
const rootChildSuggestionGapY = singleLineNodeLabelHeight + rootSiblingGapY;

const defaultNodeBorderColor = '#7a9a6d';
const defaultRootBorderColor = '#333333';
const defaultNodeFillColor = '#f8fbf4';

const defaultColorByKind: Record<NodeKind, string> = {
  seed_root: '#7b6b55',
  main_trunk: '#5f7f45',
  main_root: '#8b6f47',
  branch: defaultNodeBorderColor,
  leaf: defaultNodeBorderColor,
  root_branch: defaultRootBorderColor,
};

function getRootAngleSlots(count: number): number[] {
  if (count <= 1) return [12];
  if (count === 2) return [24, 8];
  if (count === 3) return [68, 36, 10];
  if (count === 4) return [76, 56, 30, 8];
  if (count <= 6) return [80, 66, 48, 28, 12, 2];
  return [82, 70, 58, 42, 26, 12, 0, -8];
}

function getDynamicRootOffset(index: number, count: number, side: GrowthSide = 'right'): { x: number; y: number } {
  const slots = getRootAngleSlots(count);
  const sideAngleOffset = side === 'left' ? 5 : -3;
  const angle = slots[Math.min(index, slots.length - 1)] + sideAngleOffset - Math.max(0, index - slots.length + 1) * 4;
  const sideLengthOffset = side === 'left' ? index * 22 : -index * 12;
  const length = (count <= 2 ? 250 + index * 170 : 250 + index * 135 + Math.max(0, index - 3) * 42) + sideLengthOffset;
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isEditingDocumentTitle, setIsEditingDocumentTitle] = useState(false);
  const [documentTitleDraft, setDocumentTitleDraft] = useState('');
  const [zoom, setZoom] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [detailPanelWidth, setDetailPanelWidth] = useState(238);
  const [panelResizeStart, setPanelResizeStart] = useState<{ pointerX: number; width: number } | null>(null);
  const [titlebarDragStart, setTitlebarDragStart] = useState<{ pointerX: number; pointerY: number } | null>(null);
  const [nodeReparentDrag, setNodeReparentDrag] = useState<NodeReparentDrag | null>(null);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection | null>(null);
  const [outlineDraft, setOutlineDraft] = useState('');
  const canvasPanelRef = useRef<HTMLElement | null>(null);
  const treeSvgRef = useRef<SVGSVGElement | null>(null);
  const nodeTitleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const documentTitleInputRef = useRef<HTMLInputElement | null>(null);
  const nodeReparentDragRef = useRef<NodeReparentDrag | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 700 });

  useEffect(() => {
    const panel = canvasPanelRef.current;
    if (!panel) return;

    const updateCanvasSize = () => {
      const rect = panel.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(360, Math.round(rect.width)),
        height: Math.max(420, Math.round(rect.height)),
      });
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    invoke<NametreeDocument>('load_sample_tree').then((tree) => {
      const normalizedTree = normalizeTreeLayout(tree);
      setDocument(normalizedTree);
      setUndoStack([]);
      setSelectedNodes([getInitialSelectedNodeId(normalizedTree)].filter((id): id is string => Boolean(id)));
      setCanvasOffset({ x: 0, y: 0 });
      setZoom(1);
    });
  }, []);

  useEffect(() => {
    if (!editingNodeId) return;

    requestAnimationFrame(() => {
      const input = nodeTitleInputRef.current;
      if (!input) return;
      const endPosition = input.value.length;
      input.setSelectionRange(endPosition, endPosition);
      input.scrollTop = input.scrollHeight;
    });
  }, [editingNodeId]);

  useEffect(() => {
    if (!isEditingDocumentTitle) return;

    requestAnimationFrame(() => {
      documentTitleInputRef.current?.select();
    });
  }, [isEditingDocumentTitle]);

  useEffect(() => {
    if (!panelResizeStart) return;

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = panelResizeStart.width - (event.clientX - panelResizeStart.pointerX);
      const maxPanelWidth = Math.max(238, window.innerWidth - 360);
      setDetailPanelWidth(Math.min(maxPanelWidth, Math.max(238, nextWidth)));
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
    if (!document || !nodeReparentDrag) return;

    const handlePointerMove = (event: PointerEvent) => {
      setNodeReparentDrag((current) => {
        if (!current) return current;

        const pointer = getTreePointFromClientPoint(event.clientX, event.clientY, treeSvgRef.current, canvasSize, canvasOffset, zoom);
        const isDragging = current.isDragging
          || Math.abs(event.clientX - current.startClientX) > 5
          || Math.abs(event.clientY - current.startClientY) > 5;
        const dropTarget = isDragging ? findReparentDropTarget(document, current.nodeIds, pointer, shape) : null;

        const nextDrag = {
          ...current,
          currentX: pointer.x,
          currentY: pointer.y,
          isDragging,
          dropTarget,
        };
        nodeReparentDragRef.current = nextDrag;
        return nextDrag;
      });
    };

    const handlePointerUp = () => {
      const current = nodeReparentDragRef.current;
      nodeReparentDragRef.current = null;
      setNodeReparentDrag(null);

      if (current?.isDragging && current.dropTarget) {
        reparentNodes(current.nodeIds, current.dropTarget.parentId, { x: current.currentX, y: current.currentY }, current.dropTarget.side);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [document, nodeReparentDrag, canvasSize, canvasOffset, zoom]);

  useEffect(() => {
    if (!document) return;

    const windowTitle = getDocumentFileName(document, documentPath);
    window.document.title = windowTitle;
    void getCurrentWindow().setTitle(windowTitle).catch((error) => {
      console.error('Failed to update Nametree window title', error);
    });
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
    if (!document || !selectedNode || !canEditOutline(selectedNode)) {
      setOutlineDraft('');
      return;
    }

    setOutlineDraft(serializeNodeOutline(document, selectedNode.id));
  }, [document, selectedNode]);

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

      if (!isTextInput && event.key === 'Tab' && !event.shiftKey && !(event.metaKey || event.ctrlKey || event.altKey)) {
        event.preventDefault();
        createDefaultChildForSelectedNode();
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

      if (event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        void exportCanvasAsPng();
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
    const unlistenExportPng = listen('menu-export-png', () => void exportCanvasAsPng());
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
      void unlistenExportPng.then((unlisten) => unlisten());
      void unlistenUndo.then((unlisten) => unlisten());
      void unlistenDelete.then((unlisten) => unlisten());
    };
  }, [document, documentPath, selectedNodeId, suggestions]);

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
    setSelectedNodes([getInitialSelectedNodeId(normalizedTree)].filter((id): id is string => Boolean(id)));
    setEditingNodeId(null);
    setIsEditingDocumentTitle(false);
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
    setSelectedNodes([normalizedTree.nodes[0]?.id].filter((id): id is string => Boolean(id)));
    setEditingNodeId(null);
    setIsEditingDocumentTitle(false);
    setCanvasOffset({ x: 0, y: 0 });
    setZoom(1);
  }

  async function exportCanvasAsPng() {
    if (!document || !treeSvgRef.current) return;

    try {
      const fileName = `${getDocumentBaseName(document, documentPath)}.png`;
      const targetPath = await save({
        defaultPath: fileName,
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      });
      if (!targetPath) return;

      const bytes = await renderTreeSvgToPngBytes(treeSvgRef.current, document, shape);
      const savedPath = await invoke<string>('save_png_file', { path: targetPath, fileName, bytes: Array.from(bytes) });
      window.alert(`已导出 PNG：${savedPath}`);
    } catch (error) {
      console.error('Failed to export Nametree PNG', error);
      window.alert(`导出 PNG 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function commitDocument(nextDocument: NametreeDocument, nextSelectedNodeId = selectedNodeId) {
    if (!document) return;

    const normalizedDocument = normalizeTreeLayout(nextDocument);
    const existingIds = new Set(normalizedDocument.nodes.map((node) => node.id));
    const nextSelectedIds = selectedNodeIds.filter((id) => existingIds.has(id));
    if (nextSelectedNodeId && existingIds.has(nextSelectedNodeId) && !nextSelectedIds.includes(nextSelectedNodeId)) {
      nextSelectedIds.push(nextSelectedNodeId);
    }

    setUndoStack((stack) => [...stack.slice(-49), document]);
    setDocument(normalizedDocument);
    setSelectedNodes(nextSelectedNodeId ? nextSelectedIds : []);
  }

  function updateDocumentTitleTag(titleTag: string) {
    if (!document || titleTag === (document.titleTag ?? '')) return;

    commitDocument({
      ...document,
      titleTag,
    });
  }

  function finishDocumentTitleEdit() {
    updateDocumentTitleTag(documentTitleDraft.trim());
    setIsEditingDocumentTitle(false);
  }

  function undoLastChange() {
    setUndoStack((stack) => {
      const previousDocument = stack[stack.length - 1];
      if (!previousDocument) return stack;

      setDocument(previousDocument);
      setSelectedNodes(selectedNodeIds.filter((id) => previousDocument.nodes.some((node) => node.id === id)));
      setEditingNodeId(null);
      setIsEditingDocumentTitle(false);
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
      : getInitialSelectedNodeId(nextDocument);

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
    if (!document || !selectedNode || !isKnowledgeNode(selectedNode)) return;

    const outlineItems = parseOutlineText(text);
    const pastedOutlineItems = outlineItems[0]?.title.trim() === selectedNode.title.trim()
      ? outlineItems.filter((item) => item.parent !== null)
      : outlineItems;

    if (pastedOutlineItems.length > 0) {
      pasteOutlineIntoSelectedNode(pastedOutlineItems);
      return;
    }

    updateSelectedNode({ note: selectedNode.note ? `${selectedNode.note}\n${text}` : text });
  }

  function updateSelectedNode(patch: Partial<TreeNode>) {
    if (!document || !selectedNodeId || !selectedNode || !isKnowledgeNode(selectedNode)) return;

    updateNode(selectedNodeId, patch);
  }

  function updateSelectedNodeStyles(patch: Pick<Partial<TreeNode>, 'color' | 'fillColor'>) {
    if (!document || selectedNodeIds.length === 0) return;

    const styleTargetIds = new Set(selectedNodeIds.filter((nodeId) => {
      const node = document.nodes.find((candidate) => candidate.id === nodeId);
      return node && isKnowledgeNode(node);
    }));
    if (styleTargetIds.size === 0) return;

    commitDocument({
      ...document,
      nodes: document.nodes.map((node) => styleTargetIds.has(node.id) ? { ...node, ...patch } : node),
    }, selectedNodeId);
  }

  function selectSingleNode(nodeId: string | null) {
    setSelectedNodeId(nodeId);
    setSelectedNodeIds(nodeId ? [nodeId] : []);
  }

  function toggleSelectedNode(nodeId: string) {
    setSelectedNodeIds((current) => {
      const exists = current.includes(nodeId);
      const next = exists ? current.filter((id) => id !== nodeId) : [...current, nodeId];
      setSelectedNodeId(next[next.length - 1] ?? null);
      return next;
    });
  }

  function setSelectedNodes(nodeIds: string[]) {
    const uniqueIds = Array.from(new Set(nodeIds));
    setSelectedNodeIds(uniqueIds);
    setSelectedNodeId(uniqueIds[uniqueIds.length - 1] ?? null);
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

  function reparentNodes(nodeIds: string[], nextParentId: string, dropPoint?: { x: number; y: number }, targetSide?: GrowthSide) {
    if (!document) return;

    const orderedNodeIds = getTopLevelSelectedNodeIds(document, nodeIds);
    let nextDocument = document;
    const movedNodeIds: string[] = [];

    orderedNodeIds.forEach((nodeId, index) => {
      const adjustedDropPoint = dropPoint ? { ...dropPoint, y: dropPoint.y + index * (singleLineNodeLabelHeight + outputSiblingGapY) } : undefined;
      const result = getReparentedDocument(nextDocument, nodeId, nextParentId, adjustedDropPoint, targetSide);
      if (!result) return;

      nextDocument = result;
      movedNodeIds.push(nodeId);
    });

    if (movedNodeIds.length === 0) return;
    commitDocument(nextDocument, movedNodeIds[movedNodeIds.length - 1]);
    setSelectedNodes(movedNodeIds);
  }

  function getReparentedDocument(baseDocument: NametreeDocument, nodeId: string, nextParentId: string, dropPoint?: { x: number; y: number }, targetSide?: GrowthSide): NametreeDocument | null {
    const child = baseDocument.nodes.find((node) => node.id === nodeId);
    const nextParent = baseDocument.nodes.find((node) => node.id === nextParentId);
    if (!child || !nextParent || !canReparentNode(baseDocument, child, nextParent, targetSide, true)) return null;

    const nextSide = getReparentedNodeSide(child, nextParent, shape, dropPoint, targetSide);
    const nextKind = getReparentedNodeKind(child, nextParent, shape, dropPoint);
    const subtreeNodeIds = collectDescendantNodeIds(baseDocument, nodeId);
    return {
      ...baseDocument,
      nodes: baseDocument.nodes.map((node) => {
        if (!subtreeNodeIds.has(node.id)) return node;

        const convertedKind = getConvertedSubtreeNodeKind(node, nextKind);
        return {
          ...node,
          kind: convertedKind,
          color: getConvertedNodeColor(node, convertedKind),
          side: nextSide,
        };
      }),
      tree_edges: reorderTreeEdgesForDrop(baseDocument, nodeId, nextParentId, nextSide, dropPoint ?? { x: child.x, y: child.y }, nextKind),
    };
  }

  function pasteOutlineIntoSelectedNode(outlineItems: OutlineItem[]) {
    if (!document || !selectedNode || !isKnowledgeNode(selectedNode)) return;

    const nextDocument = insertOutlineUnderSelectedNode(outlineItems);
    if (nextDocument) {
      commitDocument(nextDocument, selectedNode.id);
    }
  }

  function insertOutlineUnderNode(
    outlineItems: OutlineItem[],
    parentNode: TreeNode,
    defaultKind: NodeKind,
    baseDocument = document,
    sideForItem?: (item: OutlineItem) => GrowthSide,
  ) {
    if (!baseDocument) return null;

    const pastedNodes: TreeNode[] = [];
    const pastedEdges: TreeEdge[] = [];
    const nodeByOutlineItem = new Map<OutlineItem, TreeNode>();
    const parentDefaultSide = parentNode.side ?? (parentNode.x < shape.centerX ? 'left' : 'right');

    outlineItems.forEach((item) => {
      const outlineParentNode = item.parent ? nodeByOutlineItem.get(item.parent) ?? parentNode : parentNode;
      if (!outlineParentNode) return;

      const siblingCount = pastedEdges.filter((edge) => edge.parent_id === outlineParentNode.id).length;
      const itemSide = sideForItem?.(item) ?? outlineParentNode.side ?? parentDefaultSide;
      const sideFactor = itemSide === 'left' ? -1 : 1;
      const newNode: TreeNode = {
        id: crypto.randomUUID(),
        title: item.title,
        note: '',
        kind: defaultKind,
        color: defaultColorByKind[defaultKind],
        fillColor: defaultNodeFillColor,
        x: outlineParentNode.x + sideFactor * 178,
        y: outlineParentNode.y + siblingCount * (multiLineNodeLabelHeight + outputSiblingGapY),
        side: itemSide,
      };

      pastedNodes.push(newNode);
      pastedEdges.push({ parent_id: outlineParentNode.id, child_id: newNode.id });
      nodeByOutlineItem.set(item, newNode);
    });

    if (pastedNodes.length === 0) return null;

    return {
      ...baseDocument,
      nodes: [...baseDocument.nodes, ...pastedNodes],
      tree_edges: [...baseDocument.tree_edges, ...pastedEdges],
    };
  }

  function insertOutlineUnderSelectedNode(outlineItems: OutlineItem[], baseDocument = document) {
    if (!baseDocument || !selectedNode || !isKnowledgeNode(selectedNode)) return null;

    const defaultKind: NodeKind = selectedNode.kind === 'root_branch' ? 'root_branch' : 'branch';
    return insertOutlineUnderNode(outlineItems, selectedNode, defaultKind, baseDocument);
  }

  function getOutlineItemsUnderGroup(outlineItems: OutlineItem[], groupTitle: string): OutlineItem[] {
    const group = outlineItems.find((item) => item.parent === null && item.title.trim() === groupTitle);
    if (!group) return [];

    const items: OutlineItem[] = [];
    const itemMap = new Map<OutlineItem, OutlineItem>();

    outlineItems.forEach((item) => {
      let parent = item.parent;
      let isDescendant = false;
      while (parent) {
        if (parent === group) {
          isDescendant = true;
          break;
        }
        parent = parent.parent;
      }

      if (!isDescendant) return;

      const clonedParent = item.parent === group ? null : item.parent ? itemMap.get(item.parent) ?? null : null;
      const clonedItem: OutlineItem = {
        title: item.title,
        level: Math.max(0, item.level - group.level - 1),
        parent: clonedParent,
      };
      itemMap.set(item, clonedItem);
      items.push(clonedItem);
    });

    return items;
  }

  function getOutlineTopLevelSide(item: OutlineItem, topLevelItems: OutlineItem[]): GrowthSide {
    let topLevel = item;
    while (topLevel.parent) {
      topLevel = topLevel.parent;
    }

    const index = Math.max(0, topLevelItems.findIndex((candidate) => candidate === topLevel));
    return index % 2 === 0 ? 'right' : 'left';
  }

  function applyTrunkOutlineDraft(outlineItems: OutlineItem[]) {
    if (!document || !selectedNode || selectedNode.kind !== 'main_trunk') return;

    const descendantIds = collectDescendantNodeIds(document, selectedNode.id);
    descendantIds.delete(selectedNode.id);

    let baseDocument: NametreeDocument = {
      ...document,
      nodes: document.nodes.filter((node) => !descendantIds.has(node.id)),
      tree_edges: document.tree_edges.filter((edge) => !descendantIds.has(edge.parent_id) && !descendantIds.has(edge.child_id)),
      reference_links: document.reference_links.filter((link) => !descendantIds.has(link.source_id) && !descendantIds.has(link.target_id)),
    };

    const branchItems = getOutlineItemsUnderGroup(outlineItems, '树枝');
    const rootItems = getOutlineItemsUnderGroup(outlineItems, '树根');
    const topLevelBranchItems = branchItems.filter((item) => item.parent === null);
    const topLevelRootItems = rootItems.filter((item) => item.parent === null);

    const branchDocument = insertOutlineUnderNode(
      branchItems,
      selectedNode,
      'branch',
      baseDocument,
      (item) => getOutlineTopLevelSide(item, topLevelBranchItems),
    );
    if (branchDocument) baseDocument = branchDocument;

    const rootDocument = insertOutlineUnderNode(
      rootItems,
      selectedNode,
      'root_branch',
      baseDocument,
      (item) => getOutlineTopLevelSide(item, topLevelRootItems),
    );
    if (rootDocument) baseDocument = rootDocument;

    commitDocument(baseDocument, selectedNode.id);
  }

  function applyOutlineDraft() {
    if (!document || !selectedNode || !canEditOutline(selectedNode)) return;

    const outlineItems = parseOutlineText(outlineDraft, { allowPlainLines: true });

    if (selectedNode.kind === 'main_trunk') {
      applyTrunkOutlineDraft(outlineItems);
      return;
    }

    if (!isKnowledgeNode(selectedNode)) return;

    const descendantIds = collectDescendantNodeIds(document, selectedNode.id);
    descendantIds.delete(selectedNode.id);

    const baseDocument = {
      ...document,
      nodes: document.nodes.filter((node) => !descendantIds.has(node.id)),
      tree_edges: document.tree_edges.filter((edge) => !descendantIds.has(edge.parent_id) && !descendantIds.has(edge.child_id)),
      reference_links: document.reference_links.filter((link) => !descendantIds.has(link.source_id) && !descendantIds.has(link.target_id)),
    };

    if (outlineItems.length === 0) {
      commitDocument(baseDocument, selectedNode.id);
      return;
    }

    const nextDocument = insertOutlineUnderSelectedNode(outlineItems, baseDocument);
    if (nextDocument) {
      commitDocument(nextDocument, selectedNode.id);
    }
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

  function createDefaultChildForSelectedNode() {
    const suggestion = getDefaultChildSuggestion(selectedNode, suggestions);
    if (!suggestion) return;

    createSuggestedNode(suggestion);
  }

  if (!document) {
    return <main className="app-shell">Loading Nametree...</main>;
  }

  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const windowTitle = getDocumentFileName(document, documentPath);
  const titleTagText = getDocumentTitleTagText(document, documentPath);
  const isTitleTagPlaceholder = titleTagText.isPlaceholder;

  function handleWindowTitlebarPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || event.detail > 1) return;

    setTitlebarDragStart({ pointerX: event.clientX, pointerY: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleWindowTitlebarPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!titlebarDragStart) return;

    const deltaX = event.clientX - titlebarDragStart.pointerX;
    const deltaY = event.clientY - titlebarDragStart.pointerY;
    const moved = Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;
    if (!moved) return;

    setTitlebarDragStart(null);
    void getCurrentWindow().startDragging().catch((error) => {
      console.error('Failed to start Nametree window drag', error);
    });
  }

  function handleWindowTitlebarPointerUp() {
    setTitlebarDragStart(null);
  }

  function handleWindowTitlebarDoubleClick() {
    const appWindow = getCurrentWindow();
    void appWindow.isFullscreen()
      .then((isFullscreen) => appWindow.setFullscreen(!isFullscreen))
      .catch((error) => {
        console.error('Failed to toggle Nametree window fullscreen state', error);
      });
  }

  return (
    <main className="app-shell" style={{ gridTemplateColumns: `minmax(360px, 1fr) 6px minmax(238px, ${detailPanelWidth}px)` }}>
      <header
        className="window-titlebar"
        onPointerDown={handleWindowTitlebarPointerDown}
        onPointerMove={handleWindowTitlebarPointerMove}
        onPointerUp={handleWindowTitlebarPointerUp}
        onPointerCancel={handleWindowTitlebarPointerUp}
        onLostPointerCapture={handleWindowTitlebarPointerUp}
        onDoubleClick={handleWindowTitlebarDoubleClick}
      >
        <span>{windowTitle}</span>
      </header>
      <section
        className="canvas-panel"
        ref={canvasPanelRef}
      >
        <img className="canvas-logo" src={nametreeLogo} alt="Nametree logo" />

        <svg
          ref={treeSvgRef}
          className="tree-canvas"
          viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
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

            const point = getTreePointFromClientPoint(event.clientX, event.clientY, treeSvgRef.current, canvasSize, canvasOffset, zoom);
            setMarqueeSelection({ start: point, current: point });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!marqueeSelection) return;

            const point = getTreePointFromClientPoint(event.clientX, event.clientY, treeSvgRef.current, canvasSize, canvasOffset, zoom);
            setMarqueeSelection((current) => current ? { ...current, current: point } : current);
          }}
          onPointerUp={(event) => {
            if (marqueeSelection && document) {
              const selectionBox = getSelectionBox(marqueeSelection.start, marqueeSelection.current);
              if (selectionBox.width > 4 || selectionBox.height > 4) {
                const selectedIds = visibleKnowledgeNodes
                  .filter((node) => isNodeInSelectionBox(node, selectionBox))
                  .map((node) => node.id);
                setSelectedNodes(event.metaKey || event.ctrlKey ? [...selectedNodeIds, ...selectedIds] : selectedIds);
              }
            }

            window.setTimeout(() => setIsPanning(false), 0);
            setMarqueeSelection(null);
          }}
          onPointerLeave={() => {
            window.setTimeout(() => setIsPanning(false), 0);
            setMarqueeSelection(null);
          }}
        >
          <g transform={`translate(${canvasSize.width / 2 + canvasOffset.x} ${canvasSize.height / 2 + canvasOffset.y}) scale(${zoom}) translate(-450 -350)`}>
            <rect className="canvas-branch-ground" x="-50000" y="-50000" width="100000" height={50000 + shape.groundY} />
            <rect className="canvas-root-ground" x="-50000" y={shape.groundY} width="100000" height="100000" />
            {marqueeSelection && (() => {
              const box = getSelectionBox(marqueeSelection.start, marqueeSelection.current);
              return <rect className="selection-marquee" x={box.x} y={box.y} width={box.width} height={box.height} />;
            })()}

            <g
              className={`document-title-tag ${isTitleTagPlaceholder ? 'placeholder' : ''}`}
              transform={`translate(${shape.centerX + 28}, ${shape.groundY - 8})`}
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={() => {
                selectSingleNode(null);
                setEditingNodeId(null);
                setDocumentTitleDraft(document.titleTag ?? '');
                setIsEditingDocumentTitle(true);
              }}
            >
              {isEditingDocumentTitle ? (
                <foreignObject x="0" y="-22" width="220" height="34">
                  <input
                    ref={documentTitleInputRef}
                    className="document-title-input"
                    value={documentTitleDraft}
                    onChange={(event) => setDocumentTitleDraft(event.target.value)}
                    onBlur={finishDocumentTitleEdit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </foreignObject>
              ) : (
                <text x="0" y="0">{titleTagText.text}</text>
              )}
            </g>

          {!mainTrunk && seed && (
            <g
              className={`start-guide ${selectedNodeId === seed.id ? 'selected' : ''}`}
              transform={`translate(${seed.x}, ${seed.y})`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                selectSingleNode(seed.id);
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
            const isDropTargetEdge = nodeReparentDrag?.dropTarget?.parentId === parent.id && parent.kind !== 'main_trunk';
            const isSelectedIncomingEdge = selectedNodeIds.includes(child.id);
            return (
              <path
                key={`${edge.parent_id}-${edge.child_id}`}
                className={`${child.kind === 'root_branch' ? 'root-edge' : parent.kind === 'main_trunk' ? 'trunk-edge' : 'tree-edge'} ${isDropTargetEdge ? 'drop-target-edge' : ''} ${isSelectedIncomingEdge ? 'selected-incoming-edge' : ''}`}
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
              className={`tree-structure ${selectedNodeId === mainTrunk.id ? 'selected' : ''} ${nodeReparentDrag?.dropTarget?.parentId === mainTrunk.id ? 'drop-target' : ''}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                selectSingleNode(mainTrunk.id);
              }}
            >
              <path className="trunk-spine-base" d={createTrunkSpinePath(shape, getTrunkTopY(shape, document, suggestions))} />
              <path className="trunk-spine-root-left" d={createTrunkRootFusePath(shape, 'left')} />
              <path className="trunk-spine-root-right" d={createTrunkRootFusePath(shape, 'right')} />
              <path className="trunk-spine-foot" d={createTrunkSpineFootPath(shape)} />
              {nodeReparentDrag?.dropTarget?.parentId === mainTrunk.id && (
                <circle
                  className="trunk-drop-target"
                  cx={shape.centerX + (nodeReparentDrag.dropTarget.side === 'left' ? -34 : 34)}
                  cy={Math.min(shape.groundY + 24, Math.max(getTrunkTopY(shape, document, suggestions), nodeReparentDrag.currentY))}
                  r="22"
                />
              )}
              <rect
                className="structure-hitbox"
                x={shape.centerX - 18}
                y={getTrunkTopY(shape, document, suggestions)}
                width="36"
                height={shape.groundY + 12 - getTrunkTopY(shape, document, suggestions)}
                rx="12"
              />
            </g>
          )}

          {mainTrunk && nodeReparentDrag?.isDragging && nodeReparentDrag.dropTarget?.parentId === mainTrunk.id && (() => {
            const draggedNode = nodeById.get(nodeReparentDrag.nodeId);
            return draggedNode && isKnowledgeNode(draggedNode) && getReparentedNodeKind(draggedNode, mainTrunk, shape, { x: nodeReparentDrag.currentX, y: nodeReparentDrag.currentY }) === 'root_branch';
          })() && (() => {
            const preview = getPointerGhostRootPreview(document, nodeReparentDrag.nodeId, mainTrunk, nodeReparentDrag.dropTarget.side ?? 'right', { x: nodeReparentDrag.currentX, y: nodeReparentDrag.currentY }, shape);
            if (!preview) return null;

            return (
              <g className="ghost-root-preview">
                <path d={createRootEdgePath(preview.parent, preview.node, shape)} />
                <g transform={`translate(${preview.node.x}, ${preview.node.y})`}>
                  <rect x={-nodeLabelWidth / 2} y={-singleLineNodeLabelHeight / 2} width={nodeLabelWidth} height={singleLineNodeLabelHeight} rx="6" />
                  <text textAnchor="middle" y="5">{preview.node.title}</text>
                </g>
              </g>
            );
          })()}

          {visibleKnowledgeNodes.map((node) => {
            const titlePreviewLines = getNodeTitlePreviewLines(node.title);
            const labelHeight = getNodeVisualHeight(node);
            const isMultiLine = titlePreviewLines.length > 1;
            const isSelected = selectedNodeIds.includes(node.id);
            const isDragSource = nodeReparentDrag?.nodeIds.includes(node.id);
            const isDropTarget = nodeReparentDrag?.dropTarget?.parentId === node.id;

            return (
            <g
              key={node.id}
              className={`tree-node ${isSelected ? 'selected' : ''} ${isDragSource ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
              transform={`translate(${node.x}, ${node.y})`}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.button !== 0 || editingNodeId === node.id) return;
                event.preventDefault();

                const pointer = getTreePointFromClientPoint(event.clientX, event.clientY, treeSvgRef.current, canvasSize, canvasOffset, zoom);
                if (!(event.metaKey || event.ctrlKey) && !selectedNodeIds.includes(node.id)) {
                  setSelectedNodes([node.id]);
                }
                const dragNodeIds = selectedNodeIds.includes(node.id) ? selectedNodeIds : [node.id];
                const nextDrag = {
                  nodeIds: getTopLevelSelectedNodeIds(document, dragNodeIds),
                  nodeId: node.id,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  currentX: pointer.x,
                  currentY: pointer.y,
                  isDragging: false,
                  dropTarget: null,
                };
                nodeReparentDragRef.current = nextDrag;
                setNodeReparentDrag(nextDrag);
              }}
              onClick={(event) => {
                if (isPanning || nodeReparentDrag?.isDragging) return;
                if (event.metaKey || event.ctrlKey) {
                  toggleSelectedNode(node.id);
                  return;
                }

                selectSingleNode(node.id);
              }}
              onDoubleClick={() => {
                selectSingleNode(node.id);
                setEditingNodeId(node.id);
              }}
            >
              {isSelected && (
                node.kind === 'leaf' ? (
                  <path className="node-selection-ring" d={createLeafShapePath()} transform="scale(1.09)" stroke={node.color} />
                ) : (
                  <rect
                    className="node-selection-ring"
                    x={-nodeLabelWidth / 2 - 4}
                    y={-labelHeight / 2 - 4}
                    width={nodeLabelWidth + 8}
                    height={labelHeight + 8}
                    rx="12"
                    stroke={node.color}
                  />
                )
              )}
              {node.kind === 'leaf' ? (
                <path className="leaf-node-shape" d={createLeafShapePath()} fill={node.fillColor ?? defaultNodeFillColor} stroke={node.color} />
              ) : (
                <rect
                  x={-nodeLabelWidth / 2}
                  y={-labelHeight / 2}
                  width={nodeLabelWidth}
                  height={labelHeight}
                  rx="6"
                  fill={node.fillColor ?? defaultNodeFillColor}
                  stroke={node.color}
                />
              )}
              {editingNodeId === node.id ? (
                <foreignObject
                  x={-nodeLabelWidth / 2 + nodeLabelPaddingX}
                  y={-labelHeight / 2 + nodeLabelPaddingY}
                  width={nodeLabelWidth - nodeLabelPaddingX * 2}
                  height={labelHeight - nodeLabelPaddingY * 2}
                >
                  <textarea
                    className="node-title-input"
                    ref={nodeTitleInputRef}
                    autoFocus
                    value={node.title}
                    onChange={(event) => updateNode(node.id, { title: event.target.value })}
                    onBlur={() => setEditingNodeId(null)}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return;

                      if (event.key === 'Enter' && !event.altKey) {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }

                      if (event.key === 'Escape') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </foreignObject>
              ) : (
                <foreignObject
                  className={`node-title-view ${isMultiLine ? 'multi-line' : 'single-line'}`}
                  x={-nodeLabelWidth / 2 + nodeLabelPaddingX}
                  y={-labelHeight / 2 + nodeLabelPaddingY}
                  width={nodeLabelWidth - nodeLabelPaddingX * 2}
                  height={labelHeight - nodeLabelPaddingY * 2}
                >
                  <div>
                    {titlePreviewLines.map((line, index) => (
                      <span key={index}>{line}</span>
                    ))}
                  </div>
                </foreignObject>
              )}
            </g>
            );
          })}

          {nodeReparentDrag?.isDragging && (() => {
            const draggedNode = nodeById.get(nodeReparentDrag.nodeId);
            if (!draggedNode) return null;

            const titlePreviewLines = getNodeTitlePreviewLines(draggedNode.title);
            const labelHeight = getNodeVisualHeight(draggedNode);
            return (
              <g className="node-drag-preview" transform={`translate(${nodeReparentDrag.currentX}, ${nodeReparentDrag.currentY})`}>
                {draggedNode.kind === 'leaf' ? (
                  <path className="leaf-node-shape" d={createLeafShapePath()} fill={draggedNode.fillColor ?? defaultNodeFillColor} stroke={draggedNode.color} />
                ) : (
                  <rect
                    x={-nodeLabelWidth / 2}
                    y={-labelHeight / 2}
                    width={nodeLabelWidth}
                    height={labelHeight}
                    rx="6"
                    fill={draggedNode.fillColor ?? defaultNodeFillColor}
                    stroke={draggedNode.color}
                  />
                )}
                <text textAnchor="middle" y={titlePreviewLines.length === 1 ? 5 : -5}>{titlePreviewLines[0]}</text>
                {nodeReparentDrag.nodeIds.length > 1 && <text className="drag-count" textAnchor="middle" y={labelHeight / 2 + 18}>{nodeReparentDrag.nodeIds.length} 个节点</text>}
              </g>
            );
          })()}
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
        <button className="export-image-button" type="button" onClick={() => void exportCanvasAsPng()}>
          导出 PNG
        </button>
        {selectedNode ? (
          <div className="panel-editor">
            {isKnowledgeNode(selectedNode) ? (
              <>
                <input
                  className="panel-title-input"
                  value={selectedNode.title}
                  onChange={(event) => updateSelectedNode({ title: event.target.value })}
                />
                <div className="panel-color-grid">
                  {selectedNodeIds.length > 1 && <p className="multi-select-note">已选 {selectedNodeIds.length} 个节点，颜色会批量应用。</p>}
                  <label className="color-swatch-control" style={{ backgroundColor: selectedNode.color }}>
                    <span>边框</span>
                    <input
                      type="color"
                      value={selectedNode.color}
                      onChange={(event) => updateSelectedNodeStyles({ color: event.target.value })}
                    />
                  </label>
                  <label className="color-swatch-control" style={{ backgroundColor: selectedNode.fillColor ?? defaultNodeFillColor }}>
                    <span>填充</span>
                    <input
                      type="color"
                      value={selectedNode.fillColor ?? defaultNodeFillColor}
                      onChange={(event) => updateSelectedNodeStyles({ fillColor: event.target.value })}
                    />
                  </label>
                </div>
                <details className="note-section">
                  <summary>备注</summary>
                  <textarea
                    className="node-note-editor"
                    value={selectedNode.note}
                    onChange={(event) => updateSelectedNode({ note: event.target.value })}
                  />
                </details>
                <div className="outline-editor-header">
                  <h3>大纲</h3>
                  <button type="button" onClick={applyOutlineDraft}>应用</button>
                </div>
                <textarea
                  className="node-outline-editor"
                  value={outlineDraft}
                  placeholder={`编辑当前节点的子树大纲\n每行一个节点，用两个空格缩进表示层级`}
                  onChange={(event) => setOutlineDraft(event.target.value)}
                />
              </>
            ) : selectedNode.kind === 'main_trunk' ? (
              <>
                <div className="outline-editor-header">
                  <h3>大纲</h3>
                  <button type="button" onClick={applyOutlineDraft}>应用</button>
                </div>
                <textarea
                  className="node-outline-editor"
                  value={outlineDraft}
                  placeholder={`树枝\n  输出分支\n\n树根\n  输入材料`}
                  onChange={(event) => setOutlineDraft(event.target.value)}
                />
              </>
            ) : (
              <p className="note structure-note">选择主干或知识节点后编辑大纲。</p>
            )}
          </div>
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

function getSelectionBox(start: { x: number; y: number }, current: { x: number; y: number }): SelectionBox {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return {
    x,
    y,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function isNodeInSelectionBox(node: TreeNode, box: SelectionBox): boolean {
  const nodeWidth = nodeLabelWidth;
  const nodeHeight = getNodeVisualHeight(node);
  const nodeLeft = node.x - nodeWidth / 2;
  const nodeRight = node.x + nodeWidth / 2;
  const nodeTop = node.y - nodeHeight / 2;
  const nodeBottom = node.y + nodeHeight / 2;

  return nodeRight >= box.x
    && nodeLeft <= box.x + box.width
    && nodeBottom >= box.y
    && nodeTop <= box.y + box.height;
}

function getTopLevelSelectedNodeIds(document: NametreeDocument, nodeIds: string[]): string[] {
  const selectedIds = new Set(nodeIds);
  return nodeIds.filter((nodeId) => {
    let parentId = document.tree_edges.find((edge) => edge.child_id === nodeId)?.parent_id;
    while (parentId) {
      if (selectedIds.has(parentId)) return false;
      parentId = document.tree_edges.find((edge) => edge.child_id === parentId)?.parent_id;
    }

    return true;
  });
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

function getTreePointFromClientPoint(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement | null,
  canvasSize: { width: number; height: number },
  canvasOffset: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  const rect = svg?.getBoundingClientRect();
  if (!rect) return { x: 450, y: 350 };

  const svgX = (clientX - rect.left) * (canvasSize.width / Math.max(1, rect.width));
  const svgY = (clientY - rect.top) * (canvasSize.height / Math.max(1, rect.height));

  return {
    x: (svgX - canvasSize.width / 2 - canvasOffset.x) / zoom + 450,
    y: (svgY - canvasSize.height / 2 - canvasOffset.y) / zoom + 350,
  };
}

function findReparentDropTarget(document: NametreeDocument, draggedNodeIds: string[], point: { x: number; y: number }, shape: TreeShape): NodeReparentDropTarget | null {
  const draggedNode = document.nodes.find((node) => node.id === draggedNodeIds[0]);
  if (!draggedNode) return null;

  const draggedIdSet = new Set(draggedNodeIds);
  const candidates = document.nodes
    .filter((node) => !draggedIdSet.has(node.id) && canReparentNode(document, draggedNode, node, node.kind === 'main_trunk' ? getDropSide(point, shape) : undefined, true))
    .map((node) => ({
      node,
      side: node.kind === 'main_trunk' ? getDropSide(point, shape) : undefined,
      distance: getDropTargetDistance(node, point, shape),
      hitRadius: getDropTargetRadius(node),
    }))
    .filter((candidate) => candidate.distance <= candidate.hitRadius)
    .sort((a, b) => a.distance - b.distance);

  const currentParentId = document.tree_edges.find((edge) => edge.child_id === draggedNode.id)?.parent_id;
  const nodeCandidate = candidates.find((candidate) => candidate.node.kind !== 'main_trunk' && candidate.node.id !== currentParentId);
  if (nodeCandidate) {
    return { parentId: nodeCandidate.node.id, side: nodeCandidate.side };
  }

  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  if (isKnowledgeNode(draggedNode) && mainTrunk && isPointInRootReorderZone(point, shape)) {
    const side = getDropSide(point, shape);
    return {
      parentId: mainTrunk.id,
      side,
    };
  }

  const candidate = candidates[0];
  if (!candidate) return null;

  return { parentId: candidate.node.id, side: candidate.side };
}

function getDropSide(point: { x: number; y: number }, shape: TreeShape): GrowthSide {
  return point.x < shape.centerX ? 'left' : 'right';
}

function isPointInRootReorderZone(point: { x: number; y: number }, shape: TreeShape): boolean {
  return point.y >= shape.groundY - 78 && point.y <= shape.rootEndY + 180;
}

function getDropTargetDistance(node: TreeNode, point: { x: number; y: number }, shape: TreeShape): number {
  if (node.kind === 'main_trunk') {
    const sideX = shape.centerX + (getDropSide(point, shape) === 'left' ? -34 : 34);
    const clampedY = Math.min(shape.groundY + 24, Math.max(shape.trunkTopY, point.y));
    return Math.hypot(sideX - point.x, clampedY - point.y);
  }

  return Math.hypot(node.x - point.x, node.y - point.y);
}

function getDropTargetRadius(node: TreeNode): number {
  if (node.kind === 'main_trunk') return 92;
  if (node.kind === 'branch' || node.kind === 'root_branch') return nodeLabelWidth / 2 + 56;
  return Math.max(nodeLabelWidth / 2 + 28, getNodeVisualHeight(node) / 2 + 28);
}

function reorderTreeEdgesForDrop(
  document: NametreeDocument,
  nodeId: string,
  nextParentId: string,
  nextSide: GrowthSide | undefined,
  dropPoint: { x: number; y: number },
  nextKind?: NodeKind,
): TreeEdge[] {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const movingEdge: TreeEdge = { parent_id: nextParentId, child_id: nodeId };
  const remainingEdges = document.tree_edges.filter((edge) => edge.child_id !== nodeId);
  const originalMovingNode = nodeById.get(nodeId);
  const movingNode = originalMovingNode && nextKind ? { ...originalMovingNode, kind: nextKind, side: nextSide ?? originalMovingNode.side } : originalMovingNode;
  const parent = nodeById.get(nextParentId);
  if (parent?.kind === 'main_trunk' && movingNode?.kind === 'root_branch') {
    return reorderTrunkRootEdgesBySlot(remainingEdges, movingEdge, nodeById, nextParentId, nextSide, dropPoint);
  }

  const siblingEdges = remainingEdges.filter((edge) => isSameDropLane(nodeById.get(edge.child_id), movingNode, nextParentId, nextSide, edge.parent_id));
  const orderedSiblingEdges = [...siblingEdges].sort((a, b) => {
    const aNode = nodeById.get(a.child_id);
    const bNode = nodeById.get(b.child_id);
    return getSiblingSortY(aNode, parent, movingNode) - getSiblingSortY(bNode, parent, movingNode);
  });
  const dropSortY = getDropSortY(dropPoint.y, parent, movingNode);
  const insertBeforeSibling = orderedSiblingEdges.find((edge) => dropSortY < getSiblingSortY(nodeById.get(edge.child_id), parent, movingNode));
  const anchorIndex = insertBeforeSibling
    ? remainingEdges.findIndex((edge) => edge.parent_id === insertBeforeSibling.parent_id && edge.child_id === insertBeforeSibling.child_id)
    : findLastSiblingEdgeIndex(remainingEdges, nextParentId, nextSide, nodeById, movingNode) + 1;

  if (anchorIndex < 0) {
    return [...remainingEdges, movingEdge];
  }

  return [
    ...remainingEdges.slice(0, anchorIndex),
    movingEdge,
    ...remainingEdges.slice(anchorIndex),
  ];
}

function reorderTrunkRootEdgesBySlot(
  edges: TreeEdge[],
  movingEdge: TreeEdge,
  nodeById: Map<string, TreeNode>,
  parentId: string,
  side: GrowthSide | undefined,
  dropPoint: { x: number; y: number },
): TreeEdge[] {
  const legacyMainRootId = [...nodeById.values()].find((node) => node.kind === 'main_root')?.id;
  const isMainRootPoolParent = (id: string) => id === parentId || (legacyMainRootId ? id === legacyMainRootId : false);
  const isSameSideRootEdge = (edge: TreeEdge) => {
    const node = nodeById.get(edge.child_id);
    return isMainRootPoolParent(edge.parent_id) && node?.kind === 'root_branch' && isSameLayoutSide(node, side);
  };

  const sameSideEdges = edges.filter(isSameSideRootEdge);
  const orderedPool = [...sameSideEdges].sort((a, b) => {
    const aNode = nodeById.get(a.child_id);
    const bNode = nodeById.get(b.child_id);
    return getMainRootVisualSlotIndex(aNode, side, sameSideEdges.length) - getMainRootVisualSlotIndex(bNode, side, sameSideEdges.length);
  });
  const insertIndex = getMainRootDropSlotIndex(dropPoint, side ?? 'right', orderedPool.length + 1);
  const nextPool = [...orderedPool];
  nextPool.splice(insertIndex, 0, movingEdge);

  const result: TreeEdge[] = [];
  let poolInserted = false;
  edges.forEach((edge) => {
    if (!isSameSideRootEdge(edge)) {
      result.push(edge);
      return;
    }

    if (!poolInserted) {
      result.push(...nextPool);
      poolInserted = true;
    }
  });

  return poolInserted ? result : [...edges, ...nextPool];
}

function getMainRootVisualSlotIndex(node: TreeNode | undefined, side: GrowthSide | undefined, slotCount: number): number {
  if (!node) return Number.POSITIVE_INFINITY;
  return getMainRootDropSlotIndex({ x: node.x, y: node.y }, side ?? node.side ?? 'right', slotCount);
}

function getMainRootDropSlotIndex(point: { x: number; y: number }, side: GrowthSide, slotCount: number): number {
  if (slotCount <= 1) return 0;

  const sideFactor = side === 'left' ? -1 : 1;
  const originX = 450;
  const originY = 350;
  const scoredSlots = Array.from({ length: slotCount }, (_, index) => {
    const offset = getDynamicRootOffset(index, slotCount, side);
    const slotX = originX + sideFactor * (offset.x + 8);
    const slotY = originY + offset.y;
    const dx = Math.abs(point.x - slotX);
    const dy = Math.abs(point.y - slotY);
    return { index, score: dy + dx * 0.25 };
  });

  return scoredSlots.reduce((best, slot) => slot.score < best.score ? slot : best).index;
}

function getPointerGhostRootPreview(
  document: NametreeDocument,
  movingNodeId: string,
  parent: TreeNode,
  side: GrowthSide,
  point: { x: number; y: number },
  shape: TreeShape,
): { parent: TreeNode; node: TreeNode } | null {
  const movingNode = document.nodes.find((node) => node.id === movingNodeId);
  if (!movingNode) return null;

  const sideFactor = side === 'left' ? -1 : 1;
  const minX = parent.x + sideFactor * 118;
  const x = side === 'left' ? Math.min(point.x, minX) : Math.max(point.x, minX);
  const y = Math.max(shape.groundY + 42, point.y);

  return {
    parent,
    node: {
      ...movingNode,
      id: '__ghost-root-preview__',
      title: movingNode.title.trim() || '主根',
      kind: 'root_branch',
      side,
      x,
      y,
    },
  };
}

function isSameDropLane(
  node: TreeNode | undefined,
  movingNode: TreeNode | undefined,
  nextParentId: string,
  side: GrowthSide | undefined,
  edgeParentId: string,
): boolean {
  if (!node || edgeParentId !== nextParentId) return false;
  if (!isSameLayoutSide(node, side)) return false;

  if (movingNode?.kind === 'root_branch') {
    return node.kind === 'root_branch';
  }

  return node.kind === 'branch' || node.kind === 'leaf';
}

function isSameLayoutSide(node: TreeNode | undefined, side: GrowthSide | undefined): boolean {
  if (!node) return false;
  if (!side) return true;
  return (node.side ?? 'right') === side;
}

function getDropSortY(dropY: number, parent: TreeNode | undefined, movingNode: TreeNode | undefined): number {
  return shouldSortDownToUp(parent, movingNode) ? -dropY : dropY;
}

function getSiblingSortY(node: TreeNode | undefined, parent: TreeNode | undefined, movingNode: TreeNode | undefined): number {
  const y = node?.y ?? Number.POSITIVE_INFINITY;
  return shouldSortDownToUp(parent, movingNode) ? -y : y;
}

function shouldSortDownToUp(parent: TreeNode | undefined, movingNode: TreeNode | undefined): boolean {
  return parent?.kind === 'main_trunk' && movingNode?.kind !== 'root_branch';
}

function findLastSiblingEdgeIndex(edges: TreeEdge[], parentId: string, side: GrowthSide | undefined, nodeById: Map<string, TreeNode>, movingNode: TreeNode | undefined): number {
  let index = -1;
  edges.forEach((edge, edgeIndex) => {
    if (isSameDropLane(nodeById.get(edge.child_id), movingNode, parentId, side, edge.parent_id)) {
      index = edgeIndex;
    }
  });
  return index;
}

function canReparentNode(document: NametreeDocument, child: TreeNode, nextParent: TreeNode, targetSide?: GrowthSide, allowSameParent = false): boolean {
  if (!isKnowledgeNode(child)) return false;
  if (child.id === nextParent.id) return false;
  if (collectDescendantNodeIds(document, child.id).has(nextParent.id)) return false;

  const currentParentId = document.tree_edges.find((edge) => edge.child_id === child.id)?.parent_id;
  if (currentParentId === nextParent.id) {
    if (allowSameParent) return true;
    return nextParent.kind === 'main_trunk' && Boolean(targetSide) && child.side !== targetSide;
  }

  return nextParent.kind === 'main_trunk' || nextParent.kind === 'main_root' || nextParent.kind === 'branch' || nextParent.kind === 'root_branch';
}

function getReparentedNodeKind(child: TreeNode, nextParent: TreeNode, shape: TreeShape, dropPoint?: { x: number; y: number }): NodeKind {
  if (nextParent.kind === 'branch') return child.kind === 'leaf' ? 'leaf' : 'branch';
  if (nextParent.kind === 'root_branch' || nextParent.kind === 'main_root') return 'root_branch';

  if (nextParent.kind === 'main_trunk') {
    return (dropPoint?.y ?? child.y) >= shape.groundY - 78 ? 'root_branch' : child.kind === 'leaf' ? 'leaf' : 'branch';
  }

  return child.kind;
}

function getConvertedSubtreeNodeKind(node: TreeNode, targetRootKind: NodeKind): NodeKind {
  if (targetRootKind === 'root_branch') return 'root_branch';
  if (node.kind === 'leaf') return 'leaf';
  return 'branch';
}

function getConvertedNodeColor(node: TreeNode, nextKind: NodeKind): string {
  if (node.kind === nextKind) return node.color;
  if (node.color === defaultColorByKind[node.kind]) return defaultColorByKind[nextKind];
  return node.color;
}

function getReparentedNodeSide(child: TreeNode, nextParent: TreeNode, shape: TreeShape, dropPoint?: { x: number; y: number }, targetSide?: GrowthSide): GrowthSide | undefined {
  if (targetSide) return targetSide;

  if (nextParent.kind === 'main_trunk') {
    return (dropPoint?.x ?? child.x) < shape.centerX ? 'left' : 'right';
  }

  if (nextParent.kind === 'branch' || nextParent.kind === 'root_branch') {
    return nextParent.side ?? (nextParent.x < shape.centerX ? 'left' : 'right');
  }

  return child.side;
}

function isKnowledgeNode(node: TreeNode): boolean {
  return node.kind === 'branch' || node.kind === 'leaf' || node.kind === 'root_branch';
}

function canEditOutline(node: TreeNode): boolean {
  return node.kind === 'main_trunk' || isKnowledgeNode(node);
}

function getTitleCharWidth(char: string): number {
  return /[\u{2E80}-\u{9FFF}\u{F900}-\u{FAFF}]/u.test(char) ? 1 : 0.56;
}

function getNodeTitlePreviewLines(title: string): string[] {
  const maxLines = 2;
  const maxLineWidth = 8.2;
  const source = title.replace(/\r\n?/g, '\n').trimStart();
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  let index = 0;

  while (index < source.length && lines.length < maxLines) {
    const char = source[index];

    if (char === '\n') {
      lines.push(current);
      current = '';
      currentWidth = 0;
      index += 1;
      continue;
    }

    const charWidth = getTitleCharWidth(char);
    if (current.length > 0 && currentWidth + charWidth > maxLineWidth) {
      lines.push(current);
      current = '';
      currentWidth = 0;
      continue;
    }

    current += char;
    currentWidth += charWidth;
    index += 1;
  }

  if (lines.length < maxLines && current.length > 0) {
    lines.push(current);
  }

  if (lines.length === 0) return [''];

  if (index < source.length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex].replace(/.$/u, '')}…`;
  }

  return lines;
}

function getNodeVisualHeight(node: Pick<TreeNode, 'title'>): number {
  return getNodeTitlePreviewLines(node.title).length > 1 ? multiLineNodeLabelHeight : singleLineNodeLabelHeight;
}

function serializeNodeOutline(document: NametreeDocument, nodeId: string): string {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const selectedNode = nodeById.get(nodeId);
  const childrenByParent = new Map<string, TreeNode[]>();

  document.tree_edges.forEach((edge) => {
    const child = nodeById.get(edge.child_id);
    if (!child || !isKnowledgeNode(child)) return;

    childrenByParent.set(edge.parent_id, [...(childrenByParent.get(edge.parent_id) ?? []), child]);
  });

  const lines: string[] = [];
  const appendChildren = (parentId: string, level: number, filter?: (node: TreeNode) => boolean) => {
    const children = childrenByParent.get(parentId) ?? [];

    children.filter((child) => filter?.(child) ?? true).forEach((child) => {
      lines.push(`${'  '.repeat(level)}${child.title}`);
      appendChildren(child.id, level + 1);
    });
  };

  if (selectedNode?.kind === 'main_trunk') {
    lines.push('树枝');
    appendChildren(nodeId, 1, (child) => child.kind === 'branch' || child.kind === 'leaf');
    lines.push('');
    lines.push('树根');
    appendChildren(nodeId, 1, (child) => child.kind === 'root_branch');
    return lines.join('\n');
  }

  appendChildren(nodeId, 0);
  return lines.join('\n');
}

function parseOutlineText(text: string, options: { allowPlainLines?: boolean } = {}): OutlineItem[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => line.trim().length > 0);

  if (!options.allowPlainLines && lines.length < 2) return [];

  const parsedLines = lines.map((line) => {
    const indentText = line.match(/^[\t ]*/)?.[0] ?? '';
    const indent = [...indentText].reduce((sum, char) => sum + (char === '\t' ? 2 : 1), 0);
    const title = line.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim();
    const hasMarker = title !== line.trim();

    return { indent, title, hasMarker };
  }).filter((line) => line.title.length > 0);

  const hasOutlineSignal = options.allowPlainLines || parsedLines.some((line) => line.indent > 0) || parsedLines.some((line) => line.hasMarker);
  if (!hasOutlineSignal) return [];

  const sortedIndents = Array.from(new Set(parsedLines.map((line) => line.indent))).sort((a, b) => a - b);
  const stack: OutlineItem[] = [];
  const items: OutlineItem[] = [];

  parsedLines.forEach((line) => {
    const level = sortedIndents.indexOf(line.indent);
    const parent = level > 0 ? stack[level - 1] ?? null : null;
    const item: OutlineItem = { title: line.title, level, parent };

    stack[level] = item;
    stack.length = level + 1;
    items.push(item);
  });

  return items;
}

function getDefaultChildSuggestion(selectedNode: TreeNode | null, suggestions: Suggestion[]): Suggestion | null {
  if (!selectedNode) return null;

  if (selectedNode.kind === 'main_trunk') {
    return suggestions.find((suggestion) => suggestion.kind === 'branch' && suggestion.side === 'right')
      ?? suggestions.find((suggestion) => suggestion.kind === 'branch')
      ?? null;
  }

  if (selectedNode.kind === 'branch') {
    return suggestions.find((suggestion) => suggestion.kind === 'branch') ?? null;
  }

  if (selectedNode.kind === 'root_branch') {
    return suggestions.find((suggestion) => suggestion.kind === 'root_branch') ?? null;
  }

  return null;
}

async function renderTreeSvgToPngBytes(_svg: SVGSVGElement, document: NametreeDocument, shape: TreeShape): Promise<Uint8Array> {
  const trunkTopY = getTrunkTopY(shape, document, []);
  const exportBounds = getExportBounds(document, shape, trunkTopY);
  const serializedSvg = renderExportSvg(document, shape, exportBounds, trunkTopY);
  const svgBlob = new Blob([serializedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const imageUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(imageUrl);
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(exportBounds.width * scale);
    canvas.height = Math.ceil(exportBounds.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to encode PNG')), 'image/png');
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function renderExportSvg(document: NametreeDocument, shape: TreeShape, bounds: { x: number; y: number; width: number; height: number }, trunkTopY: number): string {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const titleTagText = getDocumentTitleTagText(document);
  const edges = document.tree_edges.map((edge) => {
    const parent = nodeById.get(edge.parent_id);
    const child = nodeById.get(edge.child_id);
    if (!parent || !child || !isKnowledgeNode(child)) return '';
    const className = child.kind === 'root_branch' ? 'root-edge' : parent.kind === 'main_trunk' ? 'trunk-edge' : 'tree-edge';
    const path = isOutputEdge(parent, child)
      ? createOutputEdgePath(parent, child, shape)
      : isRootEdge(parent, child)
        ? createRootEdgePath(parent, child, shape)
        : createCurve(getConnectionPoint(parent, child, shape), child);
    return `<path class="${className}" d="${path}"/>`;
  }).join('\n');
  const references = document.reference_links.map((link) => {
    const source = nodeById.get(link.source_id);
    const target = nodeById.get(link.target_id);
    if (!source || !target) return '';
    return `<path class="reference-link" d="${createCurve(source, target)}"/>`;
  }).join('\n');
  const trunk = document.nodes.find((node) => node.kind === 'main_trunk')
    ? `<path class="trunk-spine-base" d="${createTrunkSpinePath(shape, trunkTopY)}"/>
      <path class="trunk-spine-root" d="${createTrunkRootFusePath(shape, 'left')}"/>
      <path class="trunk-spine-root" d="${createTrunkRootFusePath(shape, 'right')}"/>
      <path class="trunk-spine-foot" d="${createTrunkSpineFootPath(shape)}"/>`
    : '';
  const nodes = document.nodes.filter(isKnowledgeNode).map(renderExportNode).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">
    <style>${getExportSvgCss()}</style>
    <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff"/>
    <rect x="-50000" y="-50000" width="100000" height="${50000 + shape.groundY}" fill="#ffffff"/>
    <rect x="-50000" y="${shape.groundY}" width="100000" height="100000" fill="#e1e2df"/>
    <text class="document-title-export" x="${shape.centerX + 28}" y="${shape.groundY - 8}">${escapeXml(titleTagText.text)}</text>
    ${edges}
    ${references}
    ${trunk}
    ${nodes}
  </svg>`;
}

function renderExportNode(node: TreeNode): string {
  const titlePreviewLines = getNodeTitlePreviewLines(node.title);
  const labelHeight = getNodeVisualHeight(node);
  const fill = node.fillColor ?? defaultNodeFillColor;
  const titleLines = titlePreviewLines.map((line, index) => {
    const y = titlePreviewLines.length === 1 ? 5 : -5 + index * 14;
    return `<text x="0" y="${y}" text-anchor="middle">${escapeXml(line)}</text>`;
  }).join('\n');

  if (node.kind === 'leaf') {
    return `<g class="tree-node-export" transform="translate(${node.x}, ${node.y})">
      <path d="${createLeafShapePath()}" fill="${fill}" stroke="${node.color}"/>
      ${titleLines}
    </g>`;
  }

  return `<g class="tree-node-export" transform="translate(${node.x}, ${node.y})">
    <rect x="${-nodeLabelWidth / 2}" y="${-labelHeight / 2}" width="${nodeLabelWidth}" height="${labelHeight}" rx="6" fill="${fill}" stroke="${node.color}"/>
    ${titleLines}
  </g>`;
}

function getExportSvgCss(): string {
  return `
    .tree-edge, .trunk-edge, .root-edge { fill: none; stroke: rgba(64, 64, 64, 0.76); stroke-width: 1.45; }
    .root-edge { stroke-width: 1.35; }
    .reference-link { fill: none; stroke: rgba(22, 110, 122, 0.32); stroke-width: 1.4; stroke-dasharray: 8 6; }
    .trunk-spine-base { fill: none; stroke: #705e51; stroke-width: 8; stroke-linecap: round; opacity: 0.84; }
    .trunk-spine-root { fill: none; stroke: #705e51; stroke-width: 5.2; stroke-linecap: round; opacity: 0.62; }
    .trunk-spine-foot { fill: rgba(112, 94, 81, 0.28); stroke: none; }
    .tree-node-export rect, .tree-node-export path { stroke-width: 1.35; }
    .tree-node-export text { fill: #1f2a1d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; font-weight: 700; dominant-baseline: middle; }
    .document-title-export { fill: #4d5665; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 18px; font-weight: 850; }
  `;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getExportBounds(document: NametreeDocument, shape: TreeShape, trunkTopY: number): { x: number; y: number; width: number; height: number } {
  const nodes = document.nodes.filter((node) => node.kind !== 'seed_root');
  const padding = 96;
  const nodeRects = nodes.map((node) => {
    const height = getNodeVisualHeight(node);
    const width = node.kind === 'leaf' ? 92 : nodeLabelWidth;
    return {
      minX: node.x - width / 2,
      maxX: node.x + width / 2,
      minY: node.y - height / 2,
      maxY: node.y + height / 2,
    };
  });
  const titleTag = getDocumentTitleTagText(document);
  const titleWidth = Math.max(160, titleTag.text.length * 24);
  nodeRects.push({ minX: shape.centerX - 90, maxX: shape.centerX + titleWidth, minY: trunkTopY - 80, maxY: shape.groundY + 50 });

  const minX = Math.floor(Math.min(...nodeRects.map((rect) => rect.minX)) - padding);
  const maxX = Math.ceil(Math.max(...nodeRects.map((rect) => rect.maxX)) + padding);
  const minY = Math.floor(Math.min(...nodeRects.map((rect) => rect.minY)) - padding);
  const maxY = Math.ceil(Math.max(...nodeRects.map((rect) => rect.maxY)) + padding);

  return {
    x: minX,
    y: minY,
    width: Math.max(720, maxX - minX),
    height: Math.max(520, maxY - minY),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to render SVG for export'));
    image.src = url;
  });
}

function getDocumentFileName(document: NametreeDocument, documentPath?: string | null): string {
  if (documentPath) {
    return documentPath.split(/[\\/]/).pop() ?? '未保存.nt';
  }

  const title = document.title.trim() || '未保存';
  return title.endsWith('.nt') ? title : `${title}.nt`;
}

function getDocumentBaseName(document: NametreeDocument, documentPath?: string | null): string {
  return stripNtExtension(getDocumentFileName(document, documentPath)) || 'Nametree';
}

function getInitialSelectedNodeId(document: NametreeDocument): string | null {
  return document.nodes.find((node) => node.kind === 'main_trunk')?.id ?? document.nodes[0]?.id ?? null;
}

function getDocumentTitleTagText(document: NametreeDocument, documentPath?: string | null): { text: string; isPlaceholder: boolean } {
  const titleTag = document.titleTag?.trim();
  if (titleTag) {
    return { text: titleTag, isPlaceholder: false };
  }

  if (documentPath) {
    const fileName = documentPath.split(/[\\/]/).pop() ?? '';
    return { text: stripNtExtension(fileName) || '双击填写作品主题', isPlaceholder: false };
  }

  const title = document.title.trim();
  if (!title || title === '未保存') {
    return { text: '双击填写作品主题', isPlaceholder: true };
  }

  return { text: stripNtExtension(title), isPlaceholder: false };
}

function stripNtExtension(fileName: string): string {
  return fileName.replace(/\.nt$/i, '');
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
    const childY = findFreeRootSuggestionY(document.nodes, childX, Math.max(shape.groundY + 56, selectedNode.y + siblingCount * rootChildSuggestionGapY));

    return [
      createSuggestionAt(selectedNode, 'root_branch', '子根系', childX, childY, parentSide),
    ];
  }

  return [];
}

function getOutputSuggestions(document: NametreeDocument, selectedNode: TreeNode, shape: TreeShape): Suggestion[] {
  if (selectedNode.kind === 'main_trunk') {
    const outputChildren = document.tree_edges
      .filter((edge) => edge.parent_id === selectedNode.id)
      .map((edge) => document.nodes.find((node) => node.id === edge.child_id))
      .filter((node): node is TreeNode => node?.kind === 'branch' || node?.kind === 'leaf');
    const leftBranchCount = outputChildren.filter((node) => (node.side ?? 'right') === 'left').length;
    const rightBranchCount = outputChildren.filter((node) => (node.side ?? 'right') === 'right').length;
    const leftX = shape.centerX - getTrunkBranchDistance(leftBranchCount, leftBranchCount + 1);
    const rightX = shape.centerX + getTrunkBranchDistance(rightBranchCount, rightBranchCount + 1);
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
    const leftRootOffset = getDynamicRootOffset(leftRootCount, leftRootTotal, 'left');
    const rightRootOffset = getDynamicRootOffset(rightRootCount, rightRootTotal, 'right');
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
  const leafY = findFreeOutputSuggestionY(placed, childX, selectedNode.y - (singleLineNodeLabelHeight + outputSiblingGapY));

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
    fillColor: defaultNodeFillColor,
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
    fillColor: defaultNodeFillColor,
    x,
    y,
    parentId: parent.id,
    side,
  };
}

function getTrunkBranchDistance(index: number, total: number): number {
  if (total <= 1) return 238;

  const position = index / Math.max(1, total - 1);
  const crown = Math.sin(position * Math.PI);
  const scale = Math.min(1, Math.max(0, (total - 2) / 8));
  const edgeDistance = 210 + scale * 12;
  const centerDistance = 292 + scale * 28;

  return Math.round(edgeDistance + (centerDistance - edgeDistance) * crown);
}

function findFreeOutputSuggestionY(nodes: TreeNode[], x: number, preferredY: number): number {
  let y = preferredY;
  const suggestionHeight = singleLineNodeLabelHeight;
  const xTolerance = 120;

  while (nodes.some((node) => Math.abs(node.x - x) < xTolerance && Math.abs(node.y - y) < (getNodeVisualHeight(node) + suggestionHeight) / 2 + outputSiblingGapY)) {
    y -= suggestionHeight + outputSiblingGapY;
  }

  return y;
}

function findFreeRootSuggestionY(nodes: TreeNode[], x: number, preferredY: number): number {
  let y = preferredY;
  const suggestionHeight = singleLineNodeLabelHeight;
  const xTolerance = 150;

  while (nodes.some((node) => Math.abs(node.x - x) < xTolerance && Math.abs(node.y - y) < (getNodeVisualHeight(node) + suggestionHeight) / 2 + rootSiblingGapY)) {
    y += suggestionHeight + rootSiblingGapY;
  }

  return y;
}

function ensureInitialMainTrunk(document: NametreeDocument): NametreeDocument {
  if (document.nodes.some((node) => node.kind === 'main_trunk')) return document;

  const seed = document.nodes.find((node) => node.kind === 'seed_root');
  const baseX = seed?.x ?? 450;
  const baseY = seed?.y ?? 390;

  return {
    ...document,
    nodes: [
      ...document.nodes,
      {
        id: 'main-trunk',
        title: '主干',
        note: '这棵树的主要表达方向。',
        kind: 'main_trunk',
        color: defaultColorByKind.main_trunk,
        fillColor: defaultNodeFillColor,
        x: baseX,
        y: baseY - 55,
      },
    ],
  };
}

function normalizeTreeLayout(document: NametreeDocument): NametreeDocument {
  const documentWithTrunk = ensureInitialMainTrunk(document);
  const shape = getTreeShape(documentWithTrunk);
  const seed = documentWithTrunk.nodes.find((node) => node.kind === 'seed_root');
  const mainTrunk = documentWithTrunk.nodes.find((node) => node.kind === 'main_trunk');
  const mainRoot = documentWithTrunk.nodes.find((node) => node.kind === 'main_root');
  const nodeById = new Map(documentWithTrunk.nodes.map((node) => [node.id, node]));

  const laidOutNodes = documentWithTrunk.nodes.map((node) => ({ ...node }));
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

  documentWithTrunk.tree_edges.forEach((edge) => {
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

  const rootSiblingGap = rootSiblingGapY;
  const rootLevelDistance = 178;
  const rootTopY = shape.groundY + 56;

  const getRootSpan = (node: TreeNode): number => {
    const nodeHeight = getNodeVisualHeight(node);
    const children = rootChildrenByParent.get(node.id) ?? [];
    if (children.length === 0) return nodeHeight;

    const total = children.reduce((sum, child) => sum + getRootSpan(child), 0) + Math.max(0, children.length - 1) * rootSiblingGap;
    return Math.max(nodeHeight, total);
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
    const children = documentWithTrunk.tree_edges
      .filter((edge) => edge.parent_id === mainTrunk?.id || edge.parent_id === mainRoot?.id)
      .map((edge) => laidOutById.get(edge.child_id))
      .filter((node): node is TreeNode => node?.kind === 'root_branch' && (node.side ?? 'right') === side);
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
      const offset = avoidRootCollision(getDynamicRootOffset(index, children.length, side), sideFactor, occupied, getRootSpan(child));
      const childX = shape.centerX + sideFactor * (offset.x + 8);
      const childY = Math.max(rootTopY, shape.groundY + offset.y);
      layoutRootSubtree(child, sideFactor, childX, childY);
      addDescendantOccupancy(child);
    });
  };

  layoutRootSide('left', -1);
  layoutRootSide('right', 1);

  return { ...documentWithTrunk, nodes: laidOutNodes };
}

function layoutOutputTree(
  mainTrunk: TreeNode | undefined,
  childrenByParent: Map<string, TreeNode[]>,
  shape: TreeShape,
) {
  if (!mainTrunk) return;

  const siblingGap = outputSiblingGapY;
  const levelDistance = 178;

  const getSpan = (node: TreeNode): number => {
    const nodeHeight = getNodeVisualHeight(node);
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

    children.forEach((node, index) => {
      const span = getSpan(node);
      const branchDistance = getTrunkBranchDistance(index, children.length);
      layoutSubtree(node, sideFactor, shape.centerX + sideFactor * branchDistance, cursor - span / 2);
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

function getTrunkTopY(shape: TreeShape, document: NametreeDocument, suggestions: Suggestion[]): number {
  const mainTrunk = document.nodes.find((node) => node.kind === 'main_trunk');
  if (!mainTrunk) return shape.trunkTopY;

  const trunkChildIds = new Set(
    document.tree_edges
      .filter((edge) => edge.parent_id === mainTrunk.id)
      .map((edge) => edge.child_id),
  );
  const trunkOutputItems = [
    ...document.nodes.filter((node) => trunkChildIds.has(node.id) && (node.kind === 'branch' || node.kind === 'leaf')),
    ...suggestions.filter((node) => node.parentId === mainTrunk.id && (node.kind === 'branch' || node.kind === 'leaf')),
  ];

  if (trunkOutputItems.length === 0) return shape.trunkTopY;

  const highestConnectionY = Math.min(...trunkOutputItems.map((node) => node.y + 42));
  return highestConnectionY - 34;
}

function createTrunkSpinePath(shape: TreeShape, top: number): string {
  const x = shape.centerX;
  const y = shape.groundY;

  return `M ${x} ${top + 6} C ${x - 1} ${top + 80}, ${x + 2} ${y - 98}, ${x} ${y + 30}`;
}

function createTrunkRootFusePath(shape: TreeShape, side: GrowthSide): string {
  const sideFactor = side === 'left' ? -1 : 1;
  const x = shape.centerX;
  const y = shape.groundY;

  return `M ${x} ${y + 20} C ${x + sideFactor * 18} ${y + 27}, ${x + sideFactor * 42} ${y + 30}, ${x + sideFactor * 76} ${y + 34}`;
}

function createTrunkSpineFootPath(shape: TreeShape): string {
  const x = shape.centerX;
  const y = shape.groundY;

  return `M ${x} ${y + 9} C ${x - 6} ${y + 18}, ${x - 8} ${y + 25}, ${x} ${y + 34} C ${x + 8} ${y + 25}, ${x + 6} ${y + 18}, ${x} ${y + 9}`;
}

function createRootCrownPath(shape: TreeShape): string {
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
  const childEdgeX = child.x - sideFactor * (nodeLabelWidth / 2);

  if (parent.kind === 'main_trunk') {
    const parentEdgeX = shape.centerX;
    const parentEdgeY = child.y + 42;

    return `M ${parentEdgeX} ${parentEdgeY} L ${childEdgeX} ${child.y}`;
  }

  const parentEdgeX = parent.x + sideFactor * (nodeLabelWidth / 2);
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

  const parentEdgeX = parent.x + sideFactor * (nodeLabelWidth / 2);
  const parentEdgeY = parent.y;
  const childEdgeX = child.x - sideFactor * (nodeLabelWidth / 2);
  const middleX = (parentEdgeX + childEdgeX) / 2;

  return `M ${parentEdgeX} ${parentEdgeY} L ${middleX} ${parentEdgeY} L ${middleX} ${child.y} L ${childEdgeX} ${child.y}`;
}

function createCurve(parent: Pick<TreeNode, 'x' | 'y'>, child: Pick<TreeNode, 'x' | 'y'>): string {
  const middleX = (parent.x + child.x) / 2;
  return `M ${parent.x} ${parent.y} C ${middleX} ${parent.y}, ${middleX} ${child.y}, ${child.x} ${child.y}`;
}

export default App;
