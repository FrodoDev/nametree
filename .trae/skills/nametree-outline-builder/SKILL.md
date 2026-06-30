---
name: "nametree-outline-builder"
description: "Builds Nametree tree outlines with Branches/Roots sections. Invoke when user wants to turn a topic, person, project, or knowledge area into a Nametree outline."
---

# Nametree Outline Builder

Use this skill to help the user create a complete Nametree-ready outline from a topic, biography, fandom subject, learning area, project, book, course, or collection of notes.

The output should be directly pasteable into Nametree's main-trunk outline editor.

## Core Model

Nametree has two semantic directions:

- `树枝`: organized output, concepts, structure, works, arguments, categories, projects, results.
- `树根`: inputs, sources, influences, background, prerequisites, observations, questions, raw material.

When generating an outline for the main trunk, always use this top-level shape:

```text
树枝
  <organized output branch>
    <child concept>
    <child concept>

树根
  <input/source root>
    <child material>
    <child material>
```

`树枝` and `树根` are semantic section labels, not knowledge nodes themselves.

## When To Invoke

Invoke this skill when the user asks to:

- Build or complete a Nametree for a topic.
- Turn research notes into a tree.
- Make an outline for a person, artist, author, company, product, book, course, or project.
- Organize knowledge into tree branches and roots.
- Create pasteable Nametree outline text.
- Continue expanding an existing Nametree outline.

## Working Style

1. Identify the user's subject and desired scope.
2. If the subject is underspecified, ask at most 2 clarifying questions.
3. Separate output structure from input material:
   - Put what the user wants to understand, explain, compare, produce, or navigate under `树枝`.
   - Put sources, influences, chronology, raw facts, references, prerequisites, questions, and evidence under `树根`.
4. Keep labels compact enough to fit Nametree nodes.
5. Prefer 2-4 levels of depth. Avoid deeply nested outlines unless the user asks for exhaustive detail.
6. Use two spaces per indentation level.
7. Do not add Markdown bullets when producing the pasteable outline.
8. Preserve Chinese names/titles as-is when the user's topic is Chinese.

## Branch Guidance

Use `树枝` for organized meaning and output-facing structure.

Good branch categories include:

- Main themes
- Concepts and frameworks
- Works or deliverables
- Albums, books, chapters, projects, milestones
- Arguments and conclusions
- Comparisons and classifications
- Things the user may later write, explain, or present

For an artist such as Jay Chou, `树枝` may include:

```text
树枝
  音乐作品
    1-JAY
    2-范特西
    3-八度空间
  风格主题
    中国风
    R&B
    叙事情歌
  影响与地位
    华语流行音乐
    创作歌手范式
```

## Root Guidance

Use `树根` for input-facing material and background.

Good root categories include:

- Biography and chronology
- Influences and teachers
- Source books, courses, papers, interviews
- Cultural background
- Questions and uncertainties
- Observations and examples
- Raw facts that support later structure

For an artist such as Jay Chou, `树根` may include:

```text
树根
  成长经历
    音乐启蒙
    古典训练
  重要关系
    吴宗宪
    方文山
  素材来源
    中国传统文化
    电影与游戏
```

## Output Modes

When the user wants a directly usable result, output only the pasteable outline:

```text
树枝
  ...

树根
  ...
```

When the user is still discussing structure, briefly explain the branch/root split first, then provide the outline.

When expanding an existing outline, preserve existing node labels unless the user asks for rewriting.

## Quality Checklist

Before finalizing an outline, check:

- Does every top-level item belong under either `树枝` or `树根`?
- Are `树枝` nodes mostly organized output/meaning?
- Are `树根` nodes mostly input/background/material?
- Are labels short enough for compact visual nodes?
- Is indentation exactly two spaces per level?
- Is the output directly pasteable into Nametree?
