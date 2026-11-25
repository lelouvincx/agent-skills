---
name: writing-linkedin-posts
description: Turns a post idea into a LinkedIn post plan, covering what to build or test first, the hook, the body and the call to action, for first-person proof posts and debate posts. Use when asked to write, plan or improve a LinkedIn post, or to turn an idea, experiment or opinion into one. Long-form essays and blog posts belong to writing-essays.
---

# Writing LinkedIn posts

The author gives an idea. Shape it into one of two post types, work out what the author must do before the post is true, then draft the hook, body and call to action. Every post is in the author's first person and backed by work they did or evidence they hold.

## The two post types

1. **First-person proof.** The hook starts with what the author did: "I built…", "I tested…", "I ran…", "I learnt…", "I read…", "I experimented with…". The body gives the numbers or outcome, the setup in a sentence or two, and what the reader should take from it. Example hooks: "I benchmarked 14 analytics agents - here's what actually works", "I improved my analytics agent reliability from 45% to 86%". When one experiment has a result, a reproducible method and a surprise, offer to split it into three posts, one for each.
2. **Debate.** Take a side on a question the audience already argues about, backed by the author's evidence. Open with a question or a contrarian claim, state the position early, and end by asking readers where they disagree. Example hooks: "Is yaml… a semantic layer?", "Spoiler alert: Semantic layers are not solving agentic analytics.", "Why text to SQL doesn't work?".

Choose the type from the idea: something the author can do and measure is first-person proof; a position on a contested question is a debate. When the idea fits both, recommend one and say why in a sentence.

## Workflow

1. Read the idea and any material the author gives: notes, numbers, repo, screenshots, earlier posts.
2. Critique the idea before drafting: does it solve a problem the audience finds painful, or is it something they want to read? Name who feels the problem and how they would recognise it. When the idea is neither, say so plainly and suggest the closest angle that is, such as a sharper problem, a bigger number or a more contested claim. When the post compares or ranks the author's own product or employer against others, readers will discount it as a vendor benchmark, so the post needs a plain disclosure line, such as "Full disclosure: I work at <company>, which builds <product>", and a public link to the method and data. Add both to what to implement.
3. Work out what to implement: the concrete work that makes the post true. For first-person proof, name what to build, test or run, what to measure, and what result or artifact the post will show. For a debate, name the position, the evidence that supports it, and the strongest counterargument to address. When the author has already done the work, list only what is missing.
4. Write the hook as one punchy first line, because LinkedIn shows only the first lines before "see more". The hook carries the first-person verb, the number or the contested claim. When the post rides a news event, the hook adds what readers cannot get from the news itself, such as a question the author's work answers; restating the headline wins reach from strangers but gives them no reason to read on or click.
5. Write the body in the style below, with one idea per post.
6. Write one call to action that fits the type: a question for proof and debate posts. When the call to action is a link, name what readers get there that they cannot get elsewhere, such as an interactive calculator rather than a live price, and say in the first two lines that a link is coming, because readers who never open "see more" never see a link at the end. When the author has a finished artifact, such as a playbook, template or repo, offer "Comment <KEYWORD> and I'll send it to you" instead, and only if they will send it to every commenter.
7. Run the quality checks below on the draft, revise until each one passes, and report any that still fail.

Every number, result and claim comes from the author's material. Where the work is not done yet, write a clearly marked placeholder, such as `[RESULT: accuracy before → after]`, instead of inventing a value.

## Style

- **A concrete scene instead of a summary.** Show what happens to the reader: "You ask, you wait a few days, and you get a dashboard back."
- **A short line after a long one.** Land the point in a few words after a longer sentence: "But you trusted what came back."
- **A sharp turn.** Grant one thing, then take it back: "That's a lot more freedom. It's not obviously more trust."
- **A wry closing line.** End on a dry, understated line rather than a summary.

Keep the author's own vocabulary and opinions from their notes or earlier posts; the style shapes the rhythm, not what they believe.

## Quality checks

- **Punchy:** the hook is short and emphatic, and the body uses short sentences with the key phrase of each paragraph emphasised, as a short line of its own or in bold.
- **Style:** the draft has at least one concrete scene, one short line after a long one, one sharp turn, and a wry closing line.
- **Short enough to make readers curious:** the post states the outcome and the most interesting detail, and leaves the full method or data for a link, a comment or a follow-up, so readers click to learn more. An attached image teases the result instead of showing the whole answer, so the link still holds something new. Cut any paragraph the reader would not miss.
- **One useful insight:** the post contains one short observation that a practitioner would nod at, beyond the facts themselves. Example: "The interesting thing is that any of these steps can be used as a quick POC / prototype before applying it in your production data platform!"
- **Ecosystem tags:** the post tags the tools and projects in the same ecosystem that it uses, compares or builds on, so their communities see it. Example: a post promoting Anfra tags dlt, dbt and DuckDB. Tag only tools the post actually mentions.
- **Worth reading:** the critique from step 2 still holds for the finished draft, including the disclosure and public method link when the author's own product is compared.

## Return

Return, in order:

- **Critique**: whether the idea is a painful problem or something people want to read, and any stronger angle.
- **Post type** and a one-line reason.
- **What to implement**: a short checklist of work to do before posting.
- **Hook**, plus two alternative hooks.
- **Body**, ready to paste, with placeholders where results are pending and the tags in place.
- **Call to action.**
- **Quality checks**: pass or fail for each check, with a one-line reason for any failure.
