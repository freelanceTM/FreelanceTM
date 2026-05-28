import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, catchError } from 'rxjs';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        Sentry.captureException(error, {
          contexts: {
            http: {
              method: context.switchToHttp().getRequest().method,
              url: context.switchToHttp().getRequest().url,
            },
          },
        });
        throw error;
      }),
    );
  }
}
