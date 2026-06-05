---
name: "nametree-product-guide"
description: "Guides Nametree product, architecture, and implementation decisions. Invoke when discussing Nametree concepts, macOS app design, data model, or roadmap."
---

# Nametree Product Guide

## Product identity

Nametree is a macOS-first, local-first thinking and knowledge-structuring app.

Slogan: **Name it to own it.**

The core idea is to help users express, store, and evolve thoughts as a living tree rather than a left-to-right mind map.

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
- The trunk should grow taller/thicker as output branches and leaves increase.
- The main root should grow deeper/larger as input root branches increase.
- Branches created from the trunk must visually grow out of the trunk shape.
- Branches created from another branch must visually appear as forks of that branch, not as trunk-origin branches.
- Knowledge nodes should stay visually lightweight, closer to compact XMind-style labels than heavy circular cards.
- Prefer white or near-white node fills, thin borders, simple typography, and minimal shadows.
- Tree lines should be thin and calm, closer to XMind connector lines than thick decorative branches.
- The canvas should support zooming so larger trees can remain navigable.

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
