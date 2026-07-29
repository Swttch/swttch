import {HTMLProps, ReactNode} from "react";

interface Props extends HTMLProps<HTMLButtonElement> {
    type?: "submit" | "reset" | "button" | undefined;
    className?: string;
    children?: ReactNode;
    onClick?: () => any;
}

/**
 * A single item in the composer's bottom row (permission mode, context usage,
 * attached file, model).
 *
 * `whitespace-nowrap` + `min-w-0` keep the row intact when space runs out: a
 * tag shrinks and ellipsizes instead of wrapping onto a second line and pushing
 * its siblings apart. Label lengths are not ours to control — a custom model
 * catalog can hand us a much longer name than the Anthropic one, and a
 * translated label can be longer still — so the row has to survive any of them
 * (issue #217).
 */
export function Tag(props: Props) {
    const {type = 'button', title = '', className = '', children, onClick, disabled, ...res} = props;

    return (
        <button
            type={type}
            className={`
                inline-flex items-center gap-1 px-2 py-[2px] rounded
                text-[0.8461rem] font-medium transition-colors
                min-w-0 whitespace-nowrap
                ${disabled
                    ? 'text-text-tertiary cursor-default'
                    : 'text-text-secondary cursor-pointer hover:bg-surface-hover'
                }
                ${className}
            `}
            title={title}
            onClick={onClick}
            disabled={disabled}
            {...res}
        >
            {children}
        </button>
    )
}
