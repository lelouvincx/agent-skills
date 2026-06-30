---
name: govuk-style
description: Write and edit in GOV.UK / GDS plain-English style for reports, guidance, summaries and customer-facing Slack messages. Use for clear, active, front-loaded prose; for Slack and presales, keep the answer first, preserve useful formatting, and end with a next action.
user-invokable: true
args:
  - name: target
    description: The document or text to write or rewrite in GOV.UK style (optional)
    required: false
---

Open the content up so anyone can understand it the first time they read it — without losing any of the substance, nuance or precision. The goal is to open up, not to dumb down. This skill applies the GOV.UK style guide and the Government Digital Service (GDS) content design principles. It is based on the GOV.UK A to Z style guide and writing guidelines (guidance.publishing.service.gov.uk).

Apply it to reports, research write-ups, guidance and any prose meant to be read. When you write a report, default to this style. When you brief a research agent, pass this skill so its report follows the same style.

## Content design principles

- Start from the user need. Write what the reader needs to know to do or decide something, not what you want to say.
- Front-load everything. Use the Minto pyramid mental model.
- One idea per sentence. One topic per paragraph. If a sentence has more than one idea, split it.
- Be specific and concrete. Give the number, the name, the date. Cut vague abstractions ("a range of", "going forward", "in terms of").
- Cut everything that does not add meaning. Shorter is clearer. Remove duplication.

## Plain English

- Open it up, do not dumb it down. Keep all the substance, nuance and precision. Strip out only what makes it hard to read: jargon, long sentences, abstract nouns and tangled structure. A non-specialist and an expert should both grasp it on first read. Plain English carries complex ideas better, not worse — even experts read faster and prefer it.
- Use the active voice. Say who does what. Write "We reviewed the data", not "The data was reviewed".
- Keep sentences short — about 15 to 20 words, never more than about 25. Keep paragraphs short.
- Use everyday words. Replace jargon and "government-speak" with plain alternatives:
  - use, not utilise or leverage
  - help, not facilitate or empower
  - work with, not collaborate, liaise or engage with
  - make or provide, not deliver
  - about, not in relation to or with regard to
  - so, not in order to
  - start, not commence; end, not terminate; buy, not purchase; enough, not sufficient
  - solve, fix or deal with, not tackle or combat
  - effect on, not impact on (do not use impact as a verb)
- Avoid metaphors and clichés: drive, unlock, deep dive, robust, key, ring-fence, hub, portal, landscape, ecosystem, going forward.
- Address the reader as "you". Write about yourself or the organisation as "we". Use "they", "them" and "their" rather than gendered pronouns. Write "disabled people", not "the disabled".
- Contractions are fine for a warmer tone (we'll, you'll), but avoid negative contractions — write "cannot", not "can't" — and avoid "should've", "could've", "would've".

## Formatting

- Do not use bold or italics for emphasis. Plain words and good structure carry the meaning. Bold is only acceptable to name a literal interface element in an instruction, for example: select Save. Use single quotation marks for the titles of schemes or documents, not italics.
- Use sentence case everywhere — headings, titles, table headers, the lot. Capitalise only proper nouns.
- Headings: front-load them, keep them under about 65 characters, make them unique and descriptive. No full stop, dash, slash or question mark. Use them to let people skim.
- Bullet points: introduce the list with a lead-in line that ends in a colon. Start each bullet lowercase. Keep each to one idea. No "and"/"or" after each item, no semicolons, no full stop after the last bullet (unless a bullet is itself a full sentence).
- Numbered steps: use a numbered list only for a sequence the reader follows in order. Steps are full sentences and end with a full stop. No lead-in colon needed.
- Links: use descriptive link text that says where the link goes — front-load the key words. Never write "click here" or "read more". The link text should make sense out of context.
- Do not use Latin abbreviations. Write "for example" not "eg", "that is" not "ie", "and so on" or "such as" not "etc". They confuse screen readers and some readers.
- Ampersands: write "and", not "&" (except in a registered name or logo).
- Numbers: write "one" but use numerals from 2 upwards (2, 9, 25). Use the % symbol with numerals (50%). Use £ with no decimals unless there are pence (£75, £75.50). Spell out millions and billions (£5 million, not £5m). Write ranges with "to", not a hyphen (10 to 20, Monday to Friday).
- Dates and times: write "4 June 2026" (no comma, no "th"). Use "to" for ranges ("4 to 8 June"). Write times as "10am to 11.30am"; use "midday" and "midnight".
- Do not use FAQs. If you have answered the user need in the content, you do not need them. Do not use exclamation marks. Do not use ALL CAPS for emphasis.

## Before you finish: self-check

- Is the single most important thing first?
- Could a non-expert understand every sentence on first read?
- Is every sentence active, short and one idea?
- Have you removed all bold/italic emphasis, jargon, Latin abbreviations and marketing language?
- Is everything in sentence case, with descriptive headings and links?
- Could you cut any more words without losing meaning? If yes, cut them.

## Note on this skill's own scope

The "no bold" and formatting rules apply to the prose you produce (reports, guidance, summaries). Code, data tables and direct quotations keep their own conventions. Markdown headings and lists are fine — they are structure, not emphasis.

## Chinh's presales and Slack adaptation

Use the original GOV.UK style as the base: clear, plain, active, front-loaded writing.

For customer-facing writing, optimise for deal movement: the reader should know what is true, why it matters, and what happens next.

### Core taste

- Lead with the answer, recommendation or honest status.
- Keep the tone warm, direct and practical. Do not sound like a policy page.
- Explain product behaviour in customer terms, not internal implementation terms.
- Preserve technical accuracy. Do not hide limitations, but do not sound defensive.
- End with the next useful action: a question, workaround, offer to help, product-priority check or trial criterion.

### Slack formatting

Slack is skimmable, not a formal document. Use structure where it helps the reader act.

- Use bold sparingly for thread titles, section labels, final asks and important status.
- Keep short paragraphs. One idea per paragraph still applies.
- Use numbered lists for steps or separate customer questions.
- Use bullets for options, constraints and product boundaries.
- Use code blocks, tables and plain-text diagrams when they prevent misunderstanding.
- Preserve product names, UI labels, code, SQL, AQL, dates, links and screenshots.

### Customer-facing patterns

#### Clarify before solving

Use this when the request is ambiguous or easy to misread.

1. Quote or restate the customer ask.
2. Rewrite it in simpler language.
3. Add a concrete example, table or diagram.
4. Ask the smallest blocking question.

Good shape:

> Just to confirm, you're asking whether one date-range filter can become 2 conditions for one chart: the start date applies to Field A, and the end date applies to Field B. Is that right?

Done when the customer has confirmed the interpretation, or the remaining question is small enough to answer safely.

#### Product gap or unsupported feature

Use this when Holistics does not support something today.

1. Thank them and show that you understand the request.
2. Restate the ideal capability in product terms.
3. Say whether it is already supported, under consideration, or needs product work.
4. Give the most reliable current workaround, even if imperfect.
5. Say what happens next: product follow-up, priority clarification, or a circle-back.

Good shape:

> Thanks, well noted. Ideally, this should let analysts manage the logic centrally, apply it globally, and lock it from end-user changes.
>
> This is a valid request. I have forwarded it to the product team and they are considering it.
>
> Meanwhile, the most reliable workaround is still local conditions. To make that easier to maintain, use Code Search and local development so you can audit where the condition is applied.
>
> I will circle back once I hear from product.

Done when the customer can tell whether the feature is supported, what they can do now, and what priority signal you need from them.

#### Workaround or immediate solution

Use this when the customer can solve the issue now.

1. Start with the practical answer.
2. Give 2 or 3 steps.
3. Add one sentence explaining when to use each option.

Good shape:

> You can handle this without resizing columns one by one:
>
> 1. Use Auto-size for the table columns.
> 2. Turn on text wrapping when the issue is packed labels.
> 3. Set column widths in AML when you want the dashboard definition to keep them.

Done when the customer has a next action they can try without another explanation.

#### Failed AI or product confidence issue

Use this when a demo, trial or AI answer failed in front of a prospect.

1. Acknowledge why the failure matters.
2. Lead with the recovery or expected result.
3. Avoid dumping internal debugging detail.
4. Reframe the issue as a governed improvement path if that is true.
5. Turn it into an evaluation case or next trial step.

Good shape:

> I understand why this felt concerning. This is exactly the kind of practical business question your users would expect AI to answer.
>
> I was able to get the expected answer after guiding the AI toward the right query pattern. I will also forward this case to our AI team.
>
> I suggest we treat this as one of your trial criteria and use it to harden the semantic context, instead of leaving it as a one-off failed answer.

Done when the message restores confidence without hiding the failure, and turns the issue into a concrete evaluation or improvement step.

### Before sending customer-facing messages

Check these in addition to the original GOV.UK self-check:

- Is the answer or recommendation first?
- Did I translate the technical point into customer impact?
- Did I avoid overpromising?
- Did I preserve the useful next action?
- If this is a product gap, did I ask for priority or importance?
- If this is Slack, is it easy to skim in under 20 seconds?
