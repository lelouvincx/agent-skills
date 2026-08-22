---
name: technical-precision
description: Explains complex technical concepts and writes or edits unambiguous technical content. Use for explainers, teaching prose, talks or scripts, explanation repair, requests to borrow an educator's clarity patterns without copying their voice, and controlled-English procedures, troubleshooting, runbooks, specifications, safety instructions, translation-ready content, or product and developer documentation.
---

# Technical Precision

Turn complex technical topics into simple, causal explainers that move from confusion to clarity, and make technical writing mean one thing on the first reading.

Use two complementary modes:

- **Explanation mode** for concepts, talks, scripts, teaching prose, and failed explanations. Build understanding through motivation, causal sequence, concrete examples, and tradeoffs.
- **Precision mode** for procedures, troubleshooting, runbooks, specifications, safety instructions, translation-ready content, and product or developer documentation. Apply controlled-English principles to make actors, actions, objects, conditions, and results explicit.

Choose the mode before drafting. Use only the workflow for that mode unless the requested output must both teach a concept and serve as operational or reference documentation. For explanation repair, follow the repair sequence and apply the terminology and ambiguity checks from the precision workflow.

Do not imitate a living creator's exact wording, catchphrases, or personal voice. If the user names a creator, extract transferable clarity patterns instead: structure, pacing, analogy use, signposting, and explanation sequence.

When you name the precision style, call it controlled English. Do not state or imply ASD-STE100 compliance.

Preserve technical accuracy, official terms, interface labels, code, commands, and quotations. If a safe rewrite depends on missing technical information, identify the ambiguity and ask the smallest question needed to resolve it.

## Repair a previous explanation

When the user's immediate response shows that the previous explanation did not land:

1. Identify the failed rung: the unfamiliar term, missing premise, hidden causal step, or analogy that did not map back. Infer it from the exchange when possible; otherwise ask one focused question.
2. Restore the minimum missing context before returning to the confusing point. Use established project or domain vocabulary when it is available, and define only terms the audience does not know.
3. Apply the terminology and ambiguity checks from the precision workflow before re-pitching.
4. Re-pitch from a different starting point or causal path. Choose a new concrete example, contrast, diagram-like sequence, or level of abstraction instead of shortening or paraphrasing the previous structure.
5. Verify the repair with one focused check: ask the reader to explain the key relationship in their own words, choose between two concrete cases, or name the remaining unclear step.

Completion criterion: the new explanation supplies the missing premise, uses a meaningfully different route, and checks the specific relationship that previously failed to land.

## Explanation workflow

### 1. Name the confusion

Start with the audience's actual confusion, not the formal definition.

Use prompts like:

- "Everyone is talking about X, but the confusing part is Y."
- "The question is not just what X is. The question is why we need it now."
- "If X sounds like another buzzword, the useful way in is to start from what came before it."

Completion criterion: you can state the audience, what they already know, and the one confusion the explainer will resolve.

### 2. Build the ladder

Explain the new idea as the next rung after an older, simpler idea:

```text
We started with [simple thing].
That worked when [old condition].
But then [new pressure] changed.
So we needed [new concept].
```

Introduce one new concept per rung. Define a term only after the reader has a reason to care about it.

Completion criterion: every new concept answers a visible limitation from the previous rung.

### 3. Make the abstract physical

Use one concrete scenario, analogy, or small example before piling on details.

Good entry points:

- "Let's say you're building..."
- "Think of this like..."
- "Imagine the system has to..."

After the analogy, map it back to the real technical parts so the comparison does not stay vague.

Completion criterion: the explainer contains at least one tangible example and explicitly maps it back to the concept.

### 4. Drive the explanation with obvious questions

Use questions as the engine of the piece:

- "But why?"
- "What changed?"
- "Why not keep doing the old thing?"
- "What does this unlock?"
- "What is the tradeoff?"

Then answer each question directly before moving on.

Completion criterion: each section or paragraph answers one clear question.

### 5. Add conversational signposts

Use connective tissue so the reader never has to infer the turn:

- "so"
- "but"
- "now"
- "because"
- "which means"
- "in other words"
- "for example"
- "now that we have X..."

Prefer short, spoken paragraphs. Use "we" when walking the reader through a sequence.

Completion criterion: transitions make the causal chain explicit without adding filler.

### 6. End with the tradeoff and the point

Do not end at the definition. End at what the idea changes.

Use this shape:

```text
So the real point is not that [X] is a new label.
The point is that [underlying shift].
The tradeoff is [cost].
```

Completion criterion: the ending states the practical meaning and the main tradeoff in plain English.

## Precision workflow

Use this workflow when the user needs technical content that must be interpreted consistently, or when an explanation repair needs stable terminology and unambiguous relationships.

### 1. Classify the content

Separate procedures, which tell the reader what to do, from descriptions, which explain what something is or does.

Completion criterion: each passage has one clear purpose, and every procedure stays imperative.

### 2. Control the terminology

- Use one term for one concept, even when repetition feels monotonous.
- Use one meaning for each term within the document.
- Preserve established product, domain, and interface terminology.
- Define an unfamiliar technical term on first use when the audience needs the definition.
- Use the complete technical term again when a shortened form could refer to more than one thing.

Completion criterion: every concept has one stable name, and each name has one clear meaning.

### 3. Write direct procedures

- Start each instruction with an imperative verb such as `Select`, `Enter`, `Connect`, or `Restart`.
- Give one action in each sentence or numbered step.
- Put a condition before the action when the reader must know it before acting.
- Put steps in the order the reader performs them.
- Name the exact object that each action affects.
- Put a warning or caution before the action that creates the risk. State the risk and the action that prevents it.

Completion criterion: the reader can perform each action in order without inferring a condition, object, or intermediate action.

### 4. Write explicit descriptions

- Prefer active voice and name the actor.
- Use passive voice only when the actor is unknown or irrelevant.
- State cause, condition, and result in that order when the order matters.
- Keep one topic in each paragraph.

Completion criterion: each sentence makes the actor, action, and relationship between technical objects clear.

### 5. Remove ambiguity

- Replace `it`, `this`, `that`, `they`, and similar pronouns when the reference is not unmistakable.
- Break up noun clusters when the relationship between nouns is unclear. Treat more than 3 consecutive nouns as a rewrite trigger.
- Rewrite an `-ing` form when it could act as more than one part of speech or attach to more than one phrase.
- Keep necessary subjects, verbs, and articles when you shorten a sentence.
- Use no more than about 20 words in an instruction and 25 words in a description. Split by meaning, not only by word count.
- Use a vertical list when prose hides a sequence, set of conditions, or group of alternatives.

Completion criterion: no sentence has 2 plausible technical interpretations.

### 6. Check the final text

- Re-check each precision completion criterion against the final text.
- Confirm that official terms, interface labels, and literal values are unchanged.
- Confirm that the rewrite preserves every technical fact and limitation.

The precision workflow is complete when each check passes. If a check cannot pass without guessing, name the ambiguity and ask the smallest question needed to resolve it.

## Output shapes

In explanation mode, when the user provides only a topic, produce:

1. a short explainer ladder
2. a draft explainer or talk script
3. optional notes on what to visualize

When the user provides a draft, produce:

1. a rewritten version
2. a brief list of the biggest clarity or precision changes
3. any remaining question that would materially improve the explanation or remove ambiguity

In precision mode, when the user provides a procedure or reference document, produce:

1. a controlled-English rewrite
2. a brief list of terminology, sequence, or ambiguity fixes
3. any remaining technical ambiguity that blocks a safe rewrite

In precision mode, follow the requested document type and structure. When the user asks for a new procedure or reference document, produce the requested document and identify only the missing technical information that prevents an accurate or safe result.

When the user asks for a talk or video script, write in speaker-friendly blocks: short paragraphs, clear turns, and optional visual cues only when they help.

## Editing pass

Before returning the final answer:

- replace noun stacks with verbs
- cut definitions that arrive before motivation
- split paragraphs that answer more than one question
- remove duplicate setup
- replace abstract claims with one concrete example
- keep the ending focused on "what this means," not just "what this is"
- apply the precision workflow when ambiguity, procedure order, or stable terminology matters

## Template

```text
If you've been seeing [X] everywhere, the confusing part is not [surface issue].
The confusing part is [real issue].

To understand it, let's start with [older/simple idea].
[Older idea] worked when [condition].
But it breaks when [new pressure].

So [X] is basically [plain-English definition].
Let's say [concrete scenario].
Without [X], [pain].
With [X], [benefit].

But this is not free. The tradeoff is [cost].

So the real point is [one-sentence takeaway].
```
