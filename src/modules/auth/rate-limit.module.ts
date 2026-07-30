import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import rateLimitConfig from '../../config/rate-limit.config';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule.forFeature(rateLimitConfig)],
      inject: [rateLimitConfig.KEY],
      useFactory: (configuration: ConfigType<typeof rateLimitConfig>) => [
        {
          ttl: configuration.ttlMs,
          limit: configuration.defaultLimit,
        },
      ],
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class RateLimitModule {}
