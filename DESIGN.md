<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->
---
name: RMIT Society
description: A trusted digital common room for RMIT student societies and discussion.
---

# Design System: RMIT Society

## Overview

**Creative North Star: "The After-Hours Zine Exchange"**

RMIT Society should feel like the unofficial publication shelf and shared reading table in a student common room: active, authored, and collectively maintained. Its visual language combines contemporary RMIT energy with independent campus publishing rather than official university communications. Red-orange issue marks, index tabs, ruled structure, and warm paper neutrals give societies distinct voices without imitating RMIT branding.

The product retains the interaction clarity students already understand from mature forums: communities, feeds, votes, sorting, comments, and moderation states behave predictably. The identity must not depend on copying Reddit's visual language. Familiar behavior sits inside a publication system built for focused reading, clear ownership, and visible accountability.

The interface is adaptive. Daylight mode resembles cool, clean publication stock under bright campus light; night mode becomes deep ink rather than a generic inverted theme. Expressive display moments establish place, while thread titles, comments, metadata, and controls remain quiet and highly legible.

**Key Characteristics:**

- Independent campus-publication character without counterfeit institutional branding.
- Familiar forum behavior expressed through index tabs, rules, issue marks, and editorial hierarchy.
- Dense enough for frequent scanning, but never crowded with ornamental badges or competing accents.
- Strong society identity within one coherent platform system.
- Keyboard-accessible, responsive, and equally deliberate in light and dark modes.

## Colors

Use a restrained red-orange ink strategy. Warm neutral surfaces and deep ink carry the atmosphere; red-orange creates identity, action, and wayfinding. A yellow signal color appears only for focus, unread changes, and time-sensitive states. This is an RMIT-inspired student-community palette, not a claim of official RMIT brand usage.

### Primary

- **Studio Red-Orange:** `oklch(0.53 0.18 32)` in daylight and `oklch(0.72 0.17 32)` in dark mode. Use for primary actions, active navigation, selected society tabs, links, issue marks, and focus treatment. It should feel energetic and creative without becoming alarm red.

### Secondary

- **Signal Yellow:** `oklch(0.84 0.16 82)` in daylight and `oklch(0.84 0.14 80)` in dark mode. Reserve for focus, unread changes, active participation, and time-sensitive status. Pair with text, icons, or shape; never use it as the only status cue.

### Neutral

- **Warm Publication Stock:** `oklch(0.972 0.014 45)` daylight ground; clean, warm, and contemporary rather than parchment-like.
- **Fresh Sheet:** `oklch(0.99 0.008 48)` lifted light surface for focused reading areas and controls.
- **Registration Ink:** `oklch(0.18 0.026 32)` primary text, rules, icons, and high-contrast controls in daylight mode.
- **Deep Ink:** `oklch(0.16 0.026 30)` dark-mode ground; chromatic and quiet rather than absolute black.
- **Night Paper:** `oklch(0.95 0.012 45)` primary text and key marks on deep-ink surfaces.
- **Proof Grey:** `oklch(0.47 0.035 32)` daylight secondary text; `oklch(0.73 0.03 40)` dark-mode secondary text.

### Named Rules

**The Red-Orange Signal Rule.** Red-orange is the memorable lead and belongs to action, orientation, and identity—not scattered decoration.

**The Two-Ink Rule.** Neutral ink plus red-orange should resolve almost every screen. Yellow enters only when a state genuinely needs immediate attention.

**The Meaning Survives Rule.** Removing color must not remove status, hierarchy, vote state, report outcome, or moderation ownership.

**The Unofficial Rule.** Use this palette as an RMIT-inspired community expression. Do not reproduce official RMIT red, logos, lockups, campaign graphics, or institutional brand arrangements unless authorized assets and usage guidance are later provided.

## Typography

**Display Font:** Oswald Variable, a condensed publication face self-hosted via Fontsource.

**Body Font:** Geist Variable, a highly legible workhorse sans serif.

**Label/Mono Font:** The body sans in compact uppercase treatments; use a mono face only for technical identifiers or measurements.

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
- **Do** let society identity appear through typography, controlled red-orange assignments, tabs, and issue marks within the shared system.
- **Do** keep thread content and comments optimized for sustained reading in both light and dark modes.
- **Do** pair every report, moderation, vote, and membership state with explicit words or recognizable icons.
- **Do** use rules, rhythm, and tonal layering before adding containers or shadows.
- **Do** keep focus states highly visible and ensure all core workflows support keyboard navigation.

### Don't:

- **Don't** reproduce Reddit's card styling, spacing, icon arrangements, or brand cues even when using familiar forum behavior.
- **Don't** imply official RMIT endorsement or recreate official red, logos, lockups, or identity assets without authorization.
- **Don't** turn the zine concept into distressed textures, fake tape, illegible handwriting, or decoration behind discussion text.
- **Don't** scatter accent colors across badges, counters, and icons; color rarity is part of the hierarchy.
- **Don't** use shadows to make every content block appear equally elevated.
- **Don't** sacrifice scanability, touch targets, contrast, or predictable controls for publication styling.
