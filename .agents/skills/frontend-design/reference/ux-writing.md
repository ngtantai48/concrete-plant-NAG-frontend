# UX Writing

## The Button Label Problem

**Never use "OK", "Submit", or "Yes/No".** Use specific verb + object patterns:

| Bad | Good | Why |
|-----|------|-----|
| OK | Save changes | Says what will happen |
| Submit | Create account | Outcome-focused |
| Yes | Delete message | Confirms the action |
| Cancel | Keep editing | Clarifies what "cancel" means |

**For destructive actions**, name the destruction: "Delete 5 items" not "Delete selected".

## Error Messages: The Formula

Every error message should answer: (1) What happened? (2) Why? (3) How to fix it?

| Situation | Template |
|-----------|----------|
| **Format error** | "[Field] needs to be [format]. Example: [example]" |
| **Missing required** | "Please enter [what's missing]" |
| **Permission denied** | "You don't have access to [thing]. [What to do instead]" |
| **Network error** | "We couldn't reach [thing]. Check your connection and [action]." |

### Don't Blame the User
"Please enter a date in MM/DD/YYYY format" not "You entered an invalid date".

## Empty States Are Opportunities

1. Acknowledge briefly
2. Explain the value of filling it
3. Provide a clear action

"No projects yet. Create your first one to get started." not just "No items".

## Voice vs Tone

| Moment | Tone Shift |
|--------|------------|
| Success | Celebratory, brief: "Done! Your changes are live." |
| Error | Empathetic, helpful: "That didn't work. Here's what to try..." |
| Loading | Reassuring: "Saving your work..." |
| Destructive confirm | Serious, clear: "Delete this project? This can't be undone." |

## Consistency: The Terminology Problem

| Inconsistent | Consistent |
|--------------|------------|
| Delete / Remove / Trash | Delete |
| Settings / Preferences / Options | Settings |
| Sign in / Log in / Enter | Sign in |
| Create / Add / New | Create |

## Writing for Translation

German text is ~30% longer than English. Keep numbers separate. Use full sentences as single strings. Avoid abbreviations. Give translators context.

## Confirmation Dialogs: Use Sparingly

Most confirmation dialogs are design failures—consider undo instead. When you must confirm: name the action, explain consequences, use specific button labels.

---

**Avoid**: Jargon without explanation. Blaming users. Vague errors. Varying terminology for variety. Humor for errors.
