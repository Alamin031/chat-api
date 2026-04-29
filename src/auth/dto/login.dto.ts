import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_REGEX,
} from '../../common/constants/validation';
import { trimStringValue } from '../../common/utils/value-transformers';

export class LoginDto {
  @ApiProperty({
    example: 'alice_01',
    minLength: USERNAME_MIN_LENGTH,
    maxLength: USERNAME_MAX_LENGTH,
  })
  @Transform(trimStringValue)
  @IsString()
  @Length(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH)
  @Matches(USERNAME_REGEX, {
    message: 'username must contain only letters, numbers, and underscores',
  })
  username!: string;
}
