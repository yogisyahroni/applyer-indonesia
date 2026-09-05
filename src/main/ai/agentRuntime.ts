import type { AiAgentRunResult, AiToolTrace } from '@shared/types/ai'
import { logActivity } from '../db/repositories/activityLogRepository'
import { getResolvedDirectAiConfig } from './config'
import { AI_TOOLS, aiToolJsonSchema, callToolResultToText, getAiTool } from './toolRegistry'
import {
  anthropicMessage,
  openAiChat,
  type AnthropicBlock,
  type AnthropicMessage,
  type AnthropicToolResultBlock,
  type AnthropicToolSpec,
  type OpenAiMessage,
  type OpenAiToolSpec,
  type ResolvedProviderConfig
} from './providerClient'

const MAX_AGENT_STEPS = 12
const MAX_PROMPT_LENGTH = 12_000

const SYSTEM_PROMPT = `You are the job-search agent inside Applyer Indonesia.
Use the provided tools to help the user search, evaluate, queue, and prepare job applications.
Default to Indonesia when the user's request is geographically ambiguous, but follow explicit location instructions.
A missing salary is NOT a rejection criterion. Treat salary as unknown unless the posting states it.
Never invent skills, experience, salary expectations, credentials, work authorization, or profile facts.
Before matching or filling when profile details matter, use get_profile.
Never submit an application. fill_application only prepares the form for human review and manual submission.
Never bypass CAPTCHA, verification, login, rate limits, or anti-bot protections. Let the user complete those steps when required.
Only exclude a job when the user explicitly asks for exclusion or a standing blacklist rule.
Keep the final answer concise and explain important actions you took.`

function compact(text: string, max = 220): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`
}

async function executeTool(name: string, input: unknown, trace: AiToolTrace[]): Promise<string> {
  const tool = getAiTool(name)
  if (!tool) {
    const message = `Unknown Applyer tool: ${name}`
    trace.push({ name, ok: false, summary: message })
    return message
  }
  try {
    const result = await tool.execute(input)
    const text = callToolResultToText(result)
    const ok = !result.isError
    trace.push({ name, ok, summary: compact(text) })
    return text
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    trace.push({ name, ok: false, summary: compact(message) })
    return `Tool failed: ${message}`
  }
}

function openAiTools(): OpenAiToolSpec[] {
  return AI_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: aiToolJsonSchema(tool)
    }
  }))
}

function anthropicTools(): AnthropicToolSpec[] {
  return AI_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: aiToolJsonSchema(tool)
  }))
}

function parseToolArguments(raw: string): unknown {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('Model returned invalid JSON tool arguments.')
  }
}

async function runOpenAiCompatible(
  config: ResolvedProviderConfig,
  prompt: string,
  trace: AiToolTrace[]
): Promise<string> {
  if (config.mode === 'openai' && !config.apiKey) throw new Error('OpenAI API requires an API key.')

  const messages: OpenAiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ]
  const tools = openAiTools()

  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    const assistant = await openAiChat(config, messages, tools)
    messages.push(assistant)
    const calls = assistant.tool_calls ?? []
    if (calls.length === 0) return assistant.content?.trim() || 'Done.'

    for (const call of calls) {
      let input: unknown = {}
      try {
        input = parseToolArguments(call.function.arguments)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        trace.push({ name: call.function.name, ok: false, summary: message })
        messages.push({ role: 'tool', tool_call_id: call.id, content: message })
        continue
      }
      const output = await executeTool(call.function.name, input, trace)
      messages.push({ role: 'tool', tool_call_id: call.id, content: output })
    }
  }

  throw new Error(`AI agent exceeded ${MAX_AGENT_STEPS} tool-calling steps.`)
}

async function runAnthropic(
  config: ResolvedProviderConfig,
  prompt: string,
  trace: AiToolTrace[]
): Promise<string> {
  const messages: AnthropicMessage[] = [{ role: 'user', content: prompt }]
  const tools = anthropicTools()

  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    const response = await anthropicMessage(config, SYSTEM_PROMPT, messages, tools)
    const blocks = response.blocks
    messages.push({ role: 'assistant', content: blocks as AnthropicBlock[] })
    const toolUses = blocks.filter((block) => block.type === 'tool_use')
    if (toolUses.length === 0) {
      const text = blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
      return text || 'Done.'
    }

    const results: AnthropicToolResultBlock[] = []
    for (const call of toolUses) {
      const output = await executeTool(call.name, call.input, trace)
      const latest = trace.at(-1)
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: output,
        is_error: latest ? !latest.ok : false
      })
    }
    messages.push({ role: 'user', content: results })
  }

  throw new Error(`AI agent exceeded ${MAX_AGENT_STEPS} tool-calling steps.`)
}

export async function runAiAgentTask(prompt: string): Promise<AiAgentRunResult> {
  const trimmed = prompt.trim()
  if (!trimmed) return { success: false, error: 'Enter an instruction for the AI agent.', toolTrace: [] }
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return { success: false, error: `Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).`, toolTrace: [] }
  }

  const trace: AiToolTrace[] = []
  try {
    const config = getResolvedDirectAiConfig()
    logActivity('info', `Direct AI agent started (${config.mode}, ${config.model})`)
    const output =
      config.mode === 'anthropic'
        ? await runAnthropic(config, trimmed, trace)
        : await runOpenAiCompatible(config, trimmed, trace)
    logActivity('info', `Direct AI agent completed with ${trace.length} tool call(s)`)
    return { success: true, output, toolTrace: trace }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logActivity('error', 'Direct AI agent failed', { error: message })
    return { success: false, error: message, toolTrace: trace }
  }
}
