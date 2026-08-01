function getBatteryColor(remaining: number): string {
  if (remaining > 50) return '#22c55e';
  if (remaining >= 20) return '#eab308';
  return '#ef4444';
}

interface Props {
  /** Percentage of the 5-hour usage window left, 0–100. */
  remaining: number;
  isLoading?: boolean;
}

/**
 * The battery glyph + percentage, factored out of {@link TokenBatteryButton} so
 * the ⋮ menu row can show the exact same visual on the right of "Usage" as the
 * dock icon shows — one place owns what "72%, amber, pulsing" looks like.
 */
export function BatteryVisual(props: Props) {
  const { remaining, isLoading } = props;
  const color = getBatteryColor(remaining);
  const isPulsing = remaining < 20;
  const fillWidth = Math.max(0, Math.min(100, remaining));

  return (
    <span className="flex items-center gap-1">
      <span className={isLoading ? 'opacity-50' : undefined}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={isPulsing ? 'animate-pulse' : undefined}
        >
          {/* 배터리 몸체 외곽선 */}
          <rect x="1" y="4" width="12" height="8" rx="1.5" ry="1.5" stroke={color} strokeWidth="1.2" fill="none" />
          {/* 배터리 꼭지 */}
          <rect x="13" y="6.5" width="1.5" height="3" rx="0.5" ry="0.5" fill={color} />
          {/* 내부 채움 — 왼쪽부터 remaining% 비율로 */}
          <rect x="2.5" y="5.5" width={`${(9 * fillWidth) / 100}`} height="5" rx="0.5" ry="0.5" fill={color} />
        </svg>
      </span>
      <span className="text-sm" style={{ color }}>
        {Math.round(remaining)}%
      </span>
    </span>
  );
}
