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
- The main trunk and main root are visible tree shapes, not ordinary circular nodes.
- There must be exactly one main trunk and exactly one main root in a tree; never draw extra decorative roots, rootlets, tendrils, or fake root branches unless they are real user-created nodes.
- The trunk should grow taller/thicker as output branches and leaves increase.
- The main root should grow deeper/larger as input root branches increase.
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
