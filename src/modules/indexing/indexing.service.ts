import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import indexingConfig from '../../config/indexing.config';
import { RepositoryBranchesService } from '../repositories/repository-branches.service';
import { RepositoriesService } from '../repositories/repositories.service';
import { BranchStatus } from '../repositories/entities/repository-branch.entity';
import { RepositoryStatus } from '../repositories/entities/repository.entity';
import {
  IndexJobListResponseDto,
  IndexStatusDto,
} from './dto/index-status.dto';
import { ListIndexJobsQueryDto } from './dto/list-index-jobs-query.dto';
import { StartIndexDto } from './dto/start-index.dto';
import { IndexJobEntity } from './entities/index-job.entity';
import { IndexJobTrigger } from './enums/index-job-trigger.enum';
import { IndexJobStatus } from './enums/index-job-status.enum';
import { IndexingMode } from './enums/indexing-mode.enum';
import { IndexingRepository } from './indexing.repository';
import { IndexJobLifecycleService } from './lifecycle/index-job-lifecycle.service';

interface PostgresDriverError extends Error {
  code?: string;
  constraint?: string;
}

@Injectable()
export class IndexingService {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly repositoriesService: RepositoriesService,
    private readonly repositoryBranchesService: RepositoryBranchesService,
    private readonly indexingRepository: IndexingRepository,
    private readonly lifecycleService: IndexJobLifecycleService,
  ) {}

  /**
   * Creates one durable queued job for a synchronized active branch. The
   * branch commit SHA is copied into the job so later Git updates cannot change
   * the snapshot that this job is expected to process.
   */
  async createJob(
    organizationId: string,
    requestedByUserId: string,
    repositoryId: number,
    input: StartIndexDto,
  ): Promise<IndexStatusDto> {
    const repository = await this.repositoriesService.findOne(
      organizationId,
      repositoryId,
    );

    if (repository.status !== RepositoryStatus.Active) {
      throw new ConflictException('Disabled repositories cannot be indexed');
    }

    const branchState = await this.repositoryBranchesService.list(
      organizationId,
      repositoryId,
    );
    const branch = branchState.branches.find(
      (candidate) => candidate.id === input.branchId,
    );

    if (!branch) {
      throw new NotFoundException('Repository branch was not found');
    }

    if (branch.status !== BranchStatus.Active) {
      throw new ConflictException(
        'Deleted repository branches cannot be indexed',
      );
    }

    if (!branch.commitSha) {
      throw new ConflictException(
        'Repository branch must be synchronized before indexing',
      );
    }

    const activeJob =
      await this.indexingRepository.findActiveByRepositoryAndBranch(
        organizationId,
        repositoryId,
        branch.id,
      );

    if (activeJob) {
      throw new ConflictException(
        'An active indexing job already exists for this repository branch',
      );
    }

    try {
      return this.toResponse(
        await this.indexingRepository.create({
          organizationId,
          repositoryId,
          branchId: branch.id,
          requestedByUserId,
          trigger: IndexJobTrigger.Manual,
          mode: input.mode ?? IndexingMode.Incremental,
          targetCommitSha: branch.commitSha,
          maxAttempts: this.configuration.jobMaxAttempts,
        }),
      );
    } catch (error: unknown) {
      if (
        this.getUniqueConstraint(error) ===
        'uq_index_jobs_active_repository_branch'
      ) {
        throw new ConflictException(
          'An active indexing job already exists for this repository branch',
        );
      }

      throw error;
    }
  }

  /** Lists persisted jobs after confirming the repository belongs to the tenant. */
  async listJobs(
    organizationId: string,
    repositoryId: number,
    query: ListIndexJobsQueryDto,
  ): Promise<IndexJobListResponseDto> {
    await this.repositoriesService.findOne(organizationId, repositoryId);

    const [jobs, total] = await this.indexingRepository.findManyByRepository({
      organizationId,
      repositoryId,
      page: query.page,
      limit: query.limit,
      status: query.status,
    });

    return {
      data: jobs.map((job) => this.toResponse(job)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Returns one job only when both repository and organization scope match. */
  async findJob(
    organizationId: string,
    repositoryId: number,
    jobId: number,
  ): Promise<IndexStatusDto> {
    const job = await this.indexingRepository.findByIdAndRepository(
      organizationId,
      repositoryId,
      jobId,
    );

    if (!job) {
      throw new NotFoundException('Indexing job was not found');
    }

    return this.toResponse(job);
  }

  /**
   * Requests cooperative cancellation. Queued jobs stop immediately; running
   * jobs remain visible as running until their lease owner acknowledges the
   * request or expired-lease recovery finalizes it.
   */
  async cancelJob(
    organizationId: string,
    repositoryId: number,
    jobId: number,
  ): Promise<IndexStatusDto> {
    const current = await this.indexingRepository.findByIdAndRepository(
      organizationId,
      repositoryId,
      jobId,
    );

    if (!current) {
      throw new NotFoundException('Indexing job was not found');
    }

    if (
      current.status === IndexJobStatus.Succeeded ||
      current.status === IndexJobStatus.Failed
    ) {
      throw new ConflictException(
        'A completed indexing job cannot be cancelled',
      );
    }

    const job = await this.lifecycleService.requestCancellation(
      organizationId,
      repositoryId,
      jobId,
    );

    if (!job) {
      throw new NotFoundException('Indexing job was not found');
    }

    if (
      job.status === IndexJobStatus.Succeeded ||
      job.status === IndexJobStatus.Failed
    ) {
      throw new ConflictException(
        'A completed indexing job cannot be cancelled',
      );
    }

    return this.toResponse(job);
  }

  /**
   * Creates a new queued job linked to one failed or cancelled job. The old
   * row remains immutable history and the retry targets the same commit.
   */
  async retryJob(
    organizationId: string,
    requestedByUserId: string,
    repositoryId: number,
    jobId: number,
  ): Promise<IndexStatusDto> {
    const source = await this.indexingRepository.findByIdAndRepository(
      organizationId,
      repositoryId,
      jobId,
    );

    if (!source) {
      throw new NotFoundException('Indexing job was not found');
    }

    if (
      source.status !== IndexJobStatus.Failed &&
      source.status !== IndexJobStatus.Cancelled
    ) {
      throw new ConflictException(
        'Only failed or cancelled indexing jobs can be retried',
      );
    }

    const repository = await this.repositoriesService.findOne(
      organizationId,
      repositoryId,
    );

    if (repository.status !== RepositoryStatus.Active) {
      throw new ConflictException('Disabled repositories cannot be indexed');
    }

    const branchState = await this.repositoryBranchesService.list(
      organizationId,
      repositoryId,
    );
    const branch = branchState.branches.find(
      (candidate) => candidate.id === source.branchId,
    );

    if (!branch) {
      throw new NotFoundException('Repository branch was not found');
    }

    if (branch.status !== BranchStatus.Active) {
      throw new ConflictException(
        'Deleted repository branches cannot be indexed',
      );
    }

    const activeJob =
      await this.indexingRepository.findActiveByRepositoryAndBranch(
        organizationId,
        repositoryId,
        source.branchId,
      );

    if (activeJob) {
      throw new ConflictException(
        'An active indexing job already exists for this repository branch',
      );
    }

    try {
      return this.toResponse(
        await this.indexingRepository.create({
          organizationId,
          repositoryId,
          branchId: source.branchId,
          requestedByUserId,
          retryOfJobId: source.id,
          trigger: IndexJobTrigger.Manual,
          mode: source.mode,
          targetCommitSha: source.targetCommitSha,
          maxAttempts: this.configuration.jobMaxAttempts,
        }),
      );
    } catch (error: unknown) {
      if (
        this.getUniqueConstraint(error) ===
        'uq_index_jobs_active_repository_branch'
      ) {
        throw new ConflictException(
          'An active indexing job already exists for this repository branch',
        );
      }

      throw error;
    }
  }

  private getUniqueConstraint(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) {
      return undefined;
    }

    const { code, constraint } = error.driverError as PostgresDriverError;

    return code === '23505' && typeof constraint === 'string'
      ? constraint
      : undefined;
  }

  private toResponse(job: IndexJobEntity): IndexStatusDto {
    const hasFailure = job.failureCode !== null || job.failureMessage !== null;

    return {
      id: job.id,
      repositoryId: job.repositoryId,
      branchId: job.branchId,
      requestedByUserId: job.requestedByUserId,
      trigger: job.trigger,
      mode: job.mode,
      status: job.status,
      phase: job.phase,
      targetCommitSha: job.targetCommitSha,
      retryOfJobId: job.retryOfJobId,
      progress: {
        totalFiles: job.totalFiles,
        processedFiles: job.processedFiles,
        skippedFiles: job.skippedFiles,
        failedFiles: job.failedFiles,
        processedSymbols: job.processedSymbols,
        processedDependencies: job.processedDependencies,
      },
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      failure: hasFailure
        ? {
            code: job.failureCode,
            message: job.failureMessage,
          }
        : null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      lastHeartbeatAt: job.lastHeartbeatAt?.toISOString() ?? null,
      nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
      cancellationRequestedAt:
        job.cancellationRequestedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}
