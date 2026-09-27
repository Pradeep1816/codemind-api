import { hostname } from 'node:os';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import knowledgeConfig from '../../../config/knowledge.config';
import { KnowledgeProcessor } from '../queue/knowledge.processor';
import { KnowledgeQueue } from '../queue/knowledge.queue';

@Injectable()
export class KnowledgeWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly shutdownController = new AbortController();
  private readonly workerId: string;
  private loopPromise: Promise<void> | null = null;
  private stopping = false;
  private nextRecoveryAt = 0;

  constructor(
    @Inject(knowledgeConfig.KEY)
    private readonly configuration: ConfigType<typeof knowledgeConfig>,
    private readonly queue: KnowledgeQueue,
    private readonly processor: KnowledgeProcessor,
  ) {
    const host = hostname()
      .replace(/[^A-Za-z0-9._:-]/gu, '_')
      .slice(0, 150);
    this.workerId = configuration.workerId ?? `${host}:${process.pid}`;
  }

  onApplicationBootstrap(): void {
    if (!this.configuration.workerEnabled) {
      console.log('knowledge worker is disabled');
      return;
    }

    console.log(`knowledge worker ${this.workerId} started`);
    this.loopPromise = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.shutdownController.abort();

    if (this.loopPromise) {
      await this.loopPromise;
    }

    if (this.configuration.workerEnabled) {
      console.log(`knowledge worker ${this.workerId} stopped`);
    }
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.recoverExpiredWhenDue();
        const claimed = await this.queue.take(this.workerId);

        if (!claimed) {
          await this.waitForNextPoll();
          continue;
        }

        console.log(
          `knowledge worker ${this.workerId} claimed build ${claimed.build.id}`,
        );
        await this.processor.process(claimed, () => this.stopping);
      } catch (error: unknown) {
        console.error(`knowledge worker ${this.workerId} loop failed`, error);
        await this.waitForNextPoll();
      }
    }
  }

  private async recoverExpiredWhenDue(): Promise<void> {
    const now = Date.now();

    if (now < this.nextRecoveryAt) {
      return;
    }

    const recovered = await this.queue.recoverExpired();
    this.nextRecoveryAt = now + this.configuration.workerRecoveryIntervalMs;

    if (recovered.length > 0) {
      console.log(
        `knowledge worker ${this.workerId} recovered ${recovered.length} expired build lease(s)`,
      );
    }
  }

  private waitForNextPoll(): Promise<void> {
    if (this.stopping) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const onShutdown = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.shutdownController.signal.removeEventListener('abort', onShutdown);
        resolve();
      }, this.configuration.workerPollIntervalMs);

      this.shutdownController.signal.addEventListener('abort', onShutdown, {
        once: true,
      });
    });
  }
}
