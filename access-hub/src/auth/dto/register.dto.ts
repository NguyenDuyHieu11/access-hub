import { IsEmail, IsString, Length } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(1, 100)
  teamName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(12, 200)
  password!: string;
}
