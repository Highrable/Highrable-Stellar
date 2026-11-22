"use client";

import { api } from "@repo/convex-client";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Input } from "@repo/ui/components/ui/input";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function PeopleSearch() {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [term]);
  const results = useQuery(
    api.newsfeed.queries.searchPeople,
    debounced.length >= 2 ? { term: debounced } : "skip",
  );
  const open = focused && term.trim().length >= 2;
  const waiting = open && (term.trim() !== debounced || results === undefined);

  return (
    <div className="relative z-20">
      <label htmlFor="newsfeed-people-search" className="sr-only">
        Search people
      </label>
      <Input
        id="newsfeed-people-search"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="newsfeed-people-results"
        placeholder="Search people by name"
        className="h-12 rounded-xl bg-background px-4"
      />
      {focused && term.trim().length < 2 && term.trim().length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Enter at least two characters.</p>
      )}
      {open && (
        <div
          id="newsfeed-people-results"
          role="listbox"
          aria-label="People search suggestions"
          className="absolute inset-x-0 top-full mt-2 max-h-80 overflow-y-auto rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          {waiting ? (
            <p role="status" className="px-3 py-4 text-sm text-muted-foreground">
              Searching people…
            </p>
          ) : results?.length ? (
            results.map((person) => (
              <Link
                key={person.id}
                href={`/people/${person.id}`}
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setFocused(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Avatar className="size-10">
                  <AvatarImage src={person.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback>{person.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{person.name}</span>
                  {person.headline && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.headline}
                    </span>
                  )}
                </span>
              </Link>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">No people found.</p>
          )}
        </div>
      )}
    </div>
  );
}
