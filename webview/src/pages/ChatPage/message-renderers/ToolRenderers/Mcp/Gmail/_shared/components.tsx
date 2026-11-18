import {ReactNode} from "react";
import {cn} from "@/utils/cn";
import {useTranslation} from "@/i18n";
import {formatGmailDate} from "./helpers";

/**
 * A single Gmail inbox row, laid out on one line like a real inbox:
 * optional unread dot · sender (fixed width) · subject · " - " · snippet
 * (truncated to fill remaining space) · date (right-aligned).
 */
export const GmailMailRow = (props: {
    sender?: string;
    subject?: string;
    date?: string;
    snippet?: string;
    unread?: boolean;
}) => {
    const {t} = useTranslation('chatTools');
    const {sender, subject, date, snippet, unread = false} = props;

    return (
        <div className="flex items-center gap-2 p-2 border-b border-border-subtle last:border-b-0 overflow-hidden">
            {unread && (
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-text-tertiary" />
            )}
            <span
                className={cn(
                    "shrink-0 min-w-[8.75rem] max-w-[11.25rem] truncate text-[0.8461rem] text-text-primary/80",
                    unread ? "font-semibold" : ""
                )}
            >
                {sender || t('gmail.common.unknownSender')}
            </span>
            <span className="flex-1 min-w-0 flex items-baseline overflow-hidden text-[0.8461rem]">
                {subject && (
                    <span
                        className={cn(
                            "shrink-0 max-w-[55%] truncate text-text-primary/60",
                            unread ? "font-semibold" : "font-medium"
                        )}
                    >
                        {subject}
                    </span>
                )}
                {snippet && (
                    <span className="flex-1 min-w-0 truncate text-text-tertiary">
                        {subject ? ` - ${snippet}` : snippet}
                    </span>
                )}
            </span>
            {date && (
                <span className="shrink-0 text-[0.7692rem] text-text-tertiary">
                    {formatGmailDate(date)}
                </span>
            )}
        </div>
    );
};

/**
 * A pill/chip used to display a Gmail label.
 */
export const GmailLabelChip = (props: {children?: ReactNode}) => {
    const {children} = props;
    return (
        <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-hover px-2 py-0.5 text-[0.7692rem] text-text-primary/80">
            {children}
        </span>
    );
};
