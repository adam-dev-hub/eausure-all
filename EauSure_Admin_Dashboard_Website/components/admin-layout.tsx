'use client';

import { useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { Shield, Activity, Rocket, LifeBuoy, Users, HardDrive } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { useT } from '@/lib/useT';

type AdminLayoutProps = {
  children: React.ReactNode;
};

export function AdminLayout({ children }: AdminLayoutProps) {
  const { data: session } = useSession();
  const locale = 'fr';
  const t = useT('admin');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminSessionActive = session?.user?.role === 'admin';

  useEffect(() => {
    if (!adminSessionActive) {
      sessionStorage.removeItem('admin_session_active');
      return;
    }
    sessionStorage.setItem('admin_session_active', 'true');
    return () => { sessionStorage.removeItem('admin_session_active'); };
  }, [adminSessionActive]);

  useEffect(() => {
    if (!adminSessionActive) return;
    const clearTimer = () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
    const scheduleLogout = () => {
      clearTimer();
      idleTimerRef.current = setTimeout(async () => {
        sessionStorage.removeItem('admin_session_active');
        await signOut({ callbackUrl: `/${locale}/admin/signin` });
      }, 2 * 60 * 60 * 1000);
    };
    const handleActivity = () => scheduleLogout();
    const handleUnload = () => sessionStorage.removeItem('admin_session_active');
    scheduleLogout();
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, handleActivity));
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearTimer();
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [adminSessionActive, locale]);

  const navigation = [
    { name: 'Console admin',          href: `/${locale}/admin`,                      icon: Shield },
    { name: 'Supervision système',    href: `/${locale}/admin/supervise-system`,      icon: Activity },
    { name: 'Déploiement firmware',   href: `/${locale}/admin/deploy-updates`,        icon: Rocket },
    { name: 'Support technique',      href: `/${locale}/admin/diagnose-problems`,     icon: LifeBuoy },
    { name: 'Gestion utilisateurs',   href: `/${locale}/admin/manage-users`,          icon: Users },
    { name: 'Pré-enregistrement',     href: `/${locale}/admin/pre-register`,          icon: HardDrive },
  ];

  return (
    <DashboardLayout
      navigation={navigation}
      sidebarStorageKey="adminSidebarCollapsed"
      userDropdownProps={{
        profileHref: `/${locale}/admin`,
        settingsHref: `/${locale}/admin`,
        showProfileSettings: false,
        signOutCallbackUrl: `/${locale}/admin/signin`,
      }}
    >
      {children}
    </DashboardLayout>
  );
}
