# Highrable UI redesign design system

The redesign extends the existing `@repo/ui` shadcn foundation. It does not introduce a second
component library or change application data contracts.

## Direction

- Freelancer mode uses Highrable orange for primary actions and selected states.
- Client mode uses a high-contrast yellow accent with dark foreground text.
- Admin keeps the orange-to-yellow operational gradient.
- Reading surfaces remain neutral so long terms, evidence, tables, and feeds stay calm.
- Light and dark themes use the same semantic tokens; fixed white surfaces are compatibility-only.

## Foundations

- Sans-serif interface typography; monospace is reserved for wallet addresses, hashes,
  transaction IDs, and compact metadata.
- 4px spacing increments.
- 8px control radius and 12px card radius.
- Subtle card elevation, neutral borders, and visible keyboard focus rings.
- Bounded content width with stacked mobile forms and wrapping actions.
- Natural page scrolling; marketing sections must not require mandatory scroll snapping.

## Shared primitives

Use these existing components before creating route-specific equivalents:

- `ProductPageHero` for route titles, context, descriptions, and actions.
- `SectionCard`, `RoutePanel`, and `RoutePanelHeader` for readable content boundaries.
- `RouteCallout` for warning, danger, success, and neutral notices.
- `RouteEmptyState` and existing loading components for empty and pending states.
- shadcn `Button`, `Sheet`, `Dialog`, `Tabs`, `Select`, `Input`, `Textarea`, `Table`, `Badge`,
  `Skeleton`, and Lucide icons for application-owned controls.

## Validation notes

Visual changes must not remove labels, `aria-*` state, focus restoration, dialog close behavior,
or mode/role conditions. Financial and privileged buttons remain wired to their existing hooks and
server-side authorization boundaries.
