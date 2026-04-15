// ../app.module.ts
import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisModule } from '@nestjs-modules/ioredis';

@Module({
  imports: [
    RedisModule.forRoot({
      url: process.env.REDIS_URI || 'localhost:6379',
      type: 'single',
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CachingModule {}
