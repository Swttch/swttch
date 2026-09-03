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
    ...McpRenderers,
]);
