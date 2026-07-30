import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RepositoryMemberEntity } from '../entities/repository-member.entity';

export interface CreateRepositoryMemberRecord {
  repositoryId: number;
  userId: string;
  addedByUserId: string;
}

@Injectable()
export class RepositoryMembersRepository {
  constructor(
    @InjectRepository(RepositoryMemberEntity)
    private readonly repository: Repository<RepositoryMemberEntity>,
  ) {}

  create(input: CreateRepositoryMemberRecord): Promise<RepositoryMemberEntity> {
    return this.repository.save(this.repository.create(input));
  }

  findByRepositoryAndUser(
    repositoryId: number,
    userId: string,
  ): Promise<RepositoryMemberEntity | null> {
    return this.repository.findOne({
      where: {
        repositoryId,
        userId,
      },
      select: {
        id: true,
      },
    });
  }

  findManyByRepository(
    repositoryId: number,
  ): Promise<RepositoryMemberEntity[]> {
    return this.repository
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.user', 'user')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .where('member.repositoryId = :repositoryId', { repositoryId })
      .orderBy('user.name', 'ASC')
      .addOrderBy('user.email', 'ASC')
      .addOrderBy('member.id', 'ASC')
      .getMany();
  }

  async deleteByRepositoryAndUser(
    repositoryId: number,
    userId: string,
  ): Promise<boolean> {
    const result = await this.repository.delete({
      repositoryId,
      userId,
    });

    return (result.affected ?? 0) > 0;
  }
}
