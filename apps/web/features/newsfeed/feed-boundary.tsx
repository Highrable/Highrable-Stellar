"use client";
import { Button } from "@repo/ui/components/ui/button";
import { Component } from "react";

export class FeedBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div
        role="alert"
        className="rounded-xl border border-red-300 bg-red-50/60 p-4 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-200"
      >
        Newsfeed could not be loaded.{" "}
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0 text-inherit"
          onClick={() => this.setState({ failed: false })}
        >
          Retry
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
