import { Injectable } from '@nestjs/common';
import { IndexJobEntity } from '../entities/index-job.entity';
import { ClaimedIndexJob } from '../lifecycle/index-job-lifecycle.types';
import { IndexingJobService } from '../services/indexing-job.service';

/** PostgreSQL-backed durable queue adapter. */
@Injectable()
export class IndexingQueue {
  constructor(private readonly indexingJobService: IndexingJobService) {}

  take(workerId: string): Promise<ClaimedIndexJob | null> {
    return this.indexingJobService.claimNext(workerId);
  }

  recoverExpired(): Promise<IndexJobEntity[]> {
    return this.indexingJobService.recoverExpired();
  }
}
