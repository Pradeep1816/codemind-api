import { Injectable } from '@nestjs/common';
import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeBuildLifecycleService } from '../lifecycle/knowledge-build-lifecycle.service';
import { ClaimedKnowledgeBuild } from '../lifecycle/knowledge-build-lifecycle.types';

/** PostgreSQL-backed durable queue for knowledge builds. */
@Injectable()
export class KnowledgeQueue {
  constructor(
    private readonly lifecycleService: KnowledgeBuildLifecycleService,
  ) {}

  take(workerId: string): Promise<ClaimedKnowledgeBuild | null> {
    return this.lifecycleService.claimNext(workerId);
  }

  recoverExpired(): Promise<KnowledgeBuildEntity[]> {
    return this.lifecycleService.recoverExpiredLeases();
  }
}
