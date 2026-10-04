import { IsString, Length, Matches } from 'class-validator';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MESSAGE =
  'slug may only contain lowercase letters, digits and single dashes, and cannot start or end with a dash';

export class CreateResourceDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Length(1, 64)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;
}
