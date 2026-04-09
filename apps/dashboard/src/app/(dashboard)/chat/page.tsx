'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Bot, Send, Trash2, Loader2, User, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolAction {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: ToolAction[];
}

export default function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: config } = useQuery({
    queryKey: ['ai-config'],
    queryFn: async () => {
      const res = await api.get<{ data: { provider: string; model: string; apiKeySet: boolean } }>('/settings/ai');
      return res.data.data;
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }];
      setMessages(newMessages);
      setInput('');

      const res = await api.post<{ data: { content: string; actions: ToolAction[]; provider: string; model: string; latencyMs: number } }>(
        '/ai/chat',
        { messages: newMessages.map((m) => ({ role: m.role, content: m.content })) },
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content, actions: data.actions }]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to get response. Check your AI settings and API key.' },
      ]);
    },
  });

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    chatMutation.mutate(input.trim());
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-11 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-violet-500" />
          <span className="text-xs font-semibold text-gray-900">AI Assistant</span>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {config?.provider ?? '—'} / {config?.model ?? '—'}
          </span>
        </div>
        <button
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
          className="text-gray-400 hover:text-gray-600 disabled:opacity-30 p-1"
          title="Clear chat"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center mx-auto mb-3">
                <Bot size={20} className="text-violet-500" />
              </div>
              <p className="text-sm font-medium text-gray-900 mb-1">AI CRM Assistant</p>
              <p className="text-xs text-gray-400 mb-4">Control your CRM with natural language</p>
              <div className="text-[11px] text-gray-400 space-y-1.5 text-left max-w-xs mx-auto">
                {[
                  'Add a contact named John, phone 919876543210',
                  'Show me all open leads',
                  'Create a task to follow up tomorrow',
                  'What are the analytics?',
                  'Send a WhatsApp to 919876543210',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => { setInput(example); }}
                    className="block w-full text-left px-2.5 py-1.5 rounded border border-gray-100 hover:border-violet-200 hover:bg-violet-50/50 transition-colors"
                  >
                    &ldquo;{example}&rdquo;
                  </button>
                ))}
              </div>
              {!config?.apiKeySet && (
                <a href="/settings/ai" className="inline-block mt-4 text-xs text-violet-500 hover:text-violet-600 font-medium">
                  Set up AI provider &rarr;
                </a>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className="flex items-start gap-2 max-w-lg">
              {msg.role === 'assistant' && (
                <div className="w-5 h-5 rounded bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={11} className="text-violet-500" />
                </div>
              )}
              <div className={cn(
                'px-3 py-2 rounded-lg text-xs leading-relaxed',
                msg.role === 'user'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-800 border border-gray-150 shadow-sm',
              )}>
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mb-1.5 space-y-1">
                    {msg.actions.map((action, ai) => (
                      <div key={ai} className="flex items-start gap-1 text-[10px] bg-violet-50 text-violet-700 rounded px-2 py-1 border border-violet-100">
                        <Wrench size={9} className="mt-0.5 shrink-0" />
                        <span><strong>{action.tool}</strong> {action.result}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === 'user' && (
                <div className="w-5 h-5 rounded bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={11} className="text-gray-500" />
                </div>
              )}
            </div>
          </div>
        ))}

        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded bg-violet-100 flex items-center justify-center shrink-0">
                <Bot size={11} className="text-violet-500" />
              </div>
              <div className="bg-white text-gray-400 px-3 py-2 rounded-lg border border-gray-150 shadow-sm text-xs flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                Thinking...
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 py-2.5 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={config?.apiKeySet ? 'Ask AI anything... (Enter to send)' : 'Configure AI provider in Settings first'}
            disabled={!config?.apiKeySet}
            rows={1}
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400 max-h-24 disabled:bg-gray-50 disabled:text-gray-300 placeholder:text-gray-300"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending || !config?.apiKeySet}
            className="bg-gray-900 hover:bg-gray-800 disabled:opacity-30 text-white rounded-lg p-2 transition shrink-0"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
