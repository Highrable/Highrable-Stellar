"use client";

import { Moon, Sun } from "lucide-react";

import { useThemeMode } from "../../hooks/use-theme-mode";
import { Button } from "../ui/button";

interface IThemeToggleProps {
  readonly className?: string;
}

/** Switches between light and dark mode. Shows the mode you would switch to. */
export function ThemeToggle({ className }: IThemeToggleProps) {
  const { isDarkMode, isMounted, setDarkMode } = useThemeMode();
  const label = isDarkMode ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => setDarkMode(!isDarkMode)}
      aria-label={label}
      title={label}
      aria-pressed={isMounted ? isDarkMode : undefined}
      className={className}
    >
      {/* Icons wait for mount so server and client markup match. */}
      {isMounted ? (
        isDarkMode ? (
          <Sun className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4" aria-hidden="true" />
        )
      ) : (
        <span className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
