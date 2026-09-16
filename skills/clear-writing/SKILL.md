---
name: clear-writing
description: Writes and edits clear, active, front-loaded prose for messages, reports, technical explainers, controlled-English docs, and agent-facing instructions. Use for Slack or email drafts, customer-facing updates, documentation, explanation repair, technical precision, AGENTS.md, CLAUDE.md, and skill writing.
user-invokable: true
args:
  - name: target
    description: The document or text to write or rewrite (optional)
    required: false
---

# Clear writing

Write so the reader understands the first time without losing substance, nuance or technical precision. Open the content up. Do not dumb it down.

Use this skill as Chinh's default writing skill. It combines:

- plain-English style inspired by GOV.UK and GDS guidance
- customer-facing Slack and presales writing
- technical explanation and controlled-English precision
- agent-facing documents, including skills, `AGENTS.md` and `CLAUDE.md`

## Choose the writing mode

Start by choosing the mode that matches the requested output. Combine modes only when the output genuinely needs them.

| Mode | Use for | What to load |
| --- | --- | --- |
| Plain English | reports, guidance, summaries, status notes and general prose | this file |
| Customer-facing | Slack messages, emails, presales replies and product-gap updates | this file |
| Technical explanation | explainers, teaching prose, talks, scripts or repairing an explanation that did not land | `reference/technical-precision.md` |
| Controlled English | procedures, troubleshooting, runbooks, specifications, safety instructions, translation-ready docs, product or developer documentation | `reference/technical-precision.md` |
| Agent-facing writing | skills, `AGENTS.md`, `CLAUDE.md`, context pointers and documents agents consume | `reference/writing-for-agents.md`; for skills also read `reference/skill-mechanics.md` |

Completion criterion: the mode is explicit in your own mind, and the output applies that mode instead of mixing every rule mechanically.

## Core content design principles

- Start from the user need. Write what the reader needs to know to do or decide something.
- Front-load the answer, recommendation or honest status.
- Put one idea in each sentence and one topic in each paragraph.
- Be specific and concrete. Give the number, name, date, command, product behaviour or next action.
- Cut everything that does not add meaning. Remove duplication.
- Preserve technical accuracy, official terms, product names, interface labels, code, commands, links, dates and direct quotations.

## Plain English rules

- Use active voice. Say who does what.
- Keep most sentences to 15 to 20 words. Split sentences longer than about 25 words.
- Use everyday words where they preserve meaning:
  - use, not utilise or leverage
  - help, not facilitate or empower
  - work with, not collaborate, liaise or engage with
  - make or provide, not deliver
  - about, not in relation to or with regard to
  - so, not in order to
  - start, not commence
  - end, not terminate
  - enough, not sufficient
- Avoid metaphors and clichés such as drive, unlock, deep dive, robust, key, hub, portal, ecosystem and going forward.
- Address the reader as "you". Use "we" for yourself or the organisation when appropriate.
- Use "they", "them" and "their" instead of gendered pronouns.
- Write "disabled people", not "the disabled".
- Contractions are fine for warmth, but write "cannot" instead of "can't".
- Avoid em dashes. Use a comma, colon, full stop or brackets.

## Formatting rules

- Use sentence case in headings, titles and table headers.
- Use headings to help skimming. Keep them descriptive and under about 65 characters.
- Introduce bullet lists with a lead-in line that ends in a colon.
- Start bullets lowercase unless the first word is a proper noun.
- Keep each bullet to one idea.
- Use numbered lists only for ordered steps.
- Use descriptive link text. Do not write "click here" or "read more".
- Write "for example" instead of "eg", and "that is" instead of "ie".
- Write "and", not "&", unless it is part of a registered name or logo.
- Use numerals from 2 upwards. Write "one" for the number 1 unless the surrounding content needs numerals.
- Use the % symbol with numerals.
- Write dates as "4 June 2026".
- Write ranges with "to", not a hyphen.
- Do not use FAQs when the main content can answer the user need.
- Do not use exclamation marks or ALL CAPS for emphasis.

The "no bold" rule applies to reports, guidance and formal prose. Slack can use bold sparingly for skim structure. Code, data tables and direct quotations keep their own conventions.

## Customer-facing Slack and presales

Optimise for deal movement. The reader should know what is true, why it matters and what happens next.

### Tone

- Lead with the practical answer.
- Keep the tone warm, direct and useful.
- Explain product behaviour in customer terms, not internal implementation terms.
- Preserve limitations without sounding defensive.
- End with the next useful action: a question, workaround, priority check, trial criterion or offer to help.

### Slack shape

- Use short paragraphs.
- Use bullets or numbered lists when they make the answer easier to scan.
- If the customer asks unrelated questions, separate the answers.
- Preserve useful screenshots, links, product names, UI labels, code, SQL, AQL and dates.
- Make the message skimmable in under 20 seconds when possible.

### Product gap or unsupported feature

Use this order:

1. Thank them and show that you understand the request.
2. Restate the ideal capability in product terms.
3. Say whether it is supported, under consideration or needs product work.
4. Give the most reliable workaround.
5. Say what happens next.

Good shape:

> Thanks, well noted. Ideally, this should let analysts manage the logic centrally, apply it globally, and lock it from end-user changes.
>
> This is a valid request. I have forwarded it to the product team and they are considering it.
>
> Meanwhile, the most reliable workaround is still local conditions. To make that easier to maintain, use Code Search and local development so you can audit where the condition is applied.
>
> I will circle back once I hear from product.

### Workaround or immediate solution

Use this order:

1. Start with the practical answer.
2. Give 2 or 3 steps.
3. Add one sentence explaining when to use each option.

### Failed AI or product confidence issue

Use this order:

1. Acknowledge why the failure matters.
2. Lead with the recovery or expected result.
3. Avoid dumping internal debugging detail.
4. Reframe the issue as a governed improvement path if that is true.
5. Turn it into an evaluation case or next trial step.

## Technical explanation and precision

When the task needs a technical explainer, explanation repair or unambiguous technical documentation, read `reference/technical-precision.md` before drafting.

Use the explanation workflow when the content must teach:

- start with the audience's actual confusion
- build from an older, simpler idea to the new idea
- use one concrete example before adding detail
- answer the obvious questions directly
- end with what the idea changes and its tradeoff

Use controlled English when the content must be interpreted consistently:

- use one term for one concept
- write one action per procedural step
- put conditions before actions
- name the exact object each action affects
- state cause, condition and result in that order when order matters
- remove pronouns and noun clusters that could refer to more than one thing

Do not imitate a living creator's exact wording, catchphrases or personal voice. If the user names a creator, borrow structure, pacing, analogy use and signposting instead.

## Agent-facing documents

When writing or editing a skill, `AGENTS.md`, `CLAUDE.md` or another document that an agent consumes, read `reference/writing-for-agents.md` before drafting. When the document is a skill, also read `reference/skill-mechanics.md`.

Apply these checks:

- sharpen the context pointer before inlining more instructions
- keep one source of truth for each behaviour
- separate always-needed steps from reference material that only some branches need
- give each step a checkable completion criterion
- cut no-op instructions the agent already follows by default
- replace duplicated explanation with one strong leading word where that word reliably triggers the intended behaviour
- remove stale sediment instead of adding another layer

## Before you finish

Check the output against the chosen mode:

- Is the answer, recommendation or user need first?
- Can the intended reader understand every sentence the first time?
- Is each sentence active, short and one idea where that helps clarity?
- Did you preserve technical facts, limitations, names, labels, code and links?
- Did you remove jargon, duplication, vague abstractions and marketing language?
- Is the next action clear when the writing is customer-facing?
- If the output is agent-facing, does the pointer trigger the right branches and avoid loading material every run unnecessarily?
- Could you cut more words without losing meaning? If yes, cut them.
