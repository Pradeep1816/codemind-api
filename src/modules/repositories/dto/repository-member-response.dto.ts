import { UserStatus } from '../../../database/entities/user.entity';

export interface RepositoryMemberUserResponseDto {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  roles: string[];
}

export interface RepositoryMemberResponseDto {
  id: number;
  user: RepositoryMemberUserResponseDto;
  addedByUserId: string | null;
  createdAt: string;
}
