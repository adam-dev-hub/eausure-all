'use client';

import { signOut, useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, Settings, LogOut } from 'lucide-react';
import { useT } from '@/lib/useT';

type UserDropdownProps = {
  profileHref?: string;
  settingsHref?: string;
  signOutCallbackUrl?: string;
  showProfileSettings?: boolean;
};

function getLocaleFromPath(pathname: string): string {
  const locale = pathname.split('/')[1];
  return locale === 'en' || locale === 'fr' || locale === 'ar' ? locale : 'fr';
}

export function UserDropdown({
  profileHref,
  settingsHref,
  signOutCallbackUrl,
  showProfileSettings = true,
}: UserDropdownProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT('userMenu');

  const locale = getLocaleFromPath(pathname);
  const resolvedProfileHref = profileHref || `/${locale}/admin`;
  const resolvedSettingsHref = settingsHref || `/${locale}/admin`;
  const resolvedSignOutCallback = signOutCallbackUrl || `/${locale}/auth/signin`;

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

  if (!session?.user) {
    return null;
  }

  const userInitials = session.user.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : session.user.email?.[0].toUpperCase() || t('anonymous');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative h-9 w-9 rounded-full border-2 border-border hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Avatar className="h-full w-full">
            <AvatarImage src={session.user.image || undefined} alt={session.user.name || ''} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{session.user.name || 'User'}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showProfileSettings && (
          <>
            <DropdownMenuItem onClick={() => router.push(resolvedProfileHref)}>
              <User className="me-2 h-4 w-4" />
              <span>{t('profile')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(resolvedSettingsHref)}>
              <Settings className="me-2 h-4 w-4" />
              <span>{t('settings')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => void handleSignOut()}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="me-2 h-4 w-4" />
          <span>{t('signOut')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
