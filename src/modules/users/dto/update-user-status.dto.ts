import { IsIn } from 'class-validator';
import { UserStatus } from '../../../database/entities/user.entity';

const MANAGEABLE_USER_STATUSES = [
  UserStatus.Active,
  UserStatus.Inactive,
  UserStatus.Suspended,
] as const;

export class UpdateUserStatusDto {
  @IsIn(MANAGEABLE_USER_STATUSES)
  status!: UserStatus.Active | UserStatus.Inactive | UserStatus.Suspended;
}
