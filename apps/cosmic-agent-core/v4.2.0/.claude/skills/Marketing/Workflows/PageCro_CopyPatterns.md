# CRO Copy Patterns

Reusable copy patterns for improving conversion on marketing pages. Use these as starting points when rewriting headlines, CTAs, or proof sections. Always adapt to your brand voice (see `~/.claude/AAI/USER/MARKETING/BrandVoice.md`).

## Headline Patterns

### Problem-first headline
Lead with the pain the visitor is trying to solve.

**Pattern:** [Pain point] + [resolution or promise]
**Example:** "Tired of slow queries on growing data? [Your product] handles millions of rows without breaking a sweat."
**When to use:** Homepage, product pages, campaign landing pages where the audience has a known pain.

### Outcome-first headline
Lead with the result the visitor wants to achieve.

**Pattern:** [Desired outcome] + [how/with what]
**Example:** "Ingest millions of rows per second with the tools you already know."
**When to use:** Feature pages, product pages where the capability is the differentiator.

### Audience-first headline
Lead with who this is for, creating immediate identification.

**Pattern:** [Audience identifier] + [what they get]
**Example:** "For teams running time-series at scale: the database that keeps up."
**When to use:** Campaign landing pages with a specific audience, comparison pages.

### Proof-first headline
Lead with a verifiable result that builds credibility.

**Pattern:** [Specific metric or achievement] + [context]
**Example:** "10x faster queries. 90% less storage. Same database you already know."
**When to use:** Pages targeting evaluators, pricing pages, competitive contexts.

## CTA Copy Patterns

### Action + outcome
Tell the visitor what they'll do and what they'll get.

**Strong:** "Start your free trial" / "See [your product] in action" / "Try it with your data"
**Weak:** "Get started" / "Learn more" / "Submit" / "Click here"

### Reduce commitment anxiety
Lower the perceived cost of clicking.

**Strong:** "Start free, no credit card" / "See the demo (2 min)" / "Explore the playground"
**Weak:** "Request a demo" (implies a sales call) / "Contact us" (implies waiting)

### Match the visitor's stage
Different CTAs for different evaluation stages.

| Stage | CTA tone | Examples |
|-------|----------|---------|
| Curious | Low commitment, educational | "See how it works" / "Read the case study" |
| Evaluating | Hands-on, exploratory | "Try it free" / "Compare plans" / "See the benchmark" |
| Ready | Direct, action-oriented | "Start your free trial" / "Create your account" |

### Supporting text under CTAs
A single line under the button that reduces anxiety or adds specificity.

**Examples:**
- "Free for 30 days. No credit card required."
- "Takes 30 seconds. Use the tools you already know."
- "Join 10,000+ developers building with [your product]."

## Proof Patterns

### The specific metric
Quantified results beat qualitative claims.

**Strong:** "[customer name] reduced query latency by 73% after migrating to [your product]."
**Weak:** "[customer name] saw significant performance improvements."

### The named testimonial
Real people with real titles at real companies.

**Strong:** "[Your product] handles our 2TB/day IoT ingest without breaking a sweat." -- Jane Smith, Platform Lead at [customer name]
**Weak:** "Great product, highly recommend!" -- Anonymous

### The "people like you" signal
Social proof that matches the visitor's identity.

**Strong:** "Trusted by 500+ IoT teams running this in production" (on a page about IoT use cases)
**Weak:** "Trusted by thousands of companies worldwide" (on every page, no matter the context)

### The migration story
For visitors evaluating a switch, proof that switching works.

**Strong:** "[customer name] migrated 5TB from [alternative] in a weekend. Here's how."
**Weak:** "Easy migration from any time-series database."

## Objection-Handling Patterns

### The preemptive answer
Address the objection before the visitor has to ask.

**Pattern:** [Acknowledge the concern] + [specific answer] + [proof]
**Example:** "Wondering about lock-in? [Your product] is built on open standards. Your data, your tools, your queries — they all work the same way they always have. And if you ever leave, the standard export tool works just fine."

### The comparison reframe
When the objection is really "why not stick with what I have?"

**Pattern:** [Acknowledge the current solution works] + [specific limitation it hits] + [how your product handles it differently]
**Example:** "[Incumbent solution] is great for most workloads. But when your tables hit billions of rows, the standard approach starts to slow down. [Your product] partitions automatically, so queries stay fast as your data grows."

### The FAQ that earns trust
Answer real questions with real specifics.

**Strong FAQ answers:**
- Include numbers, architecture details, or links to docs
- Acknowledge limitations honestly
- Point to case studies or benchmarks for proof

**Weak FAQ answers:**
- Generic reassurances ("We take this very seriously")
- Marketing language instead of substance
- Dodge the actual question

## Anti-Patterns to Flag

These patterns hurt conversion and should be called out in audits:

- **The "everything wall"** -- listing every feature on a single page with no hierarchy or narrative
- **The invisible CTA** -- CTA exists but is visually indistinguishable from surrounding content
- **The premature ask** -- requesting high-commitment action (demo, pricing) before establishing value
- **The jargon gate** -- using internal or category-specific terminology without context
- **The proof desert** -- making claims with zero supporting evidence on the page
- **The false urgency** -- countdown timers, "limited time" language that feels manipulative for a B2B product
- **The navigation trap** -- so many links and options that the visitor can't find the intended path
- **The mobile afterthought** -- page designed for desktop and merely shrunk for mobile, breaking the conversion flow
