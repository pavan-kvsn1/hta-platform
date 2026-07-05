# Graphify Workflow

Graphify is a required discovery step before code changes in this repo. Its job is to reduce blind edits by forcing a scoped understanding of the relevant behavior before implementation.

## Before Editing

1. Run a targeted query:

   ```powershell
   python -m graphify query "<module or behavior question>" --graph graphify-out\graph.json --budget 3000
   ```

2. Verify the result with source reads and focused `rg` searches.

3. State the scope before changing files:

   - What behavior is changing
   - Where it lives
   - When it runs
   - Why the change is needed
   - What existing behavior must not be disturbed

4. If the query output is noisy, use a narrower query, `graphify explain`, or `graphify path` before editing.

## After Editing

Run:

```powershell
python -m graphify update .
```

Then run the narrowest useful tests or typechecks for the changed module.

## Graph Hygiene

Generated reports, build outputs, package locks, local storage, and Graphify output itself are excluded through `.graphifyignore`. Keep that file committed so every local and future agent session indexes the same kind of source material.

If stale generated-report nodes still appear after ignore rules change, treat them as old semantic extraction residue. `python -m graphify update .` refreshes AST/code extraction, but a full Graphify re-extraction or purge/regenerate is needed to remove previously indexed Markdown/report artifacts.
