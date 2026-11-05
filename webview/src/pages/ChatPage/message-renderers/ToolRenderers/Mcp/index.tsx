import {FC} from "react";
import {RendererProps} from "../common";
import {FilesystemMcpRenderers} from "./Filesystem";
import {GmailRenderers} from "./Gmail";
import {JetBrainsRenderers} from "./JetBrains";
import {CcdTurnRenderers} from "./CcdTurn";

export const McpRenderers: Array<[string, FC<RendererProps>]> = [
    ...FilesystemMcpRenderers,
    ...GmailRenderers,
    ...JetBrainsRenderers,
    ...CcdTurnRenderers,
];
