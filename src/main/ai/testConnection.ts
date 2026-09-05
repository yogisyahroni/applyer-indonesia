import type { AiConnectionTestResult } from '@shared/types/ai'
import { getResolvedDirectAiConfig } from './config'
import { anthropicMessage, openAiChat } from './providerClient'

export async function testAiConnection(): Promise<AiConnectionTestResult> {
  const started = Date.now()
  try {
    const config = getResolvedDirectAiConfig()
    if (config.mode === 'openai' && !config.apiKey) throw new Error('OpenAI API requires an API key.')
    if (config.mode === 'anthropic' && !config.apiKey) throw new Error('Anthropic API requires an API key.')

    if (config.mode === 'anthropic') {
      const response = await anthropicMessage(
        config,
        'You are a connection test. Reply only with OK.',
        [{ role: 'user', content: 'OK?' }],
        undefined,
        8
      )
      const text = response.blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ')
        .trim()
      return {
        success: true,
        message: text || 'Connected.',
        latencyMs: Date.now() - started,
        model: config.model
      }
    }

    const response = await openAiChat(
      config,
      [
        { role: 'system', content: 'You are a connection test. Reply only with OK.' },
        { role: 'user', content: 'OK?' }
      ],
      undefined,
      8
    )
    return {
      success: true,
      message: response.content?.trim() || 'Connected.',
      latencyMs: Date.now() - started,
      model: config.model
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started
    }
  }
}
