# Minimal UI Redesign Design

## Goal

Redesign the Pet Bot desktop app UI around a minimal, light, wizard-like product experience. The app should prioritize the creation flow: upload a photo, review AI-generated assets stage by stage, confirm, and launch the desktop pet.

## Confirmed Direction

The chosen direction is option C from the preview: a top navigation layout with a centered creation workflow. The user explicitly wants a simple style and does not want small icons or emoji-based UI.

## Scope

Redesign these surfaces:

- Login and registration page.
- App shell and navigation.
- Home pet list.
- Create pet flow.
- Upload area.
- Stage preview and progress.
- Settings, credits, custom API key, and admin controls.
- Shared components affected by these screens.

Also repair visible mojibake text by replacing it with clear Simplified Chinese UI copy.

## Visual System

- Light neutral background with white surfaces.
- Thin borders instead of heavy shadows.
- Text-only navigation and buttons.
- Rounded corners kept modest.
- Blue accent only for primary actions, active navigation, and progress.
- Red, green, and amber reserved for semantic states.
- No emoji, decorative icons, gradient backgrounds, or dark slate interface.

## Layout

- Use a top app bar: brand, navigation links, account action.
- Main content uses a centered max-width container.
- The create flow uses a focused single-column wizard layout.
- Home and settings use restrained panels, lists, and forms.
- Components remain responsive on narrow screens by stacking controls.

## Interaction

- Keep the existing generation behavior and API calls.
- Keep stage-by-stage review controls.
- Display failures inline with retry actions.
- Keep disabled states explicit for insufficient credits or missing custom API key.

## Verification

- Run TypeScript/Vite/Electron production build.
- Run focused backend tests already relevant to generation bundle behavior if backend files are not changed further.
