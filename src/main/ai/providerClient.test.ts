import { afterEach, describe, expect, it, vi } from 'vitest'
import { openAiChat, openAiResponse, type ResolvedProviderConfig } from './providerClient'

const nativeConfig: ResolvedProviderConfig = {
  mode: 'openai',
  model: 'gpt-test',
  baseUrl: 'https://api.example.test/v1',
  apiKey: 'test-secret'
}

const compatibleConfig: ResolvedProviderConfig = {
  mode: 'openai_compatible',
  model: 'local-model',
  baseUrl: 'http://127.0.0.1:1234/v1',
  apiKey: null
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI provider transports', () => {
  it('uses OpenAI Responses API and parses native function calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_1',
          output: [
            {
              type: 'function_call',
              call_id: 'call_1',
              name: 'search_jobs',
              arguments: '{"query":"backend"}'
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await openAiResponse(
      nativeConfig,
      'system instructions',
      'find jobs',
      [{ type: 'function', name: 'search_jobs', description: 'Search jobs', parameters: { type: 'object' } }]
    )

    expect(result).toEqual({
      id: 'resp_1',
      text: '',
      functionCalls: [
        { type: 'function_call', callId: 'call_1', name: 'search_jobs', arguments: '{"query":"backend"}' }
      ]
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/responses')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'gpt-test',
      instructions: 'system instructions',
      input: 'find jobs',
      max_output_tokens: 1200,
      tool_choice: 'auto'
    })
  })

  it('keeps Chat Completions for OpenAI-compatible local/custom endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await openAiChat(compatibleConfig, [{ role: 'user', content: 'hello' }])

    expect(result.content).toBe('OK')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:1234/v1/chat/completions')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).toMatchObject({ model: 'local-model', max_tokens: 1200 })
  })
})
