import { cleanup, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NewsfeedPage } from "./newsfeed-page";

vi.mock("@repo/convex-client", () => ({ api: { newsfeed: { queries: { post: "post" } } } }));
vi.mock("convex/react", () => ({ useQuery: () => undefined }));
vi.mock("@repo/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("lucide-react", () => ({ Search: () => <span aria-hidden="true" /> }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("./composer", () => ({ Composer: () => <section aria-label="Create a post" /> }));
vi.mock("./feed", () => ({
  Feed: () => <section aria-label="Feed posts" />,
  PostCard: () => <article />,
}));
vi.mock("./feed-boundary", () => ({
  FeedBoundary: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock("./newsfeed-sidebar", () => ({
  NewsfeedSidebar: ({ variant }: { variant: string }) => (
    <aside aria-label={`Sidebar ${variant}`} />
  ),
}));
vi.mock("./session", () => ({
  SocialSessionStatus: () => null,
  useSocialSession: () => ({ token: "verified" }),
}));
vi.mock("./stories", () => ({ Stories: () => <section aria-label="Showcase" /> }));

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("places the composer and circular showcase before filters and feed posts", () => {
  render(<NewsfeedPage />);
  const main = screen.getByRole("main");
  const orderedElements = [
    main.querySelector('[aria-label="Create a post"]'),
    main.querySelector('[aria-label="Showcase"]'),
    main.querySelector('[aria-label="Newsfeed filter"]'),
    main.querySelector('[aria-label="Feed posts"]'),
  ];

  expect(orderedElements.every(Boolean)).toBe(true);
  for (let index = 0; index < orderedElements.length - 1; index += 1) {
    expect(
      orderedElements[index]!.compareDocumentPosition(orderedElements[index + 1]!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  }
  expect(document.querySelector(".hr-newsfeed-feed-layout")).toBeTruthy();
  expect(screen.getByRole("complementary", { name: "Sidebar feed" })).toBeTruthy();
});
