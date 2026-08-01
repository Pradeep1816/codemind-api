import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { RoleEntity } from './role.entity';

export enum OrganizationPlan {
  Free = 'free',
  Team = 'team',
  Enterprise = 'enterprise',
}

export enum OrganizationStatus {
  Active = 'active',
  Inactive = 'inactive',
  Suspended = 'suspended',
}

@Entity({ name: 'organizations' })
@Index('uq_organizations_slug', ['slug'], { unique: true })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;

  @Column({
    type: 'enum',
    enum: OrganizationPlan,
    enumName: 'organization_plan',
    default: OrganizationPlan.Free,
  })
  plan!: OrganizationPlan;

  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    enumName: 'organization_status',
    default: OrganizationStatus.Active,
  })
  status!: OrganizationStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => UserEntity, (user) => user.organization)
  users!: UserEntity[];

  @OneToMany(() => RoleEntity, (role) => role.organization)
  roles!: RoleEntity[];
}
