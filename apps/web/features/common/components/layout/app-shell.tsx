"use client";

import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { AppModeProvider, ModeBanner, useAppMode } from "@/features/mode";
import { SidebarInset, SidebarProvider } from "@repo/ui/components/ui/sidebar";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function shouldUseProductRefresh(pathname: string) {
  return !(
    pathname === "/messages" ||
    pathname.startsWith("/messages/") ||
    pathname === "/newsfeed" ||
    pathname.startsWith("/newsfeed/")
  );
}

/**
 * Starts each newly visited page at the top. Next.js only scrolls when the new
 * page is out of view, which misses pages under our sticky header. Back/forward
 * navigation is left alone so the browser can restore the previous position.
 */
function useScrollToTopOnNavigate(pathname: string) {
  const isHistoryNavigation = useRef(false);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    const handlePopState = () => {
      isHistoryNavigation.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    if (isHistoryNavigation.current) {
      isHistoryNavigation.current = false;
      return;
    }
    if (window.location.hash) return;

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
}

/** Sends the user to the home page whenever their wallet goes from connected to disconnected. */
function useRedirectHomeOnDisconnect() {
  const router = useRouter();
  const { isConnected } = useHighrableWalletIdentity();
  const wasConnected = useRef(isConnected);

  useEffect(() => {
    if (wasConnected.current && !isConnected) {
      router.push("/");
    }
    wasConnected.current = isConnected;
  }, [isConnected, router]);
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useRedirectHomeOnDisconnect();
  const { mode } = useAppMode();
  const isAdminRoute = isAdminPath(pathname);
  const activeMode = isAdminRoute ? "admin" : mode;
  const useProductRefresh = shouldUseProductRefresh(pathname);

  // Portals render outside this frame, so mirror the route theme on <html> too.
  useEffect(() => {
    document.documentElement.dataset.mode = activeMode;
    if (useProductRefresh) {
      document.documentElement.dataset.productUi = "refresh";
    } else {
      delete document.documentElement.dataset.productUi;
    }
    return () => {
      delete document.documentElement.dataset.mode;
      delete document.documentElement.dataset.productUi;
    };
  }, [activeMode, useProductRefresh]);

  return (
    <div
      data-mode={activeMode}
      data-product-ui={useProductRefresh ? "refresh" : undefined}
      className="min-h-screen bg-[var(--mode-page)] text-foreground"
    >
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-muted/60">
          <Header />
          {isAdminRoute ? null : <ModeBanner />}
          <div className="hr-app-main mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            {children}
          </div>
        </SidebarInset>
        {!isAdminRoute && pathname !== "/messages" ? (
          <Link
            href="/messages"
            aria-label="Open messages"
            className="hr-v2-button-primary fixed right-4 bottom-4 z-40 inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-md transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highrable-orange-3 sm:right-6 sm:bottom-6"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Messages
          </Link>
        ) : null}
      </SidebarProvider>
    </div>
  );
}

/** Wraps route content with the shared Highrable navigation shell. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMarketingRoute = pathname === "/" || pathname === "/home";

  useScrollToTopOnNavigate(pathname);

  if (isMarketingRoute) {
    return <>{children}</>;
  }

  return (
    <AppModeProvider>
      <ShellFrame>{children}</ShellFrame>
    </AppModeProvider>
  );
}
