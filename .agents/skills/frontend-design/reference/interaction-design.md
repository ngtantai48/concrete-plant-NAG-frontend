# Interaction Design

Make interactions feel fast. Use optimistic UI—update immediately, sync later.

## Progressive Disclosure
Start simple, reveal sophistication through interaction. Basic options first, advanced behind expandable sections. Hover states that reveal secondary actions.

## Empty States
Design empty states that teach the interface, not just say "nothing here." Every empty state is an onboarding moment:
1. Acknowledge briefly
2. Explain the value of filling it
3. Provide a clear action

## Interactive Surfaces
Make every interactive surface feel intentional and responsive. Use visual feedback for all interactions—hover, focus, active, disabled states should all be distinct.

## Button Hierarchy
Don't make every button primary. Use ghost buttons, text links, secondary styles. Hierarchy matters—one primary action per view.

## Forms
- Use inline validation (validate on blur, not on every keystroke)
- Group related fields visually
- Show format hints with placeholders, not instructions
- For non-obvious fields, explain why you're asking

## Loading States
- Use skeleton screens instead of spinners for layout-heavy content
- Be specific: "Saving your draft..." not "Loading..."
- For long waits, set expectations or show progress

## Focus Management
- Never remove focus outlines without providing an alternative
- Use `:focus-visible` to show focus only for keyboard users
- Manage focus when opening/closing modals and drawers

---

**Avoid**: Redundant information. Making every button primary. Removing focus indicators. Using spinners for everything.
