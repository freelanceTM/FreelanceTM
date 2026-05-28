import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get('NODE_ENV') === 'production';
        const logLevel = config.get('LOG_LEVEL', isProd ? 'info' : 'debug');

        const transports: winston.transport[] = [
          // Console output with colors (dev)
          new winston.transports.Console({
            format: isProd
              ? winston.format.json()
              : winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.colorize(),
                  winston.format.printf(({ timestamp, level, message, context, trace }) => {
                    return `${timestamp} [${context || 'NestJS'}] ${level}: ${message}${trace ? '\n' + trace : ''}`;
                  }),
                ),
          }),
        ];

        // File output for production (structured JSON for Loki/Grafana)
        if (isProd) {
          transports.push(
            new winston.transports.File({
              filename: 'logs/app.json.log',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
            new winston.transports.File({
              filename: 'logs/error.json.log',
              level: 'error',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
          );
        }

        return {
          level: logLevel,
          defaultMeta: { service: 'freelancetm-api' },
          transports,
          exceptionHandlers: transports,
          rejectionHandlers: transports,
        };
      },
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
