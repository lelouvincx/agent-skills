---
name: painting-ink-and-wash
description: "Creates Ink & Wash illustrations with Painter: translucent teal-and-ochre watercolor over precise mechanical linework on ivory drafting paper. Use when Chinh asks for ink-and-wash, watercolor drafting style, or an engineering-watercolor illustration."
---

# Ink & Wash

Turn the user's idea into one visual metaphor, painted as an engineering watercolor study. Use Painter with the bundled [approved reference](assets/style-reference.jpg). The reference fixes the visual treatment, not the bridge subject.

## Generate

1. Choose one concrete scene that expresses the user's idea. Keep the relationships accurate: complementary parts meet as equals; a dependency supports something; a conflict pulls in different directions. Unless requested, omit people and text.
2. Resolve `assets/style-reference.jpg` relative to this skill's directory and supply its actual local path in Painter's `inputImagePaths`. Do not pass the relative path alone or rely on a previous conversation's attachment. Set `background: "opaque"`.
3. Combine the subject with the style contract below. Request one landscape image, approximately 16:9, unless the user specifies another format.
4. Inspect the returned image with `view_media`. Check the intended metaphor, watercolor treatment, mechanical linework, legibility at thumbnail size, and absence of unintended text or people. Report any mismatch rather than claiming an exact style match.

If the bundled reference is unavailable, say so and use the style contract as a text-only fallback. Do not claim the image was reference-guided.

## Style contract

Use this text in the Painter prompt after the new subject:

> Use the supplied image as a reference for medium, palette and drawing discipline. Make an original composition for the requested subject; do not reuse its bridge or interlocking seam unless the subject calls for them.
>
> Paint translucent aquarelle washes on warm ivory engineering drafting paper. Let paper grain show through the pigment, with soft blooms, irregular pooling and exposed pale areas. Use muted petrol teal and slate blue against amber, ochre and restrained burnt orange. Keep the result light and spacious.
>
> Combine the loose watercolor with precise, delicate graphite-like mechanical drawing: ruler-straight construction lines, compass arcs, a faint square grid, sparse ruler ticks, registration crosses and dimension guides. Let the guides relate to the depicted forms rather than cover the image as arbitrary decoration. A few crisp focal edges should contrast with softer peripheral washes.
>
> Use one readable visual metaphor and a clear large-scale silhouette. Treat organic forms as carefully drafted curves, not glossy 3D surfaces. Keep the mechanical marks subordinate to the subject. No text, numbers, labels, logos, signatures or people unless explicitly requested. Keep the background ivory rather than blueprint blue. Complete opaque landscape composition, approximately 16:9 unless another format is requested.

## Revise

For a revision, supply the selected generated image as the first reference and describe the requested change as a localized edit. Add the bundled style reference only when restoring the visual treatment is necessary. Preserve everything the user did not ask to change; do not reinterpret the subject on a removal or cleanup request.

## Reference and consistency

`assets/style-reference.jpg` is a compact JPEG copy of Chinh's selected Painter result: the mechanical watercolor bridge after removing its person. It is a style anchor, not a template or an artist attribution. Image generation varies; the bundled reference and inspection improve consistency but do not guarantee identical rendering.

Example request: “Use ink-and-wash to paint semantic definitions staying stable while business context evolves.” Choose a fresh metaphor for that idea and keep the visual treatment above.
