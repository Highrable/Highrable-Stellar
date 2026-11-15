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
  `Skeleton`, `Sidebar`, and Lucide icons for application-owned controls.

The authenticated application shell adapts the installed shadcn `sidebar-07` primitives to the
real freelancer, client, and admin routes. Its collapsible sidebar owns navigation and the connected
account menu. The top bar uses shadcn breadcrumbs, a sidebar toggle, wallet connection, and theme
control. Role switching stays
on the person's own profile card, where its effect is explained before the selection changes. The
marketing footer is owned by the landing page; authenticated app routes keep the shell focused on
the working surface.

Standard shadcn button variants use semantic `primary`, `secondary`, `accent`, and `destructive`
tokens. Highrable's gradient is an explicit variant for branded calls to action. Shared component
hover and focus styles should not be replaced by global button selectors.

## Validation notes

Visual changes must not remove labels, `aria-*` state, focus restoration, dialog close behavior,
or mode/role conditions. Financial and privileged buttons remain wired to their existing hooks and
server-side authorization boundaries.
