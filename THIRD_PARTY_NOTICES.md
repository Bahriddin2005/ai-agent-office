# Third-party notices

`library/` contains verbatim copies of agent, skill, command and guide files
from the repositories below, gathered by `scripts/build-library.mjs`. Every
file keeps its original author and license. Full license texts are in
`library/LICENSES/`. Exact upstream commits are pinned in `sources.lock.json`,
and every entry in `public/data/registry.json` links back to its source file.

| Source | Copyright | License |
|---|---|---|
| [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) | © 2025-2026 Shayan Rais | MIT |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | © 2025 Alireza Rezvani | MIT |
| [W17ant/Claude-Office](https://github.com/W17ant/Claude-Office) | © 2026 W17ANT | MIT |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | © 2026 Safi Shamsi and the Graphify contributors | Apache-2.0 (earlier portions MIT; see `library/LICENSES/graphify-NOTICE`) |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | © 2025 Nous Research | MIT |
| [affaan-m/ECC](https://github.com/affaan-m/ECC) | © 2026 Affaan Mustafa | MIT |
| [microsoft/ai-agents-for-beginners](https://github.com/microsoft/ai-agents-for-beginners) | © Microsoft Corporation | MIT |
| [bojieli/ai-agent-book](https://github.com/bojieli/ai-agent-book) | © Bojie Li | Apache-2.0 |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | © 2025 Addy Osmani | MIT |
| [ashishpatel26/500-AI-Agents-Projects](https://github.com/ashishpatel26/500-AI-Agents-Projects) | © 2025 ashishpatel26 | MIT |
| [earendil-works/pi](https://github.com/earendil-works/pi) | © 2025 Mario Zechner | MIT |

## Files written by this project

These agents are authored here and credit the product they represent:

- `library/agents/hermes/hermes.md` — wraps Hermes Agent's `SOUL.md` persona (MIT, Nous Research).
- `library/agents/graphify/graphify-librarian.md` — uses the `graphify` skill (Apache-2.0, Graphify).
- `library/agents/claude-office/office-manager.md` — inspired by Claude-Office's office-manager chat persona (MIT, W17ANT).

The 3D office itself is original code (MIT, see `LICENSE`); it borrows the
idea of turning Claude Code hook events into a live office from Claude-Office
but shares no code or art with it.
