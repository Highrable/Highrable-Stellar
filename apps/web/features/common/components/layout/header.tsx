"use client";

import { WalletConnectTrigger } from "@/core/wallet/components/wallet-connect-trigger";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { MODE_NAVIGATION, useAppMode } from "@/features/mode";
import { ThemeToggle } from "@repo/ui/components/highrable/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/ui/breadcrumb";
import { Separator } from "@repo/ui/components/ui/separator";
import { SidebarTrigger } from "@repo/ui/components/ui/sidebar";
import { cn } from "@repo/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Renders the shared navigation and wallet controls for the Highrable app. */
export function Header() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const walletIdentity = useHighrableWalletIdentity();
  const { mode } = useAppMode();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const activeItem = MODE_NAVIGATION[mode].find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const pageLabel = isAdminRoute
    ? pathname.startsWith("/admin/disputes")
      ? "Disputes"
      : pathname.startsWith("/admin/admins")
        ? "Admins"
        : "Overview"
    : (activeItem?.name ??
      (pathname.startsWith("/newsfeed")
        ? "Newsfeed"
        : pathname.startsWith("/freelancers/") || pathname.startsWith("/clients/")
          ? "Profile"
          : "Workspace"));

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85",
        isScrolled && "shadow-xs",
      )}
    >
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger aria-label="Toggle navigation sidebar" className="size-9" />
          <Link href="/home" className="flex shrink-0 items-center gap-2.5 md:hidden">
            <img
              src="/logo/highrable-landscape.png"
              alt="Highrable logo"
              className="h-7 w-auto max-w-[128px] object-contain"
            />
          </Link>
          <Separator orientation="vertical" className="hidden h-5 md:block" />
          <Breadcrumb className="hidden min-w-0 md:block">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/home">Highrable</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate font-medium">{pageLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-2">
          {!walletIdentity.isConnected ? (
            <WalletConnectTrigger
              label="Connect wallet"
              className="h-10 rounded-xl px-4 font-sans text-xs font-semibold tracking-normal normal-case sm:text-sm"
            />
          ) : null}
          <ThemeToggle className="rounded-xl" />
        </div>
      </div>
    </header>
  );
}
