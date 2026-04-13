# Security Notes

## Exposed Solana Keypairs

If a Solana keypair JSON was ever committed, deleting it from the current branch is not enough. The wallet must be treated as compromised because the private key remains available in git history and in any clones or forks that already fetched it.

### Required remediation

1. Stop using the exposed wallet immediately.
2. Move any remaining funds, token authority, upgrade authority, or admin role to a fresh wallet.
3. Update local env files, deployment config, CI secrets, and runbooks to use the replacement wallet.
4. Rewrite git history to remove the file from every commit where it appeared.
5. Force-push the rewritten refs and ask every collaborator to re-clone or hard-reset to the cleaned history.

### History cleanup

`rs/tmp/non_admin.json` was committed in repository history before being deleted from the working tree. Removing it from the branch was good cleanup, but not a complete fix.

A typical rewrite uses `git filter-repo`:

```bash
git filter-repo --invert-paths --path rs/tmp/non_admin.json
git push --force --all
git push --force --tags
```

Run that only after coordinating with everyone using the repository, because it rewrites commit history.

### Repository guardrails

- Keep all live keypairs outside the repo, for example under `~/.config/solana/`.
- Use `rs/tmp/` only for untracked local scratch files.
- Run `node scripts/check-no-keypairs.mjs` before pushing changes.
- Keep deployment-specific admin overrides such as `ADMIN_OVERRIDE_WALLET` out of committed `wrangler.jsonc` files; set them in the deployment platform instead.

The repository check looks for tracked JSON files that either use keypair-style filenames or parse as 32-byte / 64-byte Solana secret-key arrays.
