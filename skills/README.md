# PICC Team Skills — Canonical Home

This directory is the **single source of truth** for the PICC sales team's skills. If a skill is not here, it is not a team skill. If two copies of a skill disagree, the copy here is right.

## The rules

1. **One skill, one file.** Each skill is a single, self-contained Markdown file at `skills/<skill-name>/SKILL.md`, written to be read by a person in one pass. No reference files, no appendices, no splitting a skill across documents unless the skill is genuinely too large for one file, and then the exception is named here.
2. **Readable beats clever.** A skill states when it applies, what it does, the steps in order, and its guardrails, in plain language. It carries no account names, order numbers, customer names, or stock snapshots: anything that changes day to day is read live when the skill runs.
3. **Changes land here first.** A skill is edited here, by pull request, before any implementation changes. App code, automations, and agent setups implement what the skill file says; where they disagree with the file, the file is right and they get fixed.
4. **Agents find skills here.** Any agent working a team workflow reads the skill from this directory (repo path `skills/<skill-name>/SKILL.md`) at the start of the task. Nobody works from a downloaded, emailed, or screenshotted copy.
5. **The Rep Copilot Space mirrors this directory.** The Skills Library in the Rep Copilot Space holds an exact copy of each skill here so the team can read and discuss them. The mirror is updated in the same pull request (or the same piece of work) that changes the skill here. The mirror never leads and never drifts: if the Space and this directory differ, this directory wins and the Space gets corrected.

## Skills

| Skill | File | What it does |
| --- | --- | --- |
| First-Order Samples & Displays (Distru Skill) | [first-order-samples-and-displays/SKILL.md](first-order-samples-and-displays/SKILL.md) | Adds the standard first-order sample and display package to a new customer's first PICC order in Distru. |

## How a new skill gets added

Draft and test the skill with an agent first. When it works, open a pull request that adds `skills/<skill-name>/SKILL.md`, adds its row to the table above, and updates the Rep Copilot Space mirror. The skill is a team skill once that pull request merges.
