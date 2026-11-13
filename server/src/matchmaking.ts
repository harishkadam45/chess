import { Redis } from "ioredis";
import { env } from "./env";

/**
 * Matchmaking queue per time-control preset. Uses Redis when REDIS_URL is set
 * (so several server instances share one queue), otherwise an in-memory map.
 * `enqueue` resolves to an opponent id if one was waiting, else null (you're queued).
 */
export interface Queue {
  enqueue(preset: string, userId: string): Promise<string | null>;
  remove(preset: string, userId: string): Promise<void>;
}

class MemoryQueue implements Queue {
  private q = new Map<string, string[]>();

  async enqueue(preset: string, userId: string) {
    const list = this.q.get(preset) ?? [];
    const idx = list.findIndex((id) => id !== userId);
    if (idx >= 0) {
      const [opp] = list.splice(idx, 1);
      this.q.set(preset, list);
      return opp;
    }
    if (!list.includes(userId)) list.push(userId);
    this.q.set(preset, list);
    return null;
  }

  async remove(preset: string, userId: string) {
    this.q.set(preset, (this.q.get(preset) ?? []).filter((id) => id !== userId));
  }
}

class RedisQueue implements Queue {
  private r = new Redis(env.redisUrl);
  private key = (p: string) => `mm:${p}`;

  async enqueue(preset: string, userId: string) {
    // Atomic: drop stale copies of us, pop an opponent, or queue us.
    const script = `
      local k = KEYS[1]
      redis.call('LREM', k, 0, ARGV[1])
      local opp = redis.call('LPOP', k)
      if opp then return opp end
      redis.call('RPUSH', k, ARGV[1])
      redis.call('EXPIRE', k, 600)
      return false`;
    const opp = (await this.r.eval(script, 1, this.key(preset), userId)) as string | null;
    return opp || null;
  }

  async remove(preset: string, userId: string) {
    await this.r.lrem(this.key(preset), 0, userId);
  }
}

export const queue: Queue = env.redisUrl ? new RedisQueue() : new MemoryQueue();
