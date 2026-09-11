# Master instrument model — decisions

Taken 11 Sep 2026, before any code. These settle the questions the integration scope
left open, and they gate the admin instruments revamp (items 3 and 4 of the remaining
work, being done together).

Each is recorded with the evidence it was taken on, so it can be revisited if the
evidence changes.

---

## 1. The database becomes authoritative, not the registry

Capabilities are seeded from `master-instrument-registry.json` once. After that the
database owns them and admins edit in the app; the registry is where the data came
from, not what it is.

**Why.** The wireframe's Capabilities tab has *Add Profile*, *Edit* and *Delete* on
every profile and bucket. Those only mean anything if edits survive.

**What it forces.** The seed script imports what is missing and never overwrites what
an admin has touched. Each profile records where it came from, so the script can tell
the difference. It stays safe to re-run when new instruments appear in the registry.

**Why the seed has to come from the registry at all.** The database cannot produce
capability profiles from what it holds. For the same instrument:

```
database  rangeData: [{ parameter: Pressure, min: 0, max: 700, unit: bar }]
registry  profile P1 Pressure (measuring), bucket 0–700 bar,
          least count 0.01 bar, accuracy ±0.1%FS
```

No least counts, no accuracies, no buckets. The registry is the only source.

**Known gap.** 8 of 209 instruments have no `legacyId` and so cannot be matched to the
registry. They start with no capabilities and need them typed in.

---

## 2. SOP references move to the capability profile

Today `sopReferences` is a flat list on the instrument, in both the database and the
registry. It moves onto the profile, which may hold several.

**Why.** A procedure belongs to a parameter, not to a box. When an engineer picks a
master on a certificate the app currently offers every SOP the instrument has, with
nothing to say which applies.

**It is not a one-to-one rename.** Of 209 instruments, 92 hold more than one SOP, and
only 38 of those have as many SOPs as capabilities:

```
667 HTAIPL/L   1 capability (pressure)               3 SOPs
666 HTAIPL/L   1 capability (differential pressure)  2 SOPs
665 HTAIPL/L   2 capabilities (pressure, vacuum)     2 SOPs
```

One parameter can legitimately have several applicable procedures.

**How the existing data is split: it isn't.** Every SOP an instrument holds is copied
onto every one of its profiles, and admins prune in the Capabilities tab. Nothing is
lost, nothing is asserted that the data does not support, and the certificate flow
behaves exactly as it does today until someone tidies it.

The alternative — leaving profiles blank and assigning by hand — would leave 92
instruments worse than they are now until that work was done.

**If per-parameter SOPs should come from the registry instead**, `standardize_registry.py`
has to learn to place them, which means the source spreadsheets must say which procedure
belongs to which parameter. Nobody has established that they do.

---

## 3. The migration is additive; the flat columns stay

`rangeData`, `parameterCapabilities`, `parameterRoles`, `parameterGroup` and
`sopReferences` are not removed. The new structure goes in alongside.

**Why.** Around 130 references across ten live files read them — not only the admin
pages, but the certificate flow's master store, the instruments API, the customer
instrument page and the seed script. Removing the columns would break all of it at once.

**Order of work.**

1. Add the new tables. Old columns untouched.
2. Seed from the registry by `legacyId`. Old and new both present, agreeing.
3. Move readers across one file at a time, each independently testable.
4. Only when nothing reads them: stop writing the old columns, then drop them, as a
   separate change.

Steps 1 and 2 are additive and can ship alone. Step 4 may be much later, or never.

---

## 4. Items 3 and 4 are done together

The certificates panel is not built first. The wireframe's Certificates tab shows two
*active* certificates side by side, each carrying its own least count and accuracy — so
a certificate belongs to a capability, and capabilities do not exist until item 4.

Building the panel first would mean building it against a model the wireframe does not
use, then rebuilding it.

**Already done and not wasted:** `GET /api/admin/instruments/:id/certificates/:certId`
and `PATCH` of the same for archive and restore. The Certificates tab needs both.

---

## Still open

- **Which of `695 HTAIPL/L`'s two certificates is current.** Both are flagged latest:
  `CAL_2785e18-266186` valid to 12 Feb, `HTA/C24456/01/26` valid to 13 Jul. Only one
  can be.
- **`149 HTAIPL/L` holds three copies of the same report** (`CR/PCAL/26SRF00416`) and
  two of another. Duplicates, not versions.
- **Which 8 instruments have no `legacyId`**, and whether they should be matched by
  asset number instead.
- **Whether "current" is decided by upload order or by validity date.** It is upload
  order today, so uploading an older certificate by mistake would make it current.
- `apps/web-tenant-template` carries its own copy of all of this. It needs the same
  treatment before a new tenant is created from it, but it blocks nothing.
