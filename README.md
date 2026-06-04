# Nametree

**Name it to own it.**

Nametree is a macOS-first, local-first app for structuring thoughts and knowledge as a living tree.

Unlike common left-to-right mind maps, Nametree uses a tree metaphor to connect input and output:

- **Roots** represent input: sources, references, questions, observations, prerequisites, and raw material.
- **Trunk and branches** represent output: concepts, understanding, explanations, arguments, writing, projects, and decisions.

The goal is to help users not only collect knowledge, but also transform input into owned understanding.

## Product idea

When learning a subject, a user can use Nametree to model:

- Main knowledge points as the trunk.
- Secondary topics as branches.
- Books, courses, papers, examples, exercises, and questions as roots.
- Outputs such as summaries, explanations, essays, and projects as branches or leaves.

Learning should include both input and output. Nametree makes both sides visible in one structure.

## Data structure decision

Nametree uses **tree-first, references allowed** as its core structure.

This means:

- The primary structure is a tree.
- A node has one main parent in the tree.
- Nodes can also reference other nodes across the tree.
- Parent-child relationships express structure and growth.
- Reference links express cross-topic relationships without turning the app into a fully freeform graph.

Minimal model:

- **Tree**: a named knowledge tree or workspace.
- **Node**: a knowledge unit, input source, question, concept, output, or note.
- **Node kind**: root/input, trunk, branch/output.
- **Tree edge**: the main parent-child relationship.
- **Reference link**: a non-tree relationship between nodes.
- **Node style**: each node can have its own color and visual treatment.
- **Node note**: each node can store an independent remark, description, or longer note.
- **Link direction**: reference links can be one-way or two-way.
- **Metadata**: title, body, tags, timestamps, position, status.

## Technical direction

The preferred stack is:

```text
React + TypeScript
├─ D3.js / React Flow      tree visualization
├─ TipTap                  rich-text node editing
└─ Zustand / Jotai         frontend state management

Tauri + Rust
├─ SQLite / rusqlite       local data storage
└─ Repository layer        data access abstraction
```

## Why this stack

- **Tauri** keeps the desktop app lighter than Electron and fits a focused macOS app.
- **Rust** is used for the backend, native capabilities, persistence, file access, and future sync-safe logic.
- **React + TypeScript** makes interactive UI development faster and safer.
- **D3.js or React Flow** can support tree visualization. Start simple before adding complex freeform layout.
- **TipTap** is a good fit for rich node content when plain text is not enough.
- **Zustand or Jotai** can manage frontend state without introducing too much framework complexity.
- **SQLite with a Repository layer** gives durable local storage while keeping future sync possible.

## Local-first strategy

The first version is desktop-only and local-first.

This should not require a major architecture rewrite later if the app keeps clear boundaries:

- Use stable UUIDs for entities.
- Keep `created_at` and `updated_at` timestamps.
- Avoid exposing local auto-increment IDs as public identifiers.
- Keep UI independent from storage details.
- Put data access behind repository-style APIs.
- Plan import/export early.

Future networking can be added by extending the persistence layer with sync logic instead of rewriting the UI and domain model.

## MVP scope

The first version should focus on:

1. Create or open a local Nametree workspace.
2. Add, rename, edit, move, and delete nodes.
3. Mark nodes as root/input, trunk, or branch/output.
4. Connect input roots to output or knowledge nodes.
5. Render a simple tree view.
6. Store data locally.
7. Export to Markdown or JSON.

Deferred features:

- Cloud sync.
- Accounts.
- Multi-user collaboration.
- Conflict resolution.
- Plugin system.
- AI features.
- Mobile apps.

## Development note

Preserve `nametree.code-workspace`. Do not delete or overwrite it unless explicitly requested.
