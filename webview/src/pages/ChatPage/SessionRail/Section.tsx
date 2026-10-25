import {ReactNode, useState} from "react";
import {ChevronDownIcon, ChevronRightIcon} from "@heroicons/react/24/outline";

interface SectionProps {
    title: string;
    /** Open when the rail opens. Claude Desktop opens Environment and Outputs and leaves Context closed. */
    defaultOpen: boolean;
    /** Told when the section opens, so a section can fetch what it shows only for a reader who looks. */
    onToggle?: (open: boolean) => void;
    children: ReactNode;
}

/** One collapsible block of the session rail: a title with a chevron, and its body. */
export function Section({title, defaultOpen, onToggle, children}: SectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

    return (
        <section className="border-t border-border-default first:border-t-0 px-3 py-2">
            <button
                type="button"
                aria-expanded={open}
                className="flex w-full items-center gap-1 py-1 text-start text-[0.8462rem] font-medium text-text-primary"
                onClick={() => {
                    setOpen(!open);
                    onToggle?.(!open);
                }}
            >
                <span>{title}</span>
                <Chevron className="h-3 w-3 text-text-tertiary"/>
            </button>
            {open && <div className="pt-1">{children}</div>}
        </section>
    );
}
