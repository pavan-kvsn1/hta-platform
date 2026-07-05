## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

Before code changes:
- Run a targeted Graphify query for the requested behavior or module, then verify the result with focused source reads/searches.
- State the scoped understanding before editing: what behavior is being changed, where it lives, when it runs, why the change is needed, and what must not be disturbed.
- If Graphify returns noisy or irrelevant nodes, tighten the query or use `graphify explain`/`graphify path`; do not treat a weak Graphify result as sufficient understanding.
- Keep each implementation scoped to the stated understanding. If new affected areas are discovered, pause and restate the scope before editing them.
- Update `graphify-out/` after edits with `python -m graphify update .`.
