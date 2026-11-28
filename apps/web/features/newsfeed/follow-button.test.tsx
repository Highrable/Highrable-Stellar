// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { FollowButton } from "./follow-button";

const mock = vi.hoisted(() => ({
  follow: vi.fn(),
  state: { authenticated: true, following: false },
  unfollow: vi.fn(),
}));

vi.mock("@repo/convex-client", () => ({
  api: {
    newsfeed: {
      queries: { followState: "followState" },
      mutations: { follow: "follow", unfollow: "unfollow" },
    },
  },
}));
vi.mock("@repo/ui/components/ui/button", () => ({
  Button: ({
    size: _size,
    variant: _variant,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: () => mock.state,
  useMutation: (query: string) => ({
    withOptimisticUpdate: () => (query === "follow" ? mock.follow : mock.unfollow),
  }),
}));
vi.mock("./session", () => ({ useSocialSession: () => ({ token: "verified" }) }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  mock.follow.mockReset().mockResolvedValue(undefined);
  mock.unfollow.mockReset().mockResolvedValue(undefined);
  mock.state.following = false;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps the compact follow control named and connected to the follow mutation", async () => {
  render(<FollowButton userId={"person-1" as never} compact />);
  const follow = screen.getByRole("button", { name: "Follow" });

  expect(follow.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(follow);
  await waitFor(() =>
    expect(mock.follow).toHaveBeenCalledWith({ token: "verified", userId: "person-1" }),
  );
});
