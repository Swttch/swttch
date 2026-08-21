import {ReactNode, createContext, useContext, useState} from "react";
import {ContextPills} from "@/pages/ChatPage/message-renderers";
import type {LoadedMessageDto} from "@/types";
import {Tooltip} from "@/components";
import {cn} from "@/utils/cn.ts";
import {useTranslation} from "@/i18n";
import {ToolUseBlockDto} from "@/dto/message/ContentBlockDto";
import {useToolStatus, type ToolStatus} from "./toolStatus";

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
 * Neutral note for a user's denial decision — deliberately NOT styled as an
 * error, so a declined tool never reads as a failure. Shared by the generic MCP
 * fallback and any renderer that wants the plain form (the JetBrains cards use
 * their own badge-styled variant). Shows the instruction the user gave, if any.
 */
export const DeclinedNote = (props: {instruction?: string}) => {
    const {t} = useTranslation('chatTools');
    return (
        <div className="mt-1 text-[0.8461rem] text-text-tertiary italic whitespace-pre-wrap">
            {props.instruction
                ? t('tool.declinedWithInstruction', {instruction: props.instruction})
                : t('tool.declined')}
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
    const bulletColor =
        status === 'success' ? 'text-state-success-fg'
        : status === 'error' ? 'text-state-error-fg'
        : status === 'progress' ? 'text-text-secondary animate-pulse'
        : 'text-text-tertiary';

    return (
        <div className={cn(`group pt-2 pb-4 ps-6 pe-3`, groupClassName)}>
            <div className="flex items-start gap-3">
                {/* Bullet indicator — colored by tool status (success/error/pending) */}
                <span className={cn('mt-[3px] text-[0.6923rem]', bulletColor)}>●</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className={cn(`mt-0.5`, className)} onClick={onClick}>
                        {children}
                    </div>
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

    return (
        <div className={`flex items-start p-2 ${className}`}>
            {label && <Label name={label}/>}
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
        <div dir="ltr" className={`monospace-block flex-1 text-text-primary/80 whitespace-pre font-mono overflow-y-hidden overflow-x-auto no-scrollbar cursor-pointer ${isFocused ? '' : maxHeight}`} onClick={onClick}>
            {children}
        </div>
    );
}
