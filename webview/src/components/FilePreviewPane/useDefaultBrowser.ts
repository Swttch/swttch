import { useEffect, useState } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';

let asked: Promise<string | null> | undefined;

/** The name of the browser this machine opens a web address in ("Google Chrome"), or null until it is known or when it cannot be found. */
export function useDefaultBrowser(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    asked ??= Promise.resolve(getBridge().request(MessageType.GET_DEFAULT_BROWSER, {}))
      .then((answer) => ((answer as { name?: unknown } | null)?.name as string | null | undefined) ?? null)
      .catch(() => null);
    void asked.then((value) => live && setName(value));
    return () => {
      live = false;
    };
  }, []);
  return name;
}
