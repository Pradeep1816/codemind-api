import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import knowledgeConfig from '../../../config/knowledge.config';
import { KnowledgeBuildErrorEntity } from '../entities/knowledge-build-error.entity';
import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildLifecycleRepository } from './knowledge-build-lifecycle.repository';
import {
  AdvanceKnowledgeBuildPhaseInput,
  ClaimedKnowledgeBuild,
  FailKnowledgeBuildInput,
  KnowledgeBuildHeartbeatResult,
  OwnedKnowledgeBuildLease,
  RecordKnowledgeBuildErrorInput,
  UpdateKnowledgeBuildProgressInput,
} from './knowledge-build-lifecycle.types';

const PHASE_ORDER: readonly KnowledgeBuildPhase[] = [
  KnowledgeBuildPhase.Preparing,
  KnowledgeBuildPhase.Analyzing,
  KnowledgeBuildPhase.Validating,
  KnowledgeBuildPhase.Publishing,
];

@Injectable()
export class KnowledgeBuildLifecycleService {
  constructor(
    @Inject(knowledgeConfig.KEY)
    private readonly configuration: ConfigType<typeof knowledgeConfig>,
    private readonly repository: KnowledgeBuildLifecycleRepository,
  ) {}

  claimNext(workerId: string): Promise<ClaimedKnowledgeBuild | null> {
    if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(workerId)) {
      throw new ConflictException('Knowledge worker identity is invalid');
    }

    return this.repository.claimNext(workerId, this.configuration.jobLeaseMs);
  }

  async heartbeat(
    input: OwnedKnowledgeBuildLease,
  ): Promise<KnowledgeBuildHeartbeatResult> {
    return this.requireOwnership(
      await this.repository.heartbeat(input, this.configuration.jobLeaseMs),
    );
  }

  async advancePhase(
    input: AdvanceKnowledgeBuildPhaseInput,
  ): Promise<KnowledgeBuildEntity> {
    if (!PHASE_ORDER.includes(input.phase)) {
      throw new ConflictException(
        'Knowledge build phase cannot be set directly',
      );
    }

    const heartbeat = await this.heartbeat(input);
    const currentIndex = PHASE_ORDER.indexOf(heartbeat.build.phase);
    const requestedIndex = PHASE_ORDER.indexOf(input.phase);

    if (requestedIndex < currentIndex || requestedIndex > currentIndex + 1) {
      throw new ConflictException('Invalid knowledge build phase transition');
    }

    return this.requireOwnership(
      await this.repository.advancePhase(
        input,
        input.phase,
        this.configuration.jobLeaseMs,
      ),
    );
  }

  async updateProgress(
    input: UpdateKnowledgeBuildProgressInput,
  ): Promise<KnowledgeBuildEntity> {
    const values = Object.values(input.progress);

    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new ConflictException('Knowledge build progress is invalid');
    }

    if (
      input.currentFile !== null &&
      (input.currentFile.length < 1 ||
        input.currentFile.length > 1_024 ||
        input.currentFile.includes('\0'))
    ) {
      throw new ConflictException('Current analysis file is invalid');
    }

    const heartbeat = await this.heartbeat(input);
    const previous = heartbeat.build;

    if (
      input.progress.processedFiles + input.progress.failedFiles >
        previous.totalFiles ||
      input.progress.processedFiles < previous.processedFiles ||
      input.progress.failedFiles < previous.failedFiles ||
      input.progress.emittedFacts < previous.emittedFacts ||
      input.progress.persistedNodes < previous.persistedNodes ||
      input.progress.persistedEdges < previous.persistedEdges
    ) {
      throw new ConflictException(
        'Knowledge build progress cannot move backwards',
      );
    }

    return this.requireOwnership(
      await this.repository.updateProgress(
        input,
        input.progress,
        input.currentFile,
        this.configuration.jobLeaseMs,
      ),
    );
  }

  async fail(input: FailKnowledgeBuildInput): Promise<KnowledgeBuildEntity> {
    if (
      !/^[a-z][a-z0-9_]{0,99}$/u.test(input.code) ||
      input.message.trim().length < 1 ||
      input.message.length > 1_000 ||
      input.message.includes('\0')
    ) {
      throw new ConflictException('Knowledge failure metadata is invalid');
    }

    return this.requireOwnership(
      await this.repository.fail(
        input,
        input.code,
        input.message,
        input.retryable,
        this.configuration.jobRetryDelayMs,
      ),
    );
  }

  recordError(
    input: RecordKnowledgeBuildErrorInput,
  ): Promise<KnowledgeBuildErrorEntity | null> {
    if (
      !/^[a-z][a-z0-9_]{0,99}$/u.test(input.code) ||
      input.message.trim().length < 1 ||
      input.message.length > 1_000 ||
      input.message.includes('\0') ||
      !Number.isSafeInteger(input.attemptNumber) ||
      input.attemptNumber < 1 ||
      !this.isNullableBoundedText(input.analyzerName, 100) ||
      !this.isNullableBoundedText(input.analyzerVersion, 100)
    ) {
      throw new ConflictException('Knowledge build error metadata is invalid');
    }

    return this.repository.recordError(input);
  }

  async acknowledgeCancellation(
    input: OwnedKnowledgeBuildLease,
  ): Promise<KnowledgeBuildEntity> {
    return this.requireOwnership(
      await this.repository.acknowledgeCancellation(input),
    );
  }

  recoverExpiredLeases(): Promise<KnowledgeBuildEntity[]> {
    return this.repository.recoverExpiredLeases(
      this.configuration.jobRecoveryBatchSize,
      this.configuration.jobRetryDelayMs,
    );
  }

  requestCancellation(
    organizationId: string,
    repositoryId: number,
    buildId: number,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.repository.requestCancellation(
      organizationId,
      repositoryId,
      buildId,
    );
  }

  private requireOwnership<T>(result: T | null): T {
    if (!result) {
      throw new ConflictException(
        'Knowledge build lease is expired, cancelled, or no longer owned',
      );
    }

    return result;
  }

  private isNullableBoundedText(value: string | null, max: number): boolean {
    return (
      value === null ||
      (value.trim().length > 0 &&
        value.length <= max &&
        !/[\0\r\n]/u.test(value))
    );
  }
}
