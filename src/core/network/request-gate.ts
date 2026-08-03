let activeRequests = 0;
const requestQueue: Array<() => void> = [];

export function acquireRequestSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(new DOMException("請求已取消。", "AbortError"));
  return new Promise((resolve, reject) => {
    let started = false;
    const start = () => {
      started = true;
      signal?.removeEventListener("abort", cancel);
      activeRequests += 1;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        activeRequests -= 1;
        requestQueue.shift()?.();
      });
    };
    const cancel = () => {
      if (started) return;
      const index = requestQueue.indexOf(start);
      if (index >= 0) requestQueue.splice(index, 1);
      reject(new DOMException("請求已取消。", "AbortError"));
    };
    if (activeRequests === 0) start();
    else {
      requestQueue.push(start);
      signal?.addEventListener("abort", cancel, { once: true });
    }
  });
}

export async function gatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const release = await acquireRequestSlot(init?.signal ?? undefined);
  try {
    return await fetch(input, init);
  } finally {
    release();
  }
}
