import openNextWorker from "./.open-next/worker.js";
import { AdminAuthNonceDurableObject } from "./lib/admin-auth-nonce-durable-object";

export { AdminAuthNonceDurableObject };

const worker = {
  fetch: openNextWorker.fetch.bind(openNextWorker),
};

export default worker;
