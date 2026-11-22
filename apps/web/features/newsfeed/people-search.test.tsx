import { api } from "@repo/convex-client";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PeopleSearch } from "./people-search";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: mocks.query }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.useFakeTimers();
  mocks.query.mockReset();
  mocks.query.mockReturnValue([
    { id: "profile-1", name: "Ada Lovelace", headline: "Engineer", avatarUrl: null },
  ]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("debounces indexed people suggestions and navigates to a wallet-free profile route", async () => {
  render(<PeopleSearch />);
  const input = screen.getByRole("combobox", { name: "Search people" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Ada" } });
  expect(mocks.query).toHaveBeenCalledWith(api.newsfeed.queries.searchPeople, "skip");
  act(() => {
    vi.advanceTimersByTime(300);
  });
  const option = screen.getByRole("option", { name: /Ada Lovelace/ });
  expect(mocks.query).toHaveBeenLastCalledWith(api.newsfeed.queries.searchPeople, { term: "Ada" });
  expect(option.getAttribute("href")).toBe("/people/profile-1");
});

it("shows an explicit empty state when a search has no matches", async () => {
  mocks.query.mockReturnValue([]);
  render(<PeopleSearch />);
  const input = screen.getByRole("combobox", { name: "Search people" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Nobody" } });
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(screen.getByText("No people found.")).toBeTruthy();
});
