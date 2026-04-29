import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import Redis from 'ioredis';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './config/env.validation';
import { REDIS_CLIENT } from './redis';
import { SocketRedisIoAdapter } from './websocket/socket-redis.adapter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<EnvironmentVariables, true>);
  const redisClient = app.get<Redis>(REDIS_CLIENT);
  const corsOrigin = configService.get('CORS_ORIGIN', { infer: true });
  const socketRedisAdapter = new SocketRedisIoAdapter(app, redisClient);

  await socketRedisAdapter.connectToRedis();

  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.useWebSocketAdapter(socketRedisAdapter);
  app.enableCors(
    corsOrigin === '*'
      ? { origin: true }
      : {
          origin: corsOrigin.split(',').map((origin) => origin.trim()),
          credentials: true,
        },
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chat API')
    .setDescription('Scalable real-time group chat backend')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const httpServer = app.getHttpServer() as NodeJS.EventEmitter;

  httpServer.once('close', () => {
    void socketRedisAdapter.dispose();
  });

  await app.listen(configService.get('PORT', { infer: true }));
  const appUrl = await app.getUrl();
  const swaggerUrl = `${appUrl}/api/docs`;

  logger.log(`Application is running at ${appUrl}/api/v1`);
  console.log(`Swagger docs: ${swaggerUrl}`);
}
void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error as Error);
  process.exitCode = 1;
});
