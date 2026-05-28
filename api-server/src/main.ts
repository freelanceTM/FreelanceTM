import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { SentryInterceptor } from './common/interceptors/sentry.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Use Winston as the logger
    logger: false,
  });

  const configService = app.get(ConfigService);
  const isDev = configService.get('NODE_ENV') === 'development';

  // Winston logger
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Sentry initialization (production only)
  const sentryDsn = configService.get<string>('SENTRY_DSN');
  if (sentryDsn && !isDev) {
    Sentry.init({
      dsn: sentryDsn,
      environment: configService.get('NODE_ENV', 'production'),
      release: process.env.GITHUB_SHA || 'dev',
      integrations: [
        nodeProfilingIntegration(),
      ],
      tracesSampleRate: 0.2,
      profilesSampleRate: 0.1,
    });
    app.useGlobalInterceptors(new SentryInterceptor());
  }

  // Security
  app.use(helmet({
    contentSecurityPolicy: isDev ? false : undefined,
  }));
  app.use(cookieParser());

  app.enableCors({
    origin: configService.get('CLIENT_URL') || 'http://localhost:5173',
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, x-telegram-init-data',
  });

  // API Prefix & Versioning
  app.setGlobalPrefix(configService.get('API_PREFIX') || '/api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global Filters & Interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger (docs)
  if (isDev) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FreelanceTM API')
      .setDescription('Full backend API for FreelanceTM platform')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
      .addApiKey({ type: 'apiKey', name: 'x-telegram-init-data', in: 'header' }, 'telegram')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    });
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  logger.log(`🚀 FreelanceTM API running on http://localhost:${port}`);
  if (isDev) {
    logger.log(`📚 Swagger Docs: http://localhost:${port}/docs`);
  }
}
bootstrap();
