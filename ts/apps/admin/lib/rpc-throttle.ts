interface QueueItem {
  info: any;
  init: any;
  doFetch: (info: any, init: any) => void;
}

const REQUEST_INTERVAL_MS = 400;

let queue: QueueItem[] = [];
let draining = false;
let lastRequestTime = 0;

async function drain() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS - elapsed));
    }

    const item = queue.shift()!;
    lastRequestTime = Date.now();
    item.doFetch(item.info, item.init);
  }

  draining = false;
}

export function createRateLimitedFetch() {
  return (info: any, init: any, doFetch: (info: any, init: any) => void) => {
    queue.push({ info, init, doFetch });
    drain();
  };
}
