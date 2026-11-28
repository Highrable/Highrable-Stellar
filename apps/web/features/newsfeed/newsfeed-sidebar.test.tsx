// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NewsfeedSidebar } from "./newsfeed-sidebar";

const data = vi.hoisted(() => ({
  suggestions: undefined as unknown[] | undefined,
  tags: undefined as unknown[] | undefined,
}));

vi.mock("@repo/convex-client", () => ({
  api: {
    newsfeed: { queries: { suggestedPeople: "suggestedPeople", trendingTags: "trendingTags" } },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (query: string) => (query === "suggestedPeople" ? data.suggestions : data.tags),
}));
vi.mock("@repo/ui/components/highrable/social-primitives", () => ({
  ProfileRow: ({ name }: { name: string }) => <a href={`/people/${name}`}>{name}</a>,
  SectionHeader: ({ title }: { title: React.ReactNode }) => <h2>{title}</h2>,
  TagChip: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("./follow-button", () => ({ FollowButton: () => <button>Follow</button> }));
vi.mock("./session", () => ({ useSocialSession: () => ({ token: "verified" }) }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  data.suggestions = [];
  data.tags = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows live trending topics above collaborator suggestions on the feed", () => {
  data.suggestions = [
    { id: "person-1", name: "Ada", headline: "Product designer", avatarUrl: null },
  ];
  data.tags = [{ tag: "Figma", count: 3 }];
  render(<NewsfeedSidebar variant="feed" />);

  expect(screen.getByRole("link", { name: "Search tag Figma, 3 mentions" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ada" })).toBeTruthy();
  expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
    "Trending tags",
    "Suggested collaborators",
  ]);
});

it("keeps the search sidebar order and its loading and empty states", () => {
  data.suggestions = undefined;
  data.tags = undefined;
  const { rerender } = render(<NewsfeedSidebar />);
  expect(screen.getByText("Loading people…")).toBeTruthy();
  expect(screen.getByText("Loading tags…")).toBeTruthy();
  expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
    "Suggested collaborators",
    "Trending tags",
  ]);

  data.suggestions = [];
  data.tags = [];
  rerender(<NewsfeedSidebar />);
  expect(screen.getByText("No collaborator suggestions yet.")).toBeTruthy();
  expect(screen.getByText("Tags will appear as members publish content.")).toBeTruthy();
});
