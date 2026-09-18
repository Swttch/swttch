import { useState, type ReactNode } from 'react';
import { SettingsHeader } from './SettingsHeader';
import { SettingsSidebar } from './SettingsSidebar';
import { ScopeTabs } from './ScopeTabs';
import { SidebarMode, useSidebarLayout, CONTENT_FLOOR_STYLE } from './useSidebarLayout';
import { useRouter, ROUTE_META } from '@/router';

interface SettingsLayoutProps {
  children: ReactNode;
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const { route } = useRouter();
  const meta = ROUTE_META[route];
  const showScopeTabs = meta?.scopeSupport === 'both';

  const { mode, ref } = useSidebarLayout();

  // What the toggle has been told, or null while it has not been told anything.
  //
  // Null rather than a boolean because the answer to "should the navigation be
  // showing" has a different default in different widths: a column that sits
  // beside the content is showing, and a drawer that covers the content is not.
  // A plain boolean would need an effect to rewrite itself every time the mode
  // changed, which is two things deciding one question.
  const [toldToShow, setToldToShow] = useState<boolean | null>(null);
  const sidebarOpen = toldToShow ?? mode !== SidebarMode.DRAWER;

  // Waving a drawer away is about this drawer, not a standing instruction to
  // keep the navigation hidden once there is room for a column again — so it
  // goes back to having been told nothing rather than to having been told no.
  const dismissDrawer = () => setToldToShow(null);

  return (
    // The canvas the content scrolls on, and the quietest surface on this
    // screen. The sidebar beside it and the section cards laid on it share the
    // one above it, and the header takes `pressed`, the far end. Three areas,
    // three surfaces, and no rule drawn between any of them.
    <div className="flex flex-col h-full bg-surface-sunken">
      <SettingsHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setToldToShow(!sidebarOpen)}
      />
      <div ref={ref} className="flex flex-1 overflow-hidden relative">
        <SettingsSidebar
          mode={mode}
          open={sidebarOpen}
          // A drawer covers what the user is reading, so choosing a page is also
          // a reason to put it away.
          onNavigate={mode === SidebarMode.DRAWER ? dismissDrawer : undefined}
        />
        {mode === SidebarMode.DRAWER && sidebarOpen && (
          <div className="absolute inset-0 z-10 bg-overlay-scrim" onClick={dismissDrawer} />
        )}
        <main
          className="flex-1 min-w-0 overflow-y-auto"
          // A floor, and only while there is a labelled column to divide the row
          // with. It is what stops the two from both shrinking past the point
          // where either is usable: the sidebar's share hits its own minimum at
          // exactly the width this floor claims the rest of, and below that
          // width the column folds and hands its space back.
          style={mode === SidebarMode.FULL ? CONTENT_FLOOR_STYLE : undefined}
        >
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
