import { hostname } from 'node:os';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import { IndexingProcessor } from '../queue/indexing.processor';
import { IndexingQueue } from '../queue/indexing.queue';

@Injectable()
export class IndexingWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly shutdownController = new AbortController();
  private readonly workerId: string;
  private loopPromise: Promise<void> | null = null;
  private stopping = false;
  private nextRecoveryAt = 0;

  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly indexingQueue: IndexingQueue,
    private readonly indexingProcessor: IndexingProcessor,
  ) {
    const host = hostname()
      .replace(/[^A-Za-z0-9._:-]/gu, '_')
      .slice(0, 150);
    this.workerId = configuration.workerId ?? `${host}:${process.pid}`;
  }

  /** Starts polling after Nest has initialized every dependency. */
  onApplicationBootstrap(): void {
    if (!this.configuration.workerEnabled) {
      console.log('indexing worker is disabled');
      return;
    }

    console.log(`indexing worker ${this.workerId} started`);
    this.loopPromise = this.run();
  }

  /** Stops new claims and lets the active processor requeue at a checkpoint. */
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.shutdownController.abort();

    if (this.loopPromise) {
      await this.loopPromise;
    }

    if (this.configuration.workerEnabled) {
      console.log(`indexing worker ${this.workerId} stopped`);
    }
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.recoverExpiredWhenDue();
        const claimed = await this.indexingQueue.take(this.workerId);

        if (!claimed) {
          await this.waitForNextPoll();
          continue;
        }

        console.log(
          `indexing worker ${this.workerId} claimed job ${claimed.job.id}`,
        );
        await this.indexingProcessor.process(claimed, () => this.stopping);
      } catch (error: unknown) {
        console.error(`indexing worker ${this.workerId} loop failed`, error);
        await this.waitForNextPoll();
      }
    }
  }

  private async recoverExpiredWhenDue(): Promise<void> {
    const now = Date.now();

    if (now < this.nextRecoveryAt) {
      return;
    }

    const recovered = await this.indexingQueue.recoverExpired();
    this.nextRecoveryAt = now + this.configuration.workerRecoveryIntervalMs;

    if (recovered.length > 0) {
      console.log(
        `indexing worker ${this.workerId} recovered ${recovered.length} expired job lease(s)`,
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
