import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { RepositoryBranchEntity } from './entities/repository-branch.entity';
import { RepositoryEntity } from './entities/repository.entity';
import { RepositoryMemberEntity } from './entities/repository-member.entity';
import { RepositoryMembersController } from './repository-members.controller';
import { RepositoryMembersService } from './repository-members.service';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';
import { RepositoryMembersRepository } from './repositories/repository-members.repository';
import { RepositoriesRepository } from './repositories/repositories.repository';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([
      RepositoryEntity,
      RepositoryMemberEntity,
      RepositoryBranchEntity,
    ]),
  ],
  controllers: [RepositoriesController, RepositoryMembersController],
  providers: [
    RepositoriesService,
    RepositoryMembersService,
    RepositoriesRepository,
    RepositoryMembersRepository,
  ],
  exports: [RepositoriesService, RepositoryMembersService],
})
export class RepositoriesModule {}
