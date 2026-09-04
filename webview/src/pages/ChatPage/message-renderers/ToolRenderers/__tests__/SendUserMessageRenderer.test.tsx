import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {SendUserMessageRenderer} from '../SendUserMessageRenderer';
import {ToolUseBlockDto, ContentBlockType} from '@/dto';

function makeToolUse(name: string, input: Record<string, unknown>): ToolUseBlockDto {
    return Object.assign(new ToolUseBlockDto(), {
        type: ContentBlockType.ToolUse,
        id: 'tool_1',
        name,
        input,
    });
}

describe('SendUserMessageRenderer', () => {
    it('renders the message the user is meant to read', () => {
        render(<SendUserMessageRenderer toolUse={makeToolUse('SendUserMessage', {
            message: 'The deploy finished.',
        })} />);

        expect(screen.getByText(/The deploy finished\./)).toBeInTheDocument();
    });

    // 'proactive' means the agent opened the conversation rather than answering.
    it('marks a proactive message', () => {
        render(<SendUserMessageRenderer toolUse={makeToolUse('SendUserMessage', {
            message: 'The nightly job failed.',
            status: 'proactive',
        })} />);

        expect(screen.getByText(/proactive/i)).toBeInTheDocument();
    });

    it('does not mark an ordinary reply', () => {
        render(<SendUserMessageRenderer toolUse={makeToolUse('SendUserMessage', {
            message: 'Done.',
            status: 'normal',
        })} />);

        expect(screen.queryByText(/proactive/i)).not.toBeInTheDocument();
    });

    // Attachments arrive either as a filesystem path or as an uploaded-file
    // object the user's device handed over; both name a file to the reader.
    it('lists a path attachment', () => {
        render(<SendUserMessageRenderer toolUse={makeToolUse('SendUserMessage', {
            message: 'Here is the chart.',
            attachments: ['/tmp/chart.png'],
        })} />);

        expect(screen.getByText('/tmp/chart.png')).toBeInTheDocument();
        expect(screen.getByText('1 attachment')).toBeInTheDocument();
    });

    it('lists an uploaded-file attachment by its name', () => {
        render(<SendUserMessageRenderer toolUse={makeToolUse('SendUserMessage', {
            message: 'Here is the chart.',
            attachments: [{file_uuid: 'f_1', file_name: 'chart.png', size: 10, is_image: true}],
        })} />);

        expect(screen.getByText('chart.png')).toBeInTheDocument();
    });

    // `Brief` is the legacy name the CLI normalizes onto SendUserMessage, so an
    // older session has to render with its own name rather than the new one.
    it('titles the row with the legacy name when that is what was called', () => {
        render(<SendUserMessageRenderer toolUse={makeToolUse('Brief', {message: 'Done.'})} />);
        expect(screen.getByText('Brief')).toBeInTheDocument();
    });
});
