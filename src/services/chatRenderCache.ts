import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';

const DEFAULT_TTL = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 500;
const PRE_RENDER_COUNT = 20;

interface CacheEntry {
  value: any;
  expiresAt: number;
  pinned: boolean;
}

class ChatRenderCache {
  private cache: Map<string, CacheEntry> = new Map();
  private pinnedKeys: Set<string> = new Set();

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (!entry.pinned && entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      this.pinnedKeys.delete(key);
      return null;
    }
    if (entry.pinned) {
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return entry.value;
  }

  set(key: string, value: any, ttl: number = DEFAULT_TTL): void {
    const isPinned = this.pinnedKeys.has(key);
    const expiresAt = isPinned ? Number.MAX_SAFE_INTEGER : Date.now() + ttl;
    this.cache.set(key, { value, expiresAt, pinned: isPinned });
    this.evict();
  }

  pin(key: string): void {
    this.pinnedKeys.add(key);
    const entry = this.cache.get(key);
    if (entry) {
      entry.pinned = true;
      entry.expiresAt = Number.MAX_SAFE_INTEGER;
    }
  }

  unpin(key: string): void {
    this.pinnedKeys.delete(key);
    const entry = this.cache.get(key);
    if (entry) {
      entry.pinned = false;
      entry.expiresAt = Date.now() + DEFAULT_TTL;
    }
  }

  isPinned(key: string): boolean {
    return this.pinnedKeys.has(key);
  }

  invalidateChat(chatId: string): void {
    const prefix = `${chatId}_`;
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        if (!this.pinnedKeys.has(key)) {
          keysToDelete.push(key);
        }
      }
    }
    keysToDelete.forEach((k) => this.cache.delete(k));
  }

  clearAll(): void {
    this.cache.clear();
    this.pinnedKeys.clear();
  }

  clearAllNonPinned(): void {
    for (const [key, entry] of this.cache) {
      if (!entry.pinned) {
        this.cache.delete(key);
      }
    }
  }

  private evict(): void {
    if (this.cache.size <= MAX_CACHE_SIZE) return;
    const nonPinnedKeys: string[] = [];
    const expiredKeys: string[] = [];
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.pinned) continue;
      if (entry.expiresAt <= now) {
        expiredKeys.push(key);
      } else {
        nonPinnedKeys.push(key);
      }
    }

    expiredKeys.forEach((k) => this.cache.delete(k));

    while (this.cache.size > MAX_CACHE_SIZE && nonPinnedKeys.length > 0) {
      const oldest = nonPinnedKeys.shift();
      if (oldest) this.cache.delete(oldest);
    }
  }

  cleanupExpired(): void {
    const now = Date.now();
    const expired: string[] = [];
    for (const [key, entry] of this.cache) {
      if (!entry.pinned && entry.expiresAt <= now) {
        expired.push(key);
      }
    }
    expired.forEach((k) => this.cache.delete(k));
  }

  get size(): number {
    return this.cache.size;
  }

  preRenderMessages(chatId: string, messages: ChatMessage[]): void {
    const lastMessages = messages.slice(-PRE_RENDER_COUNT);
    for (const msg of lastMessages) {
      const key = `${chatId}_${msg.id}`;
      const entry = this.cache.get(key);
      if (!entry || (!entry.pinned && entry.expiresAt <= Date.now())) {
        const value = {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          hasThinking: !!(msg.content && msg.content.includes('thinking')),
          isError: msg.isError === true,
          imagesCount: msg.images?.length || 0,
          inlineFilesCount: msg.inlineFiles?.length || 0,
        };
        this.set(key, value);
      }
    }
  }
}

const cacheInstance = new ChatRenderCache();

export function useRenderCache() {
  const [cacheSize, setCacheSize] = useState(0);
  const chatIdRef = useRef<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      cacheInstance.cleanupExpired();
      setCacheSize(cacheInstance.size);
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const preRenderChat = useCallback((chatId: string, messages: ChatMessage[]) => {
    if (chatIdRef.current !== chatId) {
      cacheInstance.invalidateChat(chatIdRef.current!);
      chatIdRef.current = chatId;
    }
    cacheInstance.preRenderMessages(chatId, messages);
    setCacheSize(cacheInstance.size);
  }, []);

  const getCached = useCallback((chatId: string, messageId: string) => {
    return cacheInstance.get(`${chatId}_${messageId}`);
  }, []);

  const setCached = useCallback((chatId: string, messageId: string, value: any, ttl?: number) => {
    cacheInstance.set(`${chatId}_${messageId}`, value, ttl);
    setCacheSize(cacheInstance.size);
  }, []);

  const pinMessage = useCallback((chatId: string, messageId: string) => {
    cacheInstance.pin(`${chatId}_${messageId}`);
  }, []);

  const unpinMessage = useCallback((chatId: string, messageId: string) => {
    cacheInstance.unpin(`${chatId}_${messageId}`);
  }, []);

  const invalidateChat = useCallback((chatId: string) => {
    cacheInstance.invalidateChat(chatId);
    setCacheSize(cacheInstance.size);
  }, []);

  const clearAll = useCallback(() => {
    cacheInstance.clearAll();
    setCacheSize(0);
  }, []);

  return {
    preRenderChat,
    getCached,
    setCached,
    pinMessage,
    unpinMessage,
    invalidateChat,
    clearAll,
    cacheSize,
  };
}

export const renderCache = cacheInstance;