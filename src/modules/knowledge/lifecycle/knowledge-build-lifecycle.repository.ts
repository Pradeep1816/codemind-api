import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, MoreThan } from 'typeorm';
import { KnowledgeBuildErrorEntity } from '../entities/knowledge-build-error.entity';
import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import {
  ClaimedKnowledgeBuild,
  FindKnowledgeBuildsOptions,
  KnowledgeBuildHeartbeatResult,
  KnowledgeBuildProgress,
  OwnedKnowledgeBuildLease,
  RecordKnowledgeBuildErrorInput,
} from './knowledge-build-lifecycle.types';

@Injectable()
export class KnowledgeBuildLifecycleRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Claims the oldest eligible build without waiting on another worker. */
  claimNext(
    workerId: string,
    leaseMs: number,
  ): Promise<ClaimedKnowledgeBuild | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(KnowledgeBuildEntity);
      const now = new Date();
      const build = await repository
        .createQueryBuilder('build')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('build.status = :status', {
          status: KnowledgeBuildStatus.Queued,
        })
        .andWhere('build.cancellationRequestedAt IS NULL')
        .andWhere('build.attemptCount < build.maxAttempts')
        .andWhere(
          '(build.nextAttemptAt IS NULL OR build.nextAttemptAt <= :now)',
          { now },
        )
        .orderBy('build.createdAt', 'ASC')
        .addOrderBy('build.id', 'ASC')
        .getOne();

      if (!build) {
        return null;
      }

      const leaseToken = randomUUID();
      build.status = KnowledgeBuildStatus.Running;
      build.phase = KnowledgeBuildPhase.Preparing;
      build.claimedBy = workerId;
      build.leaseToken = leaseToken;
      build.lastHeartbeatAt = now;
      build.leaseExpiresAt = new Date(now.getTime() + leaseMs);
      build.nextAttemptAt = null;
      build.attemptCount += 1;
      build.startedAt ??= now;
      build.completedAt = null;
      build.failureCode = null;
      build.failureMessage = null;
      build.currentFile = null;

      return {
        build: await repository.save(build),
        leaseToken,
      };
    });
  }

  heartbeat(
    input: OwnedKnowledgeBuildLease,
    leaseMs: number,
  ): Promise<KnowledgeBuildHeartbeatResult | null> {
    return this.dataSource.transaction(async (manager) => {
      const build = await this.findOwnedRunningBuild(manager, input);

      if (!build) {
        return null;
      }

      const now = new Date();
      build.lastHeartbeatAt = now;
      build.leaseExpiresAt = new Date(now.getTime() + leaseMs);

      return {
        build: await manager.getRepository(KnowledgeBuildEntity).save(build),
        cancellationRequested: build.cancellationRequestedAt !== null,
      };
    });
  }

  advancePhase(
    input: OwnedKnowledgeBuildLease,
    phase: KnowledgeBuildPhase,
    leaseMs: number,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.updateOwnedBuild(input, leaseMs, (build) => {
      build.phase = phase;
    });
  }

  updateProgress(
    input: OwnedKnowledgeBuildLease,
    progress: KnowledgeBuildProgress,
    currentFile: string | null,
    leaseMs: number,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.updateOwnedBuild(input, leaseMs, (build) => {
      build.processedFiles = progress.processedFiles;
      build.failedFiles = progress.failedFiles;
      build.emittedFacts = progress.emittedFacts;
      build.persistedNodes = progress.persistedNodes;
      build.persistedEdges = progress.persistedEdges;
      build.currentFile = currentFile;
    });
  }

  fail(
    input: OwnedKnowledgeBuildLease,
    code: string,
    message: string,
    retryable: boolean,
    retryDelayMs: number,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const build = await this.findOwnedRunningBuild(manager, input);

      if (!build) {
        return null;
      }

      const now = new Date();
      build.failureCode = code;
      build.failureMessage = message;
      this.clearLease(build);

      if (build.cancellationRequestedAt !== null) {
        build.status = KnowledgeBuildStatus.Cancelled;
        build.phase = KnowledgeBuildPhase.Finished;
        build.completedAt = now;
      } else if (retryable && build.attemptCount < build.maxAttempts) {
        this.resetForRetry(build, new Date(now.getTime() + retryDelayMs));
      } else {
        build.status = KnowledgeBuildStatus.Failed;
        build.phase = KnowledgeBuildPhase.Finished;
        build.completedAt = now;
      }

      return manager.getRepository(KnowledgeBuildEntity).save(build);
    });
  }

  acknowledgeCancellation(
    input: OwnedKnowledgeBuildLease,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const build = await this.findOwnedRunningBuild(manager, input);

      if (!build || build.cancellationRequestedAt === null) {
        return null;
      }

      build.status = KnowledgeBuildStatus.Cancelled;
      build.phase = KnowledgeBuildPhase.Finished;
      build.completedAt = new Date();
      this.clearLease(build);

      return manager.getRepository(KnowledgeBuildEntity).save(build);
    });
  }

  requestCancellation(
    organizationId: string,
    repositoryId: number,
    buildId: number,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(KnowledgeBuildEntity);
      const build = await repository.findOne({
        where: { id: buildId, organizationId, repositoryId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!build) {
        return null;
      }

      if (build.status === KnowledgeBuildStatus.Queued) {
        build.cancellationRequestedAt = new Date();
        build.status = KnowledgeBuildStatus.Cancelled;
        build.phase = KnowledgeBuildPhase.Finished;
        build.completedAt = build.cancellationRequestedAt;
        this.clearLease(build);
        return repository.save(build);
      }

      if (build.status === KnowledgeBuildStatus.Running) {
        build.cancellationRequestedAt ??= new Date();
        return repository.save(build);
      }

      return build;
    });
  }

  recoverExpiredLeases(
    batchSize: number,
    retryDelayMs: number,
  ): Promise<KnowledgeBuildEntity[]> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(KnowledgeBuildEntity);
      const now = new Date();
      const builds = await repository
        .createQueryBuilder('build')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('build.status = :status', {
          status: KnowledgeBuildStatus.Running,
        })
        .andWhere('build.leaseExpiresAt <= :now', { now })
        .orderBy('build.leaseExpiresAt', 'ASC')
        .addOrderBy('build.id', 'ASC')
        .take(batchSize)
        .getMany();

      for (const build of builds) {
        this.clearLease(build);

        if (build.cancellationRequestedAt !== null) {
          build.status = KnowledgeBuildStatus.Cancelled;
          build.phase = KnowledgeBuildPhase.Finished;
          build.completedAt = now;
        } else if (build.attemptCount < build.maxAttempts) {
          build.failureCode = 'lease_expired';
          build.failureMessage = 'Knowledge worker lease expired';
          this.resetForRetry(build, new Date(now.getTime() + retryDelayMs));
        } else {
          build.status = KnowledgeBuildStatus.Failed;
          build.phase = KnowledgeBuildPhase.Finished;
          build.failureCode = 'lease_expired';
          build.failureMessage =
            'Knowledge worker lease expired and no attempts remain';
          build.completedAt = now;
        }
      }

      return builds.length === 0 ? [] : repository.save(builds);
    });
  }

  recordError(
    input: RecordKnowledgeBuildErrorInput,
  ): Promise<KnowledgeBuildErrorEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const build = await this.findOwnedRunningBuild(manager, input);

      if (!build) {
        return null;
      }

      return manager.getRepository(KnowledgeBuildErrorEntity).save({
        organizationId: build.organizationId,
        repositoryId: build.repositoryId,
        knowledgeBuildId: build.id,
        knowledgeEvidenceId: null,
        phase: input.phase,
        analyzerName: input.analyzerName,
        analyzerVersion: input.analyzerVersion,
        code: input.code,
        message: input.message,
        retryable: input.retryable,
        attemptNumber: input.attemptNumber,
      });
    });
  }

  findMany(
    options: FindKnowledgeBuildsOptions,
  ): Promise<[KnowledgeBuildEntity[], number]> {
    const query = this.dataSource
      .getRepository(KnowledgeBuildEntity)
      .createQueryBuilder('build')
      .where('build.organizationId = :organizationId', {
        organizationId: options.organizationId,
      })
      .andWhere('build.repositoryId = :repositoryId', {
        repositoryId: options.repositoryId,
      });

    if (options.status !== undefined) {
      query.andWhere('build.status = :status', { status: options.status });
    }

    return query
      .orderBy('build.createdAt', 'DESC')
      .addOrderBy('build.id', 'DESC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();
  }

  findById(
    organizationId: string,
    repositoryId: number,
    buildId: number,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.dataSource.getRepository(KnowledgeBuildEntity).findOne({
      where: { id: buildId, organizationId, repositoryId },
    });
  }

  requeueTerminal(
    organizationId: string,
    repositoryId: number,
    buildId: number,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(KnowledgeBuildEntity);
      const build = await repository.findOne({
        where: {
          id: buildId,
          organizationId,
          repositoryId,
          status: In([
            KnowledgeBuildStatus.Failed,
            KnowledgeBuildStatus.Cancelled,
          ]),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!build) {
        return null;
      }

      const active = await repository.findOne({
        where: {
          repositoryId,
          branchId: build.branchId,
          status: In([
            KnowledgeBuildStatus.Queued,
            KnowledgeBuildStatus.Running,
          ]),
        },
      });

      if (active) {
        return null;
      }

      build.status = KnowledgeBuildStatus.Queued;
      build.phase = KnowledgeBuildPhase.Queued;
      build.processedFiles = 0;
      build.failedFiles = 0;
      build.emittedFacts = 0;
      build.persistedNodes = 0;
      build.persistedEdges = 0;
      build.attemptCount = 0;
      build.failureCode = null;
      build.failureMessage = null;
      build.startedAt = null;
      build.completedAt = null;
      build.nextAttemptAt = null;
      build.cancellationRequestedAt = null;
      this.clearLease(build);

      return repository.save(build);
    });
  }

  private updateOwnedBuild(
    input: OwnedKnowledgeBuildLease,
    leaseMs: number,
    update: (build: KnowledgeBuildEntity) => void,
  ): Promise<KnowledgeBuildEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const build = await this.findOwnedRunningBuild(manager, input);

      if (!build || build.cancellationRequestedAt !== null) {
        return null;
      }

      const now = new Date();
      update(build);
      build.lastHeartbeatAt = now;
      build.leaseExpiresAt = new Date(now.getTime() + leaseMs);

      return manager.getRepository(KnowledgeBuildEntity).save(build);
    });
  }

  private findOwnedRunningBuild(
    manager: EntityManager,
    input: OwnedKnowledgeBuildLease,
  ): Promise<KnowledgeBuildEntity | null> {
    return manager.getRepository(KnowledgeBuildEntity).findOne({
      where: {
        id: input.buildId,
        status: KnowledgeBuildStatus.Running,
        leaseToken: input.leaseToken,
        leaseExpiresAt: MoreThan(new Date()),
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private resetForRetry(
    build: KnowledgeBuildEntity,
    nextAttemptAt: Date,
  ): void {
    build.status = KnowledgeBuildStatus.Queued;
    build.phase = KnowledgeBuildPhase.Queued;
    build.processedFiles = 0;
    build.failedFiles = 0;
    build.emittedFacts = 0;
    build.persistedNodes = 0;
    build.persistedEdges = 0;
    build.completedAt = null;
    build.nextAttemptAt = nextAttemptAt;
    build.currentFile = null;
  }

  private clearLease(build: KnowledgeBuildEntity): void {
    build.claimedBy = null;
    build.leaseToken = null;
    build.lastHeartbeatAt = null;
    build.leaseExpiresAt = null;
    build.currentFile = null;
  }
}
