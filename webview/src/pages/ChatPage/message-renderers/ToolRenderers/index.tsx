import {FC} from "react";
import {ToolUseBlockDto} from "@/dto";
import {LoadedMessageDto} from "@/types";
import { BashRenderer } from "./BashRenderer";
import {TodoWriteRenderer} from "./TodoWriteRenderer.tsx";
import {TaskRenderer} from "./TaskRenderer.tsx";
import {ReadRenderer} from "@/pages/ChatPage/message-renderers/ToolRenderers/ReadRenderer.tsx";
import {GrepRenderer} from "@/pages/ChatPage/message-renderers/ToolRenderers/GrepRenderer.tsx";
import {GlobRenderer} from "@/pages/ChatPage/message-renderers/ToolRenderers/GlobRenderer.tsx";
import {EditRenderer} from "@/pages/ChatPage/message-renderers/ToolRenderers/EditRenderer.tsx";
import {AskUserQuestionRenderer} from "./AskUserQuestion";
import {EnterPlanModeRenderer} from "./EnterPlanModeRenderer.tsx";
import {ExitPlanModeRenderer} from "./ExitPlanModeRenderer.tsx";
import {WebFetchRenderer} from "./WebFetchRenderer.tsx";
import {WebSearchRenderer} from "./WebSearchRenderer.tsx";
import {WriteRenderer} from "./WriteRenderer.tsx";
import {SkillRenderer} from "./SkillRenderer.tsx";
import {ToolSearchRenderer} from "./ToolSearchRenderer.tsx";
import {TaskOutputRenderer} from "./TaskOutputRenderer.tsx";
import {TaskStopRenderer} from "./TaskStopRenderer.tsx";
import {TaskCreateRenderer} from "./TaskCreateRenderer.tsx";
import {TaskGetRenderer} from "./TaskGetRenderer.tsx";
import {TaskListRenderer} from "./TaskListRenderer.tsx";
import {TaskUpdateRenderer} from "./TaskUpdateRenderer.tsx";
import {NotebookEditRenderer} from "./NotebookEditRenderer.tsx";
import {WorkflowRenderer} from "./WorkflowRenderer.tsx";
import {SendMessageRenderer} from "./SendMessageRenderer.tsx";
import {ListAgentsRenderer} from "./ListAgentsRenderer.tsx";
import {StructuredOutputRenderer} from "./StructuredOutputRenderer.tsx";
import {ScheduleWakeupRenderer} from "./ScheduleWakeupRenderer.tsx";
import {ReportFindingsRenderer} from "./ReportFindingsRenderer.tsx";
import {CronCreateRenderer} from "./CronCreateRenderer.tsx";
import {CronDeleteRenderer} from "./CronDeleteRenderer.tsx";
import {CronListRenderer} from "./CronListRenderer.tsx";
import {RemoteTriggerRenderer} from "./RemoteTriggerRenderer.tsx";
import {EnterWorktreeRenderer} from "./EnterWorktreeRenderer.tsx";
import {ExitWorktreeRenderer} from "./ExitWorktreeRenderer.tsx";
import {McpResourceRenderer} from "./McpResourceRenderer.tsx";
import {SendUserMessageRenderer} from "./SendUserMessageRenderer.tsx";
import {McpRenderers} from "./Mcp";

interface ToolRendererProps {
    toolUse: ToolUseBlockDto;
    toolResult?: LoadedMessageDto;
    message?: LoadedMessageDto;
}

export const ToolRendererMap = new Map<string, FC<ToolRendererProps>>([
    ['Bash', BashRenderer],
    ['PowerShell', BashRenderer],
    ['TodoWrite', TodoWriteRenderer],
    ['Task', TaskRenderer],
    ['Agent', TaskRenderer],
    ['TaskCreate', TaskCreateRenderer],
    ['TaskGet', TaskGetRenderer],
    ['TaskList', TaskListRenderer],
    ['TaskUpdate', TaskUpdateRenderer],
    ['Read', ReadRenderer],
    ['Grep', GrepRenderer],
    ['Glob', GlobRenderer],
    ['Edit', EditRenderer],
    ['AskUserQuestion', AskUserQuestionRenderer],
    ['EnterPlanMode', EnterPlanModeRenderer],
    ['ExitPlanMode', ExitPlanModeRenderer],
    ['WebFetch', WebFetchRenderer],
    ['WebSearch', WebSearchRenderer],
    ['Write', WriteRenderer],
    ['Skill', SkillRenderer],
    ['ToolSearch', ToolSearchRenderer],
    ['TaskOutput', TaskOutputRenderer],
    ['TaskStop', TaskStopRenderer],
    ['NotebookEdit', NotebookEditRenderer],
    ['Workflow', WorkflowRenderer],
    ['SendMessage', SendMessageRenderer],
    ['ListAgents', ListAgentsRenderer],
    ['StructuredOutput', StructuredOutputRenderer],
    ['ScheduleWakeup', ScheduleWakeupRenderer],
    ['ReportFindings', ReportFindingsRenderer],
    ['CronCreate', CronCreateRenderer],
    ['CronDelete', CronDeleteRenderer],
    ['CronList', CronListRenderer],
    ['RemoteTrigger', RemoteTriggerRenderer],
    ['EnterWorktree', EnterWorktreeRenderer],
    ['ExitWorktree', ExitWorktreeRenderer],
    ['ListMcpResourcesTool', McpResourceRenderer],
    ['ReadMcpResourceTool', McpResourceRenderer],
    ['ReadMcpResourceDirTool', McpResourceRenderer],
    ['SendUserMessage', SendUserMessageRenderer],

    // Legacy tool names. The CLI keeps an alias table that normalizes these onto
    // the current names, so a session recorded under an older CLI — or a user
    // still on one — replays the old name verbatim and would otherwise render as
    // an unknown tool. Read out of the CLI binary (2.1.170); `Task`/`Agent`
    // above is the same pairing.
    ['KillShell', TaskStopRenderer],
    ['KillBash', TaskStopRenderer],
    ['BashOutput', TaskOutputRenderer],
    ['BashOutputTool', TaskOutputRenderer],
    ['AgentOutput', TaskOutputRenderer],
    ['AgentOutputTool', TaskOutputRenderer],
    ['ListPeers', ListAgentsRenderer],
    ['ListMcpResources', McpResourceRenderer],
    ['ReadMcpResource', McpResourceRenderer],
    ['Brief', SendUserMessageRenderer],

    ...McpRenderers,
]);
