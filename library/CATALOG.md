# 📚 AI Agent Office — Library Catalog

Everything from the six upstream repositories, gathered into one place (Graphify-style).
Barcha agentlar, skillar va buyruqlar bitta joyda jamlangan.

**205 agents · 883 skills · 253 commands · 25 guides** · 5087 graph edges

## Sources

| Source | Repo | License | Agents | Skills | Commands | Guides |
|---|---|---|---|---|---|---|
| Claude Code Best Practice | [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) | MIT | 20 | 6 | 14 | 20 |
| Claude Skills (alirezarezvani) | [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | MIT | 109 | 373 | 142 | 1 |
| Claude Office (W17ant) | [W17ant/Claude-Office](https://github.com/W17ant/Claude-Office) | MIT | 1 | 0 | 0 | 1 |
| Graphify | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | Apache-2.0 | 1 | 1 | 0 | 1 |
| Hermes Agent (Nous Research) | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | MIT | 1 | 211 | 0 | 1 |
| ECC (Everything Claude Code) | [affaan-m/ECC](https://github.com/affaan-m/ECC) | MIT | 73 | 292 | 97 | 1 |

## Departments

| Department | Agents | Skills | Commands |
|---|---|---|---|
| [👔 Executive Suite](departments/executive.md) — Rahbariyat | 21 | 62 | 2 |
| [🛠️ Engineering Core](departments/engineering.md) — Muhandislik markazi | 34 | 142 | 41 |
| [🧩 Languages & Build](departments/languages.md) — Dasturlash tillari | 25 | 52 | 16 |
| [🎨 Frontend & Design](departments/frontend.md) — Frontend va dizayn | 7 | 65 | 18 |
| [☁️ DevOps & Cloud](departments/devops.md) — DevOps va bulut | 7 | 37 | 1 |
| [🛡️ Security & Compliance](departments/security.md) — Xavfsizlik va muvofiqlik | 11 | 58 | 8 |
| [🧠 AI & ML Lab](departments/ai.md) — Sunʼiy intellekt laboratoriyasi | 11 | 87 | 5 |
| [🔬 Data & Research](departments/data.md) — Maʼlumot va tadqiqot | 16 | 67 | 22 |
| [🗺️ Product & Projects](departments/product.md) — Mahsulot va loyihalar | 9 | 38 | 25 |
| [📣 Marketing & Growth](departments/marketing.md) — Marketing va o‘sish | 15 | 65 | 13 |
| [💼 Sales, Finance & Ops](departments/business.md) — Savdo, moliya va operatsiyalar | 5 | 56 | 18 |
| [🎬 Creative Studio](departments/creative.md) — Ijodiy studiya | 3 | 43 | 0 |
| [⚡ Productivity Hub](departments/productivity.md) — Samaradorlik markazi | 12 | 66 | 21 |
| [🎓 Claude Academy](departments/academy.md) — Claude akademiyasi | 29 | 45 | 63 |

## Most connected ("god nodes")

- **orch-pipeline** (skill, ECC) — 35 connections
- **decide** (skill, Claude Skills) — 33 connections
- **boardroom** (skill, Claude Skills) — 30 connections
- **kanban-video-orchestrator** (skill, Hermes) — 29 connections
- **mle-workflow** (skill, ECC) — 28 connections
- **founder-mode** (skill, Claude Skills) — 27 connections
- **code-review** (command, ECC) — 27 connections
- **ecc-recipes** (skill, ECC) — 26 connections
- **plan-orchestrate** (skill, ECC) — 26 connections
- **ecc-readme** (guide, ECC) — 26 connections
- **claude-skills-readme** (guide, Claude Skills) — 26 connections
- **security-reviewer** (agent, ECC) — 25 connections
- **verification-loop** (skill, ECC) — 25 connections
- **hermes-agent** (skill, Hermes) — 24 connections
- **c-level-agents** (skill, Claude Skills) — 23 connections

## All agents

| Name | Type | Source | What it does |
|---|---|---|---|
| [a11y-architect](agents/ecc/a11y-architect.md) | agent | ECC | Accessibility Architect specializing in WCAG 2.2 compliance for Web and Native platforms. Use PROACTIVELY when designing UI components, establishing design sys… |
| [agent-evaluator](agents/ecc/agent-evaluator.md) | agent | ECC | Evaluates agent output against 5-axis quality rubric (accuracy, completeness, clarity, actionability, conciseness). Use after any non-trivial task when the use… |
| [architect](agents/ecc/architect.md) | agent | ECC | Software architecture specialist for system design, scalability, and technical decision-making. Use PROACTIVELY when planning new features, refactoring large s… |
| [build-error-resolver](agents/ecc/build-error-resolver.md) | agent | ECC | Build and TypeScript error resolution specialist. Use PROACTIVELY when build fails or type errors occur. Fixes build/type errors only with minimal diffs, no ar… |
| [chief-of-staff](agents/ecc/chief-of-staff.md) | agent | ECC | Personal communication chief of staff that triages email, Slack, LINE, and Messenger. Classifies messages into 4 tiers (skip/info_only/meeting_info/action_requ… |
| [code-architect](agents/ecc/code-architect.md) | agent | ECC | Designs feature architectures by analyzing existing codebase patterns and conventions, then providing implementation blueprints with concrete files, interfaces… |
| [code-explorer](agents/ecc/code-explorer.md) | agent | ECC | Deeply analyzes existing codebase features by tracing execution paths, mapping architecture layers, and documenting dependencies to inform new development. |
| [code-reviewer](agents/best-practice/code-reviewer.md) | agent | Best Practice | Meticulous, constructive reviewer for correctness, clarity, security, and maintainability. |
| [code-reviewer](agents/ecc/code-reviewer.md) | agent | ECC | Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code. MUST BE US… |
| [code-simplifier](agents/ecc/code-simplifier.md) | agent | ECC | Simplifies and refines code for clarity, consistency, and maintainability while preserving behavior. Focus on recently modified code unless instructed otherwis… |
| [comment-analyzer](agents/ecc/comment-analyzer.md) | agent | ECC | Analyze code comments for accuracy, completeness, maintainability, and comment rot risk. |
| [constitutional-validator](agents/best-practice/constitutional-validator.md) | agent | Best Practice | Validates roadmap items, features, and technical decisions against the project's constitution, principles, and core values. Ensures all proposals align with th… |
| [Content Strategist](agents/claude-skills/content-strategist.md) | agent | Claude Skills | Builds content engines that rank, convert, and compound. Thinks in systems — topic clusters, not individual posts. Every piece earns its place or gets killed.… |
| [conversation-analyzer](agents/ecc/conversation-analyzer.md) | agent | ECC | Use this agent when analyzing conversation transcripts to find behaviors worth preventing with hooks. Triggered by /hookify without arguments. |
| [cpp-build-resolver](agents/ecc/cpp-build-resolver.md) | agent | ECC | C++ build, CMake, and compilation error resolution specialist. Fixes build errors, linker issues, and template errors with minimal changes. Use when C++ builds… |
| [cpp-reviewer](agents/ecc/cpp-reviewer.md) | agent | ECC | Expert C++ code reviewer specializing in memory safety, modern C++ idioms, concurrency, and performance. Use for all C++ code changes. MUST BE USED for C++ pro… |
| [cs-aeo](agents/claude-skills/cs-aeo.md) | agent | Claude Skills | Answer Engine Optimization (AEO) specialist agent. Use when content needs to be optimized for citation by AI language models (ChatGPT, Perplexity, Claude, Gemi… |
| [cs-agent-deployer](agents/claude-skills/cs-agent-deployer.md) | agent | Claude Skills | Phase-4 specialist for making a Claude Managed Agent run without you. Turns a graded agent into a recurring POSIX-cron scheduled deployment (optionally self-gr… |
| [cs-agent-grader](agents/claude-skills/cs-agent-grader.md) | agent | Claude Skills | Phase-3 specialist for the bounded grade→iterate loop when building a Claude Managed Agent. Defines a CMA outcome (required rubric, max_iterations clamped 1..2… |
| [cs-agent-interviewer](agents/claude-skills/cs-agent-interviewer.md) | agent | Claude Skills | Phase-1 specialist for building a Claude Managed Agent — interviews the founder through the six intake slots (job, trigger, inputs, actions, definition-of-done… |
| [cs-agent-launcher-orchestrator](agents/claude-skills/cs-agent-launcher-orchestrator.md) | agent | Claude Skills | Session-goal router for building Claude Managed Agents. Reads ./my-agent/goal.json, routes deterministically to a phase skill (interview → stage-launch → grade… |
| [cs-agile-product-owner](agents/claude-skills/cs-agile-product-owner.md) | agent | Claude Skills | Agile product owner agent for epic breakdown, sprint planning, backlog refinement, and INVEST-compliant user story generation. Use when preparing work for a de… |
| [cs-ai-act-compliance](agents/claude-skills/cs-ai-act-compliance.md) | agent | Claude Skills | EU AI Act (Regulation (EU) 2024/1689) Article-cited compliance operator. Three decisions: AI system risk tier (Article 5 / 6+ Annex III / 50 / minimal), confor… |
| [cs-aims-iso42001](agents/claude-skills/cs-aims-iso42001.md) | agent | Claude Skills | ISO/IEC 42001:2023 AI Management System (AIMS) implementation + internal audit operator. Three decisions: AIMS gaps against Clauses 4-10, AI risk register per… |
| [cs-andreessen](agents/claude-skills/cs-andreessen.md) | agent | Claude Skills | Marc Andreessen-mode operator. Runs on a fixed anti-sycophancy operating prompt — leads with the strongest counterargument, never validates premises or praises… |
| [cs-arquiteto](agents/claude-skills/cs-arquiteto.md) | agent | Claude Skills | Company Architect — a senior chief of staff who builds a business from scratch as an OKF (Open Knowledge Format) bundle: a tree of version-controllable .md fil… |
| [cs-backend-engineer](agents/claude-skills/cs-backend-engineer.md) | agent | Claude Skills | Backend-engineering orchestrator. Walks the 7 Matt Pocock forcing questions (read/write ratio + QPS, tenancy, sync vs async, data sensitivity, pattern, RPO/RTO… |
| [cs-bizops-orchestrator](agents/claude-skills/cs-bizops-orchestrator.md) | agent | Claude Skills | Process-obsessed BizOps lead. Routes internal-operations inquiries (process / vendor / capacity / comms / SOP / procurement) to the right sub-skill via the bus… |
| [cs-book-to-skill](agents/claude-skills/cs-book-to-skill.md) | agent | Claude Skills | Book-to-skill converter persona. Interrogates whether a source is worth converting before spending a generation pass on it, then drives extract → analyze → cha… |
| [cs-caio-advisor](agents/claude-skills/cs-caio-advisor.md) | agent | Claude Skills | Eval-demanding Chief AI Officer advisor for model build-vs-buy decisions, AI risk classification under EU AI Act + US state laws, AI cost economics (API vs sel… |
| [cs-capture](agents/claude-skills/cs-capture.md) | agent | Claude Skills | Brain-dump organizer persona. Catches unstructured streams of mixed thoughts/tasks/ideas and transforms them into a 4-section actionable system with zero infor… |
| [cs-caveman-mode](agents/claude-skills/cs-caveman-mode.md) | agent | Claude Skills | Caveman-mode operator. Persistent ultra-compressed communication mode. Drops articles, filler, pleasantries, and hedging while preserving all technical substan… |
| [cs-cco-advisor](agents/claude-skills/cs-cco-advisor.md) | agent | Claude Skills | Retention-obsessed Chief Customer Officer advisor for honest retention decomposition (GRR vs NRR), customer segmentation (differential investment), CS team cov… |
| [cs-cdo-advisor](agents/claude-skills/cs-cdo-advisor.md) | agent | Claude Skills | Decision-driven Chief Data Officer advisor for AI training data rights, data product strategy (warehouse/lakehouse/mesh + build-vs-buy), B2B customer-data-as-a… |
| [cs-ceo-advisor](agents/claude-skills/cs-ceo-advisor.md) | agent | Claude Skills | Strategic leadership advisor for CEOs covering vision, strategy, board management, investor relations, and organizational culture. Use when a founder or CEO fa… |
| [cs-cfo-advisor](agents/claude-skills/cs-cfo-advisor.md) | agent | Claude Skills | Numerate-skeptic CFO advisor for unit economics, runway, fundraising, dilution, and board-grade financial decisions |
| [cs-chief-of-staff](agents/claude-skills/cs-chief-of-staff.md) | agent | Claude Skills | Routing-and-synthesis chief of staff for orchestrating the virtual boardroom, logging decisions, and surfacing stale ones |
| [cs-chro-advisor](agents/claude-skills/cs-chro-advisor.md) | agent | Claude Skills | People-systems CHRO advisor for hiring strategy, comp bands, leveling ladders, org design, and retention |
| [cs-ciso-advisor](agents/claude-skills/cs-ciso-advisor.md) | agent | Claude Skills | Risk-paranoid CISO advisor for threat modeling, compliance, incident response, and security architecture |
| [cs-ciso-iso27001](agents/claude-skills/cs-ciso-iso27001.md) | agent | Claude Skills | ISO/IEC 27001:2022 ISMS audit + implementation persona. Sample-driven; samples real records, not curated demos. Coordinates with SOC 2 (75% overlap), ISO 42001… |
| [cs-claude-coach](agents/claude-skills/cs-claude-coach.md) | agent | Claude Skills | Use proactively after any user message in a Claude.ai or Claude Code session where the user is learning to prompt better or has explicitly activated coaching.… |
| [cs-cmo-advisor](agents/claude-skills/cs-cmo-advisor.md) | agent | Claude Skills | Narrative-first CMO advisor for ICP definition, positioning, message house, channel mix, and category creation |
| [cs-commercial-orchestrator](agents/claude-skills/cs-commercial-orchestrator.md) | agent | Claude Skills | Margin-protective Commercial lead. Routes per-deal-and-packaging inquiries (pricing / deal / partner / channel / policy / RFP / forecast) to the right sub-skil… |
| [cs-compliance-officer](agents/claude-skills/cs-compliance-officer.md) | agent | Claude Skills | Multi-framework compliance officer orchestrating cross-framework programs. Routes per-framework deep work to specialist skills (ISO 42001, EU AI Act, ISO 27001… |
| [cs-content-creator](agents/claude-skills/cs-content-creator.md) | agent | Claude Skills | Long-form marketing content producer orchestrating the content-production skill (research → brief → draft → optimize → gate). Use when content must be written,… |
| [cs-coo-advisor](agents/claude-skills/cs-coo-advisor.md) | agent | Claude Skills | Execution-OS COO advisor for operating cadence, OKRs, scorecards, DRI clarity, and scaling playbooks |
| [cs-cpo-advisor](agents/claude-skills/cs-cpo-advisor.md) | agent | Claude Skills | JTBD-driven CPO advisor for product vision, portfolio strategy, PMF, North Star metrics, and roadmap focus |
| [cs-cqm-iso13485](agents/claude-skills/cs-cqm-iso13485.md) | agent | Claude Skills | ISO 13485:2016 QMS audit persona — Design Control + CAPA + Process Validation focused. Coordinates with ISO 14971 (risk file), MDR 745 (technical documentation… |
| [cs-cro-advisor](agents/claude-skills/cs-cro-advisor.md) | agent | Claude Skills | Pipeline-paranoid CRO advisor for revenue forecasting, sales motion, NRR, ramp time, and pipeline coverage |
| [cs-cto-advisor](agents/claude-skills/cs-cto-advisor.md) | agent | Claude Skills | Technical leadership advisor for CTOs covering technology strategy, team scaling, architecture decisions, and engineering excellence. Use when a CTO or technic… |
| [cs-deep-learning-tutor](agents/claude-skills/cs-deep-learning-tutor.md) | agent | Claude Skills | Study companion for the Deep Learning textbook (Goodfellow, Bengio & Courville, 2016). Plans a prerequisite-closed reading path, answers chapter questions from… |
| [cs-deep-research](agents/claude-skills/cs-deep-research.md) | agent | Claude Skills | Rigor-first meta-research persona for high-stakes questions. Reframes the question into 2-4 falsifiable hypotheses, writes a plan, discovers available channels… |
| [cs-deep-work](agents/claude-skills/cs-deep-work.md) | agent | Claude Skills | Plans a deep work day the Cal Newport way — audits a task list deep vs shallow against a 30-50% shallow budget, builds an energy-first time-blocked schedule (d… |
| [cs-demand-gen-specialist](agents/claude-skills/cs-demand-gen-specialist.md) | agent | Claude Skills | Demand generation and acquisition-funnel specialist orchestrating the marketing-demand-acquisition, paid-ads, and email-sequence skills. Use when building or f… |
| [cs-dossier](agents/claude-skills/cs-dossier.md) | agent | Claude Skills | Decision-grade entity research persona. Walks 6 forcing intake questions (subject identity + subject type + purpose + hypothesis-MANDATORY + depth + sensitivit… |
| [cs-dpo-gdpr](agents/claude-skills/cs-dpo-gdpr.md) | agent | Claude Skills | GDPR / DSGVO Data Protection Officer audit persona. Lawful-basis-discipline + DPIA-quality + Schrems-II-transfer-aware. Coordinates with ISO 27001 Article 32 o… |
| [cs-engineering-lead](agents/claude-skills/cs-engineering-lead.md) | agent | Claude Skills | Engineering Team Lead agent for coordinating QA, security, data engineering, ML, and frontend/backend teams. Orchestrates engineering-team skills for team-leve… |
| [cs-fda-qsr-auditor](agents/claude-skills/cs-fda-qsr-auditor.md) | agent | Claude Skills | FDA 21 CFR 820 (QSR / QMSR) auditor persona. Substantially harmonized with ISO 13485 post-Feb 2026 via FDA Final Rule incorporating ISO 13485 by reference. Add… |
| [cs-financial-analyst](agents/claude-skills/cs-financial-analyst.md) | agent | Claude Skills | Financial Analyst agent for DCF valuation, financial modeling, budgeting, forecasting, and SaaS metrics (ARR, MRR, churn, CAC, LTV, NRR). Orchestrates finance… |
| [cs-frontend-engineer](agents/claude-skills/cs-frontend-engineer.md) | agent | Claude Skills | Frontend-engineering orchestrator. Walks the 7 Matt Pocock forcing questions (device, LCP target, rendering, bundle budget, SEO vs auth, design system, WCAG),… |
| [cs-fullstack-engineer](agents/claude-skills/cs-fullstack-engineer.md) | agent | Claude Skills | Fullstack-engineering orchestrator. Walks the Matt Pocock 7-question forcing-question grill, runs the deterministic profile picker, then forks into the POWERFU… |
| [cs-general-counsel-advisor](agents/claude-skills/cs-general-counsel-advisor.md) | agent | Claude Skills | Risk-paranoid General Counsel advisor for contract review, IP strategy, term sheet decoding, and regulatory landscape mapping. Not legal advice; surfaces quest… |
| [cs-grants](agents/claude-skills/cs-grants.md) | agent | Claude Skills | NIH grant research persona for clinical researchers. Walks 6 forcing intake questions (research idea + career stage + prelim data + environment + submission po… |
| [cs-grill-master](agents/claude-skills/cs-grill-master.md) | agent | Claude Skills | Relentless plan-and-design interrogator. Walks decision trees one branch at a time, asks one question per turn with recommended answer + rationale, explores co… |
| [cs-grill-with-docs](agents/claude-skills/cs-grill-with-docs.md) | agent | Claude Skills | Docs-anchored plan interrogator. Walks a plan's decision tree against the project's existing language (CONTEXT.md) and recorded decisions (docs/adr/). Pre-flig… |
| [cs-growth-strategist](agents/claude-skills/cs-growth-strategist.md) | agent | Claude Skills | Growth Strategist agent for revenue operations, sales engineering, customer success, and business development. Orchestrates business-growth skills. Spawn when… |
| [cs-handoff-author](agents/claude-skills/cs-handoff-author.md) | agent | Claude Skills | Conversation-handoff author. Compacts the current session into a markdown handoff for a fresh agent. Tailors content to next-session focus. Refuses to duplicat… |
| [cs-human-gate](agents/claude-skills/cs-human-gate.md) | agent | Claude Skills | Runs the human-verification lane of an agent loop. Builds a single-file review page for a Markdown or HTML artifact, hands the reviewer a path and ends the tur… |
| [cs-inbox-setup](agents/claude-skills/cs-inbox-setup.md) | agent | Claude Skills | One-time email-triage onboarding persona. Conducts an 8-section interactive interview (~25-31 grill-me questions) to build a personalized knowledge base of 7 m… |
| [cs-inbox-triage](agents/claude-skills/cs-inbox-triage.md) | agent | Claude Skills | Recurring email-triage execution persona. Reads the 7-file KB produced by inbox-setup, classifies recent emails via the user's taxonomy, researches new senders… |
| [cs-karpathy-reviewer](agents/claude-skills/cs-karpathy-reviewer.md) | agent | Claude Skills | Reviews staged git changes against Karpathy's 4 coding principles. Runs complexity_checker on changed files, diff_surgeon on the diff, and produces a verdict w… |
| [cs-landing](agents/claude-skills/cs-landing.md) | agent | Claude Skills | Premium HTML landing page generator persona. Walks 3-4 forcing intake questions (product+pitch, audience register, brand overrides, tone) before writing any ma… |
| [cs-linkedin-editor](agents/claude-skills/cs-linkedin-editor.md) | agent | Claude Skills | Drafts, edits, and lints LinkedIn posts to a publishable standard — hook that survives the ~140-character mobile fold, one idea, real numbers, no engagement ba… |
| [cs-linkedin-orchestrator](agents/claude-skills/cs-linkedin-orchestrator.md) | agent | Claude Skills | Routes any LinkedIn organic-growth request to the right lane and gates it against LinkedIn's User Agreement before a word is drafted. Runs the policy gate (ALL… |
| [cs-litreview](agents/claude-skills/cs-litreview.md) | agent | Claude Skills | Academic literature orientation persona. Walks 3 forcing intake questions (research question specificity + framework hint + tentative depth) before any search,… |
| [cs-markdown-html-orchestrator](agents/claude-skills/cs-markdown-html-orchestrator.md) | agent | Claude Skills | Density-first markdown-to-HTML converter. Routes long markdown files (≥ 100 lines per Shihipar's threshold) to one of three converter sub-skills (md-document /… |
| [cs-meeting-discipline](agents/claude-skills/cs-meeting-discipline.md) | agent | Claude Skills | Enforces personal meeting hygiene end to end. Before a meeting it runs the cost gate (attendees x minutes x rate, optionally + 23-minute refocus overhead per a… |
| [cs-memory-curator](agents/claude-skills/cs-memory-curator.md) | agent | Claude Skills | Curates the tiered agent-memory store. Use when reviewing what the agent has learned from past sessions, adopting staged promotions into CLAUDE.md, resolving a… |
| [cs-memory-engineer](agents/claude-skills/cs-memory-engineer.md) | agent | Claude Skills | Use when someone is adding memory to an agent, choosing a memory architecture, auditing an existing memory store, or asking why their memory system is expensiv… |
| [cs-notebooklm](agents/claude-skills/cs-notebooklm.md) | agent | Claude Skills | NotebookLM browser-automation persona. Walks 2-4 forcing intake questions (Q1 action: read / add source / Studio output / create new; Q2-Q4 branch per action).… |
| [cs-patent](agents/claude-skills/cs-patent.md) | agent | Claude Skills | Patent prior-art + landscape intelligence persona. Walks 6 forcing intake questions with mandatory sub-use-case commitment (novelty / FTO / landscape / diligen… |
| [cs-pm-orchestrator](agents/claude-skills/cs-pm-orchestrator.md) | agent | Claude Skills | Flow-first delivery lead. Routes project-management inquiries (sprint/velocity, portfolio health, Jira/JQL, Confluence, Atlassian admin, templates, meetings, c… |
| [cs-product-analyst](agents/claude-skills/cs-product-analyst.md) | agent | Claude Skills | Product analytics agent for KPI definition, dashboard setup, experiment design, and test result interpretation. Use when a product question needs numbers — e.g… |
| [cs-product-manager](agents/claude-skills/cs-product-manager.md) | agent | Claude Skills | Product management agent for feature prioritization, customer discovery, PRD development, and roadmap planning using RICE framework. Use when a product decisio… |
| [cs-product-orchestrator](agents/claude-skills/cs-product-orchestrator.md) | agent | Claude Skills | Outcome-first product lead. Routes product inquiries (prioritization, OKRs, UX research, design systems, competitive, analytics, experiments, discovery, roadma… |
| [cs-product-strategist](agents/claude-skills/cs-product-strategist.md) | agent | Claude Skills | Product strategy agent for quarterly OKR planning, competitive landscape analysis, product vision development, and strategy pivot evaluation. Use when the ques… |
| [cs-project-manager](agents/claude-skills/cs-project-manager.md) | agent | Claude Skills | Project Manager agent for sprint planning, Jira/Confluence workflows, Scrum ceremonies, and stakeholder reporting. Orchestrates project-management skills. Use… |
| [cs-pulse](agents/claude-skills/cs-pulse.md) | agent | Claude Skills | Multi-source recency research persona. Walks 2–4 forcing intake questions one at a time (topic specificity, angle, time window, platform scope), runs Reddit +… |
| [cs-quality-regulatory](agents/claude-skills/cs-quality-regulatory.md) | agent | Claude Skills | Quality & Regulatory agent for ISO 13485 QMS, MDR compliance, FDA submissions, GDPR/DSGVO, and ISMS audits. Orchestrates ra-qm-team skills. Spawn when users ne… |
| [cs-reflect](agents/claude-skills/cs-reflect.md) | agent | Claude Skills | Mid-conversation reflection persona. Halts the current thread, re-reads full conversation from original goal forward, runs 5-dimension analysis (Macro / Gap /… |
| [cs-research](agents/claude-skills/cs-research.md) | agent | Claude Skills | Hybrid research router + fallback persona. Walks 2-4 minimal intake questions (Q1 question + Q2 output preference; Q3 disambiguation only when classification i… |
| [cs-research-ops-orchestrator](agents/claude-skills/cs-research-ops-orchestrator.md) | agent | Claude Skills | Evidence-first R&D operations lead. Routes enterprise research inquiries (clinical study design / R&D finance / market research / product research) to the righ… |
| [cs-roast-judge](agents/claude-skills/cs-roast-judge.md) | agent | Claude Skills | Convenes a 5-angle adversarial panel (Critic, Champion, Analyst, Investigator, Customer) on a business idea, then acts as the Judge to deliver one GO / RESHAPE… |
| [cs-scraping-architect](agents/claude-skills/cs-scraping-architect.md) | agent | Claude Skills | Use when the user wants to scrape a website, crawl docs, extract data from PDFs/Excel/CSV/HTML, parse an API response into a dataset, or debug a brittle scrapi… |
| [cs-senior-engineer](agents/claude-skills/cs-senior-engineer.md) | agent | Claude Skills | Senior Engineer agent for architecture decisions, code review, DevOps, and API design. Orchestrates engineering and engineering-team skills for technical imple… |
| [cs-skill-author](agents/claude-skills/cs-skill-author.md) | agent | Claude Skills | Skill-author persona. Forcing-question interrogator before any new-skill commit. Runs Matt Pocock's 6-item review checklist as a 6-question gate. Refuses to ac… |
| [cs-skill-doctor](agents/claude-skills/cs-skill-doctor.md) | agent | Claude Skills | Use when someone wants their agent setup graded from real conversation history, asks which of their installed skills actually fire, wonders whether their skill… |
| [cs-soc2-auditor](agents/claude-skills/cs-soc2-auditor.md) | agent | Claude Skills | SOC 2 Type II auditor persona — observation-period discipline + AICPA TSC focused. Coordinates with ISO 27001 (75% overlap, the canonical cross-walk pair) and… |
| [cs-spinning-up-deep-rl](agents/claude-skills/cs-spinning-up-deep-rl.md) | agent | Claude Skills | Answers from the knowledge base compiled from Spinning Up in Deep RL by Joshua Achiam (OpenAI). Loads the master frameworks first and reads a single chapter fi… |
| [cs-syllabus](agents/claude-skills/cs-syllabus.md) | agent | Claude Skills | Course supplementary reading list persona. Walks 3 forcing intake questions (syllabus input format + course audience + year range) before parsing. Halts at gro… |
| [cs-ux-researcher](agents/claude-skills/cs-ux-researcher.md) | agent | Claude Skills | UX research agent for research planning, persona generation, journey mapping, and usability test analysis. Use when product decisions need user evidence — e.g.… |
| [cs-vpe-advisor](agents/claude-skills/cs-vpe-advisor.md) | agent | Claude Skills | Throughput-first VP of Engineering advisor for delivery throughput (DORA 4 metrics), engineering hiring funnel, eng team structure (squad/tribe + manager-trigg… |
| [cs-webinar-marketer](agents/claude-skills/cs-webinar-marketer.md) | agent | Claude Skills | Webinar & virtual-event marketing specialist agent. Use when planning, promoting, running, or rescuing a webinar, virtual event, live demo, workshop, mastercla… |
| [cs-weekly-review](agents/claude-skills/cs-weekly-review.md) | agent | Claude Skills | Walks a user through a complete GTD weekly review — GET CLEAR (collect, process inboxes to zero, empty your head), GET CURRENT (next actions, previous + upcomi… |
| [cs-wiki-ingestor](agents/claude-skills/cs-wiki-ingestor.md) | agent | Claude Skills | Dispatched sub-agent that ingests a new source into an LLM Wiki vault. Reads the source, proposes TL;DR and key claims, identifies which entity/concept/synthes… |
| [cs-wiki-librarian](agents/claude-skills/cs-wiki-librarian.md) | agent | Claude Skills | Dispatched sub-agent that answers queries against an LLM Wiki vault. Reads index.md first, drills into 3-10 relevant pages across categories, synthesizes an an… |
| [cs-wiki-linter](agents/claude-skills/cs-wiki-linter.md) | agent | Claude Skills | Dispatched sub-agent that runs a periodic health check on an LLM Wiki vault. Runs mechanical checks via scripts (orphans, broken links, stale pages, missing fr… |
| [cs-workflow-architect](agents/claude-skills/cs-workflow-architect.md) | agent | Claude Skills | Workflow-architect persona. Opens every workflow-creation session with the intake question set, infers-and-proposes when the user is vague (never interrogates… |
| [cs-workspace-admin](agents/claude-skills/cs-workspace-admin.md) | agent | Claude Skills | Google Workspace administration agent using the gws CLI. Orchestrates workspace setup, Gmail/Drive/Sheets/Calendar automation, security audits, and recipe exec… |
| [csharp-reviewer](agents/ecc/csharp-reviewer.md) | agent | ECC | Expert C# code reviewer specializing in .NET conventions, async patterns, security, nullable reference types, and performance. Use for all C# code changes. MUS… |
| [dart-build-resolver](agents/ecc/dart-build-resolver.md) | agent | ECC | Dart/Flutter build, analysis, and dependency error resolution specialist. Fixes `dart analyze` errors, Flutter compilation failures, pub dependency conflicts,… |
| [database-reviewer](agents/ecc/database-reviewer.md) | agent | ECC | PostgreSQL database specialist for query optimization, schema design, security, and performance. Use PROACTIVELY when writing SQL, creating migrations, designi… |
| [development-workflows-research-agent](agents/best-practice/development-workflows-research-agent.md) | agent | Best Practice | Research agent that fetches GitHub repos, counts agents/skills/commands, gets star counts, and analyzes Claude Code workflow repositories |
| [devils-advocate](agents/claude-skills/devils-advocate.md) | agent | Claude Skills | Adversarial reviewer for executive plans, proposals, and decisions. Returns exactly three specific concerns, each severity-rated CRITICAL / HIGH / MEDIUM, with… |
| [DevOps Engineer](agents/claude-skills/devops-engineer.md) | agent | Claude Skills | Builds infrastructure that scales without babysitting. Automates everything worth automating. Monitors before it breaks. Treats clicking in consoles as a produ… |
| [django-build-resolver](agents/ecc/django-build-resolver.md) | agent | ECC | Django/Python build, migration, and dependency error resolution specialist. Fixes pip/Poetry errors, migration conflicts, import errors, Django configuration i… |
| [django-reviewer](agents/ecc/django-reviewer.md) | agent | ECC | Expert Django code reviewer specializing in ORM correctness, DRF patterns, migration safety, security misconfigurations, and production-grade Django practices.… |
| [doc-updater](agents/ecc/doc-updater.md) | agent | ECC | Documentation and codemap specialist. Use PROACTIVELY for updating codemaps and documentation. Generates docs/CODEMAPS/*, updates READMEs and guides. Backs the… |
| [docs-lookup](agents/ecc/docs-lookup.md) | agent | ECC | When the user asks how to use a library, framework, or API or needs up-to-date code examples, use Context7 MCP to fetch current documentation and return answer… |
| [documentation-analyst-writer](agents/best-practice/documentation-analyst-writer.md) | agent | Best Practice | Use this agent when you need to analyze existing documentation and create new or updated documentation that strictly adheres to project-specific documentation… |
| [e2e-runner](agents/ecc/e2e-runner.md) | agent | ECC | End-to-end testing specialist using Vercel Agent Browser (preferred) with Playwright fallback. Use PROACTIVELY for generating, maintaining, and running E2E tes… |
| [enrichment-agent](agents/ecc/enrichment-agent.md) | agent | ECC | Pulls detailed profile, company, and activity data for qualified leads. Enriches prospects with recent news, funding data, content interests, and mutual overla… |
| [experiment-runner](agents/claude-skills/experiment-runner.md) | agent | Claude Skills | Runs one iteration of an autoresearch experiment loop. Reads experiment state from .autoresearch/{domain}/{name}/, makes exactly ONE change to the target file,… |
| [fastapi-reviewer](agents/ecc/fastapi-reviewer.md) | agent | ECC | Reviews FastAPI applications for async correctness, dependency injection, Pydantic schemas, security, OpenAPI quality, testing, and production readiness. |
| [Finance Lead](agents/claude-skills/finance-lead.md) | agent | Claude Skills | Startup CFO who builds models that survive contact with reality. Handles fundraising, unit economics, pricing, burn rate, and board reporting. Speaks fluent sp… |
| [flutter-reviewer](agents/ecc/flutter-reviewer.md) | agent | ECC | Flutter and Dart code reviewer. Reviews Flutter code for widget best practices, state management patterns, Dart idioms, performance pitfalls, accessibility, an… |
| [fsharp-reviewer](agents/ecc/fsharp-reviewer.md) | agent | ECC | Expert F# code reviewer specializing in functional idioms, type safety, pattern matching, computation expressions, and performance. Use for all F# code changes… |
| [gan-evaluator](agents/ecc/gan-evaluator.md) | agent | ECC | GAN Harness — Evaluator agent. Tests the live running application via Playwright, scores against rubric, and provides actionable feedback to the Generator. |
| [gan-generator](agents/ecc/gan-generator.md) | agent | ECC | GAN Harness — Generator agent. Implements features according to the spec, reads evaluator feedback, and iterates until quality threshold is met. |
| [gan-planner](agents/ecc/gan-planner.md) | agent | ECC | GAN Harness — Planner agent. Expands a one-line prompt into a full product specification with features, sprints, evaluation criteria, and design direction. |
| [go-build-resolver](agents/ecc/go-build-resolver.md) | agent | ECC | Go build, vet, and compilation error resolution specialist. Fixes build errors, go vet issues, and linter warnings with minimal changes. Use when Go builds fai… |
| [go-reviewer](agents/ecc/go-reviewer.md) | agent | ECC | Expert Go code reviewer specializing in idiomatic Go, concurrency patterns, error handling, and performance. Use for all Go code changes. MUST BE USED for Go p… |
| [graphify-librarian](agents/graphify/graphify-librarian.md) | agent | Graphify | Knowledge librarian. Maps a codebase, docs or this whole office library into a Graphify knowledge graph and answers questions by traversing it instead of grepp… |
| [Growth Marketer](agents/claude-skills/growth-marketer.md) | agent | Claude Skills | Growth marketing specialist for bootstrapped startups and indie hackers. Builds content engines, optimizes funnels, runs launch sequences, and finds scalable a… |
| [harmonyos-app-resolver](agents/ecc/harmonyos-app-resolver.md) | agent | ECC | HarmonyOS application development expert specializing in ArkTS and ArkUI. Reviews code for V2 state management compliance, Navigation routing patterns, API usa… |
| [harness-optimizer](agents/ecc/harness-optimizer.md) | agent | ECC | Improve local agent-harness configuration reliability and cost using eval-driven grading (pass@k/pass^k) derived from the eval-harness skill. |
| [harness-runner](agents/claude-skills/harness-runner.md) | agent | Claude Skills | Drives one agent-harness loop iteration to completion — reads the plan and state files, executes exactly one task with the task skill's own tools, lets the con… |
| [healthcare-reviewer](agents/ecc/healthcare-reviewer.md) | agent | ECC | Reviews healthcare application code for clinical safety, CDSS accuracy, PHI compliance, and medical data integrity. Specialized for EMR/EHR, clinical decision… |
| [hermes](agents/hermes/hermes.md) | agent | Hermes | Hermes Agent by Nous Research: a direct, self-improving generalist. Learns from each task, turns repeated work into reusable skills and keeps knowledge persist… |
| [homelab-architect](agents/ecc/homelab-architect.md) | agent | ECC | Designs home and small-lab network plans from hardware inventory, goals, and operator experience level, with safe staged changes and rollback guidance. |
| [hub-coordinator](agents/claude-skills/hub-coordinator.md) | agent | Claude Skills | Coordinator for AgentHub multi-agent collaboration sessions. Dispatches N parallel subagents in isolated git worktrees via the Agent tool, monitors progress vi… |
| [java-build-resolver](agents/ecc/java-build-resolver.md) | agent | ECC | Java/Maven/Gradle build, compilation, and dependency error resolution specialist. Automatically detects Spring Boot or Quarkus and applies framework-specific f… |
| [java-reviewer](agents/ecc/java-reviewer.md) | agent | ECC | Expert Java code reviewer for Spring Boot and Quarkus projects. Automatically detects the framework and applies the appropriate review rules. Covers layered ar… |
| [kotlin-build-resolver](agents/ecc/kotlin-build-resolver.md) | agent | ECC | Kotlin/Gradle build, compilation, and dependency error resolution specialist. Fixes build errors, Kotlin compiler errors, and Gradle issues with minimal change… |
| [kotlin-reviewer](agents/ecc/kotlin-reviewer.md) | agent | ECC | Kotlin and Android/KMP code reviewer. Reviews Kotlin code for idiomatic patterns, coroutine safety, Compose best practices, clean architecture violations, and… |
| [loop-operator](agents/ecc/loop-operator.md) | agent | ECC | Operate autonomous agent loops, monitor progress, and intervene safely when loops stall. |
| [marketing-agent](agents/ecc/marketing-agent.md) | agent | ECC | Marketing strategist and copywriter for campaign planning, audience research, positioning, copy creation, and content review. Covers landing pages, email seque… |
| [memory-analyst](agents/claude-skills/memory-analyst.md) | agent | Claude Skills | Read-only analyst for `~/.claude/projects/ /memory/`. Identifies promotion candidates (entries proven enough for CLAUDE.md), stale references, consolidation op… |
| [migration-planner](agents/claude-skills/migration-planner.md) | agent | Claude Skills | Analyzes Cypress or Selenium test suites and creates a file-by-file migration plan. Invoked by /pw:migrate before conversion starts. |
| [mle-reviewer](agents/ecc/mle-reviewer.md) | agent | ECC | Production machine-learning engineering reviewer for data contracts, feature pipelines, training reproducibility, offline/online evaluation, model serving, mon… |
| [mutual-mapper](agents/ecc/mutual-mapper.md) | agent | ECC | Maps the user's social graph (X following, LinkedIn connections) against scored prospects to find mutual connections and rank them by introduction potential. |
| [network-architect](agents/ecc/network-architect.md) | agent | ECC | Designs enterprise or multi-site network architecture from requirements, using existing network skills for focused routing, validation, automation, and trouble… |
| [network-config-reviewer](agents/ecc/network-config-reviewer.md) | agent | ECC | Reviews router and switch configurations for security, correctness, stale references, risky change-window commands, and missing operational guardrails. |
| [network-troubleshooter](agents/ecc/network-troubleshooter.md) | agent | ECC | Diagnoses network connectivity, routing, DNS, interface, and policy symptoms with a read-only OSI-layer workflow and evidence-backed root cause summary. |
| [observer](agents/ecc/observer.md) | agent | ECC | Background agent that analyzes session observations to detect patterns and create instincts. Uses Haiku for cost-efficiency. v2.1 adds project-scoped instincts. |
| [office-manager](agents/claude-office/office-manager.md) | agent | Claude Office | Front-desk office manager. Reads an incoming request, picks the best specialist agent(s) from the office directory, hands the task over and reports back with a… |
| [opensource-forker](agents/ecc/opensource-forker.md) | agent | ECC | Fork any project for open-sourcing. Copies files, strips secrets and credentials (20+ patterns), replaces internal references with placeholders, generates .env… |
| [opensource-packager](agents/ecc/opensource-packager.md) | agent | ECC | Generate complete open-source packaging for a sanitized project. Produces CLAUDE.md, setup.sh, README.md, LICENSE, CONTRIBUTING.md, and GitHub issue templates.… |
| [opensource-sanitizer](agents/ecc/opensource-sanitizer.md) | agent | ECC | Verify an open-source fork is fully sanitized before release. Scans for leaked secrets, PII, internal references, and dangerous files using 20+ regex patterns.… |
| [outreach-drafter](agents/ecc/outreach-drafter.md) | agent | ECC | Generates personalized outreach messages for qualified leads. Creates warm intro requests, cold emails, X DMs, and follow-up sequences using enriched profile d… |
| [performance-optimizer](agents/ecc/performance-optimizer.md) | agent | ECC | Performance analysis and optimization specialist. Use PROACTIVELY for identifying bottlenecks, optimizing slow code, reducing bundle sizes, and improving runti… |
| [php-reviewer](agents/ecc/php-reviewer.md) | agent | ECC | Expert PHP code reviewer specializing in PSR-12 compliance, PHP type system, Eloquent ORM patterns, security, and performance. Use for all PHP code changes. MU… |
| [planner](agents/ecc/planner.md) | agent | ECC | Expert planning specialist for complex features and refactoring. Use PROACTIVELY when users request feature implementation, architectural changes, or complex r… |
| [pr-test-analyzer](agents/ecc/pr-test-analyzer.md) | agent | ECC | Review pull request test coverage quality and completeness, with emphasis on behavioral coverage and real bug prevention. |
| [presentation-claude-code](agents/best-practice/presentation-claude-code.md) | agent | Best Practice | PROACTIVELY use this agent whenever the user wants to update, modify, rearrange, or fix the CLAUDE-CODE-BEST-PRACTICE presentation (`presentation/claude-code-b… |
| [presentation-claude-gemini](agents/best-practice/presentation-claude-gemini.md) | agent | Best Practice | PROACTIVELY use this agent whenever the user wants to update, modify, rearrange, or fix the CLAUDE-GEMINI presentation (`presentation/2026-04-25-gdg-kolachi-cl… |
| [presentation-vibe-coding](agents/best-practice/presentation-vibe-coding.md) | agent | Best Practice | PROACTIVELY use this agent whenever the user wants to update, modify, or fix the VIBE-CODING presentation (`presentation/vibe-coding-to-agentic-engineering/ind… |
| [Product Manager](agents/claude-skills/product-manager.md) | agent | Claude Skills | Ships outcomes, not features. Writes specs engineers actually read. Prioritizes ruthlessly. Kills darlings when the data says so. Operates at the intersection… |
| [product-manager](agents/best-practice/product-manager.md) | agent | Best Practice | Turns a high-level ask into a crisp, exec-ready PRD with acceptance criteria and scope. |
| [python-reviewer](agents/ecc/python-reviewer.md) | agent | ECC | Expert Python code reviewer specializing in PEP 8 compliance, Pythonic idioms, type hints, security, and performance. Use for all Python code changes. MUST BE… |
| [pytorch-build-resolver](agents/ecc/pytorch-build-resolver.md) | agent | ECC | PyTorch runtime, CUDA, and training error resolution specialist. Fixes tensor shape mismatches, device errors, gradient issues, DataLoader problems, and mixed… |
| [rag-pipeline-reviewer](agents/ecc/rag-pipeline-reviewer.md) | agent | ECC | Reviews RAG (Retrieval-Augmented Generation) pipelines for retrieval quality, chunking strategy, embedding choices, and evaluation coverage. Invoke when the us… |
| [react-build-resolver](agents/ecc/react-build-resolver.md) | agent | ECC | Diagnose and fix React build failures across Vite, webpack, Next.js, CRA, Parcel, esbuild, and Bun. Handles JSX/TSX compile errors, hydration mismatches, serve… |
| [react-reviewer](agents/ecc/react-reviewer.md) | agent | ECC | Expert React/JSX code reviewer specializing in hook correctness, render performance, server/client component boundaries, accessibility, and React-specific secu… |
| [refactor-cleaner](agents/ecc/refactor-cleaner.md) | agent | ECC | Dead code cleanup and consolidation specialist. Use PROACTIVELY for removing unused code, duplicates, and refactoring. Runs analysis tools (knip, depcheck, ts-… |
| [requirement-parser](agents/best-practice/requirement-parser.md) | agent | Best Practice | Analyzes feature request descriptions and extracts structured requirements, goals, constraints, and metadata for downstream planning agents. |
| [rust-build-resolver](agents/ecc/rust-build-resolver.md) | agent | ECC | Rust build, compilation, and dependency error resolution specialist. Fixes cargo build errors, borrow checker issues, and Cargo.toml problems with minimal chan… |
| [rust-reviewer](agents/ecc/rust-reviewer.md) | agent | ECC | Expert Rust code reviewer specializing in ownership, lifetimes, error handling, unsafe usage, and idiomatic patterns. Use for all Rust code changes. MUST BE US… |
| [security-reviewer](agents/ecc/security-reviewer.md) | agent | ECC | Security vulnerability detection and remediation specialist. Use PROACTIVELY after writing code that handles user input, authentication, API endpoints, or sens… |
| [senior-software-engineer](agents/best-practice/senior-software-engineer.md) | agent | Best Practice | Pragmatic IC who plans sanely, ships small reversible slices with tests, and writes clear PRs. |
| [seo-specialist](agents/ecc/seo-specialist.md) | agent | ECC | SEO specialist for technical SEO audits, on-page optimization, structured data, Core Web Vitals, and content/keyword mapping. Use for site audits, meta tag rev… |
| [signal-scorer](agents/ecc/signal-scorer.md) | agent | ECC | Searches and ranks prospects by relevance signals across X, Exa, and LinkedIn. Assigns weighted scores based on role, industry, activity, influence, and locati… |
| [silent-failure-hunter](agents/ecc/silent-failure-hunter.md) | agent | ECC | Review code for silent failures, swallowed errors, bad fallbacks, and missing error propagation. |
| [skill-extractor](agents/claude-skills/skill-extractor.md) | agent | Claude Skills | Transforms a proven pattern or debugging solution into a standalone, portable skill package. Generates `SKILL.md` with proper frontmatter, reference docs, and… |
| [Solo Founder](agents/claude-skills/solo-founder.md) | agent | Claude Skills | Your co-founder who doesn't exist yet. Covers product, engineering, marketing, and strategy for one-person startups — because nobody's stopping you from making… |
| [spec-miner](agents/ecc/spec-miner.md) | agent | ECC | Extracts behavioral specs from existing codebases for OpenSpec. Produces flat Requirement and Invariant blocks with structured metadata (entities, enforced, id… |
| [Startup CTO](agents/claude-skills/startup-cto.md) | agent | Claude Skills | Technical co-founder who's been through two startups and learned what actually matters. Makes architecture decisions, selects tech stacks, builds engineering c… |
| [swift-build-resolver](agents/ecc/swift-build-resolver.md) | agent | ECC | Swift/Xcode build, compilation, and dependency error resolution specialist. Fixes swift build errors, Xcode build failures, SPM dependency issues, and code sig… |
| [swift-reviewer](agents/ecc/swift-reviewer.md) | agent | ECC | Expert Swift code reviewer specializing in protocol-oriented design, value semantics, ARC memory management, Swift Concurrency, and idiomatic patterns. Use for… |
| [tdd-guide](agents/ecc/tdd-guide.md) | agent | ECC | Test-Driven Development specialist enforcing write-tests-first methodology. Use PROACTIVELY when writing new features, fixing bugs, or refactoring code. Ensure… |
| [technical-cto-advisor](agents/best-practice/technical-cto-advisor.md) | agent | Best Practice | Use this agent to align technological decisions with engineering principles and organizational standards. This agent acts as a CTO, evaluating technical recomm… |
| [test-architect](agents/claude-skills/test-architect.md) | agent | Claude Skills | Plans test strategy for complex applications. Invoked by /pw:generate and /pw:coverage when the app has multiple routes, complex state, or requires a structure… |
| [test-debugger](agents/claude-skills/test-debugger.md) | agent | Claude Skills | Diagnoses flaky or failing Playwright tests using systematic taxonomy. Invoked by /pw:fix when a test needs deep analysis including running tests, reading trac… |
| [time-agent](agents/best-practice/time-agent.md) | agent | Best Practice | Use this agent to fetch the current time for Dubai, UAE (Asia/Dubai timezone, UTC+4). This agent fetches real-time Dubai time using its preloaded time-fetcher… |
| [time-agent-pkt](agents/best-practice/time-agent-pkt.md) | agent | Best Practice | Use this agent to display the current time in Pakistan Standard Time (PKT, UTC+5). (root scope — see agent-teams for Dubai time) |
| [type-design-analyzer](agents/ecc/type-design-analyzer.md) | agent | ECC | Analyze type design for encapsulation, invariant expression, usefulness, and enforcement. |
| [typescript-reviewer](agents/ecc/typescript-reviewer.md) | agent | ECC | Expert TypeScript/JavaScript code reviewer specializing in type safety, async correctness, Node/web security, and idiomatic patterns. Use for all TypeScript an… |
| [ux-designer](agents/best-practice/ux-designer.md) | agent | Best Practice | Produces a concise, accessible UX brief with flows, states, and annotations. |
| [vue-reviewer](agents/ecc/vue-reviewer.md) | agent | ECC | Expert Vue.js code reviewer specializing in Composition API correctness, reactivity pitfalls, component architecture, template security, and Vue-specific perfo… |
| [weather-agent](agents/best-practice/weather-agent.md) | agent | Best Practice | Use this agent PROACTIVELY when you need to fetch weather data for Dubai, UAE. This agent fetches real-time temperature by invoking the weather-fetcher skill v… |
| [workflow-claude-commands-agent](agents/best-practice/workflow-claude-commands-agent.md) | agent | Best Practice | Research agent that fetches Claude Code docs, reads the local commands report, and analyzes drift |
| [workflow-claude-settings-agent](agents/best-practice/workflow-claude-settings-agent.md) | agent | Best Practice | Research agent that fetches Claude Code docs, reads the local settings report, and analyzes drift |
| [workflow-claude-skills-agent](agents/best-practice/workflow-claude-skills-agent.md) | agent | Best Practice | Research agent that fetches Claude Code docs, reads the local skills report, and analyzes drift |
| [workflow-claude-subagents-agent](agents/best-practice/workflow-claude-subagents-agent.md) | agent | Best Practice | Research agent that fetches Claude Code docs, reads the local subagents report, and analyzes drift |
| [workflow-concepts-agent](agents/best-practice/workflow-concepts-agent.md) | agent | Best Practice | Research agent that fetches Claude Code docs and changelog, reads the local README CONCEPTS section, and analyzes drift |

Skills, commands and guides are listed per department in [departments/](departments/).
