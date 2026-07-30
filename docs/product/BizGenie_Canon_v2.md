# BizGenie Canon v2.0

**Document ID:** BG-DOC-001  
**Status:** Proposed — pending approval and merge  
**Scope:** Product philosophy and launch principles  
**Audience:** Product, engineering, design, operations and commercial teams  
**Change class:** Controlled product-governance document

## Authority and purpose

This proposed document is intended to become the single source of truth for BizGenie's product identity, product philosophy and launch principles after human approval and merge. It exists to keep product, design and engineering decisions aligned as the system grows.

Where an older product-positioning document conflicts with this canon, this document governs once approved and merged. Technical implementation details remain governed by approved architecture documents and Architecture Decision Records. Changes to this canon require an explicit documentation task, review through Mission Control and human approval.

This document defines direction and decision principles. It does not itself approve production code, APIs, providers, pricing, legal terms, data-governance changes or roadmap implementation.

## 1. Product Identity

BizGenie is an **AI Marketing Operating System**.

It is not merely a content generator, a collection of disconnected marketing tools or a thin interface over a model provider. It is the operating environment in which a business can understand its brand, decide what outcome it wants, plan marketing work, create and improve assets, coordinate specialist capabilities and learn from results.

The operating-system identity means BizGenie should:

- hold durable brand and business context;
- orchestrate complete marketing workflows;
- connect planning, creation, approval, distribution and learning;
- make specialist AI and human capabilities feel like one coherent product;
- preserve decisions and evidence across sessions;
- help the customer progress from intent to measurable outcome.

Individual capabilities may change. The product identity remains stable: BizGenie coordinates marketing work around the customer's brand and desired outcome.

## 2. North Star: Outcome-First

BizGenie is **outcome-first, not feature-first**.

The product begins with what the customer is trying to achieve, then assembles the smallest useful workflow to reach that outcome. Features are components of that workflow, not the organising principle of the user experience or roadmap.

An outcome-first decision answers:

1. What result is the customer trying to produce?
2. What context is needed to guide the work?
3. What is the shortest trustworthy path to completion?
4. Where does the customer need choice, approval or expertise?
5. What evidence will show whether the outcome was achieved?
6. What should BizGenie learn for the next attempt?

Product navigation, onboarding, prompts, recommendations and measurement should use the customer's language of goals and progress. Internal modules and provider boundaries should not become customer complexity.

A feature is justified when it materially improves a target outcome, reduces effort or risk, strengthens learning or makes the experience more coherent. Feature count is not a success measure.

## 3. Launch Philosophy

Build the smallest product customers will happily pay for.

"Smallest" means a focused, dependable product that completes a valuable job without avoidable surface area. It does not mean a fragile demo, an unfinished collection of features or a product that transfers essential work back to the customer.

"Happily pay for" requires:

- a clear and valuable outcome;
- a complete end-to-end path for the launch use case;
- useful output that a customer can trust and act on;
- appropriate control, review and transparency;
- a coherent experience with little operational friction;
- a credible reason to return because context and learning compound.

Launch scope should be reduced by removing optional breadth, not by breaking the core outcome loop. Every launch capability must support activation, completion, trust, retention or learning. Work that does not strengthen the paid outcome should remain outside the launch ring until evidence justifies it.

## 4. The 80/20 Integration Rule

BizGenie integrates commodity capabilities and builds only differentiators.

Commodity capabilities are functions that established services already deliver reliably and that do not create meaningful strategic advantage when recreated. Differentiators are capabilities where BizGenie's brand understanding, orchestration, learning, guidance or proprietary workflow materially improves the customer outcome.

### Integrate by default

Prefer integration when a capability:

- is widely available from mature providers;
- has high operational, compliance or maintenance cost;
- benefits from provider scale or specialist infrastructure;
- does not become more valuable merely because BizGenie owns the implementation;
- can be placed behind a replaceable boundary without degrading the product experience.

### Build deliberately

Build when the capability:

- embodies BizGenie's product identity or durable advantage;
- compounds through brand memory, outcome data or learning;
- is essential to the coherent Genie experience;
- enables orchestration that generic providers cannot supply;
- protects a critical experience, governance boundary or strategic asset.

### Decision test

Before building a capability that could be integrated, record:

1. The customer outcome it improves.
2. Why an existing provider cannot meet the requirement.
3. The differentiating knowledge or workflow BizGenie will own.
4. The full cost of building, operating and replacing it.
5. The interface that prevents lock-in and duplicate systems.

Integration does not mean a fragmented user journey. BizGenie may use specialist third-party providers behind replaceable integration boundaries, but the normal customer workflow, results, state and controls remain inside BizGenie. The customer should not be sent away to learn or manually operate third-party editing or generation tools as the normal workflow. External authentication, consent or unavoidable platform-controlled actions may briefly leave BizGenie, but the user must return to a coherent BizGenie state.

BizGenie owns the orchestration, Brand Brain context, campaign logic, instructions, approvals, asset lineage and outcome learning. Provider substitution should not materially alter the customer experience.

## 5. Brand Brain

### Purpose

The Brand Brain is BizGenie's durable, structured memory of a business and the context needed to produce consistently relevant marketing decisions and creative work.

Its purpose is to reduce repeated briefing, preserve approved brand truth, make recommendations more specific, maintain consistency across workflows and turn customer decisions and outcomes into better future guidance.

The Brand Brain is a BizGenie differentiator. It is not a transcript store, an undifferentiated vector database or permission to retain every interaction indefinitely.

### Architecture principles

The Brand Brain should be:

- **Canonical:** approved facts and rules have a clear authoritative representation.
- **Structured:** important concepts are explicit entities and relationships rather than prompt-only text.
- **Evidence-aware:** facts, inferences, recommendations and user approvals remain distinguishable.
- **Versioned:** material changes can be traced, reviewed and reversed.
- **Permissioned:** access follows tenant boundaries, purpose limitation and least privilege.
- **Portable:** provider-specific representations do not become the canonical source.
- **Replaceable at the edges:** storage, retrieval and model providers sit behind stable interfaces.
- **Outcome-linked:** learning connects work to observed results, not merely generation volume.
- **Human-governed:** material brand changes require clear user visibility and appropriate approval.
- **Progressively enriched:** the system asks only for context that improves the current outcome, then grows memory through use.

### Core conceptual entities

The following entities define the conceptual domain, not a final database schema:

- **Brand Profile:** identity, purpose, positioning, values and approved business facts.
- **Audience:** customer groups, needs, language, objections and relevant evidence.
- **Offer:** products or services, value propositions, proof, constraints and calls to action.
- **Voice:** tone, vocabulary, messaging rules, examples and prohibited patterns.
- **Visual Identity:** approved visual principles, assets, treatments and usage constraints.
- **Objective:** the outcome sought, success measure, time horizon and relevant constraints.
- **Campaign:** the coordinated plan that connects an objective, audience, offer, channels and assets.
- **Creative Asset:** a planned, generated, uploaded or approved piece of creative work and its lineage.
- **Channel Constraint:** format, policy, placement and operational requirements for a destination.
- **Decision:** an explicit customer or authorised team choice, approval, rejection or correction.
- **Evidence and Outcome:** observations that show performance, customer response or whether an assumption held.

Relationships and provenance matter as much as individual values. BizGenie must be able to explain what it knows, why it believes it and whether the customer has approved it.

### Future expansion

Future Brand Brain expansion may include richer relationship graphs, multi-brand and multi-market contexts, temporal knowledge, audience and offer learning, creative-performance patterns, reusable strategic playbooks and privacy-safe cross-campaign intelligence.

Expansion must remain evidence-led. New memory types require a defined purpose, ownership, retention rule, permission model and measurable benefit. The Brand Brain must not become an uncontrolled data lake or a second analytics system.

## 6. AI, Human and Hybrid Philosophy

BizGenie uses the right mode for the consequence, ambiguity and expertise required by the decision.

### AI

AI is appropriate for high-volume, reversible and assistive work, including:

- generating options and first drafts;
- summarising context and evidence;
- identifying patterns or inconsistencies;
- adapting approved material to formats;
- scoring against declared criteria;
- suggesting next actions;
- automating routine coordination.

AI output should expose important assumptions and uncertainty. AI may recommend but must not silently make high-consequence business, legal, privacy, pricing or production decisions.

### Human

Human judgement is appropriate when work requires accountability, taste, empathy, negotiation, ethical judgement, specialist expertise or acceptance of material risk.

Humans should own:

- final approval of consequential brand and campaign decisions;
- changes to canonical positioning or brand rules;
- legal, privacy and customer-data decisions;
- pricing and commercial commitments;
- production release and provider-replacement decisions;
- sensitive creative judgement where context cannot be safely inferred.

Human involvement should add judgement, not repetitive administration.

### Hybrid

Hybrid is the default for important creative and strategic work.

In a hybrid workflow, AI prepares, analyses, compares and recommends; the human directs, corrects, approves and remains accountable. BizGenie should preserve those corrections and approvals so future AI assistance improves.

Use hybrid when speed and scale are valuable but the result also depends on brand judgement, uncertainty or material consequence. The interface must make the handoff clear: what AI did, what evidence it used, what remains undecided and what the human is approving.

## 7. Creative Director

The Creative Director is BizGenie's guided system for helping customers produce stronger creative work. It combines preparation, observation, structured analysis and coaching while keeping the creator in control.

### Filming guidance

Before and during filming, the Creative Director should translate the desired outcome and creative brief into practical guidance such as framing, lighting, audio, pacing, delivery, shot coverage and format constraints.

Guidance should be timely and prioritised. It should help the creator complete the current take rather than overwhelm them with a technical checklist.

### Take-by-take analysis

Each take may be analysed against the approved brief and declared criteria. Analysis should identify observable strengths, specific failure modes and the smallest useful adjustment for the next take.

Comparisons should preserve context and distinguish objective checks from subjective creative judgement. The system should not present preference as fact.

### AI scoring

AI scoring is a decision aid, not an absolute measure of creative quality.

Scores must be tied to visible criteria, such as message clarity, delivery, technical quality, brand alignment, platform fit or completion of the brief. The product should explain the reason for a score, indicate uncertainty and avoid false precision.

A score must never replace customer approval or become the sole basis for a consequential decision.

### Coaching

Coaching should be constructive, specific and actionable. It should identify what to keep, what to change and what to try next. The experience should build creator confidence and capability, not merely grade performance.

Over time, coaching may adapt to the creator's preferences, prior corrections and demonstrated strengths, subject to consent and the Brand Brain's governance rules.

## 8. Genie UX

The Genie is the persistent orchestration and guidance layer of BizGenie.

### Floating Genie

The Genie should be accessible throughout the product without obstructing the task. It carries relevant context across the journey and provides a consistent place to ask for help, review progress or take the next action.

The floating presence is a product behaviour, not a requirement that every screen use the same visual treatment. Accessibility, focus and screen context govern presentation.

### Behaviour

The Genie should be:

- context-aware but explicit about important assumptions;
- concise by default and detailed on demand;
- action-oriented, offering a clear next step;
- transparent about AI-generated recommendations;
- respectful of user control and dismissible guidance;
- consistent with approved brand and workflow context;
- calm, encouraging and free from manipulative urgency.

### Proactive assistance

The Genie may proactively surface help when there is a clear opportunity to reduce friction, prevent an error, recover a stalled workflow or improve the target outcome.

Proactivity must be relevant, explainable and proportionate. Repeated dismissal should reduce similar prompts. The Genie must not create work merely to demonstrate activity.

### Notifications

Notifications should report meaningful state changes, required decisions, risks or completed work. They should be prioritised, grouped where appropriate and linked to a clear action.

Notification volume is not engagement. Users should be able to control non-essential notifications, while critical operational or security messages remain appropriately visible.

### Onboarding

Onboarding should lead the customer to an early valuable outcome while establishing only the minimum Brand Brain context required for that outcome.

BizGenie should progressively gather context through useful work rather than demand a complete brand setup before value is visible.

### Guidance

Guidance should appear at the point of need, use plain language and explain why an action matters. The Genie should reveal complexity progressively and keep advanced control available without making it the default path.

## 9. Product Principles

### The user never leaves BizGenie

The customer should be able to complete the intended workflow from within BizGenie. External providers and platforms may perform specialised work behind integrations, but their operational complexity should not fragment the primary experience.

Exceptions such as external authentication, legally required consent or platform-controlled actions must return the user to a coherent BizGenie state.

### Outcome-first navigation

Navigation should organise work around goals, progress and decisions rather than provider names or internal modules.

### Continuous learning

BizGenie should learn from explicit feedback, approvals, corrections and observed outcomes. Learning must be measurable, permissioned and reversible where appropriate.

### Brand memory

Approved brand context should persist and improve consistency across workflows. Memory must preserve provenance, tenant isolation and user control.

### Orchestration over recreation

BizGenie should coordinate the best available capabilities around the customer outcome. It should not rebuild commodity infrastructure without a documented differentiating reason.

## 10. Three-Ring Roadmap

The roadmap is organised into three rings. Rings express sequencing and decision boundaries, not automatic commitments to named features.

### Ring 1: Launch

The launch ring contains only what is required to deliver the smallest complete outcome customers will happily pay for.

A launch item must:

- support the primary paid customer outcome;
- complete or protect the end-to-end workflow;
- be dependable enough for real use;
- establish essential brand context, guidance, control or learning;
- have a clear acceptance measure.

Launch rejects optional breadth, duplicate systems and speculative platform work.

### Locked Launch Capability Boundary

Ring 1 is complete only when a paying customer can move through one coherent BizGenie journey that supports:

- sign-up, authentication and subscription management;
- creation and progressive enrichment of a Brand Brain;
- campaign creation around a business objective;
- generation of scripts, written content, AI images and AI video;
- upload of human-created UGC and existing media;
- selection of AI, Human or Hybrid creation modes, including combining human footage with AI-generated assets;
- essential editing and enhancement: platform-specific aspect ratios and format changes, captions and subtitles, music, voice-over, trimming, sequencing, repurposing, and AI regeneration or replacement of selected elements;
- content review and approval;
- scheduling and publishing to supported social platforms;
- lightweight but commercially useful campaign, content, publishing, engagement, credit and subscription analytics;
- completion of the primary workflow within the BizGenie experience, with contextual guidance from the floating Genie.

This boundary defines customer capabilities, not providers, APIs, schemas, screen layouts or technical implementation.

### Ring 2: 90 Days

The 90-day ring improves the launch product using evidence from real customer behaviour and operating performance.

Priority belongs to work that:

- removes demonstrated activation or completion friction;
- improves quality, trust, retention or measurable outcomes;
- strengthens the Brand Brain with governed learning;
- reduces material cost, latency, failure or manual operation;
- expands an adjacent workflow validated by customer evidence.

Items move into this ring through evidence and Mission Control review, not enthusiasm alone.

### Ring 3: Future Vision

The future-vision ring contains strategic possibilities that may extend BizGenie toward a broader AI Marketing Operating System.

It may explore richer orchestration, deeper Brand Brain intelligence, broader creative direction, new channels, specialist human collaboration and more advanced outcome measurement. These are hypotheses until validated.

Future vision must not silently determine launch architecture. Architecture may preserve reasonable extension points, but present scope should not pay the full cost of unvalidated future capability.

### Post-launch scope protection

Unless a direct dependency on the locked launch journey is proven, the unified inbox, advanced cross-platform social engagement management, deep sales attribution, influencer marketplace, agency and white-label features, broad CRM integrations, enterprise reporting, and a marketplace or plugin ecosystem sit outside the mandatory launch boundary. They remain valid candidates for the 90-day or future-vision rings and must not become launch blockers without evidence and Mission Control approval.

## 11. No-Drift Rules

### Mission Control compliance

Every material product or engineering change must use the applicable Mission Control task, evidence and approval process. Work is not complete because output exists; it is complete when the agreed evidence and review gates are satisfied.

### Canon compliance

Tasks, designs and Architecture Decision Records must identify any relevant canon principle. A deliberate exception requires explicit rationale and approval. Canon changes must be made in this document, not implied through implementation.

### Architecture Decision Records

A material, difficult-to-reverse technical choice requires an Architecture Decision Record that states context, options, decision, consequences and relationship to this canon.

An ADR may implement the canon but may not silently redefine product philosophy.

### No duplicate systems

Before creating a service, store, workflow, schema, provider adapter or source of truth, teams must inspect the existing architecture. Extend or replace deliberately. Do not create parallel authorities for the same concern.

### No unnecessary rebuilds

Apply the 80/20 Integration Rule. Rebuilding a commodity capability requires a documented customer outcome, differentiating reason, lifecycle cost and approval.

### Drift response

When drift is discovered:

1. Stop further unapproved expansion.
2. Record the conflict and affected work.
3. Determine whether implementation or canon should change.
4. Create the smallest explicit task or ADR needed.
5. Obtain the required human approval.
6. Preserve the decision and evidence in Mission Control.

## Canon review

This canon should be reviewed when product identity, launch strategy or a foundational operating principle is intentionally reconsidered. Routine feature changes do not require a canon revision unless they introduce a conflict.

The canon is a constraint that protects coherence, not a substitute for customer evidence. Evidence may justify a change; it must not cause an undocumented one.
