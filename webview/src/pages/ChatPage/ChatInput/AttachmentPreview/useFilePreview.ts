import { useEffect, useState } from 'react';
import { loadFilePreview, type FilePreviewResult } from './loadFilePreview';

const NONE: FilePreviewResult = { kind: 'none' };

/**
 * What the card for the file at `path` should show: `none` while the answer is on
 * its way and whenever there is no preview, so the icon is what appears first and
 * a preview replaces it only if one turns up.
 */
export function useFilePreview(path: string): FilePreviewResult {
  const [loaded, setLoaded] = useState<{ path: string; result: FilePreviewResult } | null>(null);

  useEffect(() => {
    let current = true;
    void loadFilePreview(path).then((result) => {
      if (current) setLoaded({ path, result });
    });
    return () => {
      current = false;
    };
  }, [path]);

  // An answer for another path must not linger while this one loads.
  return loaded?.path === path ? loaded.result : NONE;
}
