import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import type { User } from '../database/schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListRoomMessagesQueryDto } from './dto/list-room-messages-query.dto';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('rooms/:id/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List paginated room messages' })
  async listRoomMessages(
    @Param('id', ParseUUIDPipe) roomId: string,
    @Query() query: ListRoomMessagesQueryDto,
  ) {
    return this.messagesService.listRoomMessages(
      roomId,
      query.limit,
      query.before,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create a room message and fan it out through Redis',
  })
  async createRoomMessage(
    @Param('id', ParseUUIDPipe) roomId: string,
    @Body() body: CreateMessageDto,
    @CurrentUser() user: User,
  ) {
    return this.messagesService.createRoomMessage(roomId, body.content, user);
  }
}
