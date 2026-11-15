"use client";

import { WalletConnectTrigger } from "@/core/wallet/components/wallet-connect-trigger";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { useIsVerifiedAdminOwner } from "@/features/admin/lib/admin-session-query";
import {
  MODE_COPY,
  MODE_NAVIGATION,
  ModeSwitch,
  useAppMode,
  type IModeNavItem,
} from "@/features/mode";
import { ThemeToggle } from "@repo/ui/components/highrable/theme-toggle";
import { V2_PAGE_CONTAINER_CLASS } from "@repo/ui/components/highrable/v2-theme";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/ui/sheet";
import { cn } from "@repo/ui/lib/utils";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderProfileLink } from "./header-profile-link";

interface IAdminNavItem extends IModeNavItem {
  /** Shown only to the verified platform owner; the page itself also enforces this. */
  readonly ownerOnly?: boolean;
}

const ADMIN_NAVIGATION: readonly IAdminNavItem[] = [
  {
    name: "Overview",
    href: "/admin",
    description: "Platform totals and recent activity",
    ownerOnly: true,
  },
  { name: "Disputes", href: "/admin/disputes", description: "Review and settle cases" },
  { name: "Admins", href: "/admin/admins", description: "Who can use this area", ownerOnly: true },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The active page is marked with a short bar in the mode colour (gradient in admin).
const NAV_LINK_BASE =
  "relative flex items-center gap-2 rounded-md px-3 py-2 font-sans text-sm transition-colors";
const NAV_LINK_INACTIVE = "text-muted-foreground hover:text-foreground";
const NAV_LINK_ACTIVE =
  "bg-(--mode-soft) font-medium text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-(image:--mode-gradient)";
const NAV_LINK_ACTIVE_MOBILE = "bg-(--mode-soft) font-medium text-foreground";

/** Renders the shared navigation and wallet controls for the Highrable app. */
export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const walletIdentity = useHighrableWalletIdentity();
  const { mode } = useAppMode();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  // Owner tabs stay hidden until the server verifies the owner, so dispute admins never see them.
  const isVerifiedAdminOwner = useIsVerifiedAdminOwner({ enabled: isAdminRoute });
  const navigation = isAdminRoute
    ? ADMIN_NAVIGATION.filter((item) => !item.ownerOnly || isVerifiedAdminOwner)
    : [
        ...MODE_NAVIGATION[mode],
        { name: "Highrable Newsfeed", href: "/newsfeed", description: "Participant updates" },
      ];
  const navLabel = isAdminRoute ? "Admin navigation" : `${MODE_COPY[mode].label} navigation`;

  const walletActionClass = "hidden px-4 py-2 text-sm sm:inline-flex";
  const walletDrawerActionClass = "w-full px-4 py-2 text-sm";

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-background transition-colors",
        isScrolled ? "border-border" : "border-transparent",
      )}
    >
      <nav className={cn(V2_PAGE_CONTAINER_CLASS, "flex h-16 items-center justify-between gap-3")}>
        {/* Logo */}
        <Link href="/home" className="flex shrink-0 items-center gap-2.5">
          <img
            src="/logo/highrable-landscape.png"
            alt="Highrable logo"
            className="h-8 w-auto max-w-[128px] object-contain"
          />
        </Link>

        {/* Desktop nav — only pages that belong to the current mode */}
        <div
          className="ml-auto hidden items-center md:flex"
          role="navigation"
          aria-label={navLabel}
        >
          {navigation.map(({ href, name }) => (
            <Link
              key={name}
              href={href}
              aria-current={isActivePath(pathname, href) ? "page" : undefined}
              className={cn(
                NAV_LINK_BASE,
                isActivePath(pathname, href) ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE,
              )}
            >
              <span>{name}</span>
            </Link>
          ))}
        </div>

        {/* Mode switch + wallet + theme + mobile navigation */}
        <div className="flex items-center gap-3">
          {isAdminRoute ? null : <HeaderProfileLink />}
          {isAdminRoute ? null : <ModeSwitch className="hidden sm:inline-flex" />}
          {!walletIdentity.isConnected ? (
            <WalletConnectTrigger className={walletActionClass} />
          ) : null}
          <ThemeToggle />
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(88vw,22rem)] p-0">
              <SheetHeader className="border-b border-border/80 pr-12">
                <SheetTitle>{isAdminRoute ? "Admin navigation" : "Highrable menu"}</SheetTitle>
                <SheetDescription>{navLabel}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
                {isAdminRoute ? null : <ModeSwitch size="large" fullWidth />}
                <nav className="flex flex-col gap-1" aria-label={navLabel}>
                  {navigation.map(({ href, name, description }) => (
                    <SheetClose key={name} asChild>
                      <Link
                        href={href}
                        className={cn(
                          NAV_LINK_BASE,
                          "flex-col items-start gap-0.5 rounded-lg px-4 py-3",
                          isActivePath(pathname, href) ? NAV_LINK_ACTIVE_MOBILE : NAV_LINK_INACTIVE,
                        )}
                      >
                        <span>{name}</span>
                        <span className="hr-text-muted text-xs font-normal">{description}</span>
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
                {isAdminRoute ? null : (
                  <div className="border-t border-border/80 pt-4">
                    <HeaderProfileLink showLabel className="w-full justify-start" />
                  </div>
                )}
                {!walletIdentity.isConnected ? (
                  <div className="border-t border-border/80 pt-4">
                    <WalletConnectTrigger className={walletDrawerActionClass} />
                  </div>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
