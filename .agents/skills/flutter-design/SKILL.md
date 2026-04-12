---
name: flutter-design
description: >-
  Production-grade Flutter UI/UX design skill for building premium, accessible,
  performant mobile interfaces. Covers Material 3 theming, typography hierarchy,
  color token system, animation patterns, responsive layouts, widget architecture,
  and coding best practices. Use when building, redesigning, or refining any
  Flutter screen or component.
---

> **Flutter Design Intelligence** — Premium UI patterns for production Flutter apps.

---

## When to Use
- Building or redesigning Flutter screens/components
- Applying consistent theming, colors, typography
- Adding animations and micro-interactions
- Reviewing UI code quality and performance
- Creating responsive/adaptive layouts

## Design Direction

Before writing code, determine:
- **App domain**: industrial, logistics, dashboard, consumer, etc.
- **Brand personality**: professional, minimal, bold, refined, utilitarian
- **Platform**: Android-first, iOS-first, cross-platform
- **Tone**: Pick a clear aesthetic and execute with precision

---

## Material 3 Foundation

Always use `useMaterial3: true`. Build on `ColorScheme`, `TextTheme`, and M3 widgets.

```dart
final theme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFF2563EB),
    brightness: Brightness.light,
  ),
  textTheme: GoogleFonts.poppinsTextTheme(),
);
```

### Color Token System
Never hardcode hex in widgets. Use semantic tokens:
```dart
color: Theme.of(context).colorScheme.primary

color: colorScheme.surfaceContainerHighest
```

### Typography Hierarchy
Use the complete M3 `TextTheme`:
- `displayLarge/Medium/Small` — Hero sections, splash
- `headlineLarge/Medium/Small` — Page/section titles
- `titleLarge/Medium/Small` — Card titles, list items
- `bodyLarge/Medium/Small` — Body copy, descriptions
- `labelLarge/Medium/Small` — Buttons, tabs, chips

### Spacing System (8-point grid)
```dart
class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;
}
```

---

## Widget Architecture

### Extract to Classes, Not Methods
```dart
class _PageHeader extends StatelessWidget {
  const _PageHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      child: Text(title, style: Theme.of(context).textTheme.headlineMedium),
    );
  }
}
```

### const Propagation
```dart
child: const Padding(
  padding: EdgeInsets.all(16.0),
  child: Icon(Icons.home, size: 24.0),
)
```

### Scoped Rebuilds
Isolate rebuilding parts into separate widgets to prevent unnecessary rebuilds of expensive parent widgets.

---

## Animation as Communication

Animations communicate state changes, not just decoration.

- `AnimatedContainer`, `AnimatedOpacity`, `AnimatedSwitcher` for implicit
- `AnimationController` + `Tween` for explicit control
- `Hero` for shared element transitions
- Duration 150ms–400ms; 300ms sweet spot
- `Curves.easeInOut` default; `Curves.easeOutQuart` for natural deceleration
- Never animate layout properties (width, height, padding) directly — use transform and opacity

### Staggered Entrance Pattern
```dart
AnimatedContainer(
  duration: const Duration(milliseconds: 300),
  curve: Curves.easeOutCubic,
  // ...
)
```

---

## Elevation & Depth

M3 uses tonal elevation (color-based), not shadow-based by default.
- Use `elevation` with `surfaceTintColor` for cards
- Use `BoxShadow` sparingly and consistently
- Define shadow tokens in theme, don't scatter hardcoded shadows

---

## Layout & Responsiveness

### Adaptive Layouts
```dart
LayoutBuilder(
  builder: (context, constraints) {
    if (constraints.maxWidth > 1200) return DesktopLayout();
    if (constraints.maxWidth > 600) return TabletLayout();
    return MobileLayout();
  },
)
```

### Key Rules
- Use `SafeArea` for content near edges
- Prefer `Flexible`/`Expanded` over fixed sizes
- Content must be scrollable on small screens — never overflow
- Use `ListView.builder` / `SliverList` for long lists (>10 items)

---

## Async & State Patterns

### BuildContext After Await
```dart
Future<void> _handleSubmit() async {
  setState(() => _isLoading = true);
  try {
    await someService.doWork();
    if (!mounted) return;
    // safe to use context here
  } catch (e) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(e.toString())),
    );
  } finally {
    if (mounted) setState(() => _isLoading = false);
  }
}
```

### Null Safety
```dart
final name = user?.name ?? 'Unknown';

final display = switch (user) {
  User(:final name, :final email) => '$name <$email>',
  null => 'Guest',
};
```

---

## UI Styles Reference

| Style | Description | Key Techniques |
|-------|-------------|----------------|
| **Material 3 Clean** | Tonal color, gentle curves | `ColorScheme.fromSeed`, `NavigationBar` |
| **Enterprise Dark** | Professional dark dashboard | Dark surfaces, data-dense, subtle dividers |
| **Minimal Flat** | Ultra-clean, whitespace | Precise typography, `Divider` |
| **Gradient Premium** | Layered gradients, depth | `LinearGradient`, `ShaderMask` |
| **Glassmorphism** | Frosted glass, blur | `BackdropFilter`, `ImageFilter.blur` |
| **Brutalist** | Raw, high-contrast, bold | Borders, monochrome, tight spacing |

---

## Pre-Delivery Checklist

### Accessibility
- [ ] All interactive elements have `Tooltip` or `Semantics`
- [ ] Color contrast meets WCAG AA (4.5:1 text, 3:1 UI)
- [ ] Dynamic text scaling supported

### Theming
- [ ] No hardcoded hex colors in widgets — use `Theme.of(context).colorScheme`
- [ ] `darkTheme` provided in `MaterialApp`
- [ ] Custom fonts loaded properly

### Performance
- [ ] `const` constructors everywhere possible
- [ ] `ListView.builder` for long lists
- [ ] `RepaintBoundary` around animated widgets
- [ ] Build methods < 50 lines

### Code Quality
- [ ] Widgets extracted into separate files once > 80 lines
- [ ] No `setState` called inside `build()`
- [ ] No `BuildContext` stored across async gaps without `mounted` check

---

## Top 20 Flutter UI Rules

| # | Rule | Severity |
|---|------|----------|
| 1 | Use `const` constructors for immutable widgets | Critical |
| 2 | Never hardcode colors — use `colorScheme` | Critical |
| 3 | Keep `build()` methods under 50 lines | Critical |
| 4 | Use `ListView.builder` for lists > 10 items | Critical |
| 5 | Provide `darkTheme` in `MaterialApp` | High |
| 6 | Add `Semantics` labels to interactive widgets | High |
| 7 | Use `RepaintBoundary` around animated widgets | High |
| 8 | Check `mounted` before context after async | High |
| 9 | Use `AnimatedContainer` for simple transitions | Medium |
| 10 | Use `LayoutBuilder` for responsive breakpoints | Medium |
| 11 | Extract reusable widgets into separate files | Medium |
| 12 | Use `SafeArea` for content near edges | Medium |
| 13 | Prefer `Flexible`/`Expanded` over fixed sizes | Medium |
| 14 | Use `Hero` for page transition shared elements | Low |
| 15 | Apply `TextScaler` support for accessibility | Low |

---

## Anti-Patterns to Avoid

- Wrapping everything in Cards — not everything needs a container
- Nesting Cards inside Cards — visual noise
- Same-sized card grids repeated endlessly
- Identical padding/spacing everywhere — create rhythm through variation
- Centering everything — left-aligned with asymmetric layouts feels more designed
- Using pure black (#000) or pure white (#fff) — always tint
- Gradient text for "impact" — decorative rather than meaningful
- Glassmorphism everywhere without purpose
- Bounce/elastic easing — feels dated; use smooth deceleration

---

*Sources: [everything-claude-code/dart-flutter-patterns](https://github.com/affaan-m/everything-claude-code), [flutter-ai-ui-skill](https://github.com/rantlieu-blip/flutter-ai-ui-skill)*
