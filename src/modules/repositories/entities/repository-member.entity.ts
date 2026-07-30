import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../../../database/entities/user.entity';
import { RepositoryEntity } from './repository.entity';

@Entity({ name: 'repository_members' })
@Index('uq_repository_members_repository_user', ['repositoryId', 'userId'], {
  unique: true,
})
@Index('idx_repository_members_user_id', ['userId'])
@Index('idx_repository_members_added_by_user_id', ['addedByUserId'])
export class RepositoryMemberEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_repository_members',
  })
  id!: number;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'added_by_user_id', type: 'uuid', nullable: true })
  addedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => RepositoryEntity, (repository) => repository.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_repository_members_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => UserEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_repository_members_user_id',
  })
  user!: UserEntity;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'added_by_user_id',
    foreignKeyConstraintName: 'FK_repository_members_added_by_user_id',
  })
  addedByUser!: UserEntity | null;
}
