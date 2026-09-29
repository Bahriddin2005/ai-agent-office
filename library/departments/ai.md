# 🧠 AI & ML Lab — Sunʼiy intellekt laboratoriyasi

108 items in this department.

| Name | Type | Source | What it does |
|---|---|---|---|
| [agent-evaluator](../agents/ecc/agent-evaluator.md) | agent | ECC | Evaluates agent output against 5-axis quality rubric (accuracy, completeness, clarity, actionability, conciseness). Use after any non-trivial task when the use… |
| [cs-deep-learning-tutor](../agents/claude-skills/cs-deep-learning-tutor.md) | agent | Claude Skills | Study companion for the Deep Learning textbook (Goodfellow, Bengio & Courville, 2016). Plans a prerequisite-closed reading path, answers chapter questions from… |
| [cs-spinning-up-deep-rl](../agents/claude-skills/cs-spinning-up-deep-rl.md) | agent | Claude Skills | Answers from the knowledge base compiled from Spinning Up in Deep RL by Joshua Achiam (OpenAI). Loads the master frameworks first and reads a single chapter fi… |
| [experiment-runner](../agents/claude-skills/experiment-runner.md) | agent | Claude Skills | Runs one iteration of an autoresearch experiment loop. Reads experiment state from .autoresearch/{domain}/{name}/, makes exactly ONE change to the target file,… |
| [gan-evaluator](../agents/ecc/gan-evaluator.md) | agent | ECC | GAN Harness — Evaluator agent. Tests the live running application via Playwright, scores against rubric, and provides actionable feedback to the Generator. |
| [gan-generator](../agents/ecc/gan-generator.md) | agent | ECC | GAN Harness — Generator agent. Implements features according to the spec, reads evaluator feedback, and iterates until quality threshold is met. |
| [gan-planner](../agents/ecc/gan-planner.md) | agent | ECC | GAN Harness — Planner agent. Expands a one-line prompt into a full product specification with features, sprints, evaluation criteria, and design direction. |
| [hermes](../agents/hermes/hermes.md) | agent | Hermes | Hermes Agent by Nous Research: a direct, self-improving generalist. Learns from each task, turns repeated work into reusable skills and keeps knowledge persist… |
| [memory-analyst](../agents/claude-skills/memory-analyst.md) | agent | Claude Skills | Read-only analyst for `~/.claude/projects/ /memory/`. Identifies promotion candidates (entries proven enough for CLAUDE.md), stale references, consolidation op… |
| [mle-reviewer](../agents/ecc/mle-reviewer.md) | agent | ECC | Production machine-learning engineering reviewer for data contracts, feature pipelines, training reproducibility, offline/online evaluation, model serving, mon… |
| [multi-agent-debate](../agents/agents-500/multi-agent-debate.md) | agent | 500 Agents | Two AI agents debate any topic with an AI judge scoring the outcome |
| [rag-pipeline-reviewer](../agents/ecc/rag-pipeline-reviewer.md) | agent | ECC | Reviews RAG (Retrieval-Augmented Generation) pipelines for retrieval quality, chunking strategy, embedding choices, and evaluation coverage. Invoke when the us… |
| [accelerate](../skills/hermes/accelerate/SKILL.md) | skill | Hermes | Run PyTorch training across GPUs with minimal changes. |
| [actual-setup](../skills/hermes/actual-setup/SKILL.md) | skill | Hermes | Set up Actual Computer (actual.inc) inference in Hermes. |
| [add-llm-provider](../skills/pi/add-llm-provider/SKILL.md) | skill | Pi | Checklist for adding a new LLM provider to packages/ai. Covers core types, provider implementation, lazy registration, model generation, the full test matrix,… |
| [agent-eval](../skills/ecc/agent-eval/SKILL.md) | skill | ECC | Head-to-head comparison of coding agents (Claude Code, Aider, Codex, etc.) on custom tasks with pass rate, cost, time, and consistency metrics. Use when choosi… |
| [agent-introspection-debugging](../skills/ecc/agent-introspection-debugging/SKILL.md) | skill | ECC | Structured self-debugging workflow for AI agent failures using capture, diagnosis, contained recovery, and introspection reports. Use when an agent run fails a… |
| [agent-merge-conflict-arbiter](../skills/hermes/agent-merge-conflict-arbiter/SKILL.md) | skill | Hermes | Neutral arbiter for merge conflicts between two agents. |
| [agent-self-evaluation](../skills/ecc/agent-self-evaluation/SKILL.md) | skill | ECC | Use after completing any non-trivial task. The agent self-rates its output on 5 axes — accuracy, completeness, clarity, actionability, conciseness — with concr… |
| [agentic-engineering](../skills/ecc/agentic-engineering/SKILL.md) | skill | ECC | Operate as an agentic engineer using eval-first execution, decomposition, and cost-aware model routing. Use when planning or executing engineering work that ag… |
| [agentic-os](../skills/ecc/agentic-os/SKILL.md) | skill | ECC | Build persistent multi-agent operating systems on Claude Code. Covers kernel architecture, specialist agents, slash commands, file-based memory, scheduled auto… |
| [ai-act-readiness](../skills/claude-skills/ai-act-readiness/SKILL.md) | skill | Claude Skills | /cs:ai-act-readiness — EU AI Act 6-question forcing interrogation. Use during AI-system intake, before EU deployment, or during annual compliance refresh as Ar… |
| [ai-first-engineering](../skills/ecc/ai-first-engineering/SKILL.md) | skill | ECC | Engineering operating model for teams where AI agents generate a large share of implementation output. Use when setting team process, review gates, or ownershi… |
| [ai-regression-testing](../skills/ecc/ai-regression-testing/SKILL.md) | skill | ECC | Regression testing strategies for AI-assisted development. Sandbox-mode API testing without database dependencies, automated bug-check workflows, and patterns… |
| [ai-security](../skills/claude-skills/ai-security/SKILL.md) | skill | Claude Skills | Use when assessing AI/ML systems for prompt injection, jailbreak vulnerabilities, model inversion risk, data poisoning exposure, or agent tool abuse. Covers MI… |
| [antigravity-cli](../skills/hermes/antigravity-cli/SKILL.md) | skill | Hermes | Operate the Antigravity CLI (agy): plugins, auth, sandbox. |
| [autonomous-agent-harness](../skills/ecc/autonomous-agent-harness/SKILL.md) | skill | ECC | Transform Claude Code into a fully autonomous agent system with persistent memory, scheduled operations, computer use, and task queuing. Replaces standalone ag… |
| [axolotl](../skills/hermes/axolotl/SKILL.md) | skill | Hermes | Axolotl: YAML LLM fine-tuning (LoRA, DPO, GRPO). |
| [blackbox](../skills/hermes/blackbox/SKILL.md) | skill | Hermes | Delegate coding tasks to the Blackbox AI multi-model CLI. |
| [chroma](../skills/hermes/chroma/SKILL.md) | skill | Hermes | Embedding database for RAG and semantic search. |
| [claude-coach](../skills/claude-skills/claude-coach/SKILL.md) | skill | Claude Skills | Personal coach that teaches users to become Claude power users. Use this skill the FIRST time a user asks to "learn Claude", "be a power user", "coach me", "te… |
| [clip](../skills/hermes/clip/SKILL.md) | skill | Hermes | Zero-shot image classification and image-text search. |
| [codehealth-mcp](../skills/ecc/codehealth-mcp/SKILL.md) | skill | ECC | Real-time structural Code Health via CodeScene MCP — review before edits, verify score deltas after changes, gate commits and PRs. Use when reviewing code qual… |
| [codex](../skills/hermes/codex/SKILL.md) | skill | Hermes | Delegate coding to OpenAI Codex CLI (features, PRs). |
| [computer-use](../skills/hermes/computer-use/SKILL.md) | skill | Hermes | Drive the desktop background-first; escalate on signal. |
| [cost-aware-llm-pipeline](../skills/ecc/cost-aware-llm-pipeline/SKILL.md) | skill | ECC | Cost optimization patterns for LLM API usage — model routing by task complexity, budget tracking, retry logic, and prompt caching. Use when LLM spend needs to… |
| [council-multi-model](../skills/ecc/council-multi-model/SKILL.md) | skill | ECC | Add one optional external Codex critique after the existing council has produced a decision draft. Use when an ambiguous, high-consequence decision would benef… |
| [counterparty-channel-discipline](../skills/ecc/counterparty-channel-discipline/SKILL.md) | skill | ECC | Per-channel strict prompts, mention gating, silent observation, and a communication autonomy policy for agents that sit in shared channels with external counte… |
| [cross-eval](../skills/claude-skills/cross-eval/SKILL.md) | skill | Claude Skills | /cs:cross-eval — Multi-model consensus on a board memo or strategy brief. Claude + Codex + Gemini cross-review with graceful degradation. Use when a high-stake… |
| [dspy](../skills/hermes/dspy/SKILL.md) | skill | Hermes | DSPy: declarative LM programs, auto-optimize prompts, RAG. |
| [eu-ai-act-specialist](../skills/claude-skills/eu-ai-act-specialist/SKILL.md) | skill | Claude Skills | EU AI Act (Regulation (EU) 2024/1689) operational compliance for compliance teams. Three Article-level decisions: (1) What's the risk tier of this AI system —… |
| [eval](../skills/claude-skills/eval/SKILL.md) | skill | Claude Skills | Evaluate and rank agent results by metric or LLM judge for an AgentHub session. Use when the user runs /hub:eval or asks to score, compare, or pick a winner am… |
| [eval-harness](../skills/ecc/eval-harness/SKILL.md) | skill | ECC | Eval-driven development (EDD) framework for AI coding sessions — define capability and regression evals before coding, grade with code-based, model-based, rule… |
| [evaluating-llms-harness](../skills/hermes/evaluating-llms-harness/SKILL.md) | skill | Hermes | lm-eval-harness: benchmark LLMs (MMLU, GSM8K, etc.). |
| [faiss](../skills/hermes/faiss/SKILL.md) | skill | Hermes | Fast vector similarity search at billion scale. |
| [fal-ai-media](../skills/ecc/fal-ai-media/SKILL.md) | skill | ECC | Unified media generation via fal.ai MCP — image, video, and audio. Covers text-to-image (Nano Banana), text/image-to-video (Seedance, Kling, Veo 3), text-to-sp… |
| [fastmcp](../skills/hermes/fastmcp/SKILL.md) | skill | Hermes | Build, test, and deploy Python MCP servers. |
| [flash-attention](../skills/hermes/flash-attention/SKILL.md) | skill | Hermes | Speed up long-sequence transformer training and inference. |
| [foundation-models-on-device](../skills/ecc/foundation-models-on-device/SKILL.md) | skill | ECC | Apple FoundationModels framework for on-device LLM — text generation, guided generation with @Generable, tool calling, and snapshot streaming in iOS 26+. Use w… |
| [gan-style-harness](../skills/ecc/gan-style-harness/SKILL.md) | skill | ECC | GAN-inspired Generator-Evaluator agent harness for building high-quality applications autonomously. Based on Anthropic's March 2026 harness design paper. Use w… |
| [guidance](../skills/hermes/guidance/SKILL.md) | skill | Hermes | Constrain LLM output with grammars; guarantee valid JSON. |
| [healthcare-eval-harness](../skills/ecc/healthcare-eval-harness/SKILL.md) | skill | ECC | Patient safety evaluation harness for healthcare application deployments. Automated test suites for CDSS accuracy, PHI exposure, clinical workflow integrity, a… |
| [hermes-agent](../skills/hermes/hermes-agent/SKILL.md) | skill | Hermes | Use, configure, theme, extend, and orchestrate Hermes Agent. |
| [honcho](../skills/hermes/honcho/SKILL.md) | skill | Hermes | Configure and troubleshoot Honcho memory for Hermes. |
| [huggingface-hub](../skills/hermes/huggingface-hub/SKILL.md) | skill | Hermes | HuggingFace hf CLI: search/download/upload models, datasets. |
| [huggingface-tokenizers](../skills/hermes/huggingface-tokenizers/SKILL.md) | skill | Hermes | Fast BPE/WordPiece tokenization and custom vocab training. |
| [inference-sh-cli](../skills/hermes/inference-sh-cli/SKILL.md) | skill | Hermes | Run 150+ AI apps (image, video, LLM) via inference.sh CLI. |
| [inherit-legacy-style](../skills/ecc/inherit-legacy-style/SKILL.md) | skill | ECC | Prevent AI style drift on legacy projects by scanning the codebase for implicit conventions, resolving conflicts with the operator one at a time, and writing a… |
| [instructor](../skills/hermes/instructor/SKILL.md) | skill | Hermes | Structured LLM outputs validated with Pydantic. |
| [ito-inference](../skills/ecc/ito-inference/SKILL.md) | skill | ECC | Inspect the availability of model serving on a completed Itô compute booking and, when the canonical backend becomes available, hand off an explicitly confirme… |
| [ito-training](../skills/ecc/ito-training/SKILL.md) | skill | ECC | Inspect the availability of ML training on a completed Itô compute booking and, when the canonical backend becomes available, hand off an explicitly confirmed… |
| [lambda-labs](../skills/hermes/lambda-labs/SKILL.md) | skill | Hermes | On-demand GPU cloud instances for ML training. |
| [llama-cpp](../skills/hermes/llama-cpp/SKILL.md) | skill | Hermes | llama.cpp local GGUF inference + HF Hub model discovery. |
| [llava](../skills/hermes/llava/SKILL.md) | skill | Hermes | Vision-language chat: VQA, captioning, image dialogue. |
| [llm-cost-optimizer](../skills/claude-skills/llm-cost-optimizer/SKILL.md) | skill | Claude Skills | Use proactively whenever LLM API costs come up -- or should. Triggers include: 'my AI costs are too high', 'optimize token usage', 'which model should I use',… |
| [llm-trading-agent-security](../skills/ecc/llm-trading-agent-security/SKILL.md) | skill | ECC | Security patterns for autonomous trading agents with wallet or transaction authority. Covers prompt injection, spend limits, pre-send simulation, circuit break… |
| [mcp-oauth-remote-gateway](../skills/hermes/mcp-oauth-remote-gateway/SKILL.md) | skill | Hermes | Manual OAuth for remote MCP servers on headless gateways. |
| [mcporter](../skills/hermes/mcporter/SKILL.md) | skill | Hermes | List, auth, and call MCP servers/tools from the terminal. |
| [ml-adoption-playbook](../skills/ecc/ml-adoption-playbook/SKILL.md) | skill | ECC | End-to-end methodology for AI agents and software engineers to add machine learning algorithms to existing non-ML codebases. Covers problem framing, data readi… |
| [mle-workflow](../skills/ecc/mle-workflow/SKILL.md) | skill | ECC | Production machine-learning engineering workflow for data contracts, reproducible training, model evaluation, deployment, monitoring, and rollback. Use when bu… |
| [nemo-curator](../skills/hermes/nemo-curator/SKILL.md) | skill | Hermes | Curate LLM training data: dedupe, filter, PII redaction. |
| [obliteratus](../skills/hermes/obliteratus/SKILL.md) | skill | Hermes | OBLITERATUS: abliterate LLM refusals (diff-in-means). |
| [openclaw-persona-forge](../skills/ecc/openclaw-persona-forge/SKILL.md) | skill | ECC | 为 OpenClaw AI Agent 锻造完整的龙虾灵魂方案。根据用户偏好或随机抽卡， 输出身份定位、灵魂描述(SOUL.md)、角色化底线规则、名字和头像生图提示词。 如当前环境提供已审核的生图 skill，可自动生成统一风格头像图片。 当用户需要创建、设计或定制 OpenClaw 龙虾灵魂时使用。 不适用于：微… |
| [openhands](../skills/hermes/openhands/SKILL.md) | skill | Hermes | Delegate coding to OpenHands CLI (model-agnostic, LiteLLM). |
| [outlines](../skills/hermes/outlines/SKILL.md) | skill | Hermes | Outlines: structured JSON/regex/Pydantic LLM generation. |
| [peft](../skills/hermes/peft/SKILL.md) | skill | Hermes | Fine-tune large LLMs with LoRA on limited GPU memory. |
| [pinecone](../skills/hermes/pinecone/SKILL.md) | skill | Hermes | Managed vector DB for production RAG and search. |
| [prompt-engineer-toolkit](../skills/claude-skills/prompt-engineer-toolkit/SKILL.md) | skill | Claude Skills | Turns marketing prompts into tested, versioned production assets: A/B prompt evaluation against structured test cases, immutable prompt version history with di… |
| [prompt-governance](../skills/claude-skills/prompt-governance/SKILL.md) | skill | Claude Skills | Use when managing prompts in production at scale: versioning prompts, running A/B tests on prompts, building prompt registries, preventing prompt regressions,… |
| [prompt-optimizer](../skills/ecc/prompt-optimizer/SKILL.md) | skill | ECC | Analyze draft prompts, detect intent and missing context, match ECC commands, skills, and agents, and output a ready-to-paste optimized prompt with diagnosis a… |
| [pytorch-fsdp](../skills/hermes/pytorch-fsdp/SKILL.md) | skill | Hermes | Fully sharded data-parallel training for large models. |
| [pytorch-lightning](../skills/hermes/pytorch-lightning/SKILL.md) | skill | Hermes | Clean training loops with built-in distributed support. |
| [pytorch-patterns](../skills/ecc/pytorch-patterns/SKILL.md) | skill | ECC | PyTorch deep learning patterns and best practices for building robust, efficient, and reproducible training pipelines, model architectures, and data loading. U… |
| [qdrant](../skills/hermes/qdrant/SKILL.md) | skill | Hermes | Vector search engine for production RAG systems. |
| [regex-vs-llm-structured-text](../skills/ecc/regex-vs-llm-structured-text/SKILL.md) | skill | ECC | Decision framework for parsing structured text (quizzes, forms, invoices, receipts, tables) with a hybrid regex-first pipeline — regex extraction handles 95%+… |
| [saelens](../skills/hermes/saelens/SKILL.md) | skill | Hermes | Train sparse autoencoders to interpret model features. |
| [scholar-evaluation](../skills/ecc/scholar-evaluation/SKILL.md) | skill | ECC | Structured scholarly-work evaluation for papers, proposals, literature reviews, methods sections, evidence quality, citation support, and research-writing feed… |
| [segment-anything-model](../skills/hermes/segment-anything-model/SKILL.md) | skill | Hermes | SAM: zero-shot image segmentation via points, boxes, masks. |
| [self-eval](../skills/claude-skills/self-eval/SKILL.md) | skill | Claude Skills | Honestly evaluate AI work quality using a two-axis scoring system. Use after completing a task, code review, or work session to get an unbiased assessment. Det… |
| [serving-llms-vllm](../skills/hermes/serving-llms-vllm/SKILL.md) | skill | Hermes | vLLM: high-throughput LLM serving, OpenAI API, quantization. |
| [simpo](../skills/hermes/simpo/SKILL.md) | skill | Hermes | Reference-free preference alignment, simpler than DPO. |
| [slime](../skills/hermes/slime/SKILL.md) | skill | Hermes | RL post-training for LLMs with Megatron and SGLang. |
| [stable-diffusion](../skills/hermes/stable-diffusion/SKILL.md) | skill | Hermes | Text-to-image generation, inpainting, and img2img. |
| [tensorrt-llm](../skills/hermes/tensorrt-llm/SKILL.md) | skill | Hermes | High-throughput LLM inference on NVIDIA GPUs. |
| [torchtitan](../skills/hermes/torchtitan/SKILL.md) | skill | Hermes | Pretrain LLMs at scale with PyTorch 4D parallelism. |
| [trl-fine-tuning](../skills/hermes/trl-fine-tuning/SKILL.md) | skill | Hermes | TRL: SFT, DPO, GRPO, RLOO reward modeling for LLM RLHF. |
| [unreal-mcp](../skills/hermes/unreal-mcp/SKILL.md) | skill | Hermes | Automate Unreal Engine editor scenes, actors, and renders. |
| [unsloth](../skills/hermes/unsloth/SKILL.md) | skill | Hermes | Unsloth: 2-5x faster LoRA/QLoRA fine-tuning, less VRAM. |
| [weights-and-biases](../skills/hermes/weights-and-biases/SKILL.md) | skill | Hermes | W&B: log ML experiments, sweeps, model registry, dashboards. |
| [whisper](../skills/hermes/whisper/SKILL.md) | skill | Hermes | Transcribe and translate speech in 99 languages. |
| [cs-spinning-up-deep-rl](../commands/claude-skills/cs-spinning-up-deep-rl.md) | command | Claude Skills | /cs:spinning-up-deep-rl [topic \| framework \| chNN] — query the knowledge base compiled from Spinning Up in Deep RL by Joshua Achiam (OpenAI). Use when applying… |
| [gan-build](../commands/ecc/gan-build.md) | command | ECC | Run a generator/evaluator build loop for implementation tasks with bounded iterations and scoring. |
| [learn-eval](../commands/ecc/learn-eval.md) | command | ECC | Extract reusable patterns from the session, self-evaluate quality before saving, and determine the right save location (Global vs Project). |
| [model-route](../commands/ecc/model-route.md) | command | ECC | Recommend the best model tier for the current task based on complexity, risk, and budget. |
| [multi-execute](../commands/ecc/multi-execute.md) | command | ECC | Execute a multi-model implementation plan while preserving Claude as the only filesystem writer. |
| [claude-mcp](../guides/best-practice/claude-mcp.md) | guide | Best Practice | MCP (Model Context Protocol) servers extend Claude Code with connections to external tools, databases, and APIs. This guide covers recommended servers for dail… |
| [hermes-readme](../guides/hermes/hermes-readme.md) | guide | Hermes | Overview of NousResearch/hermes-agent: what it contains and how to install and use it. |
| [pi-readme](../guides/pi/pi-readme.md) | guide | Pi | Overview of earendil-works/pi: what it contains and how to install and use it. |
