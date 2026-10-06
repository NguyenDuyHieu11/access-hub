import { IsOptional, IsString, Length, Matches } from 'class-validator';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MESSAGE =
  'slug may only contain lowercase letters, digits and single dashes, and cannot start or end with a dash';

// Stricter than git's own rules on purpose: segments of letters, digits and "_"
// joined by single ".", "-" or "/". No leading dash, no "..", no ".lock" ending.
export const BRANCH_PATTERN =
  /^(?!.*\.lock(?:\/|$))[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*(?:\/[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*)*$/;
export const BRANCH_MESSAGE =
  'defaultBranch may only contain letters, digits and "_", joined by single ".", "-" or "/"';

export class CreateResourceDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Length(1, 64)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Matches(BRANCH_PATTERN, { message: BRANCH_MESSAGE })
  defaultBranch?: string;
}
