# Spatial Design

## Spacing Systems

### Use 4pt Base, Not 8pt

8pt systems are too coarse—you'll frequently need 12px (between 8 and 16). Use 4pt for granularity: 4, 8, 12, 16, 24, 32, 48, 64, 96px.

### Name Tokens Semantically

Name by relationship (`--space-sm`, `--space-lg`), not value (`--spacing-8`). Use `gap` instead of margins for sibling spacing—it eliminates margin collapse and cleanup hacks.

## Grid Systems

### The Self-Adjusting Grid

Use `repeat(auto-fit, minmax(280px, 1fr))` for responsive grids without breakpoints. For complex layouts, use named grid areas and redefine them at breakpoints.

## Visual Hierarchy

### The Squint Test

Blur your eyes. Can you still identify the most important element? The second? Clear groupings? If everything looks the same weight, you have a hierarchy problem.

### Hierarchy Through Multiple Dimensions

| Tool | Strong Hierarchy | Weak Hierarchy |
|------|------------------|----------------|
| **Size** | 3:1 ratio or more | <2:1 ratio |
| **Weight** | Bold vs Regular | Medium vs Regular |
| **Color** | High contrast | Similar tones |
| **Position** | Top/left (primary) | Bottom/right |
| **Space** | Surrounded by white space | Crowded |

**The best hierarchy uses 2-3 dimensions at once.**

### Cards Are Not Required

Cards are overused. Use cards only when content is truly distinct and actionable or items need visual comparison. **Never nest cards inside cards.**

## Container Queries

```css
.card-container {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card {
    grid-template-columns: 120px 1fr;
  }
}
```

## Optical Adjustments

Text at `margin-left: 0` looks indented due to letterform whitespace—use negative margin to optically align.

### Touch Targets vs Visual Size

```css
.icon-button {
  width: 24px;
  height: 24px;
  position: relative;
}
.icon-button::before {
  content: '';
  position: absolute;
  inset: -10px;
}
```

## Depth & Elevation

Create semantic z-index scales. For shadows, create a consistent elevation scale. **Shadows should be subtle—if you can clearly see it, it's probably too strong.**

---

**Avoid**: Arbitrary spacing values outside your scale. Making all spacing equal. Creating hierarchy through size alone.
