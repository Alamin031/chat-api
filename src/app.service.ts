import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus() {
    return {
      service: 'chat-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
