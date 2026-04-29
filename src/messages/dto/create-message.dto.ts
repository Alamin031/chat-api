import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { MESSAGE_MAX_LENGTH } from '../../common/constants/validation';
import { trimStringValue } from '../../common/utils/value-transformers';

export class CreateMessageDto {
  @ApiProperty({
    example: 'Hello everyone!',
    maxLength: MESSAGE_MAX_LENGTH,
  })
  @Transform(trimStringValue)
  @IsString()
  content!: string;
}
