---
checklist_binding: required
consumes_sections: ["01-usp", "02-claims-proof", "03-target-audience", "04-mechanism", "05-why-cubed", "06-appeal", "07-features-benefits", "08-promise", "09-hook", "10-headlines", "11-big-four", "12-pain-list", "13-vision-list", "14-usp-iteration-1", "15-usp-iteration-2", "16-usp-iteration-3", "17-usp-iteration-4", "18-usp-iteration-5"]
produced_by: Marketing skill (v4.2.0/.claude/skills/Marketing/)
---

> **CHECKLIST BINDING (REQUIRED)**
>
> Before applying this template, resolve the project-root per
> `CHECKLIST_CONVENTION.md` and load the filled copy platform at
> `{project-root}/copyplatforms/{client}/{product}/{version}/`.
> Use the latest version unless the user names a specific one.
>
> The checklist is produced by running the Marketing skill's Q&A
> framework with the user. ALL foundational content comes from the
> user through that Q&A — never from the LLM.
>
> Core Frameworks is foundational — it applies across ALL 18
> sections, so Copywriting workflows that invoke any framework
> from this file must have read all 18 section files. Do NOT
> invent, substitute, speculate, or pattern-match.
>
> If the checklist directory is missing OR any required section
> file is empty: STOP. Instruct the user to run the Marketing
> skill to complete the checklist via Q&A. Do NOT proceed with
> partial content. Do NOT fill gaps with plausible-looking text.
>
> Required: ALL 18 section files (`01-usp.md` through `18-usp-iteration-5.md`).

---

# Core Frameworks

> The foundational conceptual frameworks that apply across ALL sections of the copy platform. Every copy platform section (1-18) operates under these three frameworks simultaneously. Read this before executing the Expanding phase of `CopyPlatform.md`.

---

## 1. Fractal AIDA Pattern

Every level of writing must follow the AIDA pattern (Attention → Interest → Desire → Action):

- **Individual sentences contain micro-AIDA** — each sentence has its own attention grab, interest anchor, desire amplifier, and implicit action
- **Paragraphs contain sentence-level AIDA** — paragraphs sequence sentences through the full arc
- **Sections contain paragraph-level AIDA** — each section of a piece of copy is itself a complete AIDA cycle
- **Pieces contain section-level AIDA** — the whole ad, email, landing page, or VSL is an AIDA arc from first line to CTA
- **Funnels contain piece-level AIDA** — the ad → lander → page → offer sequence is an AIDA arc at the campaign level

AIDA is fractal. Break it at any level and the copy leaks attention.

---

## 2. Emotional-Logical Balance (Per AIDA Stage)

Each AIDA stage has a specific emotional-to-logical ratio. Copy that violates these ratios feels "off" even if technically well-written.

| Stage | Emotional | Logical | Why |
|-------|-----------|---------|-----|
| **A (Attention)** | 80% | 20% | Pattern interrupt is emotional first; logic only frames what they're seeing |
| **I (Interest)** | 60% | 40% | The emotional hook has to hold, but now logical foundation starts |
| **D (Desire)** | 40% | 60% | Emotion amplifies want; logic justifies the purchase to the rational self |
| **A (Action)** | 90% | 10% | At the moment of commitment, emotional urgency dominates; logical reassurance is a safety net |

**Rule of thumb:** If a piece of copy feels "dry," check whether you're over-logical at Attention or Action. If it feels "manipulative," check whether you're over-emotional at Desire.

---

## 3. Advertisement Specific Guidelines

Every ad, email, or short-form piece follows these construction rules:

- **Each sentence must be self-contained yet connected.** A reader who skims still gets the arc.
- **First sentence:** Pattern-interrupt + emotional spike. Break their current train of thought.
- **Middle sentences:** Problem-agitation + solution-hint. Expand the gap between current and desired state.
- **Final sentence:** Clear, urgent call-to-action. Unambiguous next step.
- **Use sensory and emotional language.** Specific, visceral, tangible. "Burning" not "uncomfortable."
- **Create immediate relevance.** The prospect should recognize themselves in the first sentence.

---

## How These Frameworks Interact

The three frameworks are layered:

1. **Fractal AIDA** tells you WHAT to put at each level (attention, interest, desire, action)
2. **Emotional-Logical Balance** tells you HOW much of each (the ratio for that stage)
3. **Advertisement Guidelines** tell you the CONSTRUCTION RULES (sentence-level craft)

When expanding a copy platform section, run the output through all three:
- Does it follow AIDA at the appropriate level?
- Does the emotional-logical ratio match the stage?
- Does it obey the sentence construction rules?

If any of the three fails, the copy will underperform regardless of how well the others are executed.

---

## Referenced By

- `CopyPlatformSections.md` — every section operates under these frameworks during expansion
- `CopyPlatform.md` workflow Phase 3 (Expanding) — apply these when expanding any section
- `ContentWriter.md` workflow — apply these when writing final copy
- `SalesStory.md` workflow — apply these to story beats

Cross-reference with:
- `AIDAFramework.md` — detailed AIDA application per component (headline, lead, body, CTA)
- `TenAgreements.md` — the 10 agreements overlay on top of these frameworks
- `EmotionalTriggers.md` — specific emotions to activate at each AIDA stage

---

## Failure Mode — Missing or Incomplete Checklist

If any required section file (1-18) is missing or empty, STOP work
and instruct the user to run the Marketing skill to build the
checklist via Q&A. Never synthesize content to fill gaps. Never
pattern-match from memory or prior sessions — foundational content
comes from the user, only from the user, for this specific offer.
