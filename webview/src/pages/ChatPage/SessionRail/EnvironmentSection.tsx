import {FolderIcon} from "@heroicons/react/24/outline";
import {useChatStreamContext} from "@/contexts/ChatStreamContext";
import {useSessionContext} from "@/contexts/SessionContext";
import {basename} from "../ChatInput/basename";

function BranchIcon() {
    return (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="4.5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="4.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="11.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M4.5 5v6M11.5 8v.5a2 2 0 0 1-2 2H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
    );
}

/** The branch the CLI last recorded on an entry of this session. */
export function currentBranchOf(messages: readonly object[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        const branch = (messages[i] as {gitBranch?: unknown}).gitBranch;
        if (typeof branch === 'string' && branch !== '' && branch !== 'HEAD') return branch;
    }
    return undefined;
}

/** Where the session runs: its folder and the branch it works on. */
export function EnvironmentSection() {
    const {workingDirectory} = useSessionContext();
    const {messages} = useChatStreamContext();
    const branch = currentBranchOf(messages);

    return (
        <ul className="flex flex-col gap-1 text-[0.8462rem] text-text-primary">
            {workingDirectory && (
                <li className="flex items-center gap-2 py-0.5" title={workingDirectory}>
                    <FolderIcon className="h-4 w-4 shrink-0 text-text-secondary"/>
                    <span dir="ltr" className="truncate">{basename(workingDirectory)}</span>
                </li>
            )}
            {branch && (
                <li className="flex items-center gap-2 py-0.5">
                    <span className="text-text-secondary"><BranchIcon/></span>
                    <span dir="ltr" className="truncate">{branch}</span>
                </li>
            )}
        </ul>
    );
}
