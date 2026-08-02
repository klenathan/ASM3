# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

RMIT students who need an RMIT-only community forum to discover, join, and participate in societies. Society moderators administer their own societies; system admins oversee platform operations.

## Product Purpose

RMIT Society organizes student discussion into societies—shared community spaces where students find peers and keep campus conversations moving. Success means an eligible RMIT student can establish a trusted account and participate.

## Positioning

An unofficial RMIT community forum restricted to approved RMIT identities across AU, VN, and EU RMIT communities. A society is the product term for an RMIT community; a thread is a post within one.

## Operating Context

New students arrive from the public landing page and register with an approved RMIT email. Registration verifies email ownership with a one-time passcode (OTP), then signs the student in automatically and sends them to the forum.

## Capabilities and Constraints

- Registration route is `/register`, matching the backend API naming.
- Registration collects approved RMIT email, password, and display name.
- Exact approved-domain allow-list stays configurable; do not hard-code unconfirmed domains.
- Registration requires an OTP sent by email before automatic sign-in.
- Stack: React 19, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS, shadcn/ui, and next-themes.
- Authenticated user sessions use secure browser cookies.

## Brand Commitments

RMIT Society uses a red-orange identity with warm publication-paper neutrals. Theme starts dark and supports the `.dark` selector.

## Evidence on Hand

- Existing auth flow and visual vocabulary: `src/pages/sign-in/SignInPage.tsx`, `src/pages/landing/LandingPage.tsx`, and `src/index.css`.
- Current backend registration endpoint: `POST /api/v1/auth/register`; it presently creates a session directly and exposes no email-OTP endpoints.

## Product Principles

- Keep membership RMIT-only and verifiable.
- Make joining a society community clear and low-friction.
- Use product-specific terms consistently.
- Keep account and moderation authority trustworthy and scoped.

## Accessibility & Inclusion

Registration must be keyboard-operable, clearly labeled, provide programmatic validation and status feedback, and work in both supported themes.
