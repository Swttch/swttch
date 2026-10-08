import { useEffect, useState } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';
import { extensionOf } from './fileType';

/** Icons already asked for, by extension: a type is asked about once, not once per chip. */
const cache = new Map<string, Promise<string | null>>();

async function ask(extension: string): Promise<string | null> {
  const answer = (await getBridge().request(MessageType.GET_FILE_ICON, { extension })) as
    | { mimeType?: string; base64?: string }
    | undefined;
  return answer?.mimeType && answer.base64 ? `data:${answer.mimeType};base64,${answer.base64}` : null;
}

/**
 * The icon the operating system draws for this extension, as a data URL, or null
 * where the system cannot be asked or has nothing. Never rejects: a chip without
 * the system's icon simply keeps the one it draws itself.
 */
export function loadFileIcon(extension: string): Promise<string | null> {
  const known = cache.get(extension);
  if (known) return known;

  const pending = ask(extension).catch((): string | null => {
    // A dropped connection says nothing about the type, so the next chip asks again.
    cache.delete(extension);
    return null;
  });
  cache.set(extension, pending);
  return pending;
}

/** @internal test-only: forget every remembered icon. */
export function _resetFileIconCache(): void {
  cache.clear();
}

/** The system's icon for the file called `name`, or null until it arrives and wherever there is none. */
export function useFileIcon(name: string): string | null {
  const extension = extensionOf(name);
  const [loaded, setLoaded] = useState<{ extension: string; icon: string | null } | null>(null);

  useEffect(() => {
    if (!extension) return;
    let current = true;
    void loadFileIcon(extension).then((icon) => {
      if (current) setLoaded({ extension, icon });
    });
    return () => {
      current = false;
    };
  }, [extension]);

  return extension && loaded?.extension === extension ? loaded.icon : null;
}
