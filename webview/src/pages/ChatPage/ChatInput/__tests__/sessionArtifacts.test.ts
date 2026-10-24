import {describe, it, expect} from 'vitest';
import {collectSessionArtifacts} from '../sessionArtifacts';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';
import type {LoadedMessageDto} from '@/types';

const A = 'https://claude.ai/artifact/aaaaaaaaaaaaaaaaaaaaaa';
const B = 'https://claude.ai/artifact/bbbbbbbbbbbbbbbbbbbbbb';
const TYPE = 'https://claude.ai/artifact/tttttttttttttttttttttt';

function result(text: string, isError?: boolean): LoadedMessageDto {
    return {
        message: {content: [{type: ContentBlockType.ToolResult, content: text, ...(isError ? {is_error: true} : {})}]},
    } as unknown as LoadedMessageDto;
}

function call(input: Record<string, unknown>, toolResult?: LoadedMessageDto, name = 'Artifact'): LoadedMessageDto {
    const block = Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: `tu-${Math.random()}`,
        name,
        input,
        tool_result: toolResult,
    });
    return {message: {content: [block]}} as unknown as LoadedMessageDto;
}

describe('collectSessionArtifacts', () => {
    it('is empty for a session that published nothing', () => {
        expect(collectSessionArtifacts([])).toEqual([]);
    });

    it('lists a page a typed create published, named by the call title, not the type it came from', () => {
        const messages = [call(
            {type_url: TYPE, title: 'Q4 deck'},
            result(`Created a new Artifact at ${A} (version 1792777235-07a8) from the Artifact type ${TYPE} (release x).`),
        )];
        expect(collectSessionArtifacts(messages)).toEqual([{url: A, title: 'Q4 deck'}]);
    });

    it('names a published file after the file when the call gave no title', () => {
        const messages = [call(
            {file_path: 'C:\\tmp\\scratchpad\\hello-two.html'},
            result(`Published C:\\tmp\\scratchpad\\hello-two.html at ${A} (Version 1, version id 1)`),
        )];
        expect(collectSessionArtifacts(messages)).toEqual([{url: A, title: 'hello-two'}]);
    });

    it('lists a page once when it is published again, keeps its first title, and moves it to the end', () => {
        const messages = [
            call({file_path: '/tmp/a.html', title: 'Alpha'}, result(`Published /tmp/a.html at ${A} (Version 1, version id 1)`)),
            call({file_path: '/tmp/b.html', title: 'Beta'}, result(`Published /tmp/b.html at ${B} (Version 1, version id 2)`)),
            call({file_path: '/tmp/a.html', edits: []}, result(`Published /tmp/a.html at ${A} (Version 2, version id 3)`)),
        ];
        expect(collectSessionArtifacts(messages)).toEqual([
            {url: B, title: 'Beta'},
            {url: A, title: 'a'},
        ]);
    });

    it('lists the page an update by address names', () => {
        const messages = [call({url: A}, result(`Updated the Artifact at ${A} (Version 3, version id 4)`))];
        expect(collectSessionArtifacts(messages)).toEqual([{url: A, title: ''}]);
    });

    it.each(['quickstart', 'list', 'read', 'open', 'delete'])('leaves out an %s call, which names pages without publishing one', (action) => {
        const messages = [call({action, intent: 'slides'}, result(`see ${A}`))];
        expect(collectSessionArtifacts(messages)).toEqual([]);
    });

    it('leaves out a call that failed, one with no result yet, and the other Artifact tools', () => {
        const messages = [
            call({file_path: '/tmp/a.html'}, result(`failed near ${A}`, true)),
            call({file_path: '/tmp/b.html'}, undefined),
            call({collection: 'rows'}, result(`rows of ${B}`), 'ArtifactData'),
        ];
        expect(collectSessionArtifacts(messages)).toEqual([]);
    });

    it('skips messages whose content is plain text', () => {
        const message = {message: {content: 'hello'}} as unknown as LoadedMessageDto;
        expect(collectSessionArtifacts([message])).toEqual([]);
    });
});
