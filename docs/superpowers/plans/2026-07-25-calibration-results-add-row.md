# Calibration Results Add-Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-parameter button that appends one calibration-result row whenever the results section is editable.

**Architecture:** Extend the existing `ResultsTable` presentation and call its existing `onPointCountChange` callback with `parameter.results.length + 1`. Continue using the certificate store's established `setPointCount` mutation for row creation and persistence.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Zustand, Lucide React.

## Global Constraints

- Do not change the API, database schema, offline database, or synchronization contracts.
- Keep the existing bulk point-count selector.
- Respect the parent section's existing `disabled` state.

---

### Task 1: Add and verify the one-row action

**Files:**
- Modify: `apps/web-hta/src/components/forms/ResultsSection.tsx`
- Create: `apps/web-hta/tests/unit/results-section-add-row.test.tsx`

**Interfaces:**
- Consumes: `ResultsTableProps.onPointCountChange(count: number): void`
- Produces: A button named `Add measurement row` that requests the current result count plus one.

- [ ] **Step 1: Write the failing component test**

Render `ResultsSection` with one parameter containing two results. Mock the
certificate store and image hook, click `Add measurement row`, and assert that
`setPointCount(0, 3)` is called. Render again with `disabled` and assert that
the action is disabled.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
pnpm --dir apps\web-hta test -- --run tests/unit/results-section-add-row.test.tsx
```

Expected: the button cannot be found.

- [ ] **Step 3: Add the minimal table action**

Import Lucide's `Plus` icon and render a full-width button after `</table>`.
Its click handler calls:

```tsx
onPointCountChange(parameter.results.length + 1)
```

Set `disabled={disabled}` and apply the existing restrained slate styling.

- [ ] **Step 4: Run focused and existing store tests**

```powershell
pnpm --dir apps\web-hta test -- --run tests/unit/results-section-add-row.test.tsx tests/unit/zustand-stores.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 5: Run type checking**

```powershell
pnpm --dir apps\web-hta typecheck
```

Expected: exits successfully.

- [ ] **Step 6: Refresh the repository graph**

```powershell
python -m graphify update .
```

Expected: Graphify completes successfully.
