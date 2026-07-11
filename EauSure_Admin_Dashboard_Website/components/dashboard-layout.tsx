'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserDropdown } from '@/components/user-dropdown';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/useT';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

type NavigationItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type DashboardLayoutProps = {
  children: React.ReactNode;
  navigation?: NavigationItem[];
  sidebarStorageKey?: string;
  headerActions?: React.ReactNode;
  userDropdownProps?: {
    profileHref?: string;
    settingsHref?: string;
    signOutCallbackUrl?: string;
    showProfileSettings?: boolean;
  };
};

function getLocaleFromPath(pathname: string): string {
  const locale = pathname.split('/')[1];
  return locale === 'en' || locale === 'fr' || locale === 'ar' ? locale : 'fr';
}

export function DashboardLayout({
  children,
  navigation,
  sidebarStorageKey = 'sidebarCollapsed',
  headerActions,
  userDropdownProps,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const t = useT('navigation');
  const tApp = useT('app');
  const locale = getLocaleFromPath(pathname);
  const resolvedSignOutCallback = `/${locale}/auth/signin`;
  const hasMountedRef = useRef(false);
  const sidebarSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Save sidebar state to localStorage when it changes
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem(sidebarStorageKey, String(newState));
  };

  useEffect(() => {
    const savedState = localStorage.getItem(sidebarStorageKey);
    setIsCollapsed(savedState === 'true');
  }, [sidebarStorageKey]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (sidebarSaveTimeoutRef.current) {
      clearTimeout(sidebarSaveTimeoutRef.current);
    }

    localStorage.setItem(sidebarStorageKey, String(isCollapsed));
    sidebarSaveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(sidebarStorageKey, String(isCollapsed));
    }, 1000);

    return () => {
      if (sidebarSaveTimeoutRef.current) {
        clearTimeout(sidebarSaveTimeoutRef.current);
      }
    };
  }, [isCollapsed, sidebarStorageKey]);

  const defaultNavigation: NavigationItem[] = [];

  const navigationItems = navigation ?? defaultNavigation;

  const handleSignOut = async () => {
    try {
      await fetch('/api/user/heartbeat/offline', {
        method: 'POST',
        keepalive: true,
      });
    } catch {
      // Sign-out should continue even if offline update fails.
    }

    await signOut({ callbackUrl: resolvedSignOutCallback });
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className={cn(
        "border-r border-border bg-card flex flex-col shadow-sm transition-all duration-300 overflow-hidden",
        isCollapsed ? "w-16" : "w-64"
      )}>
        {/* Collapse toggle button */}
        <div className={cn("px-4 py-2 transition-all duration-300", isCollapsed && "px-2")}>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn("w-full transition-all duration-300", isCollapsed && "justify-center px-2")}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4 me-2" />}
            {!isCollapsed && <span className="text-xs opacity-100 transition-opacity duration-200">{t('collapse')}</span>}
          </Button>
        </div>

        <Separator />
        
        <nav className={cn("flex-1 p-4 space-y-1 transition-all duration-300", isCollapsed && "px-2")}>
          {navigationItems.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
              >
                <Link href={item.href}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full transition-all duration-300',
                      isCollapsed ? 'justify-center px-2' : 'justify-start',
                      isActive && 'bg-secondary',
                      !isActive && 'hover:translate-x-1'
                    )}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <item.icon className={cn("h-4 w-4 transition-all duration-300", !isCollapsed && "me-2")} />
                    {!isCollapsed && <span className="opacity-100 transition-opacity duration-200">{item.name}</span>}
                  </Button>
                </Link>
              </motion.div>
            );
          })}
        </nav>

        <Separator />
        
        <div className={cn("p-4 transition-all duration-300", isCollapsed && "px-2")}>
          <Button
            variant="outline"
            size="sm"
            className={cn("w-full transition-all duration-300", isCollapsed && "justify-center px-2")}
            type="button"
            onClick={() => void handleSignOut()}
            title={isCollapsed ? t('signOut') : undefined}
          >
            <LogOut className={cn("h-4 w-4 transition-all duration-300", !isCollapsed && "me-2")} />
            {!isCollapsed && <span className="opacity-100 transition-opacity duration-200">{t('signOut')}</span>}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm shadow-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="relative h-8 w-8 shrink-0">
                <Image
                  src="/logo.png"
                  alt="EauSûre"
                  fill
                  className="object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-foreground truncate">
                  EauSûre
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  {tApp('subtitle')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {headerActions}
              <ThemeToggle />
              <UserDropdown {...userDropdownProps} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background/40 backdrop-blur-sm">
          <motion.div
            className="p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
