# Colorfigures

## Local adoption

Imported from `colorfigures.zip` supplied on 18 November 2026. This repository installs it as `creating-colorfigures` through `./sync-skills.sh`; invoke `/creating-colorfigures` in Amp or Claude Code. The skill name, discovery description and alternative-skill pointers are adapted for this repository. The engine, examples, build script, licence and upstream credits are preserved, with trailing whitespace and final newlines normalised by repository hooks.

[DESIGN.md](DESIGN.md) extracts the illustration and interface design system using Google's DESIGN.md format: machine-readable tokens followed by rationale, responsive rules and component guidance. It documents the existing implementation without changing the renderer.

[specimen.html](specimen.html) is the self-contained visual specimen. Open it in a browser to inspect all 46 colours, seven typography styles and interactive component states.

A Claude skill. Describe an everyday object in one line and Claude draws it hand-inked and isometric, as one
self-contained HTML file with buttons that actually work: real 3D bodies shaded in flat light, mid and dark bands,
a heavy ink silhouette with finer inner lines, a flat blue cast shadow, a hand-drawn wobble, warm paper and
body-colour swatches. Drag to turn it all the way round, switch on See-through to watch the real mechanism work
inside, with labels that light up on each part as it works, and zoom in. It works on a phone too.

Live examples: https://april-zhu.com/colorfigures-demo · Skill page: https://april-zhu.com/colorfigures

## Install

**Claude Code** — paste in Terminal, then restart Claude Code:

    mkdir -p ~/.claude/skills && curl -fsSL https://april-zhu.com/colorfigures/colorfigures.tar.gz | tar -xz -C ~/.claude/skills

Or unzip `colorfigures.zip` and move the `colorfigures` folder into `~/.claude/skills/` (or `.claude/skills/` inside a project).

**Claude.ai** — download `colorfigures.skill` and upload it in Settings → Capabilities → Skills, then switch it on.

## Try

- a gumball machine where I can put in a coin and turn the crank
- a record player: put on a record, drop the needle and it plays
- a kettle that boils and clicks off by itself — show how it knows when to stop
- how does a toaster know when to pop? make it a Colorfigure

Claude saves an `.html` file. Open it in your browser and press things.

## What's inside

- `SKILL.md` — the instructions Claude follows
- `assets/core.js` — the engine: free 3D camera, shapes and shading, ink, see-through and labels, game keypad, the page with its buttons and controls
- `assets/examples/` — complete figures to learn from (toaster, desk lamp, claw machine)
- `scripts/build.py` — makes one self-contained file with zoom and the phone layout: `python3 scripts/build.py figure.html OUT.html`

Plain text only. Nothing runs on install; figures run in the browser like any web page, with no outside requests.

## Credits

- Built on [ISO-GLOW](https://isoglow.dev) by April Zhu (MIT).
- ISO-GLOW is built on [iso-figure](https://github.com/MrBongoC/ai-iso-skill) by Tolga Cohce (MIT).
- See-through views follow the method of [Anatomy](https://github.com/wheresryan22/anatomy) by Ryan (MIT).

## License

MIT. See [LICENSE](LICENSE).

If you share, fork or build on this skill, you must keep the licence and the credit to Colorfigures (https://april-zhu.com/colorfigures). If you post figures made with it, please credit Colorfigures.

Made by April · [@Aprilzz423](https://x.com/Aprilzz423)
