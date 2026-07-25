import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/server/env";

const globalQueue = globalThis as unknown as {
  redis?: IORedis;
  generationQueue?: Queue;
};

// maxRetriesPerRequest/retryStrategy stay bounded here (unlike the worker's
// connection in worker.ts, which needs `maxRetriesPerRequest: null` for
// blocking reads) so a flaky Redis link fails an API request quickly instead
// of hanging it indefinitely.
export const redis =
  globalQueue.redis ??
  new IORedis(env().REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    connectTimeout: 5_000,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2_000))
  });

export const generationQueue =
  globalQueue.generationQueue ??
  new Queue("forge-generation", {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 200
    }
  });

if (process.env.NODE_ENV !== "production") {
  globalQueue.redis = redis;
  globalQueue.generationQueue = generationQueue;
}
