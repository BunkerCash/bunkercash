import openNextWorker, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";
import { AdminSignatureReplay } from "./durable-objects/admin-signature-replay";

export {
  AdminSignatureReplay,
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
};

export default {
  fetch: openNextWorker.fetch.bind(openNextWorker),
};
