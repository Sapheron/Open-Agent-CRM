'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import axios from 'axios';
import { useInboxStore } from '@/stores/inbox.store';
import { useAuthStore } from '@/stores/auth.store';

let socket: Socket | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
      '/api/auth/refresh',
      { refreshToken },
    );
    localStorage.setItem('access_token', data.data.accessToken);
    localStorage.setItem('refresh_token', data.data.refreshToken);
    useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken);
    return data.data.accessToken;
  } catch {
    localStorage.clear();
    window.location.href = '/login';
    return null;
  }
}

export function useSocket() {
  const { accessToken } = useAuthStore();
  const { addMessage, setTyping } = useInboxStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (!accessToken || initialized.current) return;
    initialized.current = true;

    socket = io(process.env.NEXT_PUBLIC_API_URL ?? '', {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on('connect', () => console.log('[WS] Connected'));
    socket.on('disconnect', async (reason) => {
      console.log('[WS] Disconnected:', reason);
      // If server kicked us (likely expired token), refresh and reconnect
      if (reason === 'io server disconnect' || reason === 'transport close') {
        const newToken = await refreshAccessToken();
        if (newToken && socket) {
          socket.auth = { token: newToken };
          socket.connect();
        }
      }
    });

    socket.on('message.new', ({ conversationId, message }: { conversationId: string; message: Parameters<typeof addMessage>[1] }) => {
      addMessage(conversationId, message);
      setTyping(conversationId, false);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('conversation.updated', ({ conversationId, changes }: { conversationId: string; changes: any }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedChanges = changes as any;
      // Update conversation in store
      useInboxStore.getState().upsertConversation({
        ...useInboxStore.getState().conversations.find((c) => c.id === conversationId)!,
        ...typedChanges,
      });
    });

    socket.on('ai.typing', ({ conversationId }: { conversationId: string }) => {
      setTyping(conversationId, true);
      // Auto-clear after 15s if no message comes
      setTimeout(() => setTyping(conversationId, false), 15000);
    });

    return () => {
      socket?.disconnect();
      socket = null;
      initialized.current = false;
    };
  }, [accessToken, addMessage, setTyping]);

  return socket;
}

export function getSocket() {
  return socket;
}
