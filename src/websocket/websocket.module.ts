import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { UsersModule } from '../users/users.module';
import { ChatEventsService } from './chat-events.service';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [RoomsModule, UsersModule],
  providers: [ChatGateway, ChatEventsService],
})
export class WebsocketModule {}
