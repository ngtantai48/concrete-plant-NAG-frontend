# Color & Contrast

## Color Spaces: Use OKLCH

**Stop using HSL.** Use OKLCH (or LCH) instead. It's perceptually uniform, meaning equal steps in lightness *look* equal.

```css
--color-primary: oklch(60% 0.15 250);
--color-primary-light: oklch(85% 0.08 250);
--color-primary-dark: oklch(35% 0.12 250);
```

**Key insight**: As you move toward white or black, reduce chroma. High chroma at extreme lightness looks garish.

## Building Functional Palettes

### The Tinted Neutral Trap
**Pure gray is dead.** Add a subtle hint of your brand hue to all neutrals:

```css
--gray-100: oklch(95% 0.01 60);  /* Hint of warmth */
--gray-900: oklch(15% 0.01 60);

--gray-100: oklch(95% 0.01 250); /* Hint of blue */
--gray-900: oklch(15% 0.01 250);
```

The chroma is tiny (0.01) but perceptible. It creates subconscious cohesion.

### Palette Structure

| Role | Purpose | Example |
|------|---------|---------|
| **Primary** | Brand, CTAs, key actions | 1 color, 3-5 shades |
| **Neutral** | Text, backgrounds, borders | 9-11 shade scale |
| **Semantic** | Success, error, warning, info | 4 colors, 2-3 shades each |
| **Surface** | Cards, modals, overlays | 2-3 elevation levels |

### The 60-30-10 Rule (Applied Correctly)

- **60%**: Neutral backgrounds, white space, base surfaces
- **30%**: Secondary colors—text, borders, inactive states
- **10%**: Accent—CTAs, highlights, focus states

The common mistake: using the accent color everywhere. Accent colors work *because* they're rare.

## Contrast & Accessibility

### WCAG Requirements

| Content Type | AA Minimum | AAA Target |
|--------------|------------|------------|
| Body text | 4.5:1 | 7:1 |
| Large text (18px+ or 14px bold) | 3:1 | 4.5:1 |
| UI components, icons | 3:1 | 4.5:1 |

### Dangerous Color Combinations
- Light gray text on white (the #1 accessibility fail)
- **Gray text on any colored background**—use a darker shade of the background color instead
- Red text on green background (8% of men can't distinguish these)
- Blue text on red background (vibrates visually)

### Never Use Pure Gray or Pure Black
Pure gray (`oklch(50% 0 0)`) and pure black (`#000`) don't exist in nature. Even a chroma of 0.005-0.01 is enough to feel natural.

## Theming: Light & Dark Mode

### Dark Mode Is Not Inverted Light Mode

| Light Mode | Dark Mode |
|------------|-----------|
| Shadows for depth | Lighter surfaces for depth (no shadows) |
| Dark text on light | Light text on dark (reduce font weight) |
| Vibrant accents | Desaturate accents slightly |
| White backgrounds | Never pure black—use dark gray (oklch 12-18%) |

```css
:root[data-theme="dark"] {
  --surface-1: oklch(15% 0.01 250);
  --surface-2: oklch(20% 0.01 250);
  --surface-3: oklch(25% 0.01 250);
  --body-weight: 350;
}
```

### Token Hierarchy
Use two layers: primitive tokens (`--blue-500`) and semantic tokens (`--color-primary: var(--blue-500)`). For dark mode, only redefine the semantic layer.

## Alpha Is A Design Smell

Heavy use of transparency usually means an incomplete palette. Alpha creates unpredictable contrast and performance overhead. Define explicit overlay colors for each context instead.

---

**Avoid**: Relying on color alone to convey information. Creating palettes without clear roles. Using pure black (#000) for large areas. Skipping color blindness testing.
