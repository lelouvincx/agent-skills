## Chinh's presales

Use the original GOV.UK style as the base: clear, plain, active, front-loaded writing.

For customer-facing writing, optimise for deal movement: the reader should know what is true, why it matters, and what happens next.

### Core taste

- Lead with the answer, recommendation or honest status.
- Keep the tone warm, direct and practical. Do not sound like a policy page.
- Explain product behaviour in customer terms, not internal implementation terms.
- Preserve technical accuracy. Do not hide limitations, but do not sound defensive. Sometimes hide it to prevent over-explaining technical terms.
- End with the next useful action: a question, workaround, offer to help, product-priority check or trial criterion.

### Slack formatting

Slack is skimmable, not a formal document. Use structure where it helps the reader act.

- Use bold sparingly for thread titles, sections, final asks, important phrase.
- Keep short paragraphs. One idea per paragraph still applies.
- If customer asks many unrelated questions at a time, separate them so that things not getting tangled.
- Prefer numbered/bullet list.
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

Done when: the customer has confirmed the interpretation, or the remaining question is small enough to answer safely.

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

Done when: the customer can tell whether the feature is supported, what they can do now, and what priority signal you need from them.

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

Done when: the customer has a next action they can try without another explanation.

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

Done when: the message restores confidence without hiding the failure, and turns the issue into a concrete evaluation or improvement step.

### Before sending customer-facing messages

Check these in addition to the original GOV.UK self-check:

- Is the answer or recommendation first?
- Did I translate the technical point into customer impact?
- Did I avoid overpromising?
- Did I preserve the useful next action?
- If this is a product gap, did I ask for priority or importance?
- If this is Slack, is it easy to skim in under 20 seconds?
