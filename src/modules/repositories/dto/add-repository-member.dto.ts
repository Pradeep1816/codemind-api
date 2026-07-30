import { IsUUID } from 'class-validator';

export class AddRepositoryMemberDto {
  @IsUUID('4')
  userId!: string;
}
