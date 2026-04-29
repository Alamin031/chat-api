import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request, { Response as SupertestResponse } from 'supertest';
import { AppModule } from '../src/app.module';
import { isRecord } from '../src/common/utils/type-guards';

interface StatusResponseBody {
  success: boolean;
  data: {
    service: string;
    status: string;
  };
}

function isStatusResponseBody(value: unknown): value is StatusResponseBody {
  return (
    isRecord(value) &&
    value.success === true &&
    isRecord(value.data) &&
    value.data.service === 'chat-api' &&
    value.data.status === 'ok'
  );
}

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api/v1 (GET)', () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    return request(httpServer)
      .get('/api/v1')
      .expect(200)
      .expect((response: SupertestResponse) => {
        const body: unknown = response.body;
        expect(isStatusResponseBody(body)).toBe(true);
      });
  });
});
