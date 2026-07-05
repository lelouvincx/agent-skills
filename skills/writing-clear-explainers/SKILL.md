---
name: writing-clear-explainers
description: Writes and edits technical explanations, video scripts, and teaching prose so they feel easy to understand. Use when the user wants a clear explainer, asks to simplify a complex concept, turn notes into a talk or script, or borrow clarity patterns from an educator without copying their exact voice.
---

# Writing Clear Explainers

Turn complex technical topics into simple, causal explainers that move from confusion to clarity.

Do not imitate a living creator's exact wording, catchphrases, or personal voice. If the user names a creator, extract transferable clarity patterns instead: structure, pacing, analogy use, signposting, and explanation sequence.

## Workflow

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

## Output shapes

When the user provides only a topic, produce:

1. a short explainer ladder
2. a draft explainer or talk script
3. optional notes on what to visualize

When the user provides a draft, produce:

1. a rewritten version
2. a brief list of the biggest clarity changes
3. any remaining question that would materially improve the explanation

When the user asks for a talk or video script, write in speaker-friendly blocks: short paragraphs, clear turns, and optional visual cues only when they help.

## Editing pass

Before returning the final answer:

- replace noun stacks with verbs
- cut definitions that arrive before motivation
- split paragraphs that answer more than one question
- remove duplicate setup
- replace abstract claims with one concrete example
- keep the ending focused on "what this means," not just "what this is"

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
