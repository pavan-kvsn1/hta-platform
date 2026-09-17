# Maintenance

Repairs run against real data when something is found wrong. None of these run on a
schedule. Most take `--check` and write nothing without it - read what each one says.

| script | status | what it does |
|---|---|---|
| `backfill-master-spec.mjs` | ad-hoc | fills in the master's own figures on certificates written before the app recorded them, and heals a lost parameter link. Reads the capabilities from the database. |
| `clear-dangling-master-refs.mjs` | ad-hoc | lets a parameter go of a master its certificate no longer carries |
| `clean-sop-references.mjs` | ad-hoc | takes "AS A SOURCE" out of master instruments' SOP references |
| `delete-certificate.ts` | ad-hoc | removes a certificate and everything it owns, including its files |
| `backfill-field-change-revision.cjs` | spent | put a revision number on field-change requests written before they carried one |
| `add-customer-account-id.js` | spent | gave existing customers an account id |

`backfill-master-spec.mjs` used to read the register file the app shipped. It reads the
database now: a repair working from a build-old copy would write stale figures onto
certificates, which is the opposite of repairing them.
