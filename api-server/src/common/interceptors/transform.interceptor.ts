import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Smart transform interceptor — preserves backwards compatibility
 * with the legacy Express API (direct objects) while allowing
 * new routes to use { data, meta } when explicitly returned.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // If controller already returned { data, meta }, pass through
        if (data && typeof data === 'object' && ('__raw' in data)) {
          const { __raw, ...rest } = data;
          return rest;
        }
        // If it's a primitive or already an array, pass through
        if (data == null || typeof data !== 'object' || Array.isArray(data)) {
          return data;
        }
        // If it has legacy top-level keys used by the old client, pass through
        const legacyKeys = ['gigs', 'total', 'page', 'limit', 'orders', 'users', 'categories', 'payments', 'disputes'];
        const hasLegacyShape = legacyKeys.some((k) => k in data);
        if (hasLegacyShape) {
          return data;
        }
        // Otherwise wrap for new clients
        return { data };
      }),
    );
  }
}
