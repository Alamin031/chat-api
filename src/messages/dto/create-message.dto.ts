import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
} from '../../common/constants/validation';
import { trimStringValue } from '../../common/utils/value-transformers';

export class CreateMessageDto {
  @ApiProperty({
    example: 'Hello everyone!',
    minLength: MESSAGE_MIN_LENGTH,
    maxLength: MESSAGE_MAX_LENGTH,
  })
  @Transform(trimStringValue)
  @IsString()
  @Length(MESSAGE_MIN_LENGTH, MESSAGE_MAX_LENGTH)
  content!: string;
}
