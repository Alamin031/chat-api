import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import type { User } from '../database/schema';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'List all rooms with live active user counts' })
  async listRooms() {
    return this.roomsService.listRooms();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new chat room' })
  async createRoom(@Body() body: CreateRoomDto, @CurrentUser() user: User) {
    return this.roomsService.createRoom(body.name, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room details' })
  async getRoomDetails(@Param('id', ParseUUIDPipe) roomId: string) {
    return this.roomsService.getRoomDetails(roomId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a room if the caller is the creator' })
  async deleteRoom(
    @Param('id', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: User,
  ) {
    return this.roomsService.deleteRoom(roomId, user);
  }
}
