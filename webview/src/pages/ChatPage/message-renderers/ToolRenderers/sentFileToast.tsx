import toast from "react-hot-toast";
import {XMarkIcon} from "@heroicons/react/24/outline";
import {i18n} from "@/i18n";

/** How long the toast that says a file was saved stays: react-hot-toast's own 2 seconds went by before it could be read. */
export const SAVED_TOAST_MS = 5000;

/**
 * Says that a file was saved, and where. The message names a folder, which is worth reading and copying, so the toast
 * stays {@link SAVED_TOAST_MS}, and it has a button to put it away sooner, since a toast that cannot be closed by hand
 * keeps covering what is under it. A long path wraps instead of running out of the toast.
 */
export function showSavedToast(message: string): void {
    toast.success(
        (instance) => (
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
        ),
        {duration: SAVED_TOAST_MS},
    );
}
