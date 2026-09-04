import {ReactNode, createContext, useContext, useState} from "react";
import {ContextPills} from "@/pages/ChatPage/message-renderers";
import type {LoadedMessageDto} from "@/types";
import {Tooltip} from "@/components";
import {cn} from "@/utils/cn.ts";
import {ToolUseBlockDto} from "@/dto/message/ContentBlockDto";
import {useToolStatus, useToolDeclined, type ToolStatus} from "./toolStatus";
import {useSoftWrapToggle} from "@/pages/ChatPage/message-renderers/components/useSoftWrapToggle";

/**
 * The tool_use block currently being rendered. ToolRenderer provides it so deep
 * children (e.g. the JetBrains project-path chip) can read the tool's `input`
 * without threading props through every renderer. Undefined when no provider is
 * present.
 */
export const ToolUseContext = createContext<ToolUseBlockDto | undefined>(undefined);
export function useCurrentToolUse(): ToolUseBlockDto | undefined {
    return useContext(ToolUseContext);
}

export * from './RendererProps';
export * from './toolStatus';

/**
 * A user's denial decision, shown in the error colour the way the CLI shows it,
 * so a declined tool cannot be mistaken for one that ran.
 *
 * This was styled neutrally before, on the reasoning that a decline is a
 * decision rather than a failure. On screen that backfired: the decline text
 * landed in an ordinary result box, in the exact place and style a successful
 * tool prints its output, so the distinction the styling meant to protect was
 * the one being lost. ToolWrapper now draws this for every card.
 *
 * `text` is what was recorded, sentinel stripped and otherwise untouched — it
 * already carries the instruction the user gave instead. It stays in the CLI's
 * own words even when the interface is in another language: this row relays the
 * CLI's output rather than authoring it, so which language the message is in is
 * not ours to answer for. The JetBrains cards keep their own badge-styled
 * variant.
 */
export const DeclinedNote = (props: {text: string}) => {
    return (
        <div className="mt-1 text-[0.8461rem] text-state-error-fg whitespace-pre-wrap">
            {props.text}
        </div>
    );
};

export const ToolWrapper = (props: {
    message?: LoadedMessageDto;
    onClick?: () => any;
    groupClassName?: string;
    className?: string;
    /**
     * Override the bullet status. The context status only knows is_error; a
     * renderer that parses a payload-level failure (non-zero exit code, build
     * isSuccess:false, …) passes `forceStatus="error"` to reflect the truth.
     */
    forceStatus?: ToolStatus;
    children?: ReactNode;
}) => {
    const {message, groupClassName = '', className = '', onClick, forceStatus, children} = props;
    const contextStatus = useToolStatus();
    const status = forceStatus ?? contextStatus;
    const declined = useToolDeclined();
    // A decline reads as an error, the way it does in the CLI. It is a decision
    // rather than a fault, but a muted bullet put it in the same visual class as
    // a tool that ran and returned nothing interesting.
    const bulletColor =
        status === 'success' ? 'text-state-success-fg'
        : status === 'error' || status === 'declined' ? 'text-state-error-fg'
        : status === 'progress' ? 'text-text-secondary animate-pulse'
        : 'text-text-tertiary';

    return (
        <div className={cn(`group pt-2 pb-4 ps-6 pe-3`, groupClassName)}>
            <div className="flex items-start gap-3">
                {/*
                  Bullet indicator — colored by tool status (success/error/pending).

                  `data-message-bullet` is what `useSectionFold` counts to report
                  how much of a reply it is hiding. A bullet is what a reader
                  takes for "one message", and this wrapper is the one place
                  that draws one, so the attribute belongs here rather than on
                  each of the ~190 renderers that mount it.
                */}
                <span data-message-bullet className={cn('mt-[3px] text-[0.6923rem]', bulletColor)}>●</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className={cn(`mt-0.5`, className)} onClick={onClick}>
                        {children}
                    </div>
                    {/* Drawn here, once, rather than in each of the ~190 renderers —
                        a card that forgets would silently print the raw marker in a
                        result box instead. ToolRenderer withholds this from the MCP
                        cards, which draw their own in their badge style. */}
                    {declined && <DeclinedNote text={declined} />}
                </div>

                {message?.context && <ContextPills context={message.context} />}
            </div>
        </div>
    )
}

export const ToolWrapper2 = (props: {
    onClick?: () => any;
    children: ReactNode;
}) => {
    const {onClick, children} = props;

    return (
        <div className="mt-0.5 mb-1.5" onClick={onClick}>
            {children}
        </div>
    )
}

export const ToolHeader = (props: {
    name: string;
    description?: string;
    inProgress?: boolean;
    className?: string;
    /** Optional hover tooltip on the bold name (e.g. the raw MCP tool id). */
    nameTooltip?: string;
    children?: ReactNode;
}) => {
    const {name, description = '', className = '', nameTooltip, children} = props;

    return (
        <div className={cn(`flex items-start gap-1.5 text-[1rem]`, className)}>
            <div className="text-text-primary text-[1rem] font-semibold">
                <Tooltip content={nameTooltip}>
                    <span className={cn(nameTooltip && "cursor-help")}>{name}</span>
                </Tooltip>
            </div>

            {children || <div className="text-text-primary/60">{description}</div>}
        </div>
    )
}

/**
 * A short caption that explains a tool's execution result. Rendered between the
 * tool header and the result box (e.g. Edit's "Modified", search's "N found").
 */
export const ResultCaption = (props: {children?: ReactNode; className?: string}) => {
    const {children, className} = props;
    return (
        <div className={cn("text-text-primary/50 text-[0.8461rem] mb-1", className)}>
            {children}
        </div>
    );
};

// dir="ltr": this wraps raw code / command / JSON output (Bash in/out,
// NotebookEdit source, TaskOutput result, …). Without it, `<html dir="rtl">`
// flips punctuation/indentation ordering inside the code content itself.
export const Container = ({children, className = ''}: { children?: ReactNode; className?: string;}) => {
    return (
        <div dir="ltr" className={`bg-surface-hover border border-border-subtle rounded text-[0.8461rem] font-mono ${className}`}>
            {children}
        </div>
    )
}

export const LabelValue = (props: {
    label?: string;
    className?: string;
    maxHeight?: string;
    children?: ReactNode;
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const {label = '', children, className = '', maxHeight} = props;
    const softWrap = useSoftWrapToggle();

    // The row carries the class and hosts the button (#179 follow-up). It does
    // not scroll, so the button stays put while the value box beside it is
    // scrolled sideways — an absolutely positioned child of the box itself
    // would slide away with the content.
    return (
        <div className={cn('group/wrap relative flex items-start p-2', softWrap.blockClassName, className)}>
            {label && <Label name={label}/>}
            {softWrap.button}
            <Value
                isFocused={isFocused}
                onClick={() => setIsFocused((v) => !v)}
                maxHeight={maxHeight}
            >{children}</Value>
        </div>
    )
}

export const Label = ({name}: { name: string }) => {
    return <div className="text-tool-label-fg min-w-[40px]">{name}</div>
}

export const Value = (props: {
    isFocused?: boolean;
    onClick?: () => any;
    maxHeight?: string;
    children?: ReactNode;
}) => {
    const {isFocused, onClick, children, maxHeight = 'max-h-[105px]'} = props;

    return (
        <div dir="ltr" className={cn('monospace-block flex-1 min-w-0 text-text-primary/80 whitespace-pre font-mono overflow-y-hidden overflow-x-auto no-scrollbar cursor-pointer', isFocused ? '' : maxHeight)} onClick={onClick}>
            {children}
        </div>
    );
}
