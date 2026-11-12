import toast from "react-hot-toast";
import {XMarkIcon} from "@heroicons/react/24/outline";
import {getAdapter} from "@/adapters";
import {i18n} from "@/i18n";

/** How long the toast that says a file was saved stays: react-hot-toast's own 2 seconds went by before it could be read. */
export const SAVED_TOAST_MS = 5000;

/**
 * Says that a file was saved. The message names the file (or how many files, and the folder's name), not the whole path:
 * a path of several folders fills the toast and is not what anyone needs to read. Where the file went is one click away
 * instead, on the button that shows it in the file manager, when `revealPath` says which file to show.
 *
 * It stays {@link SAVED_TOAST_MS} so there is time to use that button, and it has a button to put it away sooner, since a
 * toast that cannot be closed by hand keeps covering what is under it.
 */
export function showSavedToast(message: string, revealPath?: string): void {
    toast.success(
        (instance) => (
            <span className="flex flex-col items-start gap-1.5">
                <span className="flex items-start gap-3">
                    <span className="min-w-0 break-all">{message}</span>
                    <button
                        type="button"
                        onClick={() => toast.dismiss(instance.id)}
                        className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
                        aria-label={i18n.t("chat:sentFiles.dismiss")}
                    >
                        <XMarkIcon className="h-4 w-4"/>
                    </button>
                </span>
                {revealPath !== undefined && (
                    <button
                        type="button"
                        onClick={() => {
                            toast.dismiss(instance.id);
                            getAdapter().revealFile(revealPath).catch(() => toast.error(i18n.t("chat:fileOpenFailed", {path: revealPath})));
                        }}
                        className="whitespace-nowrap font-medium text-accent-claude transition-opacity hover:opacity-80"
                    >
                        {i18n.t("chat:fileLink.showInFileManager")}
                    </button>
                )}
            </span>
        ),
        {duration: SAVED_TOAST_MS},
    );
}
