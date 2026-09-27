# Upgrade Scout

A Claude Code plugin that reviews your codebase against **references** (repos, design docs, model/API docs, ecosystem catalogs) and produces an HTML report (in the language of your request, Korean by default) with evidence, scores, a roadmap, and open decision questions on what to bring in and what to skip. It never touches the target code. [한국어](README.md)

## Install

```bash
claude plugin marketplace add PineappleBingo/upgrade-scout
claude plugin install upgrade-scout@upgrade-scout
```
Skill only (works with Codex, Cursor, and other tools too): `npx skills add PineappleBingo/upgrade-scout -g`

Update: `claude plugin update upgrade-scout@upgrade-scout`, or `/plugin` → Marketplaces → auto-update.

## Usage

```text
/upgrade-scout:upgrade-scout
REFERENCES: <owner>/<repo>, <design doc URL or path>, <model/API doc URL>
FOCUS: <one line on the capability you care about>
LENSES: agent-architecture
```
Plain-language requests work too: "review our code against this design doc", "what should we port from this repo", "check our agent architecture".

The skill body is written in Korean, but the report itself follows whatever language you write your request in.

| Reference | What shows up in the report |
|---|---|
| Repo | Implemented vs. claimed · what to port · scores |
| Design doc, playbook, org chart | Principle → present/partial/absent map · missing pieces · hard-rule conflicts |
| Model / API doc | Capability sheet · judgment-point map · fit score (Jev is picked up automatically as a pack) |
| Ecosystem (radar, awesome lists, topics) | Latest implementations · shallow-clone-then-review |

## Requirements

Node.js ≥20 · git. Optional: `TYPESAFE_API_KEY` (for live Jev pack calls), gh CLI. There are no extra agents to install: the skill runs Claude Code's built-in Explore/Plan agents with the sub-agent briefs bundled inside it. Briefs instruct agents to stay "read-only" (not enforced, since Bash is still available).

## Checks

```bash
node skills/upgrade-scout/scripts/selfcheck.mjs --strict
node --test skills/upgrade-scout/scripts/test/*.test.mjs
claude plugin validate --strict .
```

## License

MIT
