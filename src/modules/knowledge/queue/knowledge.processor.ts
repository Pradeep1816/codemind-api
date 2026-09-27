import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import knowledgeConfig from '../../../config/knowledge.config';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildLifecycleService } from '../lifecycle/knowledge-build-lifecycle.service';
import {
  ClaimedKnowledgeBuild,
  KnowledgeBuildProgress,
  OwnedKnowledgeBuildLease,
} from '../lifecycle/knowledge-build-lifecycle.types';
import type {
  KnowledgeEdgeInput,
  KnowledgeNodeInput,
} from '../persistence/knowledge-persistence.types';
import {
  KnowledgeGraphBuilderError,
  KnowledgeGraphBuilderService,
} from '../services/knowledge-graph-builder.service';
import { KnowledgePersistenceService } from '../services/knowledge-persistence.service';

interface SafeKnowledgeFailure {
  code: string;
  message: string;
  retryable: boolean;
}

class KnowledgeCancellationRequestedError extends Error {
  constructor() {
    super('Knowledge build cancellation was requested');
    this.name = KnowledgeCancellationRequestedError.name;
  }
}

class KnowledgeWorkerStoppingError extends Error {
  constructor() {
    super('Knowledge worker is shutting down');
    this.name = KnowledgeWorkerStoppingError.name;
  }
}

class KnowledgeHeartbeatMonitor {
  private readonly controller = new AbortController();
  private readonly task: Promise<void>;
  private cancellationRequested = false;
  private failure: unknown;

  constructor(
    private readonly lifecycleService: KnowledgeBuildLifecycleService,
    private readonly ownership: OwnedKnowledgeBuildLease,
    private readonly intervalMs: number,
  ) {
    this.task = this.run();
  }

  async checkpoint(workerStopping: boolean): Promise<void> {
    if (workerStopping) {
      throw new KnowledgeWorkerStoppingError();
    }

    if (this.failure) {
      throw this.failure instanceof Error
        ? this.failure
        : new Error('Knowledge heartbeat failed');
    }

    const heartbeat = await this.lifecycleService.heartbeat(this.ownership);
    this.cancellationRequested ||= heartbeat.cancellationRequested;

    if (this.cancellationRequested) {
      throw new KnowledgeCancellationRequestedError();
    }
  }

  async stop(): Promise<void> {
    this.controller.abort();
    await this.task;
  }

  wasCancellationRequested(): boolean {
    return this.cancellationRequested;
  }

  private async run(): Promise<void> {
    while (!this.controller.signal.aborted) {
      await this.wait(this.intervalMs, this.controller.signal);

      if (this.controller.signal.aborted) {
        return;
      }

      try {
        const heartbeat = await this.lifecycleService.heartbeat(this.ownership);
        this.cancellationRequested ||= heartbeat.cancellationRequested;
      } catch (error: unknown) {
        this.failure = error;
        return;
      }
    }
  }

  private wait(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const onAbort = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, milliseconds);

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

@Injectable()
export class KnowledgeProcessor {
  constructor(
    @Inject(knowledgeConfig.KEY)
    private readonly configuration: ConfigType<typeof knowledgeConfig>,
    private readonly lifecycleService: KnowledgeBuildLifecycleService,
    private readonly graphBuilder: KnowledgeGraphBuilderService,
    private readonly persistenceService: KnowledgePersistenceService,
  ) {}

  /** Builds and atomically publishes one claimed knowledge snapshot. */
  async process(
    claimed: ClaimedKnowledgeBuild,
    isWorkerStopping: () => boolean,
  ): Promise<void> {
    const build = claimed.build;
    const ownership: OwnedKnowledgeBuildLease = {
      buildId: build.id,
      leaseToken: claimed.leaseToken,
    };
    const persistenceOwnership = {
      ...ownership,
      organizationId: build.organizationId,
      repositoryId: build.repositoryId,
    };
    const monitor = new KnowledgeHeartbeatMonitor(
      this.lifecycleService,
      ownership,
      this.configuration.jobHeartbeatIntervalMs,
    );
    const progress: KnowledgeBuildProgress = {
      processedFiles: 0,
      failedFiles: 0,
      emittedFacts: 0,
      persistedNodes: 0,
      persistedEdges: 0,
    };
    let phase = KnowledgeBuildPhase.Preparing;

    try {
      await monitor.checkpoint(isWorkerStopping());
      phase = KnowledgeBuildPhase.Analyzing;
      await this.lifecycleService.advancePhase({ ...ownership, phase });

      const graph = await this.graphBuilder.build({
        organizationId: build.organizationId,
        repositoryId: build.repositoryId,
        indexJobId: build.sourceIndexJobId,
      });
      progress.processedFiles = build.totalFiles;
      progress.emittedFacts = graph.nodes.length + graph.edges.length;
      await this.lifecycleService.updateProgress({
        ...ownership,
        progress,
        currentFile: null,
      });

      await this.recordDiagnostics(claimed, graph.diagnostics);
      await this.persistNodes(
        graph.nodes,
        persistenceOwnership,
        ownership,
        progress,
        monitor,
        isWorkerStopping,
      );
      await this.persistEdges(
        graph.edges,
        persistenceOwnership,
        ownership,
        progress,
        monitor,
        isWorkerStopping,
      );

      await monitor.checkpoint(isWorkerStopping());
      phase = KnowledgeBuildPhase.Validating;
      await this.lifecycleService.advancePhase({ ...ownership, phase });
      await monitor.checkpoint(isWorkerStopping());

      phase = KnowledgeBuildPhase.Publishing;
      await this.lifecycleService.advancePhase({ ...ownership, phase });
      await monitor.stop();
      await this.persistenceService.publishSnapshot(persistenceOwnership);
    } catch (error: unknown) {
      await monitor.stop();
      await this.handleFailure(error, monitor, ownership, claimed, phase);
    }
  }

  private async persistNodes(
    nodes: readonly KnowledgeNodeInput[],
    persistenceOwnership: {
      organizationId: string;
      repositoryId: number;
      buildId: number;
      leaseToken: string;
    },
    ownership: OwnedKnowledgeBuildLease,
    progress: KnowledgeBuildProgress,
    monitor: KnowledgeHeartbeatMonitor,
    isWorkerStopping: () => boolean,
  ): Promise<void> {
    for (const batch of this.batches(nodes)) {
      await monitor.checkpoint(isWorkerStopping());
      const result = await this.persistenceService.persistGraphBatch({
        ...persistenceOwnership,
        nodes: batch,
        edges: [],
      });
      progress.persistedNodes = result.persistedNodes;
      progress.persistedEdges = result.persistedEdges;
      await this.lifecycleService.updateProgress({
        ...ownership,
        progress,
        currentFile: null,
      });
    }
  }

  private async persistEdges(
    edges: readonly KnowledgeEdgeInput[],
    persistenceOwnership: {
      organizationId: string;
      repositoryId: number;
      buildId: number;
      leaseToken: string;
    },
    ownership: OwnedKnowledgeBuildLease,
    progress: KnowledgeBuildProgress,
    monitor: KnowledgeHeartbeatMonitor,
    isWorkerStopping: () => boolean,
  ): Promise<void> {
    for (const batch of this.batches(edges)) {
      await monitor.checkpoint(isWorkerStopping());
      const result = await this.persistenceService.persistGraphBatch({
        ...persistenceOwnership,
        nodes: [],
        edges: batch,
      });
      progress.persistedNodes = result.persistedNodes;
      progress.persistedEdges = result.persistedEdges;
      await this.lifecycleService.updateProgress({
        ...ownership,
        progress,
        currentFile: null,
      });
    }
  }

  private *batches<T>(values: readonly T[]): Generator<readonly T[]> {
    for (
      let offset = 0;
      offset < values.length;
      offset += this.configuration.persistenceBatchSize
    ) {
      yield values.slice(
        offset,
        offset + this.configuration.persistenceBatchSize,
      );
    }
  }

  private async recordDiagnostics(
    claimed: ClaimedKnowledgeBuild,
    diagnostics: readonly {
      analyzerName: string;
      analyzerVersion: string;
      code: string;
      message: string;
      retryable: boolean;
    }[],
  ): Promise<void> {
    for (const diagnostic of diagnostics) {
      await this.lifecycleService.recordError({
        buildId: claimed.build.id,
        leaseToken: claimed.leaseToken,
        phase: KnowledgeBuildPhase.Analyzing,
        analyzerName: diagnostic.analyzerName,
        analyzerVersion: diagnostic.analyzerVersion,
        code: diagnostic.code,
        message: diagnostic.message,
        retryable: diagnostic.retryable,
        attemptNumber: claimed.build.attemptCount,
      });
    }
  }

  private async handleFailure(
    error: unknown,
    monitor: KnowledgeHeartbeatMonitor,
    ownership: OwnedKnowledgeBuildLease,
    claimed: ClaimedKnowledgeBuild,
    phase: KnowledgeBuildPhase,
  ): Promise<void> {
    if (
      error instanceof KnowledgeCancellationRequestedError ||
      monitor.wasCancellationRequested() ||
      (await this.isCancellationPending(ownership))
    ) {
      await this.tryAcknowledgeCancellation(ownership);
      return;
    }

    const failure = this.toSafeFailure(error);

    try {
      await this.lifecycleService.recordError({
        ...ownership,
        phase,
        analyzerName: null,
        analyzerVersion: null,
        ...failure,
        attemptNumber: claimed.build.attemptCount,
      });
      await this.lifecycleService.fail({ ...ownership, ...failure });
    } catch (terminalError: unknown) {
      console.error(
        `knowledge build ${claimed.build.id} could not persist its failure transition`,
        terminalError,
      );
    }

    console.error(`knowledge build ${claimed.build.id} failed`, error);
  }

  private async isCancellationPending(
    ownership: OwnedKnowledgeBuildLease,
  ): Promise<boolean> {
    try {
      return (await this.lifecycleService.heartbeat(ownership))
        .cancellationRequested;
    } catch {
      return false;
    }
  }

  private async tryAcknowledgeCancellation(
    ownership: OwnedKnowledgeBuildLease,
  ): Promise<void> {
    try {
      await this.lifecycleService.acknowledgeCancellation(ownership);
    } catch {
      // Expired-lease recovery will finalize the pending cancellation.
    }
  }

  private toSafeFailure(error: unknown): SafeKnowledgeFailure {
    if (error instanceof KnowledgeWorkerStoppingError) {
      return {
        code: 'worker_shutdown',
        message: 'Knowledge worker stopped before the build completed',
        retryable: true,
      };
    }

    if (error instanceof QueryFailedError) {
      return {
        code: 'database_operation_failed',
        message: 'A database operation failed during knowledge generation',
        retryable: true,
      };
    }

    if (error instanceof KnowledgeGraphBuilderError) {
      return {
        code: error.code,
        message: error.message.slice(0, 1_000),
        retryable: false,
      };
    }

    if (error instanceof Error) {
      const code = this.readStableErrorCode(error);

      if (code) {
        return {
          code,
          message: error.message.slice(0, 1_000),
          retryable: false,
        };
      }
    }

    return {
      code: 'knowledge_pipeline_failed',
      message: 'The knowledge generation pipeline failed unexpectedly',
      retryable: false,
    };
  }

  private readStableErrorCode(error: Error): string | null {
    const code = (error as Error & { code?: unknown }).code;

    return typeof code === 'string' && /^[a-z][a-z0-9_]{0,99}$/u.test(code)
      ? code
      : null;
  }
}
