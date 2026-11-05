# CLAUDE.md

Read **[AGENTS.md](AGENTS.md)** first. It is the canonical guide for AI agents on this repo: product rules, current state, architecture, commands, content standard, decision log, open work and glossary.

Key rules (details in AGENTS.md §2):
- No user music uploads. No dummy/synthetic media in `src/`.
- Audio is published only through `npm run catalog:publish`, after a named human approval in `content/curation.json`.
- Licences: CC0 / CC BY / CC BY-SA or documented written permission. Never ripped YouTube audio.
- Keep `scripts/standard.ts`, `tests/standard.test.ts` and `docs/06` in sync.
