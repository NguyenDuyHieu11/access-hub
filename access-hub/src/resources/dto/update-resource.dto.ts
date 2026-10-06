import { IsOptional, IsString, Length, Matches } from 'class-validator';
import {
  BRANCH_MESSAGE,
  BRANCH_PATTERN,
  SLUG_MESSAGE,
  SLUG_PATTERN,
} from './create-resource.dto.js';

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Matches(BRANCH_PATTERN, { message: BRANCH_MESSAGE })
  defaultBranch?: string;
}
