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

**The gap that was here is closed.** 8 of 209 instruments had no `legacyId` and so
could not be matched to the registry. The cause was not missing data: the edit path
created each new version without carrying `legacyId` over, so every instrument an admin
had ever edited lost its link. All 8 were version 2 or later and every one had a
version 1 that still held the id.

Fixed on 11 Sep 2026 in two parts — `legacyId` is now carried forward by both versioning
paths in `apps/api/src/routes/admin/index.ts`, and the 8 rows were backfilled from their
own version 1. The registry and the database now agree one-for-one:

```
registry units 212   current db rows 212
db rows with no registry unit   0
registry units with no db row   0
```

The same bulk-import path was also dropping `rangeData`, `sopReferences`,
`parameterCapabilities`, `parameterRoles`, `parameterGroup`, `calibrationDueDate`,
`reportNo`, `usage`, `calibratedAtLocation`, `remarks` and `status` — re-importing a
spreadsheet row wiped everything the registry had seeded. It now carries over whatever
the spreadsheet does not mention.

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

## One asset, several units

Five asset numbers are held by more than one instrument, because the asset is one
purchase and the units are its parts:

| asset | units |
|---|---|
| `149 HTAIPL/L` | Multi Function Calibrator, Current Coil |
| `188 HTAIPL/L` | Digital Pressure Calibrator, High Pressure External Transducer, Low Pressure External Transducer |
| `580 HTAIPL/L` | recorder with RTD sensor, recorder for 'N' type, recorder for 'T' type |
| `741 HTAIPL/L` | TSI Air borne Particle Counter, Aerosol Photometer |
| `784 HTAIPL/L` | Digital Temperature and Humidity meter, Thermal Anemometer |

**Each unit already has its own row and its own certificate**, and the registry names the
file per unit — `188A HTAIPL L.pdf`, `188B…`, `188C…`. So the letter suffixes are not a
puzzle to solve by reading the PDFs; the registry states the mapping, and the two
certificates that were read against it agree.

This is what the wireframe's Certificates tab is describing when it shows two *active*
certificates side by side, each with its own least count and accuracy — a certificate
belongs to a capability, not to a box. Today that works only because each unit happens
to be a separate row. When capabilities land, these five need deciding: one instrument
with several capability profiles, or the units left as they are. The wireframe's
`☐ Composite: Ind: [___] Sen: [___]` field on Serial Number and Model suggests the
former — `188B`'s certificate reads `Ind:61056430 & Transducer:2899734`.

Nothing is blocked by leaving them as they are.

---

## Still open

- **Which of `695 HTAIPL/L`'s two certificates is current.** Both are flagged latest:
  `CAL_2785e18-266186` valid to 12 Feb, `HTA/C24456/01/26` valid to 13 Jul. Only one
  can be.
- **`149 HTAIPL/L` holds three copies of the same report** (`CR/PCAL/26SRF00416`) and
  two of another. Duplicates, not versions. Note `149` is a two-unit asset, so some of
  that may be one certificate legitimately sitting on each unit.
- **Whether "current" is decided by upload order or by validity date.** It is upload
  order today, so uploading an older certificate by mistake would make it current.
- **Three certificate files have no instrument** — `241`, `288` and `885`. Neither the
  database nor the registry knows them, so they are retired assets whose paperwork was
  left in the folder. Nothing to attach them to.
- **22 instruments have no certificate file at all.** The five weights are among them:
  the registry names `904 HTAIPL L.pdf` for 904, 905 and 906 and `907 HTAIPL L.pdf` for
  907 and 908, and those files exist, but nothing is attached in the database yet.
- **Three asset numbers look wrong but are faithful** — `333 HTAIPL/L/285` (extra
  suffix), `715 HTAIPL` (no `/L`) and `849 HATIPL/L` (`HATIPL` for `HTAIPL`). The
  registry carries the same strings, so these are source-level, not database defects.
  Fixing them means fixing the source spreadsheets.
- `apps/web-tenant-template` carries its own copy of all of this. It needs the same
  treatment before a new tenant is created from it, but it blocks nothing.
