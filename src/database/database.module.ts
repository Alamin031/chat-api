import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { EnvironmentVariables } from '../config/env.validation';
import { DATABASE_POOL, DATABASE_TOKEN } from './database.constants';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

@Injectable()
class DatabaseLifecycleService implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new Pool({
          connectionString: config.getOrThrow('DATABASE_URL', { infer: true }),
          max: config.get('DATABASE_POOL_MAX', { infer: true }),
          ssl: config.get('DATABASE_SSL', { infer: true })
            ? { rejectUnauthorized: false }
            : undefined,
        }),
    },
    {
      provide: DATABASE_TOKEN,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
    DatabaseLifecycleService,
  ],
  exports: [DATABASE_TOKEN],
})
export class DatabaseModule {}
