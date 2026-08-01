import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
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
import { IndexingMode } from './enums/indexing-mode.enum';
import { IndexingRepository } from './indexing.repository';

interface PostgresDriverError extends Error {
  code?: string;
  constraint?: string;
}

@Injectable()
export class IndexingService {
  constructor(
    private readonly repositoriesService: RepositoriesService,
    private readonly repositoryBranchesService: RepositoryBranchesService,
    private readonly indexingRepository: IndexingRepository,
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
      targetCommitSha: job.targetCommitSha,
      progress: {
        totalFiles: job.totalFiles,
        processedFiles: job.processedFiles,
        skippedFiles: job.skippedFiles,
        failedFiles: job.failedFiles,
      },
      attemptCount: job.attemptCount,
      failure: hasFailure
        ? {
            code: job.failureCode,
            message: job.failureMessage,
          }
        : null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}
