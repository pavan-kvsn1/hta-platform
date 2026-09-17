# Operations

Recovery and environment. **All live.** See `docs/runbooks/rollback.md` for when each
one is the right answer.

| script | what it is for |
|---|---|
| `rollback-immediate.sh` | canary issues and bad deployments - minutes |
| `rollback-full.sh` | full rollback, including migrations |
| `rollback-check.sh` | whether a rollback is safe to attempt |
| `dr-drill.sh` | rehearse a restore without touching production |
| `dr-restore.sh` | the real restore |
| `setup-local-secrets.sh` | a working local environment |
