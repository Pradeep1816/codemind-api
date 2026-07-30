import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { OrganizationRolesRepository } from './repositories/organization-roles.repository';
import { OrganizationRepository } from './repositories/organization.repository';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const manager = {} as EntityManager;

  it('normalizes organization data and delegates persistence', async () => {
    const organization = {
      id: 'organization-id',
      name: 'CodeMind Labs',
      slug: 'codemind-labs',
    } as OrganizationEntity;
    const findBySlug = jest.fn().mockResolvedValue(null);
    const createOrganization = jest.fn().mockResolvedValue(organization);
    const organizationRepository = {
      findBySlug,
      create: createOrganization,
    } as unknown as OrganizationRepository;
    const organizationRolesRepository =
      {} as unknown as OrganizationRolesRepository;
    const service = new OrganizationsService(
      organizationRepository,
      organizationRolesRepository,
    );

    await service.ensureSlugAvailable('codemind-labs', manager);
    const result = await service.create(
      {
        name: ' CodeMind Labs ',
        slug: ' CODEMIND-LABS ',
      },
      manager,
    );

    expect(findBySlug).toHaveBeenCalledWith('codemind-labs', manager);
    expect(createOrganization).toHaveBeenCalledWith(
      {
        name: 'CodeMind Labs',
        slug: 'codemind-labs',
      },
      manager,
    );
    expect(result).toBe(organization);
  });

  it('rejects a slug already found by the repository', async () => {
    const organizationRepository = {
      findBySlug: jest.fn().mockResolvedValue({ id: 'organization-id' }),
    } as unknown as OrganizationRepository;
    const organizationRolesRepository =
      {} as unknown as OrganizationRolesRepository;
    const service = new OrganizationsService(
      organizationRepository,
      organizationRolesRepository,
    );

    await expect(
      service.ensureSlugAvailable('codemind-labs', manager),
    ).rejects.toThrow(ConflictException);
  });

  it('delegates organization-scoped permission lookup to the repository', async () => {
    const findUserPermissionNames = jest
      .fn()
      .mockResolvedValue(['user.read', 'user.manage']);
    const organizationRolesRepository = {
      findUserPermissionNames,
    } as unknown as OrganizationRolesRepository;
    const service = new OrganizationsService(
      {} as OrganizationRepository,
      organizationRolesRepository,
    );

    const result = await service.getUserPermissionNames(
      'user-id',
      'organization-id',
    );

    expect(findUserPermissionNames).toHaveBeenCalledWith(
      'user-id',
      'organization-id',
    );
    expect(result).toEqual(['user.read', 'user.manage']);
  });
});
