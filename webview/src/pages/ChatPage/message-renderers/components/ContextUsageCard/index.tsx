import React, { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { ModelInfo } from '@/types/slashCommand';
import { ContextUsage, parseTokenValue } from '@/utils/parseContextUsage';
import { StreamingMessage } from '@/pages/ChatPage/StreamingMessage';
import { allocateGridCells } from './gridAllocation';
import { assignCategoryColors } from './palette';
import { ContextUsageGrid } from './ContextUsageGrid';
import { ContextInfoColumn } from './ContextInfoColumn';
import { ContextDetailSections } from './ContextDetailSections';
import { ContextViewToggle } from './ContextViewToggle';
import { resolveContextModelName, formatTokensSummary } from './modelDisplayName';

interface Props {
  data: ContextUsage;
  rawMarkdown: string;
}

/** Grid resolution: 20 columns × 20 rows = 400 dense cells, echoing the TUI grid. */
const TOTAL_CELLS = 400;

/**
 * Renders the `/context` report as the native terminal TUI does: a dense usage
 * grid beside the model/token summary and category legend, then the detail
 * sections (Custom Agents / Memory Files / Skills / MCP Tools) as trees. A toggle
 * flips the whole card to the verbatim CLI markdown, so nothing is ever hidden.
 */
export const ContextUsageCard: React.FC<Props> = (props: Props) => {
  const { t } = useTranslation('chat');
  const { data, rawMarkdown } = props;
  const { controlResponse } = useCliConfig();
  const [rawMode, setRawMode] = useState(false);

  const models: ModelInfo[] = controlResponse?.response?.response?.models ?? [];
  const totalTokens = useMemo(() => parseTokenValue(data.tokensTotalLabel), [data.tokensTotalLabel]);
  const allocation = useMemo(
    () => allocateGridCells(data.categories, totalTokens, TOTAL_CELLS),
    [data.categories, totalTokens],
  );
  const coloredCategories = useMemo(() => assignCategoryColors(data.categories), [data.categories]);
  const displayName = useMemo(
    () => resolveContextModelName(models, data.model),
    [models, data.model],
  );

  return (
    <div className="my-2">
      <header className="flex items-center justify-between gap-3 px-4 py-2">
        <h3 className="text-[0.9375rem] font-semibold text-text-primary">
          {t('contextUsage.heading')}
        </h3>
        <ContextViewToggle
          rawMode={rawMode}
          onChange={setRawMode}
          label={t('contextUsage.viewToggle.showOriginal')}
          tooltip={t('contextUsage.viewToggle.tooltip')}
        />
      </header>

      {rawMode ? (
        <div className="px-4 py-3">
          <StreamingMessage
            content={rawMarkdown}
            isStreaming={false}
            className="text-text-primary text-[0.9375rem] leading-relaxed"
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-x-6 gap-y-4 px-4 py-4">
            <ContextUsageGrid allocation={allocation} />
            <ContextInfoColumn
              displayName={displayName}
              modelId={data.model}
              tokensSummary={formatTokensSummary(
                data.tokensUsedLabel,
                data.tokensTotalLabel,
                data.percentUsed,
              )}
              categories={coloredCategories}
            />
          </div>
          <ContextDetailSections data={data} />
        </>
      )}
    </div>
  );
};
