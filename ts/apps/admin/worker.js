import openNextWorker from "./.open-next/worker.js";
import { AdminAuthNonceDurableObject } from "./lib/admin-auth-nonce-durable-object";

export { AdminAuthNonceDurableObject };

export default {
  fetch: openNextWorker.fetch.bind(openNextWorker),
};
