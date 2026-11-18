import {ReactNode} from "react";
import {useTranslation} from "@/i18n";
import {Container, LabelValue} from "../../../../common";
import {prettyResult} from "../helpers";

interface InOutBlockProps {
    inContent?: ReactNode;
    outContent?: ReactNode;
    inLabel?: string;
    outLabel?: string;
}

/**
 * Bash-style IN/OUT box, reused for tools whose input is itself worth reviewing
 * (terminal command, debugger expression). IN holds the request, OUT the result.
 */
export const InOutBlock = (props: InOutBlockProps) => {
    const {t} = useTranslation('chatTools');
    const {inContent, outContent, inLabel = t('jetbrains.common.in'), outLabel = t('jetbrains.common.out')} = props;
    return (
        <Container className="mt-1.5">
            <LabelValue label={inLabel} className="border-b border-border-subtle" maxHeight="max-h-[5rem]">
                {inContent}
            </LabelValue>
            <LabelValue label={outLabel} maxHeight="max-h-[8.75rem]">
                {outContent}
            </LabelValue>
        </Container>
    );
};

interface OutBlockProps {
    children?: ReactNode;
    maxHeight?: string;
}

/**
 * Marks a result region as the tool's OUT for cards that have no IN/OUT block,
 * so the output can't be mistaken for the header/input above it. Two forms per
 * the result's shape:
 *  - `OutBlock`: code/mono results — the framed OUT half of an InOutBlock.
 *  - `OutLabel`: inline results (status badges, short text) — a dim "OUT" caption.
 */
export const OutBlock = (props: OutBlockProps) => {
    const {t} = useTranslation('chatTools');
    return (
        <Container className="mt-1.5">
            <LabelValue label={t('jetbrains.common.out')} maxHeight={props.maxHeight ?? 'max-h-[8.75rem]'}>{props.children}</LabelValue>
        </Container>
    );
};

interface OutLabelProps {
    children?: ReactNode;
}

export const OutLabel = (props: OutLabelProps) => {
    const {t} = useTranslation('chatTools');
    return (
        <div className="mt-1.5">
            <div className="text-tool-label-fg text-[0.7692rem] uppercase tracking-wide">{t('jetbrains.common.out')}</div>
            {props.children}
        </div>
    );
};

interface RawJsonResultProps {
    out: string;
    /** Pretty-print JSON output (default). Pass false to show the raw text as-is. */
    pretty?: boolean;
}

/**
 * The shared "couldn't parse the result into a rich card, show it raw" fallback
 * box — a single source for the boilerplate that every list/collection renderer
 * repeated. Renders nothing for empty output.
 */
export const RawJsonResult = (props: RawJsonResultProps) => {
    const {out, pretty = true} = props;
    if (!out) return null;
    return (
        <Container className="mt-1.5">
            <LabelValue maxHeight="max-h-[10rem]">{pretty ? prettyResult(out) : out}</LabelValue>
        </Container>
    );
};
