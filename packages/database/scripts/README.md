# Database scripts

| folder | what lives there |
|---|---|
| [`seed/`](seed/) | filling an empty database from the register |
| [`migration/`](migration/) | one-way jobs already applied here, kept so another environment can repeat them |
| [`retired/`](retired/) | nothing left for it to do; kept as the record |

Every one of these takes `--dry-run` or reports without `--apply`. Read what each says
before running it; none of them should surprise you.
