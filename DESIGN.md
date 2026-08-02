<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->
---
name: RMIT Society
description: A trusted digital common room for RMIT student societies and discussion.
---

# Design System: RMIT Society

## Overview

**Creative North Star: "The After-Hours Zine Exchange"**

RMIT Society should feel like the unofficial publication shelf and shared reading table in a student common room: active, authored, and collectively maintained. Its visual language comes from independent campus publishing rather than official university communications. Strong typographic issue marks, index tabs, ruled structure, and restrained ink colors give societies distinct voices without imitating RMIT branding.

The product retains the interaction clarity students already understand from mature forums: communities, feeds, votes, sorting, comments, and moderation states behave predictably. The identity must not depend on copying Reddit's visual language. Familiar behavior sits inside a publication system built for focused reading, clear ownership, and visible accountability.

The interface is adaptive. Daylight mode resembles cool, clean publication stock under bright campus light; night mode becomes deep ink rather than a generic inverted theme. Expressive display moments establish place, while thread titles, comments, metadata, and controls remain quiet and highly legible.

**Key Characteristics:**

- Independent campus-publication character without counterfeit institutional branding.
- Familiar forum behavior expressed through index tabs, rules, issue marks, and editorial hierarchy.
- Dense enough for frequent scanning, but never crowded with ornamental badges or competing accents.
- Strong society identity within one coherent platform system.
- Keyboard-accessible, responsive, and equally deliberate in light and dark modes.

## Colors

Use a restrained two-ink strategy. Neutral surfaces and text carry almost all information; one lead ink creates identity and action, while one highlighter ink signals live or exceptional state. Exact values are **[to be resolved during implementation]**.

### Primary

- **Electric Ultramarine:** The lead publication ink for primary actions, active navigation, selected society tabs, links, and focus treatment. It should read as energetic and independent rather than institutional.

### Secondary

- **Highlighter Signal:** A rare functional ink for unread changes, active participation, and time-sensitive status. It is not a decorative accent and must never carry meaning without text or an icon.

### Neutral

- **Cool Publication Stock:** The daylight ground; clean and cool rather than warm, nostalgic, or parchment-like.
- **Fresh Sheet:** A lifted light surface for focused reading areas and controls when tonal separation is necessary.
- **Registration Black:** Primary text, rules, icons, and high-contrast controls in daylight mode.
- **Deep Ink:** The night-mode ground; chromatic and quiet rather than absolute black.
- **Night Paper:** Primary text and key marks on deep-ink surfaces.
- **Proof Grey:** Secondary text, disabled states, dividers, and low-emphasis regions in both modes.

### Named Rules

**The Two-Ink Rule.** Neutral ink plus the lead ink should resolve almost every screen. The highlighter enters only when a state genuinely needs immediate attention.

**The Meaning Survives Rule.** Removing color must not remove status, hierarchy, vote state, report outcome, or moderation ownership.

**The Unofficial Rule.** Do not reproduce official RMIT red, lockups, campaign graphics, or institutional brand arrangements unless authorized assets and usage guidance are later provided.

## Typography

**Display Font:** A bold, condensed publication face **[to be resolved during implementation]**

**Body Font:** A highly legible workhorse sans serif **[to be resolved during implementation]**

**Label/Mono Font:** A compact annotation or tab face, only if needed **[to be resolved during implementation]**

**Character:** Display type acts like a zine masthead or issue marker: direct, compressed, and unmistakable. Reading type stays calm through long threads and dense metadata. Personality must come from the contrast between these jobs, not from making every label expressive.

### Hierarchy

- **Display:** Reserved for product identity, society identity, and rare route-level statements.
- **Headline:** Thread and section headings; forceful enough to scan without overwhelming adjacent metadata.
- **Title:** Society names, panel headings, and compact content groupings.
- **Body:** Thread content, comments, rules, and explanatory copy; optimized for sustained reading with a controlled line length.
- **Label:** Sorting, status, timestamps, counts, and moderation metadata; compact but never cryptically small or low contrast.

### Named Rules

**The Masthead-and-Manuscript Rule.** Expression belongs at the point of identity; discussion content remains quiet enough to read for minutes at a time.

**The Sentence-Case Rule.** Use uppercase sparingly for issue marks, short tabs, and stamps. Actions, navigation, statuses, and long labels use natural sentence case.

## Layout

The spatial model combines a publication index with familiar forum navigation. Content should form continuous reading fields separated by rules, tonal shifts, tabs, and whitespace rather than a wall of detached cards. The system supports compact scanning, but voting, authorship, timestamps, society context, and moderation status retain stable positions so repeated use becomes effortless.

A persistent personal-society index may anchor wide layouts while the main reading field receives most of the width. Contextual information should occupy a secondary margin or drawer, not squeeze the discussion column. Exact container widths, spacing steps, and breakpoints are **[to be resolved during implementation]**.

On narrow screens, preserve the reading field first. Society navigation becomes a deliberate drawer or compact index; secondary context moves below the primary content; voting and thread actions remain reachable without forcing horizontal scanning. Desktop density must not be achieved by shrinking type, and mobile adaptation must not flatten all hierarchy into identical stacked cards.

**The Reading-Table Rule.** One region owns attention at a time. Adjacent rails support orientation and action but do not compete with the current thread or feed.

**The Familiar-Behavior Rule.** Sorting, voting, joining, commenting, reporting, and navigation use recognizable interaction patterns even when their visual treatment is publication-inspired.

## Elevation & Depth

The system is flat by default. Depth comes from overlapping tabs, clipped edges, tonal paper layers, rules, and deliberate whitespace rather than ambient card shadows. Temporary surfaces such as dialogs, menus, and mobile drawers may use restrained structural elevation when overlap must be unmistakable. Exact shadow treatments are **[to be resolved during implementation]**.

**The Printed-Flat Rule.** Persistent content surfaces do not float. Elevation indicates a temporary layer, active manipulation, or necessary overlap, never generic importance.

## Shapes

The form language combines rectangular publication sheets with functional softened controls. Content regions, issue marks, and navigation tabs should feel cut, indexed, or clipped; controls that users press repeatedly may use modest corner softening for comfort and clarity. Exact radii are **[to be resolved during implementation]**.

Borders behave as editorial rules: crisp, purposeful, and used to organize reading order. Avoid placing a rounded container around every content unit. Society identity may introduce a controlled tab silhouette or edge treatment, but it must remain compatible with dense feeds and small screens.

**The Cut-Paper Rule.** Use strong rectangular geometry for information and selective softness for interaction. Do not let one universal rounded rectangle erase the difference between content, navigation, and controls.

## Do's and Don'ts

### Do:

- **Do** preserve familiar forum workflows while giving them a distinct RMIT Society identity.
- **Do** let society identity appear through typography, a controlled ink assignment, tabs, and issue marks within the shared system.
- **Do** keep thread content and comments optimized for sustained reading in both light and dark modes.
- **Do** pair every report, moderation, vote, and membership state with explicit words or recognizable icons.
- **Do** use rules, rhythm, and tonal layering before adding containers or shadows.
- **Do** keep focus states highly visible and ensure all core workflows support keyboard navigation.

### Don't:

- **Don't** reproduce Reddit's card styling, spacing, icon arrangements, or brand cues even when using familiar forum behavior.
- **Don't** imply official RMIT endorsement or recreate official identity assets without authorization.
- **Don't** turn the zine concept into distressed textures, fake tape, illegible handwriting, or decoration behind discussion text.
- **Don't** scatter accent colors across badges, counters, and icons; color rarity is part of the hierarchy.
- **Don't** use shadows to make every content block appear equally elevated.
- **Don't** sacrifice scanability, touch targets, contrast, or predictable controls for publication styling.
