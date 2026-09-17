# Building the register — archive

How the lab's master instrument spreadsheet became
`apps/web-hta/src/data/master-instrument-registry.json`.

**All archive.** The app no longer reads that file. Instruments, their capabilities and
their accuracies are edited on the admin pages and read from the database; the file is
kept only because the test suite uses it as a fixture.

Run in this order, against `reference_docs/` outside the repo:

| script | what it did |
|---|---|
| `convert_master_list.py` | the Excel sheet into structured JSON |
| `extract_parameter_inventory.py` | what parameters appear across certificates |
| `extract_least_counts.py` | least counts read out of certificate PDFs |
| `extract_least_counts_manual.py` | the ones the automatic pass could not read |
| `backfill_profiles_from_excel.py` | capability profiles from the spreadsheet |
| `build_parameter_standards.py` | the standard parameter names |
| `apply_certificate_findings.py` | certificate-verified figures over the extracted ones |
| `link_legacy_master_ids.py` | the sequential id every saved certificate refers to |
| `standardize_registry.py` | the working registry down to the shape the app consumed |

`link_legacy_master_ids.py` and `standardize_registry.py` write the register file.
The rest write intermediates under `reference_docs/`.
