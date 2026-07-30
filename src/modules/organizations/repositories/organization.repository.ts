import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OrganizationEntity } from '../../../database/entities/organization.entity';

export interface CreateOrganizationRecord {
  name: string;
  slug: string;
}

@Injectable()
export class OrganizationRepository {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly repository: Repository<OrganizationEntity>,
  ) {}

  findBySlug(
    slug: string,
    manager?: EntityManager,
  ): Promise<OrganizationEntity | null> {
    return this.getRepository(manager).findOne({
      where: { slug },
      select: { id: true },
    });
  }

  create(
    input: CreateOrganizationRecord,
    manager?: EntityManager,
  ): Promise<OrganizationEntity> {
    const repository = this.getRepository(manager);
    const organization = repository.create(input);

    return repository.save(organization);
  }

  async lockById(
    organizationId: string,
    manager: EntityManager,
  ): Promise<boolean> {
    const organization = await manager
      .getRepository(OrganizationEntity)
      .createQueryBuilder('organization')
      .select('organization.id')
      .where('organization.id = :organizationId', { organizationId })
      .setLock('pessimistic_write')
      .getOne();

    return organization !== null;
  }

  private getRepository(
    manager?: EntityManager,
  ): Repository<OrganizationEntity> {
    return manager
      ? manager.getRepository(OrganizationEntity)
      : this.repository;
  }
}
