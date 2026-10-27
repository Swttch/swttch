import {useEffect, useState} from "react";
import {decodeText, loadFileContent} from "@/components/FilePreviewPane/loadFileContent";
import {htmlTitleOf} from "@/utils/htmlTitle";

/** The `<title>` of the page at `path`, once read; undefined while loading or when the page names none. */
export function usePageTitle(path: string | undefined): string | undefined {
    const [title, setTitle] = useState<string | undefined>(undefined);
    useEffect(() => {
        if (!path || !/\.html?$/i.test(path)) return;
        let cancelled = false;
        void loadFileContent(path, () => cancelled).then((result) => {
            if (cancelled || !result.ok || result.kind !== 'html') return;
            setTitle(htmlTitleOf(decodeText(result.pieces)));
        });
        return () => { cancelled = true; };
    }, [path]);
    return title;
}

