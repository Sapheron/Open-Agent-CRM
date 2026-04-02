import type { AiProvider } from './provider.interface';
import { GeminiProvider } from './gemini.provider';
import { OpenAiProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';

export interface ProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

// Mirrors PROVIDER_MODELS in ai-settings.service.ts — keep in sync
export const PROVIDER_MODELS: Record<string, string[]> = {
  GEMINI: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  OPENAI: [
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'o4-mini',
    'o3',
  ],
  ANTHROPIC: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ],
  GROQ: [
    'llama-3.3-70b-versatile',
    'deepseek-r1-distill-llama-70b',
    'qwen-qwq-32b',
    'llama-3.1-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ],
  OLLAMA: ['llama3.3', 'llama3.1', 'mistral', 'phi4', 'gemma3', 'deepseek-r1', 'qwen2.5'],
  OPENROUTER: [
    'google/gemini-2.5-pro',
    'openai/gpt-4.1',
    'anthropic/claude-sonnet-4-6',
    'deepseek/deepseek-r1',
    'meta-llama/llama-3.3-70b-instruct',
    'auto',
  ],
};

export class ProviderFactory {
  static create(config: ProviderConfig): AiProvider {
    switch (config.provider) {
      case 'GEMINI':
        return new GeminiProvider(config.apiKey, config.model);

      case 'OPENAI':
        return new OpenAiProvider(config.apiKey, config.model, 'OPENAI');

      case 'ANTHROPIC':
        return new AnthropicProvider(config.apiKey, config.model);

      case 'GROQ':
        return new OpenAiProvider(
          config.apiKey,
          config.model,
          'GROQ',
          'https://api.groq.com/openai/v1',
        );

      case 'OLLAMA':
        return new OpenAiProvider(
          'ollama', // Ollama doesn't need a real key
          config.model,
          'OLLAMA',
          config.baseUrl ?? 'http://localhost:11434/v1',
        );

      case 'OPENROUTER':
        return new OpenAiProvider(
          config.apiKey,
          config.model,
          'OPENROUTER',
          'https://openrouter.ai/api/v1',
        );

      default:
        // CUSTOM: openai-compatible with custom base URL
        return new OpenAiProvider(config.apiKey, config.model, 'CUSTOM', config.baseUrl);
    }
  }
}
