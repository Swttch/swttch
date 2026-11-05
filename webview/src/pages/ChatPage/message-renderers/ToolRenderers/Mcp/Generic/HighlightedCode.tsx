import {CSSProperties, useEffect, useState} from "react";
import type {HighlightOptions} from "streamdown";
import {jsonResultCode as code} from "@/utils/codePlugin";

type Tokens = NonNullable<ReturnType<typeof code.highlight>>["tokens"];

/**
 * Code or JSON coloured by the same Shiki highlighter the chat's code blocks
 * use, in the palette of the MCP input/output card. Shows the plain text until
 * the grammar has loaded, and keeps showing it if the highlighter fails or does
 * not know the language, so the content is never blank.
 */
export const HighlightedCode = (props: {text: string; language: string}) => {
    const {text, language} = props;
    const [tokens, setTokens] = useState<Tokens | null>(null);

    useEffect(() => {
        let cancelled = false;
        setTokens(null);
        const options = {code: text, language, themes: code.getThemes()} as unknown as HighlightOptions;
        const immediate = code.highlight(options, (result) => {
            if (!cancelled && result) setTokens(result.tokens);
        });
        if (immediate) setTokens(immediate.tokens);
        return () => {
            cancelled = true;
        };
    }, [text, language]);

    if (!tokens) return <>{text}</>;

    return (
        <>
            {tokens.map((line, lineIndex) => (
                <span key={lineIndex}>
                    {line.map((token, tokenIndex) => (
                        <span
                            key={tokenIndex}
                            data-mcp-json-token=""
                            style={token.htmlStyle as CSSProperties | undefined}
                        >
                            {token.content}
                        </span>
                    ))}
                    {lineIndex < tokens.length - 1 ? "\n" : ""}
                </span>
            ))}
        </>
    );
};
