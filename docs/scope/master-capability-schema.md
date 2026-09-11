# Master instrument capabilities — the schema

Additive. Nothing in `MasterInstrument` is altered or dropped by this change.

Sized against the registry: **369 profiles, 231 subtypes, 1564 range buckets** across
212 instruments.

---

## Where these hang

On `instrumentId` — the stable identity — not on `MasterInstrument.id`, which is one
*version* of an instrument.

`MasterInstrumentTraining` already does this (`instrumentId` plus a nullable
`masterInstrumentId`), so it is the established pattern here, not a new idea.

The reason is not theoretical. `MasterInstrumentCertificate` attaches to the version row,
and today:

```
certificates                                     210
attached to a superseded version                  25
same file duplicated across versions              8 instruments
695 HTAIPL/L   the same PDF attached 7 times, once per version
149 HTAIPL/L   the same PDF attached 3 times
```

Capabilities are far heavier than a certificate row — `708 HTAIPL/L` has 10 profiles,
4 of them with subtypes. Copying that forward on every description edit would repeat the
same failure at ten times the size.

---

## The three tables

```prisma
enum CapabilityKind {
  RANGE      // 365 profiles — a measuring or sourcing span
  ARTIFACT   //   4 profiles — a fixed value, e.g. a 2 kg mass
}

enum CapabilityRole {
  MEASURING  // 301
  SOURCE     //  68
}

enum AccuracyKind {
  SYMMETRIC  // 1411 buckets — ±0.6 °C
  FORMULA    //  120 buckets — ±(0.02% of reading + 2 counts)
  CLASS      //    2 buckets — Class 1
}

model MasterCapabilityProfile {
  id           String          @id @default(uuid())
  tenantId     String
  instrumentId String          // stable identity, NOT MasterInstrument.id

  profileKey   String          // "P1" — the registry's own id, kept for traceability
  parameter    String          // "Thermocouple", "Pressure", "Mass"
  role         CapabilityRole
  unit         String          // "°C", "bar", "kg"
  kind         CapabilityKind  @default(RANGE)

  // Overall span. Null for ARTIFACT, which carries its value on its single bucket.
  minValue       Decimal?      @db.Decimal(20, 9)
  maxValue       Decimal?      @db.Decimal(20, 9)
  minInclusive   Boolean       @default(true)
  maxInclusive   Boolean       @default(true)

  // Set when the parameter splits: "thermocouple_type", "rtd_type". Null means the
  // buckets hang directly off this profile.
  subtypeKind    String?

  // Decision 2 of master-instrument-model-decisions.md: a procedure belongs to a
  // parameter, not to a box.
  sopReferences  String[]      @default([])

  // How the seed knows what an admin has touched and must not overwrite.
  source         String        @default("registry")  // "registry" | "manual"
  sortOrder      Int           @default(0)

  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  createdById    String?

  tenant         Tenant                     @relation(fields: [tenantId], references: [id])
  subtypes       MasterCapabilitySubtype[]
  buckets        MasterCapabilityBucket[]
  certificates   MasterInstrumentCertificate[]

  @@unique([tenantId, instrumentId, profileKey])
  @@index([tenantId, instrumentId])
  @@index([parameter])
}

model MasterCapabilitySubtype {
  id           String   @id @default(uuid())
  profileId    String

  subtypeKey   String   // "Type J", "Pt-100"

  // Its own span: Type J stops at 1200 °C where Type K goes further.
  minValue     Decimal? @db.Decimal(20, 9)
  maxValue     Decimal? @db.Decimal(20, 9)
  minInclusive Boolean  @default(true)
  maxInclusive Boolean  @default(true)

  sortOrder    Int      @default(0)

  profile      MasterCapabilityProfile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  buckets      MasterCapabilityBucket[]

  @@unique([profileId, subtypeKey])
  @@index([profileId])
}

model MasterCapabilityBucket {
  id           String   @id @default(uuid())
  profileId    String
  subtypeId    String?  // null when the profile has no subtypes

  bucketKey    String   // "B1"

  minValue     Decimal? @db.Decimal(20, 9)
  maxValue     Decimal? @db.Decimal(20, 9)
  minInclusive Boolean  @default(true)
  maxInclusive Boolean  @default(true)

  // Declared on 1443 buckets, absent on 121. Null means "not declared", which is not
  // the same as zero and must stay distinguishable.
  leastCountValue Decimal? @db.Decimal(20, 9)
  leastCountUnit  String?

  // Null on 31 buckets. The three shapes are the three the data actually holds.
  accuracyKind     AccuracyKind?
  accuracyValue    Decimal?      @db.Decimal(20, 9)  // SYMMETRIC
  accuracyUnit     String?                            // SYMMETRIC — "°C", "%FS"
  accuracyPolarity String?                            // SYMMETRIC — "±"
  accuracyFormula  String?                            // FORMULA — kept verbatim
  accuracyClass    String?                            // CLASS — "Class 1"

  sortOrder    Int      @default(0)

  profile      MasterCapabilityProfile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  subtype      MasterCapabilitySubtype? @relation(fields: [subtypeId], references: [id], onDelete: Cascade)

  // Uniqueness is enforced by a NULLS NOT DISTINCT index created in the migration;
  // a plain @@unique does not hold when subtypeId is null. See below.
  @@index([profileId])
  @@index([subtypeId])
}
```

`profileId` is carried on every bucket even when `subtypeId` is set, so "all buckets of
this profile" stays one query instead of a join through subtypes.

### The bucket unique constraint needs raw SQL

`@@unique([profileId, subtypeId, bucketKey])` does **not** hold when `subtypeId` is null,
which is every bucket on a profile without subtypes. Postgres treats nulls as distinct,
so B1 could be inserted twice. Verified on this server, Postgres 16.13:

```
CREATE TEMP TABLE nulltest (a text, b text, c text, UNIQUE (a, b, c));
INSERT INTO nulltest VALUES ('P1', NULL, 'B1');
INSERT INTO nulltest VALUES ('P1', NULL, 'B1');   -- accepted
```

The fix is `NULLS NOT DISTINCT`, which Prisma does not emit, so it goes in the migration
SQL by hand. Also verified here — the duplicate is rejected, and `('P1','Type J','B1')`
is still allowed, which is what we want:

```sql
CREATE UNIQUE INDEX "MasterCapabilityBucket_profile_subtype_key"
  ON "MasterCapabilityBucket" ("profileId", "subtypeId", "bucketKey")
  NULLS NOT DISTINCT;
```

The Prisma model keeps `@@index` on the same columns for query planning and leaves the
uniqueness to this index.

---

## Components — the indicator and its sensor

The wireframe puts `☐ Composite: Ind: [___] Sen: [___]` under Make/Model and again under
Serial Number. The registry backs it with `make_parts`, `model_parts` and `serial_parts`:

```
units                     212
asset_type composite       33
asset_type simple         179
distinct part names        ind (58), sen (58)  — only ever these two
composite units with no parts    0
simple units with parts          0
```

A serial is the strongest case. `152 HTAIPL/L` stores
`"Ind: 07011059 & Sen: 20194659"` in one string today; the indicator and the sensor each
have their own serial, and each is a thing that gets calibrated.

### Why a table and not six columns

Flat `indMake / indModel / indSerial / senMake / senModel / senSerial` would hold the 33
units in the registry today, and break on the next one.

`188 HTAIPL/L` is the counterexample already in the data. Its certificates read:

```
188A   Druck DPI 610 indicator alone                    -1 to 20 bar
188B   Ind:61056430 & Transducer:2899734              0 to 700 bar
188C   indicator with the low pressure transducer      0 to 25 mbar
```

That is **one indicator and three sensors**, with a certificate for each pairing — not
three instruments, which is how the database holds it now. Six columns cannot express it.
A table can, and needs no reshaping if 188 and 580 are ever collapsed.

```prisma
enum ComponentRole {
  INDICATOR   // registry "ind"
  SENSOR      // registry "sen"
}

model MasterInstrumentComponent {
  id           String        @id @default(uuid())
  tenantId     String
  instrumentId String        // stable identity, as with capability profiles

  role         ComponentRole
  componentKey String        // "ind", "sen", "sen2" — stable across edits, never reused

  make         String?       // null means "same as the instrument's own make"
  model        String?
  serialNumber String?

  sortOrder    Int           @default(0)

  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  tenant       Tenant        @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, instrumentId, componentKey])
  @@index([tenantId, instrumentId])
}
```

`make` and `model` are nullable because the registry usually only splits one of the
three: 33 units split the serial, 24 split the model, and just 1 splits the make. Null
means the component shares the instrument's own value rather than having none.

**`assetType` is not stored.** The wireframe's Metadata tab shows
`Asset Type: [Simple ▼]`, but it is exactly "does this instrument have components".
Storing it alongside the components invites the two to disagree. Derive it and render the
control read-only.

**Components do not link to capability profiles yet.** For `188` that link is the whole
point — profile P1 at 0–700 bar belongs to the high pressure transducer. But 188 is three
separate rows today, so there is nothing to link. The column goes on when those five
multi-unit assets are settled, and is additive when it does.

---

## One line added to an existing table

```prisma
model MasterInstrumentCertificate {
  // ...unchanged...

  // Which capability this certificate covers. Null until assigned, so every existing
  // row stays valid. The Certificates tab needs this: the wireframe shows two active
  // certificates side by side, each carrying its own least count and accuracy.
  capabilityProfileId String?
  capabilityProfile   MasterCapabilityProfile? @relation(fields: [capabilityProfileId], references: [id])

  @@index([capabilityProfileId])
}
```

---

## The audit table the Audit Log tab needs

Version diffing cannot produce
`Profile: Pressure (P1) → Bucket B2 → Least Count, before 0.05 bar, after 0.01 bar`.
An event log can.

```prisma
model MasterCapabilityAudit {
  id           String   @id @default(uuid())
  tenantId     String
  instrumentId String

  action       String   // PROFILE_ADDED, BUCKET_UPDATED, PROFILE_DELETED, ...
  profileKey   String?  // "P1"
  subtypeKey   String?  // "Type J"
  bucketKey    String?  // "B2"
  field        String?  // "leastCountValue"
  beforeValue  String?
  afterValue   String?

  actorId      String?
  createdAt    DateTime @default(now())

  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  actor        User?    @relation(fields: [actorId], references: [id])

  @@index([tenantId, instrumentId, createdAt])
}
```

---

## What is NOT in this change

`rangeData`, `parameterCapabilities`, `parameterRoles`, `parameterGroup` and
`sopReferences` stay on `MasterInstrument`, untouched and still written. Around 130
references across ten live files read them, including the certificate flow's master
store. They are migrated one file at a time afterwards, and dropped only when nothing
reads them.

---

## Migration

Additive throughout — `prisma db execute` followed by `prisma migrate resolve --applied`,
never `migrate dev`.

```
1  create the enums, the three capability tables   no existing row touched
   and MasterInstrumentComponent
   plus the NULLS NOT DISTINCT bucket index        raw SQL, Prisma cannot emit it
2  add MasterInstrumentCertificate.capabilityProfileId   nullable, no backfill
3  create MasterCapabilityAudit                     empty
4  seed capabilities and components from the        inserts only
   registry, by legacyId
```

Every step adds. Nothing is altered or deleted, so each is independently reversible by
dropping what it created.

**Step 4 is only possible now.** Before the 11 Sep cleanup, 8 instruments had no
`legacyId` and would have seeded empty. Registry and database now match 212-for-212.

---

## Phasing out the old columns

Four of the five go. One stays.

| column | refs | files | verdict |
|---|---|---|---|
| `rangeData` | 76 | 15 | retire — replaced by profiles, subtypes and buckets |
| `sopReferences` | 52 | 14 | retire — moves onto the profile |
| `parameterRoles` | — | — | retire — two values, exactly `CapabilityRole` |
| `parameterCapabilities` | 151 combined | 19 | retire, but needs a lookup table |
| `parameterGroup` | — | — | **keep** |

279 references across 26 files in all, about half of them the tenant template and tests.

### `parameterGroup` is not legacy

It holds 28 curated labels — *Temperature & Humidity*, *Electrical (multi-function)*,
*Pressure & Temperature*. The registry has **no** `parameter_group` field; this exists
only in the database, all 212 rows have one, and nothing else can produce it.

Deriving it from profiles would also lose deliberate distinctions: *Temperature* and
*Temperature (readout)* are both in use.

### `parameterCapabilities` needs a translation table

40 slugs in the database against 47 parameter names in the registry. They do not line up:

```
registry "Relative Humidity"  ->  slug "humidity"
registry "Gauge Pressure"     ->  slug "pressure"
registry "Speed (Contact)"    ->  slug "contact_speed"
```

Derivable, but only through a 47-entry map someone writes and checks. Bounded, not free.

### The order, so no change touches 26 files

The trick is a compatibility layer in the API: keep *returning* the old fields, but
compute them from the new tables instead of reading the columns.

```
1  seed the new tables                     both stores present, agreeing
2  API computes the old fields             all 26 files keep working, untouched
3  stop writing the columns                one change, in the admin routes
4  move the UI page by page                nothing forces the pace
5  drop the four columns                   parameterGroup stays
```

**Step 2 is the one that matters.** It is where the old store stops being the source of
truth, and it is a single file. Everything after it is optional and can take weeks.

### A consumer nobody would think to check

`apps/web-hta/src/app/admin/users/[id]/edit/page.tsx` holds 11 references to the
parameter columns. It is engineer authorisation — which parameters an engineer is signed
off for — and it builds that list from instrument capabilities. It quietly governs who
can sign a certificate.

---

## Open, and worth settling before step 1

- **Should certificates move onto `instrumentId` too**, in the same change? It would
  recover the 25 certificates stranded on superseded versions and stop `695` gaining a
  ninth copy. It is a bigger change than the rest of this and could ship separately.
- **`profileKey` uniqueness.** It is unique per instrument in the registry. If an admin
  deletes P2 and adds a new profile, does it become P2 again or P11? Reusing keys makes
  the audit log ambiguous. Suggest never reusing.
- **The five multi-unit assets** (149, 188, 580, 741, 784). Each unit is its own row
  today and so gets its own profiles, which works. Whether they should instead be one
  instrument with more profiles is the question recorded in the model decisions doc.
