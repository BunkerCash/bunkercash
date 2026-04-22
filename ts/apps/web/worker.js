import openNextWorker, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";
import { runWithCloudflareRequestContext } from "./.open-next/cloudflare/init.js";
import { runDailyCollection } from "./lib/metrics-cron";

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

const SCHEDULED_REQUEST_URL = "https://scheduled.internal/__metrics_daily";

export default {
  fetch: openNextWorker.fetch.bind(openNextWorker),

  async scheduled(_controller, env, ctx) {
    const request = new Request(SCHEDULED_REQUEST_URL);

    await runWithCloudflareRequestContext(request, env, ctx, async () => {
      await runDailyCollection({ env });
      return new Response(null, { status: 204 });
    });
  },
};
