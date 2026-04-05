import { AuditType, ManualCheckResult } from './types';

export type CheckCategory =
  | 'Keyboard & Focus'
  | 'Forms & Input'
  | 'Images & Media'
  | 'Color & Visual'
  | 'Links & Navigation'
  | 'Content & Structure'
  | 'Video & Audio';

export type CheckPriority = 'high' | 'medium' | 'low';

export interface PredefinedCheck {
  id: string;
  criterion: string;
  level: 'A' | 'AA' | 'AAA';
  title: string;
  description: string;
  category: CheckCategory;
  priority: CheckPriority;
  /** Actionable testing questions the auditor works through while evaluating this criterion. */
  questions: string[];
  /** Which audit tiers include this criterion. */
  auditTags: ('rapid' | 'mid-level')[];
}

const _CHECKS: Omit<PredefinedCheck, 'auditTags'>[] = [
  // ── Level A ──────────────────────────────────────────────────────────────
  {
    id: '1.1.1', criterion: '1.1.1', level: 'A',
    title: 'Non-text Content',
    description: 'All non-text content has a text alternative that serves the equivalent purpose.',
    category: 'Images & Media',
    priority: 'high',
    questions: [
      'For each image flagged below, does the alt text accurately convey the content or function — not just "image of" or the filename?',
      'Are purely decorative images marked with empty alt="" or aria-hidden="true" so screen readers skip them?',
      'Do icon-only buttons and controls have an accessible name (aria-label, title, or visually-hidden text) that describes the action — not the icon?',
      'For complex images (charts, graphs, diagrams), is there a longer description via aria-describedby or a nearby caption?',
      'Do SVGs used as meaningful content have a <title> element and role="img", or an aria-label?',
      'Are CAPTCHA images accompanied by an audio alternative or other accessible challenge?',
    ],
  },
  {
    id: '1.2.1', criterion: '1.2.1', level: 'A',
    title: 'Audio-only and Video-only (Prerecorded)',
    description: 'Prerecorded audio-only and video-only content has an equivalent alternative.',
    category: 'Video & Audio',
    priority: 'low',
    questions: [
      'Is there a text transcript for any audio-only content (e.g. podcasts, audio clips)?',
      'Is there a text or audio equivalent for any video-only content (e.g. a silent instructional video)?',
    ],
  },
  {
    id: '1.2.2', criterion: '1.2.2', level: 'A',
    title: 'Captions (Prerecorded)',
    description: 'Captions are provided for all prerecorded audio content in synchronized media.',
    category: 'Video & Audio',
    priority: 'medium',
    questions: [
      'Do all videos that contain speech or meaningful audio have closed captions?',
      'Are captions accurately synchronized with the audio and free of significant errors?',
      'Do captions identify speakers and describe relevant non-speech sounds (e.g. [applause], [music])?',
    ],
  },
  {
    id: '1.3.1', criterion: '1.3.1', level: 'A',
    title: 'Info and Relationships',
    description: 'Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text.',
    category: 'Content & Structure',
    priority: 'high',
    questions: [
      'For each heading flagged below, is the visible heading text coded with an actual h1–h6 element rather than bold/large styled text?',
      'Does the heading hierarchy make sense — is there exactly one h1, and do sub-headings use h2/h3 in logical nesting order?',
      'For each form field flagged below, is every input, select, and textarea associated with a visible label via <label for>, aria-labelledby, or aria-label?',
      'Do any data tables lack <th> header cells, or are <th> cells missing scope="col"/"row" attributes?',
      'Are lists of items coded as <ul> or <ol> rather than visual dashes or line breaks?',
      'Do page regions (header, main content, navigation, footer) use the correct ARIA landmark roles or HTML5 sectioning elements?',
    ],
  },
  {
    id: '1.3.2', criterion: '1.3.2', level: 'A',
    title: 'Meaningful Sequence',
    description: 'When the sequence in which content is presented affects its meaning, a correct reading sequence can be programmatically determined.',
    category: 'Content & Structure',
    priority: 'medium',
    questions: [
      'When CSS is disabled or linearized, does the content still read in a logical order?',
      'In multi-column layouts, does the reading order follow the visual left-to-right, top-to-bottom flow?',
      'Do tables used for layout preserve meaningful reading order when linearized row by row?',
    ],
  },
  {
    id: '1.3.3', criterion: '1.3.3', level: 'A',
    title: 'Sensory Characteristics',
    description: 'Instructions do not rely solely on sensory characteristics such as shape, color, size, visual location, or sound.',
    category: 'Content & Structure',
    priority: 'medium',
    questions: [
      'Do any instructions reference shape, position, or color alone — e.g. "click the green button" or "see the panel on the right"?',
      'Can a blind or color-blind user follow every instruction on the page without relying on visual cues?',
    ],
  },
  {
    id: '1.4.1', criterion: '1.4.1', level: 'A',
    title: 'Use of Color',
    description: 'Color is not used as the only visual means of conveying information, indicating an action, or distinguishing an element.',
    category: 'Color & Visual',
    priority: 'high',
    questions: [
      'Are required form fields indicated by something other than color alone (e.g. an asterisk or the word "required")?',
      'Do charts, graphs, or data visualizations use labels, patterns, or icons in addition to color?',
      'If links are styled to match surrounding body text, are they distinguished by underline or another non-color cue?',
    ],
  },
  {
    id: '2.1.1', criterion: '2.1.1', level: 'A',
    title: 'Keyboard',
    description: 'All functionality is operable through a keyboard interface without requiring specific timings for individual keystrokes.',
    category: 'Keyboard & Focus',
    priority: 'high',
    questions: [
      'Tab through the entire page using only Tab and Shift+Tab — can you reach every link, button, input, and interactive control?',
      'Press Enter to activate links and buttons, and Space to activate buttons and checkboxes — do they respond correctly?',
      'For menus, dropdowns, and listboxes, can you open them with Enter/Space and navigate options with arrow keys?',
      'Do any of the elements flagged below (those with JS click or drag handlers on non-interactive elements) have a usable keyboard equivalent?',
      'Open any modals, dialogs, or off-canvas panels — does focus move into them, and can you close them with Escape?',
      'Is there any functionality that requires a mouse gesture (hover to reveal, drag-and-drop) with no keyboard alternative?',
      'After dynamic content changes (modal closes, accordion expands, alert appears), does focus move to a logical location?',
    ],
  },
  {
    id: '2.1.2', criterion: '2.1.2', level: 'A',
    title: 'No Keyboard Trap',
    description: 'If keyboard focus can be moved to a component, focus can be moved away using only the keyboard.',
    category: 'Keyboard & Focus',
    priority: 'high',
    questions: [
      'Tab to every focusable element on the page — can you always move forward with Tab and backward with Shift+Tab without getting stuck?',
      'For each keyboard handler flagged below, does it intercept Tab or Escape in a way that prevents navigating away from the element?',
      'Tab into any modal or dialog — does focus stay within it, and can you close it with Escape to return focus to the trigger?',
      'Are there any iframes or embedded widgets where keyboard focus becomes invisible or impossible to exit without a mouse?',
      'In custom widgets (carousels, date pickers, rich text editors) do arrow keys work inside the widget AND allow Tab to exit it?',
      'After completing a form section or closing an overlay, can you Tab past the component to continue through the rest of the page?',
      'Does any element with a positive tabindex create a confusing tab order that makes it hard to predict where focus will land?',
    ],
  },
  {
    id: '2.3.1', criterion: '2.3.1', level: 'A',
    title: 'Three Flashes or Below Threshold',
    description: 'Web pages do not contain anything that flashes more than three times in any one-second period.',
    category: 'Color & Visual',
    priority: 'high',
    questions: [
      'Does any content on the page flash, blink, or strobe rapidly (more than 3 times per second)?',
      'Are any animations, GIFs, or videos free of rapidly flashing elements that could trigger photosensitive seizures?',
    ],
  },
  {
    id: '2.4.1', criterion: '2.4.1', level: 'A',
    title: 'Bypass Blocks',
    description: 'A mechanism is available to bypass blocks of content that are repeated on multiple web pages.',
    category: 'Links & Navigation',
    priority: 'high',
    questions: [
      'Is there a "skip to main content" link or similar mechanism at the top of the page?',
      'Does the skip link become visible when focused and successfully move focus past repeated navigation?',
      'Are ARIA landmark regions (main, nav) present so screen reader users can skip to key areas?',
    ],
  },
  {
    id: '2.4.2', criterion: '2.4.2', level: 'A',
    title: 'Page Titled',
    description: 'Web pages have titles that describe topic or purpose.',
    category: 'Links & Navigation',
    priority: 'high',
    questions: [
      'Does the <title> element accurately describe the current page\'s topic or purpose?',
      'Is the title unique across the site so users can distinguish pages in browser tabs or history?',
      'For dynamically updated pages, does the title update to reflect the current content or state?',
    ],
  },
  {
    id: '2.4.3', criterion: '2.4.3', level: 'A',
    title: 'Focus Order',
    description: 'If a web page can be navigated sequentially, focusable components receive focus in an order that preserves meaning and operability.',
    category: 'Keyboard & Focus',
    priority: 'high',
    questions: [
      'When tabbing through the page, does focus move in a logical reading order (top to bottom, left to right)?',
      'After opening a dialog, dropdown, or dynamic content, does focus move into the new content?',
      'When content closes or is removed, does focus return to a logical location rather than jumping to the top of the page?',
    ],
  },
  {
    id: '2.4.4', criterion: '2.4.4', level: 'A',
    title: 'Link Purpose (In Context)',
    description: 'The purpose of each link can be determined from the link text alone or from the link and its context.',
    category: 'Links & Navigation',
    priority: 'high',
    questions: [
      'For each ambiguous link flagged below, does the surrounding paragraph or heading provide enough context to determine where it goes?',
      'Are any "read more", "click here", or "learn more" links grouped with a visually adjacent heading that could serve as context — is that relationship programmatically exposed (e.g., aria-labelledby)?',
      'Do any duplicate link texts (same text, different destinations) have an aria-label that distinguishes them?',
      'Are image-only links missing an alt attribute or aria-label that describes the destination?',
      'For links inside tables, does the row or column header make the purpose clear to screen reader users?',
    ],
  },
  {
    id: '3.1.1', criterion: '3.1.1', level: 'A',
    title: 'Language of Page',
    description: 'The default human language of each web page can be programmatically determined.',
    category: 'Content & Structure',
    priority: 'medium',
    questions: [
      'Does the <html> element have a lang attribute that correctly identifies the page\'s primary language (e.g. lang="en")?',
      'For multilingual sites, is the lang attribute updated when the user switches language?',
    ],
  },
  {
    id: '3.2.1', criterion: '3.2.1', level: 'A',
    title: 'On Focus',
    description: 'If any component receives focus, it does not automatically change the context.',
    category: 'Keyboard & Focus',
    priority: 'medium',
    questions: [
      'Tab to every interactive element — does focus on any element trigger a page navigation, URL change, or form submission without a deliberate user action?',
      'Do any of the elements flagged below (those with JavaScript focus handlers or autofocus) cause a context change when tabbed to?',
      'Does any element receive focus automatically on page load (autofocus) in a way that bypasses the expected reading order?',
      'Do tooltips or fly-out menus that open on focus stay open long enough to be read without stealing focus or changing the page?',
    ],
  },
  {
    id: '3.2.2', criterion: '3.2.2', level: 'A',
    title: 'On Input',
    description: 'Changing a setting of a user interface component does not automatically cause a change of context.',
    category: 'Forms & Input',
    priority: 'medium',
    questions: [
      'Does selecting an option in a dropdown or radio group automatically navigate to a new page without a submit button?',
      'Does toggling a checkbox or switch cause an unexpected page reload or modal to appear without user initiation?',
    ],
  },
  {
    id: '3.3.1', criterion: '3.3.1', level: 'A',
    title: 'Error Identification',
    description: 'If an input error is detected, the item in error is identified and the error is described to the user in text.',
    category: 'Forms & Input',
    priority: 'high',
    questions: [
      'When you submit a form with intentional errors, is each specific field in error clearly identified in text?',
      'Is the error message descriptive enough to tell the user what went wrong, not just that something went wrong?',
      'Are errors communicated by text alone, not only by color, icon, or border change?',
    ],
  },
  {
    id: '3.3.2', criterion: '3.3.2', level: 'A',
    title: 'Labels or Instructions',
    description: 'Labels or instructions are provided when content requires user input.',
    category: 'Forms & Input',
    priority: 'high',
    questions: [
      'Does every form input have a visible, descriptive label that is still present when the field is focused?',
      'Are placeholder texts used as substitutes for labels (they should not be — placeholders disappear on input)?',
      'Are there format hints for fields that require a specific format, such as dates (MM/DD/YYYY) or phone numbers?',
    ],
  },
  // ── Level AA ─────────────────────────────────────────────────────────────
  {
    id: '1.2.4', criterion: '1.2.4', level: 'AA',
    title: 'Captions (Live)',
    description: 'Captions are provided for all live audio content in synchronized media.',
    category: 'Video & Audio',
    priority: 'low',
    questions: [
      'Does any live video or webinar stream on this page provide real-time captions?',
      'Are the live captions accurate enough to convey the meaning of the audio without major gaps?',
    ],
  },
  {
    id: '1.2.5', criterion: '1.2.5', level: 'AA',
    title: 'Audio Description (Prerecorded)',
    description: 'Audio description is provided for all prerecorded video content in synchronized media.',
    category: 'Video & Audio',
    priority: 'low',
    questions: [
      'Does any video convey meaningful information visually that is not described in the existing audio track?',
      'If so, is an audio description track or described version of the video available?',
    ],
  },
  {
    id: '1.4.3', criterion: '1.4.3', level: 'AA',
    title: 'Contrast (Minimum)',
    description: 'Text and images of text have a contrast ratio of at least 4.5:1; large text requires at least 3:1.',
    category: 'Color & Visual',
    priority: 'high',
    questions: [
      'Does all normal-sized body text meet a 4.5:1 contrast ratio against its background?',
      'Does all large text (18pt+ regular or 14pt+ bold) meet at least 3:1 contrast?',
      'Do placeholder texts, disabled labels, and decorative text that conveys information meet the minimum threshold?',
    ],
  },
  {
    id: '1.4.4', criterion: '1.4.4', level: 'AA',
    title: 'Resize Text',
    description: 'Text can be resized without assistive technology up to 200% without loss of content or functionality.',
    category: 'Color & Visual',
    priority: 'medium',
    questions: [
      'At 200% browser zoom, is all text readable and does no content become truncated, overlapping, or hidden?',
      'Does the page layout adapt gracefully, or does it require horizontal scrolling at 200% zoom?',
      'Are any text sizes set in px that prevent scaling when the user changes browser font size?',
    ],
  },
  {
    id: '1.4.10', criterion: '1.4.10', level: 'AA',
    title: 'Reflow',
    description: 'Content can be presented without loss of information at 320px width without requiring two-dimensional scrolling.',
    category: 'Color & Visual',
    priority: 'high',
    questions: [
      'At 320px viewport width (or 400% browser zoom), can you access all content by scrolling in one direction only?',
      'Does any content get cut off, hidden, or require horizontal scrolling at small viewport widths?',
      'Do tables, code blocks, or fixed-width elements break the single-axis scroll requirement?',
    ],
  },
  {
    id: '1.4.11', criterion: '1.4.11', level: 'AA',
    title: 'Non-text Contrast',
    description: 'The visual presentation of UI components and graphical objects has at least a 3:1 contrast ratio against adjacent color(s).',
    category: 'Color & Visual',
    priority: 'high',
    questions: [
      'Do buttons, input borders, checkboxes, radio buttons, and toggle switches meet a 3:1 contrast ratio against their background?',
      'Do focus indicators (outlines, rings) have at least 3:1 contrast against the adjacent background?',
      'Do meaningful icons and graphical elements (e.g. chart lines, error icons) meet the 3:1 ratio?',
    ],
  },
  {
    id: '1.4.12', criterion: '1.4.12', level: 'AA',
    title: 'Text Spacing',
    description: 'No loss of content or functionality occurs when text spacing is changed (line height, letter spacing, word spacing, paragraph spacing).',
    category: 'Color & Visual',
    priority: 'medium',
    questions: [
      'Apply the WCAG text spacing bookmarklet (line-height: 1.5, letter-spacing: 0.12em, word-spacing: 0.16em, paragraph spacing: 2em) — does any text overlap, get clipped, or disappear?',
      'Do any interactive components (dropdowns, tooltips) break or become unusable with the overridden spacing?',
    ],
  },
  {
    id: '2.4.6', criterion: '2.4.6', level: 'AA',
    title: 'Headings and Labels',
    description: 'Headings and labels describe topic or purpose.',
    category: 'Content & Structure',
    priority: 'high',
    questions: [
      'Do all headings accurately describe the content of the section that follows them?',
      'Are heading levels used consistently so that lower-level headings are visually less prominent than higher-level ones?',
      'Are all form labels descriptive enough that users can understand what input is expected?',
    ],
  },
  {
    id: '2.4.7', criterion: '2.4.7', level: 'AA',
    title: 'Focus Visible',
    description: 'Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.',
    category: 'Keyboard & Focus',
    priority: 'high',
    questions: [
      'Tab to every interactive element — is there always a clearly visible focus indicator (outline, ring, border, or background change)?',
      'Do any of the elements flagged below have outline: none or outline: 0 without a visible replacement style such as box-shadow or border?',
      'Is the focus indicator visible against both light and dark backgrounds it may appear on?',
      'Does the focus indicator have at least 3:1 contrast against the adjacent background color?',
      'For custom focus styles using box-shadow or border-color, do they remain visible in Windows High Contrast Mode?',
    ],
  },
  {
    id: '2.5.3', criterion: '2.5.3', level: 'AA',
    title: 'Label in Name',
    description: 'For user interface components with labels that include text or images of text, the accessible name contains the visible text.',
    category: 'Forms & Input',
    priority: 'high',
    questions: [
      'Does each button\'s or input\'s accessible name (aria-label or aria-labelledby) include the visible text label?',
      'Are there any components where the accessible name is completely different from the visible label?',
      'Do icon buttons with visible text have an accessible name that starts with or matches that text?',
    ],
  },
  {
    id: '3.2.3', criterion: '3.2.3', level: 'AA',
    title: 'Consistent Navigation',
    description: 'Navigational mechanisms that are repeated on multiple pages occur in the same relative order each time they are repeated.',
    category: 'Links & Navigation',
    priority: 'medium',
    questions: [
      'Does the main navigation appear in the same location and order on every page of the site?',
      'Do repeated elements like header, footer, and sidebar maintain their relative order across different page templates?',
    ],
  },
  {
    id: '3.2.4', criterion: '3.2.4', level: 'AA',
    title: 'Consistent Identification',
    description: 'Components that have the same functionality across pages are identified consistently.',
    category: 'Links & Navigation',
    priority: 'medium',
    questions: [
      'Are components with identical functions labeled the same way across all pages (e.g. search, close, submit)?',
      'Do icons that perform the same action always have the same accessible name, regardless of where they appear?',
    ],
  },
  {
    id: '3.3.3', criterion: '3.3.3', level: 'AA',
    title: 'Error Suggestion',
    description: 'If an input error is detected and suggestions for correction are known, the suggestion is provided to the user in text.',
    category: 'Forms & Input',
    priority: 'medium',
    questions: [
      'When a field expects a specific format (e.g. email, date, phone), does the error message tell the user how to correct it?',
      'For selection-based fields with a known set of valid values, does the error message suggest the correct options?',
    ],
  },
  {
    id: '3.3.4', criterion: '3.3.4', level: 'AA',
    title: 'Error Prevention (Legal, Financial, Data)',
    description: 'For pages that cause legal commitments or financial transactions, submissions can be reversed, checked, or confirmed.',
    category: 'Forms & Input',
    priority: 'medium',
    questions: [
      'For checkout, account creation, or legal agreement forms, is there a review step before final submission?',
      'Can the user go back and edit their submission, or is there a confirmation dialog before irreversible actions are taken?',
    ],
  },
  // ── Level AAA ─────────────────────────────────────────────────────────────
  {
    id: '1.2.6', criterion: '1.2.6', level: 'AAA',
    title: 'Sign Language (Prerecorded)',
    description: 'Sign language interpretation is provided for all prerecorded audio content in synchronized media.',
    category: 'Video & Audio',
    priority: 'low',
    questions: [
      'Is a sign language interpretation video available for all prerecorded videos that contain speech?',
      'Is the sign language interpreter clearly visible and sized appropriately in the video frame?',
    ],
  },
  {
    id: '1.4.6', criterion: '1.4.6', level: 'AAA',
    title: 'Contrast (Enhanced)',
    description: 'Text and images of text have a contrast ratio of at least 7:1; large text requires at least 4.5:1.',
    category: 'Color & Visual',
    priority: 'medium',
    questions: [
      'Does all body and UI text achieve at least a 7:1 contrast ratio against its background?',
      'Does all large text (18pt+ regular or 14pt+ bold) achieve at least 4.5:1?',
      'Are there any low-contrast placeholder texts, captions, or helper text that fall below the 7:1 threshold?',
    ],
  },
  {
    id: '2.1.3', criterion: '2.1.3', level: 'AAA',
    title: 'Keyboard (No Exception)',
    description: 'All functionality is operable through a keyboard interface with no exceptions for timing.',
    category: 'Keyboard & Focus',
    priority: 'low',
    questions: [
      'Is every single function on the page operable by keyboard, with absolutely no exceptions for path-dependent or freehand input?',
      'Are there any drawing tools, drag-and-drop interfaces, or time-sensitive interactions that cannot be replicated by keyboard?',
    ],
  },
  {
    id: '2.4.8', criterion: '2.4.8', level: 'AAA',
    title: 'Location',
    description: 'Information about the user\'s location within a set of web pages is available (e.g. breadcrumbs, site map).',
    category: 'Links & Navigation',
    priority: 'low',
    questions: [
      'Is there a breadcrumb trail, site map, or other mechanism that shows the user where they are within the site structure?',
      'Does the page title or heading clearly indicate the current page\'s position in the site hierarchy?',
    ],
  },
  {
    id: '2.4.9', criterion: '2.4.9', level: 'AAA',
    title: 'Link Purpose (Link Only)',
    description: 'The purpose of each link can be identified from the link text alone, without any surrounding context.',
    category: 'Links & Navigation',
    priority: 'medium',
    questions: [
      'Does every link\'s text unambiguously describe its destination when read completely out of context?',
      'Are there any links whose purpose only makes sense because of the surrounding paragraph or heading?',
    ],
  },
  {
    id: '2.4.10', criterion: '2.4.10', level: 'AAA',
    title: 'Section Headings',
    description: 'Section headings are used to organize content throughout the page.',
    category: 'Content & Structure',
    priority: 'medium',
    questions: [
      'Does every major section of content have a descriptive heading that allows users to understand its purpose?',
      'Is the heading hierarchy logical (h1 → h2 → h3) without skipping levels?',
      'Can a screen reader user navigate the page\'s structure meaningfully using headings alone?',
    ],
  },
  {
    id: '3.1.3', criterion: '3.1.3', level: 'AAA',
    title: 'Unusual Words',
    description: 'A mechanism is available for identifying definitions of unusual or restricted words, idioms, and jargon.',
    category: 'Content & Structure',
    priority: 'low',
    questions: [
      'Is there a glossary, inline definition, or tooltip for any technical jargon, acronyms, or industry-specific terms?',
      'Are idioms or figurative language explained for users who may interpret them literally?',
    ],
  },
  {
    id: '3.1.5', criterion: '3.1.5', level: 'AAA',
    title: 'Reading Level',
    description: 'Supplemental content is available when text requires reading ability more advanced than lower secondary education.',
    category: 'Content & Structure',
    priority: 'low',
    questions: [
      'Does the page\'s primary content require advanced reading ability (above a ~12-year-old level)?',
      'If so, is there a simpler summary, plain language version, or supplemental explanation available?',
    ],
  },
  {
    id: '3.2.5', criterion: '3.2.5', level: 'AAA',
    title: 'Change on Request',
    description: 'Changes of context are initiated only by user request, or a mechanism is available to turn off such changes.',
    category: 'Keyboard & Focus',
    priority: 'low',
    questions: [
      'Does the page automatically redirect, refresh, or open new windows without the user explicitly requesting it?',
      'Do carousels, slideshows, or auto-updating content change context without user control?',
      'If automatic changes exist, is there a mechanism to turn them off before they occur?',
    ],
  },
  {
    id: '3.3.5', criterion: '3.3.5', level: 'AAA',
    title: 'Help',
    description: 'Context-sensitive help is available for pages that require user input.',
    category: 'Forms & Input',
    priority: 'medium',
    questions: [
      'For complex or non-obvious form fields, is context-sensitive help (tooltip, info icon, or inline guidance) available?',
      'Is the help accessible by keyboard and screen reader, not just on mouse hover?',
    ],
  },
  {
    id: '3.3.6', criterion: '3.3.6', level: 'AAA',
    title: 'Error Prevention (All)',
    description: 'For all pages requiring user submission, submissions can be reversed, verified, or confirmed.',
    category: 'Forms & Input',
    priority: 'medium',
    questions: [
      'On every page with a form submission, can the user review and correct their input before it is finalized?',
      'Is there a confirmation step, undo mechanism, or review screen before any irreversible action is completed?',
    ],
  },
];

/** Display order for the By Category view */
export const CATEGORY_ORDER: CheckCategory[] = [
  'Keyboard & Focus',
  'Images & Media',
  'Color & Visual',
  'Forms & Input',
  'Links & Navigation',
  'Content & Structure',
  'Video & Audio',
];

/** One-line testing hint shown under each category heading */
export const CATEGORY_DESCRIPTIONS: Record<CheckCategory, string> = {
  'Keyboard & Focus':    'Tab through the page without a mouse — verify all controls are reachable and focus is always visible.',
  'Images & Media':      'Inspect all images, icons, and graphics for meaningful, accurate text alternatives.',
  'Color & Visual':      'Test with zoomed text, high contrast, and custom text spacing; check UI component contrast ratios.',
  'Forms & Input':       'Submit forms with intentional errors; verify every input has a visible label and helpful error messages.',
  'Links & Navigation':  'Read link text in isolation — does each one describe its destination without surrounding context?',
  'Content & Structure': 'Look for instructions that rely on position, shape, color, or sound to convey meaning.',
  'Video & Audio':       'Check for captions, transcripts, or audio descriptions on any media present on this page.',
};

/** WCAG criteria included in the Rapid Audit (Quick Assess) — 13 criteria */
export const RAPID_AUDIT_CHECK_IDS: string[] = [
  '2.1.1',  // Keyboard
  '2.4.7',  // Focus Visible
  '2.1.2',  // No Keyboard Trap
  '3.2.1',  // On Focus
  '2.4.4',  // Link Purpose (In Context)
  '1.1.1',  // Non-text Content / Image Function
  '2.4.3',  // Focus Order
  '1.4.3',  // Contrast (Minimum)
  '1.3.1',  // Info and Relationships — Headings / Landmarks
  '2.4.6',  // Headings and Labels
  '2.4.1',  // Bypass Blocks
  '2.5.3',  // Label in Name
  '1.4.10', // Reflow
];

/** WCAG criteria included in the Mid-Level Audit (Assessment) — 20 criteria */
export const MID_LEVEL_AUDIT_CHECK_IDS: string[] = [
  '1.1.1',  // Non-text Content
  '1.2.1',  // Audio-only and Video-only
  '1.3.1',  // Info and Relationships
  '1.3.2',  // Meaningful Sequence
  '1.3.3',  // Sensory Characteristics
  '1.4.1',  // Use of Color
  '1.4.3',  // Contrast (Minimum)
  '1.4.4',  // Resize Text
  '2.1.2',  // No Keyboard Trap
  '2.3.1',  // Three Flashes or Below Threshold
  '2.4.1',  // Bypass Blocks
  '2.4.2',  // Page Titled
  '2.4.4',  // Link Purpose (In Context)
  '2.4.6',  // Headings and Labels
  '2.4.7',  // Focus Visible
  '3.1.1',  // Language of Page
  '3.2.1',  // On Focus
  '3.2.2',  // On Input
  '3.3.1',  // Error Identification
  '3.3.2',  // Labels or Instructions
];

/** Adds computed auditTags to every check based on tier membership. */
export const PREDEFINED_CHECKS: PredefinedCheck[] = (() => {
  const rapid = new Set(RAPID_AUDIT_CHECK_IDS);
  const mid = new Set(MID_LEVEL_AUDIT_CHECK_IDS);
  return _CHECKS.map(c => ({
    ...c,
    auditTags: [
      ...(rapid.has(c.id) ? ['rapid' as const] : []),
      ...(mid.has(c.id) ? ['mid-level' as const] : []),
    ],
  }));
})();

export function createDefaultChecks(auditType?: AuditType): ManualCheckResult[] {
  const now = new Date().toISOString();
  const ids =
    auditType === 'rapid'     ? RAPID_AUDIT_CHECK_IDS :
    auditType === 'mid-level' ? MID_LEVEL_AUDIT_CHECK_IDS :
    null;
  const source = ids
    ? PREDEFINED_CHECKS.filter(c => ids.includes(c.id))
    : PREDEFINED_CHECKS;
  return source.map(c => ({
    id: c.id,
    type: 'wcag' as const,
    wcagCriterion: c.criterion,
    level: c.level,
    title: c.title,
    description: c.description,
    status: 'not-tested' as const,
    updatedAt: now,
  }));
}
