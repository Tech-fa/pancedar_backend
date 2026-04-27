import { Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import 'source-map-support/register';
import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import * as winston from 'winston';
import { HistoryInterceptor } from './history/history.interceptor';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logLevel: LogLevel[] =
    process.env.DEBUG == 'true'
      ? ['error', 'warn', 'log', 'debug']
      : ['error', 'warn', 'log'];

  const logger = new Logger('Main');
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console({
          format:
            process.env.NODE_ENV == 'development'
              ? winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.ms(),
                  nestWinstonModuleUtilities.format.nestLike('MyApp', {
                    colors: true,
                    prettyPrint: true,
                  }),
                )
              : winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.ms(),
                  nestWinstonModuleUtilities.format.nestLike('MyApp', {
                    colors: true,
                    prettyPrint: true,
                  }),
                ),
        }),
        // other transports...
      ],
    }),
    cors: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ limit: '100kb', extended: true }));

  app.useWebSocketAdapter(new WsAdapter(app));

  // Enable CORS
  app.enableCors();

  // History tracking for all requests
  const historyInterceptor = app.get(HistoryInterceptor);
  app.useGlobalInterceptors(historyInterceptor);

  await app.listen(process.env.PORT);
  logger.log('okay we are live');
}
bootstrap();
