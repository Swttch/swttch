import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTopBar } from '@/contexts/TopBarContext';

interface Props {
  children: ReactNode;
}

export function BannerArea(props: Props) {
  const { children } = props;
  const bannerRef = useRef<HTMLDivElement>(null);
  // Hangs under the top bar, so it sits at the top edge when the bar is hidden.
  const { topBarHeight } = useTopBar();
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      setBannerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative w-full">
      <div ref={bannerRef} className="fixed start-0 w-full z-20" style={{ top: topBarHeight }}>
        {children}
      </div>
      {bannerHeight > 0 && (
        <div className="w-full" style={{ height: bannerHeight }} />
      )}
    </div>
  );
}
