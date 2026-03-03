# Map-First Mobile CRM Reference (Badger Maps × Apple Maps style)

## Purpose
Capture the approved UX direction and interaction model from reference screenshots so implementation stays aligned on the active Next.js app surface.

## Product stance
- **Map-first** (not dashboard-first)
- **Mobile-first** (desktop adapts from mobile patterns)
- **Field-rep workflow first**: find accounts -> plan route -> execute check-ins -> follow-ups

## Primary navigation model
1. **Top app bar (red)** with context title/actions
2. **Bottom tab bar (dark)** with 5 tabs:
   - Map
   - Accounts
   - Route
   - Calendar
   - Settings

## Screen patterns to match

### 1) Map (default home)
- Full-bleed map canvas with dense account pins
- Secondary segmented control near top (`Map | List`)
- Selected-account tray docked above bottom tabs:
  - account name/address
  - owner badge
  - quick actions: add to..., check-in, center on map, navigate

### 2) Accounts
- Segmented filters: `All | Recent | Follow-Ups`
- Search input immediately under filters
- Alphabet index rail on right edge
- Fast tap-to-open account details

### 3) Route
- Segmented toggle: `Current Route | Saved Routes`
- Saved list with route name/date/owner rows
- Current route timeline with stop order, time, duration, travel time
- Action row: `GO`, optimize, save, clear, +calendar
- Add-locations modal from route context

### 4) Calendar
- Month-grid first view
- Route/calendar relationship visible from nav and badges

### 5) Account Details modal
- Sheet/modal with red header
- Tabs: `Detail | Location | Notes | History`
- Detail section includes owner, follow-up date, check-ins, status, custom sales fields
- Persistent bottom quick actions (check-in/navigation related)

## Interaction behavior requirements
- One-thumb usage for primary actions
- Fast transitions between map <-> account <-> route contexts
- No horizontal overflow on iPhone widths
- Minimum tap target ~44px for key actions

## Data integration constraints
- Keep Notion CRM + dispensary contacts as source systems
- Normalize into canonical model for map-first rendering:
  - Account
  - Contact
  - Stop
  - Route
- UI should not bind directly to raw Notion property names

## Implementation note
This is a **reference spec**, not a mandate for pixel cloning. Keep the interaction model and information hierarchy, while preserving PICC naming and legal-safe visual differentiation where required.
