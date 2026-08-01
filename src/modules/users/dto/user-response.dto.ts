import { UserStatus } from '../entities/user.entity';

export interface UserResponseDto {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserListResponseDto {
  data: UserResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UserInvitationResponseDto {
  user: UserResponseDto;
  invitationToken: string;
  expiresAt: string;
}
