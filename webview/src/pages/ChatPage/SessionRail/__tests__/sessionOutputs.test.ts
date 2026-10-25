import {describe, expect, it} from 'vitest';
import {collectSessionOutputs, toolLabel} from '../sessionOutputs';
import type {LoadedMessageDto} from '@/types';

function assistant(...blocks: object[]): LoadedMessageDto {
    return {type: 'assistant', message: {content: blocks}} as unknown as LoadedMessageDto;
}

function user(content: object[], extra: object = {}): LoadedMessageDto {
    return {type: 'user', timestamp: '2026-10-26T01:02:03.000Z', message: {content}, ...extra} as unknown as LoadedMessageDto;
}

const use = (id: string, name: string, input: object) => ({type: 'tool_use', id, name, input});
const result = (id: string, content: unknown, is_error = false) => ({type: 'tool_result', tool_use_id: id, content, is_error});

describe('collectSessionOutputs', () => {
    it('lists the files SendUserFile sent, newest first', () => {
        const messages = [
            assistant(use('t1', 'SendUserFile', {files: ['/a/photo.jpg', '/a/table.csv']})),
            user([result('t1', 'ok')], {toolUseResult: {attachments: [
                {path: '/a/photo.jpg', size: 3, isImage: true},
                {path: '/a/table.csv', size: 24, isImage: false},
            ]}}),
        ];
        expect(collectSessionOutputs(messages).map((o) => o.kind === 'file' && o.name)).toEqual(['table.csv', 'photo.jpg']);
    });

    it('lists a picture a tool returned, with the tool that made it', () => {
        const messages = [
            assistant(use('t2', 'mcp__browser__screenshot', {})),
            user([result('t2', [{type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'QUJD'}}])]),
        ];
        const [only] = collectSessionOutputs(messages);
        expect(only).toMatchObject({kind: 'image', tool: 'mcp__browser__screenshot', src: 'data:image/png;base64,QUJD'});
    });

    it('does not list a picture a Read opened', () => {
        const messages = [
            assistant(use('t7', 'Read', {file_path: '/a/p.png'})),
            user([result('t7', [{type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'QUJD'}}])]),
        ];
        expect(collectSessionOutputs(messages)).toEqual([]);
    });

    it('lists a published Artifact and puts it first', () => {
        const messages = [
            assistant(use('t3', 'SendUserFile', {files: ['/a/x.pdf']})),
            user([result('t3', 'ok')], {toolUseResult: {attachments: [{path: '/a/x.pdf', size: 1, isImage: false}]}}),
            assistant(use('t4', 'Artifact', {title: 'Deck', file_path: '/a/deck.html'})),
            user([result('t4', 'Created a new Artifact at https://claude.ai/artifact/abc123 (version v1)')]),
        ];
        const kinds = collectSessionOutputs(messages).map((o) => o.kind);
        expect(kinds).toEqual(['artifact', 'file']);
    });

    it('skips a call that failed or has no result yet', () => {
        const messages = [
            assistant(use('t5', 'SendUserFile', {files: ['/a/gone.png']})),
            user([result('t5', 'boom', true)]),
            assistant(use('t6', 'SendUserFile', {files: ['/a/later.png']})),
        ];
        expect(collectSessionOutputs(messages)).toEqual([]);
    });
});

describe('toolLabel', () => {
    it('names the server of an MCP tool and the tool itself otherwise', () => {
        expect(toolLabel('mcp__Claude_Browser__computer')).toBe('Claude Browser');
        expect(toolLabel('mcp__my-server__shot')).toBe('my server');
        expect(toolLabel('Read')).toBe('Read');
    });
});
