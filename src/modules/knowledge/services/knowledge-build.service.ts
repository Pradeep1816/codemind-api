import { createHash } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import analysisConfig from '../../../config/analysis.config';
import knowledgeConfig from '../../../config/knowledge.config';
import { IndexJobStatus } from '../../indexing/enums/index-job-status.enum';
import { IndexingService } from '../../indexing/indexing.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import {
  KnowledgeBuildListResponseDto,
  KnowledgeBuildResponseDto,
} from '../dto/knowledge-build-response.dto';
import { ListKnowledgeBuildsQueryDto } from '../dto/list-knowledge-builds-query.dto';
import { StartKnowledgeBuildDto } from '../dto/start-knowledge-build.dto';
import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import { KnowledgeBuildTrigger } from '../enums/knowledge-build-trigger.enum';
import { KnowledgeBuildLifecycleRepository } from '../lifecycle/knowledge-build-lifecycle.repository';
import { KnowledgeBuildLifecycleService } from '../lifecycle/knowledge-build-lifecycle.service';
import { KnowledgePersistenceService } from './knowledge-persistence.service';

@Injectable()
export class KnowledgeBuildService {
  constructor(
    @Inject(knowledgeConfig.KEY)
    private readonly knowledgeConfiguration: ConfigType<typeof knowledgeConfig>,
    @Inject(analysisConfig.KEY)
    private readonly analysisConfiguration: ConfigType<typeof analysisConfig>,
    private readonly repositoriesService: RepositoriesService,
    private readonly indexingService: IndexingService,
    private readonly persistenceService: KnowledgePersistenceService,
    private readonly lifecycleService: KnowledgeBuildLifecycleService,
    private readonly lifecycleRepository: KnowledgeBuildLifecycleRepository,
  ) {}

  /** Queues a reproducible knowledge build from one successful index job. */
  async create(
    organizationId: string,
    requestedByUserId: string,
    repositoryId: number,
    input: StartKnowledgeBuildDto,
  ): Promise<KnowledgeBuildResponseDto> {
    const sourceJob = await this.indexingService.findJob(
      organizationId,
      repositoryId,
      input.sourceIndexJobId,
    );

    if (sourceJob.status !== IndexJobStatus.Succeeded) {
      throw new ConflictException(
        'Knowledge can only be generated from a successful indexing job',
      );
    }

    const created = await this.persistenceService.createBuild({
      organizationId,
      repositoryId,
      branchId: sourceJob.branchId,
      sourceIndexJobId: sourceJob.id,
      requestedByUserId,
      trigger: KnowledgeBuildTrigger.Manual,
      analyzerBundleVersion: this.knowledgeConfiguration.analyzerBundleVersion,
      configurationDigest: this.configurationDigest(),
      maxAttempts: this.knowledgeConfiguration.jobMaxAttempts,
    });
    const build = await this.lifecycleRepository.findById(
      organizationId,
      repositoryId,
      created.buildId,
    );

    if (!build) {
      throw new NotFoundException('Knowledge build was not found');
    }

    return this.toResponse(build);
  }

  /** Lists tenant-scoped build history for one repository. */
  async list(
    organizationId: string,
    repositoryId: number,
    query: ListKnowledgeBuildsQueryDto,
  ): Promise<KnowledgeBuildListResponseDto> {
    await this.repositoriesService.findOne(organizationId, repositoryId);
    const [builds, total] = await this.lifecycleRepository.findMany({
      organizationId,
      repositoryId,
      page: query.page,
      limit: query.limit,
      status: query.status,
    });

    return {
      data: builds.map((build) => this.toResponse(build)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Returns one build without disclosing another tenant's identifier. */
  async findOne(
    organizationId: string,
    repositoryId: number,
    buildId: number,
  ): Promise<KnowledgeBuildResponseDto> {
    return this.toResponse(
      await this.requireBuild(organizationId, repositoryId, buildId),
    );
  }

  /** Requests cooperative cancellation of a queued or running build. */
  async cancel(
    organizationId: string,
    repositoryId: number,
    buildId: number,
  ): Promise<KnowledgeBuildResponseDto> {
    const current = await this.requireBuild(
      organizationId,
      repositoryId,
      buildId,
    );

    if (
      current.status === KnowledgeBuildStatus.Succeeded ||
      current.status === KnowledgeBuildStatus.Failed
    ) {
      throw new ConflictException(
        'A completed knowledge build cannot be cancelled',
      );
    }

    const build = await this.lifecycleService.requestCancellation(
      organizationId,
      repositoryId,
      buildId,
    );

    if (!build) {
      throw new NotFoundException('Knowledge build was not found');
    }

    return this.toResponse(build);
  }

  /** Requeues the same immutable draft after a terminal failure/cancellation. */
  async retry(
    organizationId: string,
    repositoryId: number,
    buildId: number,
  ): Promise<KnowledgeBuildResponseDto> {
    const current = await this.requireBuild(
      organizationId,
      repositoryId,
      buildId,
    );

    if (
      current.status !== KnowledgeBuildStatus.Failed &&
      current.status !== KnowledgeBuildStatus.Cancelled
    ) {
      throw new ConflictException(
        'Only failed or cancelled knowledge builds can be retried',
      );
    }

    await this.repositoriesService.findOne(organizationId, repositoryId);
    const build = await this.lifecycleRepository.requeueTerminal(
      organizationId,
      repositoryId,
      buildId,
    );

    if (!build) {
      throw new ConflictException(
        'Knowledge build cannot be retried while another build is active',
      );
    }

    return this.toResponse(build);
  }

  private async requireBuild(
    organizationId: string,
    repositoryId: number,
    buildId: number,
  ): Promise<KnowledgeBuildEntity> {
    const build = await this.lifecycleRepository.findById(
      organizationId,
      repositoryId,
      buildId,
    );

    if (!build) {
      throw new NotFoundException('Knowledge build was not found');
    }

    return build;
  }

  private configurationDigest(): string {
    const normalized = Object.fromEntries(
      Object.entries(this.analysisConfiguration).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );

    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  private toResponse(build: KnowledgeBuildEntity): KnowledgeBuildResponseDto {
    const hasFailure =
      build.failureCode !== null || build.failureMessage !== null;
    const accountedFiles = build.processedFiles + build.failedFiles;
    const percentage =
      build.status === KnowledgeBuildStatus.Succeeded
        ? 100
        : build.totalFiles === 0
          ? 0
          : Math.min(
              100,
              Math.floor((accountedFiles / build.totalFiles) * 100),
            );

    return {
      id: build.id,
      repositoryId: build.repositoryId,
      branchId: build.branchId,
      sourceIndexJobId: build.sourceIndexJobId,
      requestedByUserId: build.requestedByUserId,
      trigger: build.trigger,
      status: build.status,
      phase: build.phase,
      targetCommitSha: build.targetCommitSha,
      analyzerBundleVersion: build.analyzerBundleVersion,
      configurationDigest: build.configurationDigest,
      progress: {
        percentage,
        totalFiles: build.totalFiles,
        processedFiles: build.processedFiles,
        failedFiles: build.failedFiles,
        emittedFacts: build.emittedFacts,
        persistedNodes: build.persistedNodes,
        persistedEdges: build.persistedEdges,
        currentFile: build.currentFile,
      },
      attemptCount: build.attemptCount,
      maxAttempts: build.maxAttempts,
      failure: hasFailure
        ? { code: build.failureCode, message: build.failureMessage }
        : null,
      startedAt: build.startedAt?.toISOString() ?? null,
      completedAt: build.completedAt?.toISOString() ?? null,
      lastHeartbeatAt: build.lastHeartbeatAt?.toISOString() ?? null,
      nextAttemptAt: build.nextAttemptAt?.toISOString() ?? null,
      cancellationRequestedAt:
        build.cancellationRequestedAt?.toISOString() ?? null,
      createdAt: build.createdAt.toISOString(),
      updatedAt: build.updatedAt.toISOString(),
    };
  }
}
