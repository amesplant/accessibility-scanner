# Accessibility Standards & Best Practices

All features must minimally meet **WCAG 2.2 AA**. This document is the reference for what that means in practice.

---

## Non-Negotiable Rules

- Every interactive element must be keyboard operable and have a visible focus indicator.
- Color must never be the sole means of conveying information.
- All status changes must be announced to assistive technology without moving focus.

---

## WCAG 2.2 AA Checklist

### Perceivable

| Criterion | Requirement | Implementation |
|-----------|-------------|----------------|
| 1.1.1 Non-text Content | Every image, icon, and graphic has a text alternative | Use `alt` on `<img>`, `aria-label` on icon-only buttons, `aria-hidden="true"` on decorative icons |
| 1.3.1 Info & Relationships | Structure is conveyed semantically, not just visually | Use `<h1>`–`<h6>`, `<ul>`, `<table>` with `<th>`, landmark roles (`<main>`, `<nav>`, `<aside>`) |
| 1.3.2 Meaningful Sequence | Reading order in the DOM matches visual order | Avoid CSS-only reordering (`order`, `flex-direction: row-reverse`) that diverges from DOM order |
| 1.3.3 Sensory Characteristics | Instructions don't rely solely on shape, color, size, or location | "Click the red button" → "Click the Submit button" |
| 1.3.4 Orientation | Content is not locked to portrait or landscape | Avoid fixed orientation unless essential |
| 1.3.5 Identify Input Purpose | Autocomplete attributes on personal data fields | Use `autocomplete="name"`, `autocomplete="email"`, etc. |
| 1.4.1 Use of Color | Color is not the only visual means of conveying information | Pair color with icons, patterns, or text labels |
| 1.4.2 Audio Control | Any audio that plays automatically for more than 3s can be paused | Provide a stop/pause/mute control |
| 1.4.3 Contrast (Minimum) | Text contrast ≥ 4.5:1; large text (18pt/14pt bold) ≥ 3:1 | Use a contrast checker; avoid light grey on white |
| 1.4.4 Resize Text | Page is usable at 200% zoom without horizontal scroll | Test at browser 200% zoom |
| 1.4.5 Images of Text | Use real text instead of images of text | Avoid screenshots of code/text as content |
| 1.4.10 Reflow | Content reflows at 320px CSS width without horizontal scrolling | Test at 320px viewport; avoid fixed-width containers |
| 1.4.11 Non-text Contrast | UI components and focus indicators have contrast ≥ 3:1 against adjacent colors | Check button borders, input borders, chart lines |
| 1.4.12 Text Spacing | No content lost when line-height, letter-spacing, word-spacing are increased | Don't use fixed-height containers that clip overflowing text |
| 1.4.13 Content on Hover/Focus | Tooltips/popovers triggered by hover are dismissible, hoverable, and persistent | User can move mouse over tooltip; Escape dismisses it |

### Operable

| Criterion | Requirement | Implementation |
|-----------|-------------|----------------|
| 2.1.1 Keyboard | All functionality is available via keyboard | Test Tab, Shift+Tab, Enter, Space, arrow keys; no mouse-only interactions |
| 2.1.2 No Keyboard Trap | Focus can always move away from any component | Modal dialogs must release focus on Escape or close button |
| 2.1.4 Character Key Shortcuts | Single-key shortcuts can be turned off or remapped | Avoid single-character keyboard shortcuts unless user can disable them |
| 2.4.1 Bypass Blocks | A skip-to-main-content link is provided | Implement a visually hidden "Skip to main content" link as the first focusable element |
| 2.4.2 Page Titled | Every page/view has a descriptive `<title>` | Update `document.title` on route changes |
| 2.4.3 Focus Order | Focus moves in a logical, meaningful sequence | Match DOM order to visual order; manage focus on modal open/close |
| 2.4.4 Link Purpose | Link text is descriptive on its own or in context | Avoid "Click here" or "Read more" without context; use `aria-label` if needed |
| 2.4.6 Headings & Labels | Headings and labels are descriptive | Headings summarize section content; labels identify controls |
| 2.4.7 Focus Visible | Keyboard focus indicator is always visible | Never use `outline: none` without a custom visible replacement |
| 2.4.11 Focus Not Obscured (Minimum) | Focused component is not entirely hidden by sticky/fixed content | Ensure sticky headers or cookie banners don't fully cover focused elements |
| 2.5.3 Label in Name | The accessible name of a control contains its visible label text | Button labeled "Search" must have accessible name containing "Search" |
| 2.5.4 Motion Actuation | Functionality triggered by motion has an alternative UI control | Avoid shake-to-undo type patterns without a button equivalent |
| 2.5.7 Dragging Movements | Any drag operation has a single-pointer alternative | Provide buttons or inputs as alternatives to drag-and-drop |
| 2.5.8 Target Size (Minimum) | Interactive targets are at least 24×24 CSS pixels | Prefer 44×44px for touch; ensure spacing compensates for smaller targets |

### Understandable

| Criterion | Requirement | Implementation |
|-----------|-------------|----------------|
| 3.1.1 Language of Page | `lang` attribute is set on `<html>` | `<html lang="en">` |
| 3.1.2 Language of Parts | Content in a different language is marked | `<span lang="fr">Bonjour</span>` |
| 3.2.1 On Focus | Focus alone does not trigger a context change | Don't submit forms or navigate on focus |
| 3.2.2 On Input | Changing a control's value doesn't cause an unexpected context change | Inform users before an action if it will trigger navigation |
| 3.2.3 Consistent Navigation | Navigation repeated across views appears in the same order | Keep nav structure consistent across pages |
| 3.2.4 Consistent Identification | Components with the same function are labeled consistently | A search button is always called "Search", not "Search" on one page and "Find" on another |
| 3.3.1 Error Identification | Errors are identified in text and describe the specific problem | "Email is required" not just a red border |
| 3.3.2 Labels or Instructions | Every input has a label or clear instructions | Use `<Label htmlFor>` — never placeholder-only labeling |
| 3.3.3 Error Suggestion | Where possible, suggest how to fix an error | "Enter a valid email address, e.g. name@example.com" |
| 3.3.4 Error Prevention | For important submissions, provide review, confirm, or undo | Destructive actions (delete, submit) should confirm before executing |
| 3.3.7 Redundant Entry | Users are not asked to re-enter information already provided in the same session | Auto-fill or carry forward previously entered values where appropriate |

### Robust

| Criterion | Requirement | Implementation |
|-----------|-------------|----------------|
| 4.1.1 Parsing | HTML is valid and well-formed | No duplicate IDs; elements properly nested; tags closed |
| 4.1.2 Name, Role, Value | All UI components expose name, role, and value to assistive tech | Use semantic HTML first; add ARIA only when semantics are insufficient. Custom components need `role`, `aria-label`/`aria-labelledby`, and `aria-checked`/`aria-expanded` etc. as appropriate |
| 4.1.3 Status Messages | Status messages are announced without moving focus | Use `role="status"` (polite) or `role="alert"` (assertive) for dynamic messages like save confirmations, errors, or loading states |

---

## ARIA Best Practices

- **First rule of ARIA**: use native HTML elements before reaching for ARIA. `<button>` beats `<div role="button">`.
- Don't add `role="presentation"` or `aria-hidden="true"` to focusable elements.
- `aria-label` overrides visible text — keep them in sync or use `aria-labelledby` instead.
- `aria-describedby` supplements; `aria-labelledby` names. Use both where appropriate.
- Modal dialogs: set `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the dialog title, and trap focus within the dialog.
- Live regions: use `aria-live="polite"` for non-urgent updates (save success), `aria-live="assertive"` / `role="alert"` for urgent errors only.
- Expandable controls: use `aria-expanded="true/false"` on the trigger, not the panel.
- Required fields: use `aria-required="true"` in addition to `required` for maximum compatibility.

## Focus Management

- When opening a modal, dialog, or drawer: move focus to the first focusable element inside it (or the dialog container itself).
- When closing a modal: return focus to the element that triggered it.
- When navigating to a new route (SPA): move focus to the main heading or a skip target.
- When content updates dynamically (e.g. filtered results): announce the change via a live region rather than moving focus unexpectedly.
- Never remove the focus outline without providing an equivalent custom indicator with sufficient contrast (≥ 3:1).

## Keyboard Interaction Patterns

| Component | Expected Keyboard Behavior |
|-----------|---------------------------|
| Button | Enter / Space activates |
| Link | Enter activates |
| Checkbox | Space toggles |
| Radio group | Arrow keys move between options; Tab exits the group |
| Select / Listbox | Arrow keys navigate options; Enter/Space selects |
| Dialog | Escape closes; Tab cycles focus within; Shift+Tab reverses |
| Tabs | Arrow keys switch tabs; Tab moves into tab panel |
| Accordion | Enter/Space toggles panel |
| Tooltip | Escape dismisses |
| Menu / Dropdown | Arrow keys navigate items; Escape closes; Enter/Space activates item |

## Forms

- Every input must have a programmatically associated `<label>` via `htmlFor`/`id` — no exceptions.
- Never use `placeholder` on inputs or textareas — placeholder text disappears on input, has insufficient contrast, and is not a substitute for a label.
- Group related inputs with `<fieldset>` and `<legend>`.
- Inline error messages must be associated with the input via `aria-describedby`.
- Required fields must be communicated in text (not only with an asterisk) or via `aria-required="true"`.
- Success/error states must not rely on color alone — pair with icons and text.

## Images & Media

- Decorative images: `alt=""` and `aria-hidden="true"`.
- Informative images: `alt` describing the content and its purpose.
- Complex images (charts, diagrams): provide a long description via `aria-describedby` or an adjacent text block.
- Icons used as buttons: `aria-label` on the button, `aria-hidden="true"` on the icon itself.

## Testing Checklist (Before Marking a Feature Done)

- [ ] Tab through every interactive element — is the order logical? Is focus always visible?
- [ ] Activate every button and link with keyboard only (Enter/Space)
- [ ] Open and close any modals/dialogs — does focus move correctly in both directions?
- [ ] Check color contrast for all text and UI components
- [ ] Zoom to 200% — is content still usable?
- [ ] Resize to 320px width — does content reflow without horizontal scroll?
- [ ] Test with a screen reader (VoiceOver on macOS, NVDA on Windows) for critical flows
- [ ] Confirm all dynamic updates (filter results, save confirmations, errors) are announced via live regions
