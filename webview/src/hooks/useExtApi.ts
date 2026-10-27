import { useCallback, useEffect, useState } from 'react';
import { getBridge } from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';
import { useSessionScope } from './useSessionAssets';

/** What `swttch-ext api` answers, as the backend passes it on. */
export type ExtApiAnswer =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; status?: number; hint?: string } };

export interface ExtCapabilities {
  /** False when the kit is missing or is older than the version that has `swttch-ext`. */
  installed: boolean;
  /** `api.frame.retitle` and the like. */
  capabilities: string[];
  version: string | null;
}

const NOT_ASKED: ExtCapabilities | undefined = undefined;
let known: ExtCapabilities | undefined = NOT_ASKED;
let asking: Promise<ExtCapabilities> | undefined;

/** Forget what the kit was last said to support, so an install or an update is noticed. @internal */
export function _resetExtCapabilities(): void {
  known = NOT_ASKED;
  asking = undefined;
}

/** Ask the backend what the installed kit's `swttch-ext` can do. A kit that could not be run counts as one that can do nothing. */
export function loadExtCapabilities(workingDir?: string): Promise<ExtCapabilities> {
  if (known) return Promise.resolve(known);
  asking ??= (getBridge().request(MessageType.GET_EXT_CAPABILITIES, { workingDir }) as Promise<
    { status?: string; installed?: boolean; capabilities?: string[]; version?: string | null } | undefined
  >)
    .then((answer) => {
      const caps: ExtCapabilities = {
        installed: answer?.status === 'ok' && answer.installed === true,
        capabilities: answer?.status === 'ok' && Array.isArray(answer.capabilities) ? answer.capabilities : [],
        version: answer?.version ?? null,
      };
      // Only an answer is kept. A kit that could not be run may be fixed a moment later.
      if (answer?.status === 'ok') known = caps;
      return caps;
    })
    .catch(() => ({ installed: false, capabilities: [], version: null }))
    .finally(() => {
      asking = undefined;
    });
  return asking;
}

/** Run one `swttch-ext api` call. Never rejects: a call that could not be made is `{ok:false}`. */
export async function runExtApi(
  service: string,
  call: string,
  params: Record<string, string>,
  options: { yes?: boolean; workingDir?: string } = {},
): Promise<ExtApiAnswer> {
  try {
    const answer = (await getBridge().request(MessageType.RUN_EXT_API, {
      service, call, params, yes: options.yes === true, workingDir: options.workingDir,
    })) as (ExtApiAnswer & { requestId?: string }) | undefined;
    if (answer && typeof answer === 'object' && 'ok' in answer) return answer;
    return { ok: false, error: { code: 'extend_kit_unreadable', message: 'No answer' } };
  } catch (err) {
    return { ok: false, error: { code: 'extend_kit_unrunnable', message: err instanceof Error ? err.message : String(err) } };
  }
}

/** What the kit on this machine can do, once known. Undefined while it is being asked. */
export function useExtCapabilities(enabled = true): ExtCapabilities | undefined {
  const { workingDir } = useSessionScope();
  const [caps, setCaps] = useState<ExtCapabilities | undefined>(known);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadExtCapabilities(workingDir).then((answer) => {
      if (alive) setCaps(answer);
    });
    return () => {
      alive = false;
    };
  }, [enabled, workingDir]);
  return caps;
}

/** A call bound to this session's project, for the menu to use. */
export function useRunExtApi(): (service: string, call: string, params: Record<string, string>, yes?: boolean) => Promise<ExtApiAnswer> {
  const { workingDir } = useSessionScope();
  return useCallback((service, call, params, yes) => runExtApi(service, call, params, { yes, workingDir }), [workingDir]);
}
