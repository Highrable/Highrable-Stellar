export const APP_NAME = "Highrable" as const;

export const EMAIL_FONTS = {
  sans: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`,
  mono: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
} as const;

// Hex equivalents of the landing-v2 Highrable tokens.
// Email clients require inline-safe values, not CSS variables or oklch.
export const EMAIL_COLORS = {
  page: {
    bg: "#f5f5f5",
    grid: "#ececec",
  },
  card: {
    bg: "#ffffff",
    bgInverse: "#1a1a1a",
    bgMuted: "#fafafa",
    bgAccent: "#fff3e9",
    border: "#e8e8e8",
    borderStrong: "#1a1a1a",
    borderAccent: "#ffd5b6",
    borderSubtle: "#f0f0f0",
  },
  text: {
    primary: "#1a1a1a",
    inverse: "#ffffff",
    secondary: "#5f5f5f",
    muted: "#7f7f7f",
    dimmed: "#a3a3a3",
  },
  brand: {
    orange1: "#ff8c42",
    orange2: "#ff6b6b",
    buttonGradient: "linear-gradient(to right, #ff8703, #fe6002)",
    orange3: "#e85d00",
    orange4: "#b94a00",
    accentBg: "#fff3e9",
    accentText: "#b94a00",
    amber: "#f59e0b",
    stellar: "#4f46e5",
    success: "#059669",
  },
} as const;

export const EMAIL_RADIUS = {
  sm: "6px",
  md: "8px",
  lg: "12px",
  xl: "18px",
} as const;

export const EMAIL_SOCIAL_LINKS = [
  { label: "X/Twitter", href: "https://x.com/highrable" },
  { label: "Facebook", href: "https://web.facebook.com/Highrable" },
  { label: "Instagram", href: "https://www.instagram.com/highrable.work/" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/highrable/" },
] as const;
