import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/server/env";

const globalQueue = globalThis as unknown as {
  redis?: IORedis;
  generationQueue?: Queue;
};

export const redis =
  globalQueue.redis ??
  new IORedis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
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
