import type { AiMode } from '@shared/types/ai'

type DirectAiMode = Exclude<AiMode, 'cli'>

export interface ResolvedProviderConfig {
  mode: DirectAiMode
  model: string
  baseUrl: string
  apiKey: string | null
}

export interface OpenAiToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface OpenAiAssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: OpenAiToolCall[]
}

export type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | OpenAiAssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string }

export interface OpenAiToolSpec {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface OpenAiResponse {
  choices?: Array<{ message?: OpenAiAssistantMessage }>
  error?: { message?: string }
}

export interface AnthropicTextBlock {
  type: 'text'
  text: string
}

export interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicBlock[]
}

export interface AnthropicToolSpec {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

interface AnthropicResponse {
  content?: Array<AnthropicTextBlock | AnthropicToolUseBlock>
  stop_reason?: string
  error?: { message?: string }
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const text = await response.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    if (!response.ok) {
      const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
      const nested = record?.error && typeof record.error === 'object' ? (record.error as Record<string, unknown>) : null
      const message = typeof nested?.message === 'string' ? nested.message : text || response.statusText
      throw new Error(`${response.status} ${message}`.trim())
    }
    return parsed as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI provider request timed out.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function bearerHeaders(apiKey: string | null): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

export async function openAiChat(
  config: ResolvedProviderConfig,
  messages: OpenAiMessage[],
  tools?: OpenAiToolSpec[],
  maxTokens = 1200
): Promise<OpenAiAssistantMessage> {
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: maxTokens
  }
  if (tools?.length) {
    payload.tools = tools
    payload.tool_choice = 'auto'
  }

  const data = await fetchJson<OpenAiResponse>(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...bearerHeaders(config.apiKey)
    },
    body: JSON.stringify(payload)
  })
  const message = data.choices?.[0]?.message
  if (!message) throw new Error(data.error?.message || 'AI provider returned no assistant message.')
  return message
}

export async function anthropicMessage(
  config: ResolvedProviderConfig,
  system: string,
  messages: AnthropicMessage[],
  tools?: AnthropicToolSpec[],
  maxTokens = 1200
): Promise<{ blocks: Array<AnthropicTextBlock | AnthropicToolUseBlock>; stopReason?: string }> {
  if (!config.apiKey) throw new Error('Anthropic API requires an API key.')
  const payload: Record<string, unknown> = {
    model: config.model,
    system,
    messages,
    max_tokens: maxTokens
  }
  if (tools?.length) payload.tools = tools

  const data = await fetchJson<AnthropicResponse>(`${config.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  })
  if (!Array.isArray(data.content)) throw new Error(data.error?.message || 'Anthropic returned no message content.')
  return { blocks: data.content, stopReason: data.stop_reason }
}
