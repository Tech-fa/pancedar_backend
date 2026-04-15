// ../cache/cache.service.ts
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';

@Injectable()
export class CacheService {
  constructor(@InjectRedis() private readonly redisService: Redis) {}

  async getData(key: string): Promise<string> {
    return await this.redisService.get(key);
  }

  async setData(key: string, value: any, ttl = 3600) {
    await this.redisService.setex(key, ttl, value);
  }


  async evictData(key: string) {
    await this.redisService.del(key);
  }
}
