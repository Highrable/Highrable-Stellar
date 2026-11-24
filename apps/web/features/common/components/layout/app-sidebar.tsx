"use client";

import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { useWallet } from "@/core/wallet/hooks/use-wallet";
import { usePasskeySmartAccount } from "@/core/wallet/passkey-smart-account-context";
import { useIsVerifiedAdminOwner } from "@/features/admin/lib/admin-session-query";
import { MODE_COPY, MODE_NAVIGATION, useAppMode, type IModeNavItem } from "@/features/mode";
import { api } from "@repo/convex-client";
import { NavUser } from "@repo/ui/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@repo/ui/components/ui/sidebar";
import { useQuery } from "convex/react";
import { Gavel, MessageCircle, Newspaper, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface IAdminNavItem extends IModeNavItem {
  /** Shown only to the verified platform owner; the page also enforces this. */
  readonly ownerOnly?: boolean;
}

const ADMIN_NAVIGATION: readonly IAdminNavItem[] = [
  {
    name: "Overview",
    href: "/admin",
    description: "Platform totals and recent activity",
    icon: ShieldCheck,
    ownerOnly: true,
  },
  {
    name: "Disputes",
    href: "/admin/disputes",
    description: "Review and settle cases",
    icon: Gavel,
  },
  {
    name: "Admins",
    href: "/admin/admins",
    description: "Manage who can use this area",
    icon: UserRound,
    ownerOnly: true,
  },
];

const NEWSFEED_NAVIGATION: IModeNavItem = {
  name: "Newsfeed",
  href: "/newsfeed",
  description: "Updates from the Highrable community",
  icon: Newspaper,
};

const MESSAGES_NAVIGATION: IModeNavItem = {
  name: "Messages",
  href: "/messages",
  description: "Direct, group, and work conversations",
  icon: MessageCircle,
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLink({
  item,
  pathname,
}: {
  readonly item: IModeNavItem;
  readonly pathname: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = item.icon;
  const isActive = isActivePath(pathname, item.href);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.name}
        className="h-10 px-3 text-sidebar-foreground/80 hover:text-sidebar-foreground data-[active=true]:bg-(--mode-soft) data-[active=true]:text-sidebar-foreground"
      >
        <Link
          href={item.href}
          aria-current={isActive ? "page" : undefined}
          onClick={() => {
            if (isMobile) {
              setOpenMobile(false);
            }
          }}
        >
          <Icon aria-hidden="true" />
          <span>{item.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function BrandLink() {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg" tooltip="Highrable home" className="h-14">
          <Link
            href="/home"
            aria-label="Highrable home"
            onClick={() => {
              if (isMobile) setOpenMobile(false);
            }}
          >
            <img src="/logo/highrable-icon.jpg" alt="" className="size-8 rounded-lg object-cover" />
            <span className="grid min-w-0 leading-tight">
              <span className="truncate font-semibold tracking-tight">Highrable</span>
              <span className="truncate text-xs font-normal text-sidebar-foreground/60">
                Your workspace
              </span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function SidebarUser({ isAdminRoute }: { readonly isAdminRoute: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { mode } = useAppMode();
  const walletIdentity = useHighrableWalletIdentity();
  const router = useRouter();
  const { disconnectWallet } = useWallet();
  const { disconnectPasskeyAccount } = usePasskeySmartAccount();
  const onboardingState = useQuery(
    api.users.queries.getOnboardingState,
    !isAdminRoute && walletIdentity.walletAddress
      ? { walletAddress: walletIdentity.walletAddress }
      : "skip",
  );

  if (isAdminRoute || !walletIdentity.isConnected || !walletIdentity.walletAddress) {
    return null;
  }

  const profileHref = `/${mode === "client" ? "clients" : "freelancers"}/${encodeURIComponent(
    walletIdentity.walletAddress,
  )}`;
  const displayName = [onboardingState?.user?.firstName, onboardingState?.user?.lastName]
    .filter(Boolean)
    .join(" ");
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handleSignOut = async () => {
    closeMobileSidebar();
    if (walletIdentity.walletType === "passkey_smart_account") {
      await disconnectPasskeyAccount();
    } else {
      await disconnectWallet();
    }
  };

  return (
    <NavUser
      user={{
        name: displayName || "Highrable account",
        subtitle: MODE_COPY[mode].label,
        ...(onboardingState?.avatarUrl ? { avatar: onboardingState.avatarUrl } : {}),
      }}
      onAccount={() => {
        closeMobileSidebar();
        router.push(profileHref);
      }}
      onSignOut={() => void handleSignOut()}
    />
  );
}

/** Shared shadcn sidebar for participant modes and verified admin surfaces. */
export function AppSidebar() {
  const pathname = usePathname();
  const { mode } = useAppMode();
  const walletIdentity = useHighrableWalletIdentity();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isVerifiedAdminOwner = useIsVerifiedAdminOwner({ enabled: isAdminRoute });
  const navigation = isAdminRoute
    ? ADMIN_NAVIGATION.filter((item) => !item.ownerOnly || isVerifiedAdminOwner)
    : MODE_NAVIGATION[mode];

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-2 py-3">
        <BrandLink />
      </SidebarHeader>
      <SidebarContent className="py-3">
        <nav aria-label={isAdminRoute ? "Admin navigation" : `${MODE_COPY[mode].label} navigation`}>
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] font-semibold tracking-[0.08em] uppercase">
              {isAdminRoute ? "Admin tools" : `${MODE_COPY[mode].shortLabel} workspace`}
            </SidebarGroupLabel>
            <SidebarMenu>
              {navigation.map((item) => (
                <NavigationLink key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroup>

          {!isAdminRoute ? (
            <SidebarGroup>
              <SidebarGroupLabel className="px-3 text-[11px] font-semibold tracking-[0.08em] uppercase">
                Community
              </SidebarGroupLabel>
              <SidebarMenu>
                <NavigationLink item={MESSAGES_NAVIGATION} pathname={pathname} />
                <NavigationLink item={NEWSFEED_NAVIGATION} pathname={pathname} />
              </SidebarMenu>
            </SidebarGroup>
          ) : null}
        </nav>
      </SidebarContent>
      {!isAdminRoute && walletIdentity.isConnected ? (
        <>
          <SidebarSeparator />
          <SidebarFooter className="p-3">
            <SidebarUser isAdminRoute={false} />
          </SidebarFooter>
        </>
      ) : null}
      <SidebarRail />
    </Sidebar>
  );
}
