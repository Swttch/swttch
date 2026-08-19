import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function BannerArea(props: Props) {
  const { children } = props;
  const bannerRef = useRef<HTMLDivElement>(null);
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
      <div ref={bannerRef} className="fixed top-10 start-0 w-full z-20">
        {children}
      </div>
      {bannerHeight > 0 && (
        <div className="w-full" style={{ height: bannerHeight }} />
      )}
    </div>
  );
}
