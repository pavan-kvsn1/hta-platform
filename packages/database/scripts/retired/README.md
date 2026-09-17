# Retired

Kept as the record of how the data got here. Nothing here has a job left.

| script | why it is retired |
|---|---|
| `check-capabilities-against-registry.mjs` | compared the database against the register file the app shipped, and had to agree before the app could be switched over. The app no longer ships a copy, so there are no longer two things to compare - only the record, and a test fixture that is allowed to drift from it. |

It still runs, and still reports 369 profiles and 1,564 bands with no differences. That
is now a statement about the fixture, not a gate on anything.
