# Responsive Design

## Mobile-First: Write It Right
Start with base styles for mobile, use `min-width` queries to layer complexity. Desktop-first means mobile loads unnecessary styles first.

## Breakpoints: Content-Driven
Don't chase device sizes—let content tell you where to break. Three breakpoints usually suffice (640, 768, 1024px). Use `clamp()` for fluid values without breakpoints.

## Detect Input Method, Not Just Screen Size

```css
@media (pointer: fine) {
  .button { padding: 8px 16px; }
}
@media (pointer: coarse) {
  .button { padding: 12px 20px; }
}
@media (hover: hover) {
  .card:hover { transform: translateY(-2px); }
}
```

**Critical**: Don't rely on hover for functionality. Touch users can't hover.

## Safe Areas: Handle the Notch

```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

## Responsive Images

```html
<img
  src="hero-800.jpg"
  srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w"
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Hero image"
>
```

## Layout Adaptation Patterns

**Navigation**: Three stages—hamburger on mobile, horizontal compact on tablet, full with labels on desktop.
**Tables**: Transform to cards on mobile using `display: block` and `data-label` attributes.
**Progressive disclosure**: Use `<details>/<summary>` for content that can collapse on mobile.

## Testing: Don't Trust DevTools Alone

Test on at least: One real iPhone, one real Android, a tablet if relevant. Cheap Android phones reveal performance issues you'll never see on simulators.

---

**Avoid**: Desktop-first design. Device detection instead of feature detection. Separate mobile/desktop codebases. Ignoring tablet and landscape.
