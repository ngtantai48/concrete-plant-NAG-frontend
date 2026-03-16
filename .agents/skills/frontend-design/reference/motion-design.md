# Motion Design

## Duration: The 100/300/500 Rule

| Duration | Use Case | Examples |
|----------|----------|----------|
| **100-150ms** | Instant feedback | Button press, toggle, color change |
| **200-300ms** | State changes | Menu open, tooltip, hover states |
| **300-500ms** | Layout changes | Accordion, modal, drawer |
| **500-800ms** | Entrance animations | Page load, hero reveals |

**Exit animations are faster than entrances**—use ~75% of enter duration.

## Easing: Pick the Right Curve

**Don't use `ease`.** Instead:

| Curve | Use For | CSS |
|-------|---------|-----|
| **ease-out** | Elements entering | `cubic-bezier(0.16, 1, 0.3, 1)` |
| **ease-in** | Elements leaving | `cubic-bezier(0.7, 0, 0.84, 0)` |
| **ease-in-out** | State toggles | `cubic-bezier(0.65, 0, 0.35, 1)` |

**For micro-interactions, use exponential curves:**

```css
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
```

**Avoid bounce and elastic curves.** They were trendy in 2015 but now feel tacky. Real objects decelerate smoothly.

## The Only Two Properties You Should Animate

**transform** and **opacity** only—everything else causes layout recalculation. For height animations, use `grid-template-rows: 0fr → 1fr`.

## Staggered Animations

Use CSS custom properties: `animation-delay: calc(var(--i, 0) * 50ms)`. **Cap total stagger time** at ~500ms.

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .card {
    animation: fade-in 200ms ease-out;
  }
}
```

**Preserve**: Progress bars, loading spinners (slowed), focus indicators.

## Perceived Performance

**The 80ms threshold**: Anything under 80ms feels instant. Target this for micro-interactions.

Strategies:
- **Preemptive start**: Begin transitions immediately while loading
- **Early completion**: Show content progressively
- **Optimistic UI**: Update immediately, sync later

## Performance

Don't use `will-change` preemptively—only when animation is imminent. Use Intersection Observer for scroll-triggered animations.

---

**Avoid**: Animating everything. Using >500ms for UI feedback. Ignoring `prefers-reduced-motion`. Using animation to hide slow loading.
