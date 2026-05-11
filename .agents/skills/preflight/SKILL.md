---
name: preflight
description: Audits a fresh clone of this repo for fork-day setup gaps before any code work begins. Verifies gh auth, git remote, branch protection, Vercel project link, lefthook install, Node and package-manager versions against package.json engines, presence of CI workflow files, and optional Claude Code red-green PreToolUse hook wiring when present. Use at the start of every session on an unfamiliar clone, or whenever the AGENTS.md proof gate asks for the preflight artifact.
---

# preflight

Audits whether a freshly-cloned (or freshly-forked) checkout of this repo is set up for agent-driven development. Each check returns `pass`, `fail`, or `skip` with a remediation hint when it fails. The output goes straight into the chat as the preflight artifact for the AGENTS.md proof gate.

## When to use

- The first time you open this repo on a new machine, in a new container, or after a fork.
- At the start of any session that's about to land non-trivial code, when you're not certain the workspace is fully set up.
- Whenever a hook unexpectedly doesn't fire (preflight will tell you whether `.claude/settings.json` and `lefthook` are installed).

## What it checks

| Check                      | What it verifies                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| CI workflow files          | `.github/workflows/` exists and contains at least one `.yml`                                           |
| Claude Code red-green hook | `.claude/settings.json` parses and declares `hooks.PreToolUse` when the checkout provides the file      |
| lefthook git hooks         | `.git/hooks/pre-commit` exists and looks like a lefthook-managed hook when the repo declares lefthook   |
| git remote origin          | `git remote get-url origin` returns a URL                                                              |
| Node version               | current `node` version satisfies `engines.node` from `package.json`                                    |
| pnpm version               | current `pnpm --version` satisfies `engines.pnpm` when the repo declares one                           |
| Vercel project link        | `.vercel/project.json` is present (skipped if absent — only relevant when this repo deploys to Vercel) |
| gh auth status             | `gh auth status` exits 0 (skipped when `PREFLIGHT_SKIP_NETWORK=1`)                                     |
| main branch protection     | `gh api repos/<owner>/<repo>/branches/main/protection` returns 200 (skipped when no network)           |

## How to run it

From the repo root:

```bash
npx tsx .agents/skills/preflight/scripts/preflight.ts
```

Or against a different target directory:

```bash
npx tsx .agents/skills/preflight/scripts/preflight.ts --target /path/to/clone
```

Environment variables:

| Variable                   | Effect                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| `PREFLIGHT_SKIP_NETWORK=1` | Skip the `gh auth` and branch-protection checks (useful in CI or offline) |
| `PREFLIGHT_NODE_VERSION`   | Override the detected Node version (used by tests)                        |
| `PREFLIGHT_PNPM_VERSION`   | Override the detected pnpm version (used by tests)                        |

## Output

A Markdown table of `(name, status, detail)` followed by a remediation block listing only the failed checks and what to do about them. The script exits `0` when every check passes or skips, and `1` when at least one check fails.

Paste the entire stdout block into chat as the preflight artifact. The remediation block is the only thing you need to act on.

## When a check fails

The remediation hint tells you the next step. Common cases:

- **Claude Code red-green hook**: if `.claude/settings.json` exists but fails, fix the hook JSON. If the file is absent, the check skips because this repo does not require Claude settings in every clone.
- **lefthook git hooks**: run the repo's package-manager equivalent of `lefthook install` once if lefthook is configured. If the repo does not declare lefthook, the check skips.
- **Node/package-manager version**: fix your runtime; use Node 20 or 22 for this repo. Only manage pnpm when `package.json` declares `engines.pnpm`.
- **gh auth status**: `gh auth login` once.
- **main branch protection**: only triggers if you have admin access; configure on GitHub.
- **Vercel project link**: `vercel link` if this repo deploys to Vercel; otherwise the check stays in `skip`.

## See also

- [docs/setup.md](../../../docs/setup.md) — long-form fork-day verification with copy-pasteable commands.
- [docs/agent-compat.md](../../../docs/agent-compat.md) — cross-agent layout that the Claude hook check expects.
- [AGENTS.md](../../../AGENTS.md) — the proof gate that consumes this skill's output.
