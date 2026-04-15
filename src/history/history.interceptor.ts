import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { HistoryService } from './history.service';
import { QueuePublisher } from '../queue/queue.publisher';
import { Events } from '../queue/queue-constants';
import { RequestContextService } from './request-context.service';

@Injectable()
export class HistoryInterceptor implements NestInterceptor {
  // List of URL patterns to exclude from history tracking
  private excludePatterns: RegExp[] = [
    /^\/auth\/login/,         // Auth endpoints
    /^\/auth\/refresh/,
    /^\/health/,              // Health checks 
    /^\/metrics/,             // Metrics endpoints
    /^\/histories/            // Avoid tracking history of history views
  ];

  constructor(
    private readonly queuePublisher: QueuePublisher,
    private readonly requestContextService: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    
    // Skip tracking for excluded endpoints
    const originalUrl = request.originalUrl || request.url;
    if (request.method === 'GET' || this.shouldExclude(originalUrl)) {
      return next.handle();
    }
    const clientId = request.user?.clientId || request.user?.client?.id;
    const entityName = request.entityName;
    let entityId = '';
    const handler = context.getHandler();
    const methodName = handler.name;
    let operation = methodName;
    if (request.params?.id) {
      entityId = request.params.id;
    }
    const user = request.user;
    if(!user){
      return next.handle();
    }
    
    // Set the user in the request context service
    this.requestContextService.setUser(user);

    return this.requestContextService.run(() => {
      // Set user in context inside the async local storage context
      this.requestContextService.setUser(user);
      
      return next.handle().pipe(
        tap((responseBody) => {
          const res = context.switchToHttp().getResponse();
          const responseStatus = res.statusCode;
          if (responseBody) {
            entityId = responseBody.id || entityId;
          }
          if (
            responseStatus >= 200 &&
            responseStatus < 300 &&
            request.method !== 'GET'
          ) {
  
            this.queuePublisher.publish(Events.NOTIFICATION, {
              subject: entityName,
              actions: request.actions,
              method: operation,
              entityId,
              userId: user.id,
              clientId,
            });
          }
        }),
      );
    });
  }

  /**
   * Check if the URL should be excluded from history tracking
   */
  private shouldExclude(url: string): boolean {
    return this.excludePatterns.some(pattern => pattern.test(url));
  }
}
