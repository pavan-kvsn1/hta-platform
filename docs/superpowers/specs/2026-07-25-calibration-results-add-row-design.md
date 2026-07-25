# Calibration Results Add-Row Control

## Goal

Allow an engineer to append one calibration-result row at a time without
returning to the point-count selector at the top of a long results table.

## Placement

Each parameter's results table gets a full-width `Add measurement row` button
immediately below its final result row and above its status footer.

## Availability

The action is enabled whenever the Calibration Results section is editable:

- while creating or editing a draft;
- while correcting the section after section-specific feedback unlocks it.

It is disabled when the parent page marks the Calibration Results section as
read-only. The parent page remains the source of truth for section access.

## Behaviour

Clicking the action increases that parameter's result count by exactly one.
The existing certificate store creates the blank row, assigns the next point
number, marks the form dirty, and preserves the established save, offline,
sync, validation, calculation, and image-association flows.

The existing point-count selector remains available for bulk count changes.
No API, database, or schema changes are required.

## Verification

- The button appears below every parameter results table.
- One click requests the current row count plus one.
- The button is disabled when the section is disabled.
- Existing point-count store tests continue to pass.
