import { IsEmail } from 'class-validator';

export class AddMemberDTO {
  @IsEmail()
  email!: string;
}
