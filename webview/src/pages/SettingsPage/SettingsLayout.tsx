import { useState, type ReactNode } from 'react';
import { SettingsHeader } from './SettingsHeader';
import { SettingsSidebar } from './SettingsSidebar';
import { ScopeTabs } from './ScopeTabs';
import { useRouter, ROUTE_META } from '@/router';
import { isMobile } from '@/config/environment';

interface SettingsLayoutProps {
  children: ReactNode;
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const { route } = useRouter();
  const meta = ROUTE_META[route];
  const showScopeTabs = meta?.scopeSupport === 'both';

  // On mobile the sidebar collapses into a hamburger-toggled drawer, closed by default.
  const mobile = isMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    // The canvas the content scrolls on, and the quietest surface on this
    // screen. The sidebar beside it and the section cards laid on it share the
    // one above it, and the header takes `pressed`, the far end. Three areas,
    // three surfaces, and no rule drawn between any of them.
    <div className="flex flex-col h-full bg-surface-sunken">
      <SettingsHeader onToggleSidebar={mobile ? () => setSidebarOpen((o) => !o) : undefined} />
      <div className="flex flex-1 overflow-hidden relative">
        <SettingsSidebar
          isDrawer={mobile}
          open={sidebarOpen}
          onNavigate={() => setSidebarOpen(false)}
        />
        {mobile && sidebarOpen && (
          <div
            className="absolute inset-0 z-10 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className="flex-1 overflow-y-auto">
          {/* Inside the padding rather than above it: the scope control is part
              of the page's content, not a bar spanning the column, and it lines
              up with the heading it governs. */}
          <div className="p-3 xs:p-6">
            {showScopeTabs && <ScopeTabs />}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
