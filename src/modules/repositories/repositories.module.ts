import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import gitConfig from '../../config/git.config';
import { UsersModule } from '../users/users.module';
import { RepositoryBranchEntity } from './entities/repository-branch.entity';
import { RepositoryEntity } from './entities/repository.entity';
import { RepositoryMemberEntity } from './entities/repository-member.entity';
import { GitCommandService } from './git/git-command.service';
import { GitService } from './git/git.service';
import { RepositoryBranchesController } from './repository-branches.controller';
import { RepositoryBranchesService } from './repository-branches.service';
import { RepositoryMembersController } from './repository-members.controller';
import { RepositoryMembersService } from './repository-members.service';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';
import { RepositoryMembersRepository } from './repositories/repository-members.repository';
import { RepositoryBranchesRepository } from './repositories/repository-branches.repository';
import { RepositoriesRepository } from './repositories/repositories.repository';

@Module({
  imports: [
    ConfigModule.forFeature(gitConfig),
    UsersModule,
    TypeOrmModule.forFeature([
      RepositoryEntity,
      RepositoryMemberEntity,
      RepositoryBranchEntity,
    ]),
  ],
  controllers: [
    RepositoriesController,
    RepositoryMembersController,
    RepositoryBranchesController,
  ],
  providers: [
    RepositoriesService,
    RepositoryMembersService,
    RepositoryBranchesService,
    RepositoriesRepository,
    RepositoryMembersRepository,
    RepositoryBranchesRepository,
    GitCommandService,
    GitService,
  ],
  exports: [
    RepositoriesService,
    RepositoryMembersService,
    RepositoryBranchesService,
    GitService,
  ],
})
export class RepositoriesModule {}
