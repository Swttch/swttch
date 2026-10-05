import {useEffect, useRef, type ReactNode} from "react";

export interface OptionItem {
    key: string;
    label: string;
    /**
     * Shown but not answerable. The row keeps its place and number so the
     * options around it do not renumber, and says why through [trailing].
     */
    disabled?: boolean;
    /** Right-aligned content on a disabled row, e.g. the link that unlocks it. */
    trailing?: ReactNode;
}

interface Props {
    option: OptionItem;
    isFocused: boolean;
    onClick: () => void;
    onFocus: () => void;
}

export function OptionButton(props: Props) {
    const {option, isFocused = false, onClick, onFocus} = props;
    const ref = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isFocused && !option.disabled) ref.current?.focus();
    }, [isFocused, option.disabled]);

    // A row that cannot be answered is not a button: the link inside it is the
    // only thing to click, and a button holding a button is not valid markup.
    // `aria-disabled` sits on the wording alone, not the row: on the row it would
    // mark the link inside as disabled too, and the link is the one live part.
    if (option.disabled) {
        return (
            <div className="w-full flex items-center gap-2.5 px-2.5 py-[3.5px] border border-border-strong/20 rounded-[4px] text-start font-bold select-none">
                <span aria-disabled="true" className="flex items-center gap-2.5 text-text-tertiary opacity-50">
                    <span className="text-[1rem]">{option.key}</span>
                    <span className="text-[1rem]">{option.label}</span>
                </span>
                {option.trailing && <span className="ml-auto">{option.trailing}</span>}
            </div>
        );
    }

    return (
        <button
            type="button"
            ref={ref}
            onClick={onClick}
            tabIndex={0}
            onFocus={onFocus}
            className={`w-full flex items-center gap-2.5 px-2.5 py-[3.5px] border border-border-strong/20 rounded-[4px] text-start font-bold transition-colors duration-100 select-none outline-none ${
                isFocused
                    ? 'text-text-primary bg-accent-primary-subtle'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
        >
            <span className="text-[1rem] text-text-tertiary">{option.key}</span>
            <span className="text-[1rem]">{option.label}</span>
        </button>
    );
}
