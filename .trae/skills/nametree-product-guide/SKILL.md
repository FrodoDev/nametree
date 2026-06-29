---
name: "nametree-product-guide"
description: "Guides Nametree product, architecture, and implementation decisions. Invoke when discussing Nametree concepts, macOS app design, data model, or roadmap."
---

# Nametree Product Guide

## Product identity

Nametree is a macOS-first, local-first thinking and knowledge-structuring app.

Slogan: **Name it to own it.**

The core idea is to help users express, store, and evolve thoughts as a living tree rather than a left-to-right mind map.

Brand direction:

- Use `images/tree1.jpg` as the temporary product logo/reference asset until a final brand asset is provided.
- The logo may be shown in a small, lightweight brand block with only logo, **NameTree**, and the slogan.
- Avoid a heavy left sidebar for branding or explanatory text; keep canvas space primary.
- Brand typography should keep **NameTree** visually dominant over the slogan.
- Use colors sampled from the logo direction: trunk/dark brown for the app name, leaf green for the slogan.
- The slogan should be visually smaller than the app name.

## Concept model

Nametree represents knowledge as a tree with two meaningful directions:

- **Roots**: input, sources, prerequisites, references, observations, questions, raw material.
- **Trunk / branches**: organized understanding, concepts, arguments, outputs, explanations, projects, writing, or decisions.

For learning a subject:

- The trunk can represent the main knowledge system.
- Branches can represent secondary topics and derived understanding.
- Roots can represent books, papers, courses, examples, exercises, doubts, and external inputs.
- Growth means transforming input from roots into output on the tree.

Visualization rules:

- The initial start point is only a guide for beginning tree growth; it is not a functional knowledge node.
- The main trunk is a visible tree shape. Roots are represented by real root nodes growing from the trunk base, not by a single required visible main-root structure.
- There must be exactly one main trunk. There may be multiple trunk-level root nodes; do not force a single main root unless the user explicitly changes direction.
- The trunk should grow taller/thicker as output branches and leaves increase.
- The root system should grow deeper/wider as input root branches increase.
- Branches created from the trunk must visually grow out of the trunk shape.
- Branches created from the trunk must never share one identical visual departure point; each trunk child should attach to a distinct height along the trunk.
- Branch-side layout should compromise toward XMind-style horizontal expansion: parent-child branches extend horizontally, siblings align vertically, and adding new branches pushes the output layout upward rather than below the ground line.
- Output-side edges, including trunk-to-branch edges, should use horizontal XMind-style elbow lines instead of diagonal or curved branch lines when the user has chosen the simplified XMind layout direction.
- Branch/root growth suggestions must appear on both left and right sides when applicable; the side chosen by the user must be persisted and respected by layout.
- Root-side growth follows the same side-selection logic as trunk/branch growth.
- Avoid overlapping existing nodes and pending suggestion nodes; never place a suggestion where it blocks another suggestion.
- Branches created from another branch must visually appear as forks of that branch, not as trunk-origin branches.
- Knowledge nodes should stay visually lightweight, closer to compact XMind-style labels than heavy circular cards.
- Prefer white or near-white node fills, thin borders, simple typography, and minimal shadows.
- Tree lines should be thin and calm, closer to XMind connector lines than thick decorative branches.
- The main tree silhouette should reference the core structure of `images/tree1.jpg`: a central trunk, an upward output crown, and a downward input root system.
- Do not use `images/tree1.jpg` as a canvas background; it is a logo/reference asset, not the interactive drawing layer.
- Temporary product logo can use the tree-with-roots reference style until a final brand asset is provided.
- The canvas should support zooming so larger trees can remain navigable.
- Keep the primary UI focused on the canvas. Avoid explanatory sidebars unless they provide direct editing or actionable information.
- A lightweight brand block is acceptable, but it should not compete with the canvas.
- Zoom must support large trees. Do not keep the minimum zoom too high; users should be able to zoom out enough to see a growing output tree.

Interaction rules:

- Knowledge node titles should be editable directly on the node, preferably by double-clicking, similar to XMind.
- Single-click selects a node; double-click edits the node title in place.
- The selected node detail panel may edit longer content/notes, but title editing should not require a separate side-panel mode.
- Root-side nodes and branch-side nodes should share the same interaction model whenever possible.
- The app should support deleting the selected node and undoing recent document edits so users can recover from mistaken template/layout experiments without recreating the whole document.
- The app should support copying and pasting selected knowledge node content. Text inputs/textareas must keep native system copy/paste behavior; canvas-level `Cmd+C`/`Cmd+V` should only apply when focus is outside text editing controls, and paste should directly fill/append visible content rather than creating an unexplained placeholder node.

## Data structure decision

Use **Option B: tree-first, references allowed**.

This means:

- The primary structure is still a tree, so each node has one main parent within a tree.
- Nodes may also have reference links to other nodes.
- Parent-child relationships express structure and growth.
- Reference links express cross-topic relationships without turning the whole product into a freeform graph.

Recommended minimal model:

- **Tree**: a named knowledge tree or workspace.
- **Node**: a knowledge unit, input source, question, concept, output, or note.
- **Node kind**: root/input, trunk, branch/output.
- **Tree edge**: the primary parent-child relationship.
- **Reference link**: a non-tree relationship between nodes.
- **Node style**: each node can have its own color and visual treatment.
- **Node note**: each node can store an independent remark, description, or longer note.
- **Link direction**: reference links can be one-way or two-way.
- **Metadata**: title, note/body, tags, timestamps, position, status.

## Current UI and interaction decisions

Use these decisions as baseline constraints unless the user explicitly changes direction:

### macOS window and title

- The document filename should be shown in the macOS window title area, similar to XMind.
- Avoid drawing a heavy in-page document title inside the canvas.
- Do not modify canvas layout, app-shell padding, or canvas height just to position the title.
- Prefer the simplest stable Tauri title approach before custom titlebar/overlay work.
- Avoid `hiddenTitle` / `titleBarStyle: Overlay` unless explicitly requested and carefully validated; these can make title placement and content layout fragile.

### Local-first file behavior

- Nametree documents use the `.nt` extension.
- `.nt` files are structured JSON, preferably wrapped with format/version metadata for migration.
- Do not use `localStorage` as the primary save mechanism for real documents.
- Support real file save/open through Tauri commands.
- `Cmd+S` should save; the first save should ask for filename/location.
- `Cmd+O` should open a `.nt` file picker.
- `Cmd+N` should create a fresh unsaved document.
- The UI should stay lightweight: avoid persistent save-status text like “已自动保存” unless explicitly requested.

### Canvas layout and scrolling

- The initial full-window layout should not create page-level vertical scrolling.
- Avoid `min-height: 100vh` plus top padding combinations that make the page taller than the window.
- The canvas and right detail panel should visually align at the top and feel like one balanced workspace.
- Two-finger trackpad vertical scrolling should pan/scroll the canvas view, not aggressively zoom.
- Zoom should require modifier intent such as `Cmd` or `Ctrl` with wheel/scroll.
- Keep zoom sensitivity calm.

### Right detail panel

- The right detail panel may be resizable.
- Default width should be relatively compact, around 70% of the former wider panel.
- Enforce a minimum width large enough to preserve the bottom brand block without wrapping.
- The panel should edit selected knowledge node details, including title/note/style, but should not become a heavy explanatory sidebar.

### Branding placement

- Keep the canvas primary; brand should feel integrated, not like a floating call-to-action button.
- The right detail panel bottom can contain a subtle integrated brand block with logo, **NameTree**, and the slogan.
- The right detail panel brand block should sit at the panel bottom and can be visually fused with the panel, not styled as a card/button.
- The canvas may also contain a subtle logo-only mark in the top-left.
- Canvas logo-only mark should have a container whose corner radius and background match the canvas surface.
- If the canvas has `border-radius: 28px`, the canvas logo container should use the same radius and the same background recipe.
- Do not remove or alter the right detail panel brand when adding the canvas logo-only mark, unless explicitly requested.

### Node styling

- Knowledge nodes should support separate border and fill colors.
- Existing `color` can represent border/stroke color.
- Add `fillColor` for node fill/background color, defaulting to white for older `.nt` files.
- Color pickers should be comfortably clickable; tiny 18px color inputs are too small.
- Use larger color controls, around `44px × 32px`, with visible rounded swatches.

### Tree growth interaction gotchas

- Candidate/suggestion nodes must stop pointer events from bubbling into canvas pan logic.
- Structure shapes such as main trunk/main root should not have overly large transparent hitboxes that cover candidate nodes.
- Main trunk is structural; trunk-level `root_branch` nodes are real main roots and may be multiple.
- Creating main trunk should not add ordinary parent-child `tree_edges`; creating branch/root-branch/leaf should.
- Root creation from the trunk should create a `root_branch` edge from the trunk base, not a separate visible `main_root` node.
- Child roots created from a main root/root branch should extend horizontally like mirrored tree branches, with vertical stacking downward for layout.
- Root nodes should only show one child-root suggestion; unlike branches, roots do not need separate branch/leaf candidate choices.
- Main roots should not stack in one vertical column per side. Their direction should be dynamic: with one or two main roots per side they may grow more horizontally; as same-side root count increases, use explicit angle slots instead of linear x/y increments so roots do not collapse into one repeated slope. A dense side should use more downward probing angles, not too many roots in the high horizontal band.
- Root layout milestone: the accepted baseline uses angle-slot main-root placement, compact XMind-like root labels, a subtle root-crown transition at the trunk base, and continuous cubic root curves. Preserve this baseline unless the user explicitly asks to revisit the visual model.
- For root collision avoidance, extend a conflicted root along its existing angle/direction instead of pushing it straight down; vertical-only displacement can invert root ordering and create visual crossings in balanced left/right fixtures.
- `make debug` must run the root layout fixture check and refresh `debug-output/*.svg`; use `debug-output/root-left-dense.svg`, `debug-output/root-balanced.svg`, and `debug-output/root-with-children.svg` as the primary visual regression snapshots.
- The root fixture baseline should keep `overlaps: 0`, `crossingRisk: 0`, and no warnings before considering a root-layout iteration acceptable.
- Main roots should visually emerge from a small root-crown area at the trunk base, not from one identical point. Use multiple attach points inside or immediately adjacent to the trunk base, and use a subtle crown transition shape if needed so roots do not appear detached from the trunk.
- Main root curves should be relatively short and tied to the nearby root crown; avoid long radiating lines that make the roots look disconnected from the trunk base. Avoid hockey-stick/golf-club curves made from a long straight segment plus a hook; prefer continuous curved paths that first probe downward from the root crown and then bend toward the label.
- Treat main-root rectangles as readable labels attached to natural root lines, not as the literal geometric end of the organic root itself. A short mounting segment from the root line to the label is acceptable.
- Selecting the main trunk should preserve explicit left-main-root and right-main-root creation choices.
- Root layout changes should be checked against the saved fixtures in `debug-fixtures/` with `npm run root:check`; inspect `debug-output/*.svg` and `debug-output/report.json` before relying on visual intuition only.
- Root layout should include enough horizontal and vertical spacing to avoid node overlap, and should use slight asymmetric offsets so left/right root systems do not look mechanically mirrored.

## Product principles

1. Local-first before cloud-first.
2. The user owns their knowledge data.
3. Structure should support thinking, not force rigid taxonomy.
4. Naming is an act of understanding: users clarify thoughts by naming nodes.
5. Input and output should both be visible, because learning is incomplete without production.
6. Prefer simple, durable file/data formats over opaque storage.

## Recommended technical direction

For the first macOS desktop version, prefer:

- **Tauri** for the app shell.
- **Rust** for native backend commands, file access, persistence, and future sync-safe logic.
- **TypeScript + React** for UI.
- **SVG / Canvas** for tree visualization.
- **SQLite** or structured local files for persistence.

Tauri/app icon notes:

- Use `src-tauri/icons` as the source of application icons configured by `src-tauri/tauri.conf.json`.
- If using `images/tree1.jpg` to generate app icons, first verify the actual file format. It may be WebP content even if the extension is `.jpg`.
- Tauri icon generation requires a square source image; crop/convert to a square PNG before running the icon generator.
- `tauri dev` / `make dev` may show a different or cached Dock icon than the built `.app`; trust the icon in the bundled app produced by `make build`.
- macOS Dock may cache old icons; removing the Dock item or restarting Dock may be needed when validating app icons.

Why:

- Tauri is lighter than Electron and fits a focused macOS desktop tool.
- Rust gives safe native capabilities and good long-term maintainability.
- React + TypeScript makes interactive UI iteration faster.
- A local-first storage boundary makes future sync possible without redesigning the whole app.

## Architecture guidance

Keep the app divided into clear layers:

1. **Domain model**
   - Tree
   - Node
   - Edge / relationship
   - Root-side input nodes
   - Branch/output nodes
   - Metadata: title, note, tags, timestamps, position, status

2. **Persistence layer**
   - Local database or file storage.
   - Expose repository-style APIs such as create node, update node, move node, link root input, export tree.
   - Do not let UI directly depend on storage details.

3. **Application commands**
   - Tauri commands bridge frontend and backend.
   - Keep commands aligned with user actions.

4. **Frontend state**
   - Maintain current tree, selection, editing state, layout state.
   - Avoid putting permanent business rules only in React components.

5. **Visualization**
   - Tree layout should support roots below/around the trunk and branches above/outward.
   - Start with a simple deterministic layout before advanced freeform editing.

## Local-first now, network later

Starting with a single-machine desktop app is a good choice and does not require a major rewrite later if boundaries are kept clean.

Design now for future sync by:

- Giving every entity a stable UUID.
- Keeping created_at and updated_at timestamps.
- Avoiding auto-increment IDs as public identifiers.
- Recording changes through clear repository methods.
- Keeping persistence independent from UI.
- Planning import/export early.

Avoid building sync, accounts, servers, collaboration, or conflict resolution in the first version unless explicitly requested.

## MVP scope

A good first version should focus on:

1. Create/open a local Nametree document or workspace.
2. Add, rename, edit, delete nodes.
3. Mark nodes as root/input or branch/output.
4. Connect input roots to knowledge/output nodes.
5. Render a simple tree view.
6. Store data locally.
7. Export to Markdown or JSON.

Current milestone status:

- `v0.1.0` marks the framework milestone: the initial app shell, visual tree concept, logo/icon direction, basic tree interactions, zoom, and node editing framework are in place.
- Next phases should build on this framework rather than re-litigating the initial brand/sidebar/tree-direction decisions unless the user explicitly asks.
- Treat current visual rules as baseline constraints: lightweight XMind-like nodes/lines, one main trunk, one main root, side-selected growth, no decorative fake roots.

Defer:

- Multi-user collaboration.
- Cloud sync.
- Plugin system.
- Complex graph database.
- AI features.
- Mobile apps.

## When assisting this project

When working on Nametree:

- Preserve `nametree.code-workspace`; never delete or overwrite it unless the user explicitly asks.
- Use the GitHub account/organization identity `FrodoDev` for authors, ownership, package metadata, bundle identifiers, and similar project identity fields.
- Never write local machine usernames, absolute home paths, or local-only account identities into project files, documentation, metadata, examples, or skills intended for version control.
- Prefer small, incremental implementation steps.
- Discuss product and architecture tradeoffs before large code changes.
- Keep the first version desktop-only and local-first unless the user changes direction.
- Avoid over-engineering or adding speculative infrastructure.
