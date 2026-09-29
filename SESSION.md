# Issue 204: readable form controls

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/204
Branch: codex/204-form-contrast from main 2280256.
Scope: consistent light theme for the existing light app, shared input/textarea foreground and placeholder colors, native form/autofill defaults, contrast regression tests.
Owned: components/mobile/settings-mobile.tsx; app/globals.css; components/layout/providers.tsx; components/ui/{input,textarea}.tsx; tests/e2e/form-contrast.spec.ts; SESSION.md.
Out of scope: provider behavior, credentials, data, auth, schema, layout redesign.
Architecture: preserve DESIGN-SYSTEM and current components; field users need clear controls in daylight. Product register, restrained existing palette. Existing app root tokens already use the light palette for both themes; remove the partial system-driven dark form state.
Overlap: checked open #195, #194, #189, #166, #135, #82. No shared source ownership, SESSION only. Later branches must retain the shared control fix.
Validation: RED browser reproduction under dark device settings before source edits; GREEN contrast >=4.5:1 for control text and placeholders, light backgrounds, focus/disabled/filled/password/native textarea/select and autofill states. Mobile and desktop, light and dark OS preference. Full npm run verify, real browser screenshots and interaction recording; production form read-back. No live sends in contrast tests.
