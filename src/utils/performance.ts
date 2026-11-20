export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: any = null;
  return function (this: any, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

export function debounceWithImmediate<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timer: any = null;
  return function (this: any, ...args: Parameters<T>) {
    const callNow = immediate && !timer;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!immediate) fn.apply(this, args);
    }, delay);
    if (callNow) fn.apply(this, args);
  };
}

export function useRAFThrottle<T extends (...args: any[]) => any>(
  fn: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let lastArgs: any[] | null = null;
  return function (this: any, ...args: Parameters<T>) {
    lastArgs = args;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      fn.apply(this, lastArgs as any);
      rafId = null;
      lastArgs = null;
    });
  };
}

export const performance = {
  now: (): number => {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    return Date.now();
  },

  measure: <T>(label: string, fn: () => T): T => {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`[perf] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
  },

  measureAsync: async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    console.log(`[perf] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
  },
};

export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, { value: ReturnType<T>; expiresAt: number }>();
  const TTL = 5 * 60 * 1000;

  const memoized = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const result = fn.apply(this, args);
    cache.set(key, { value: result, expiresAt: Date.now() + TTL });
    if (cache.size > 500) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    return result;
  };

  return memoized as T;
}
