import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import {
  ROOM_NAME_MAX_LENGTH,
  ROOM_NAME_MIN_LENGTH,
  ROOM_NAME_REGEX,
} from '../../common/constants/validation';
import { trimStringValue } from '../../common/utils/value-transformers';

export class CreateRoomDto {
  @ApiProperty({
    example: 'general-chat',
    minLength: ROOM_NAME_MIN_LENGTH,
    maxLength: ROOM_NAME_MAX_LENGTH,
  })
  @Transform(trimStringValue)
  @IsString()
  @Length(ROOM_NAME_MIN_LENGTH, ROOM_NAME_MAX_LENGTH)
  @Matches(ROOM_NAME_REGEX, {
    message: 'name must contain only letters, numbers, and hyphens',
  })
  name!: string;
}
