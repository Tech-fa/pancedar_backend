import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { QueuePublisher } from "../queue/queue.publisher";
import { Events } from "../queue/queue-constants";
import { RequestContextService } from "./request-context.service";

@Injectable()
export class HistoryInterceptor implements NestInterceptor {
  constructor(private readonly requestContextService: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Skip tracking for excluded endpoints
    if (request.method === "GET") {
      return next.handle();
    }

    const user = request.user;
    if (!user) {
      return next.handle();
    }

    // Set the user in the request context service
    this.requestContextService.setUser(user);

    return this.requestContextService.run(() => {
      // Set user in context inside the async local storage context
      this.requestContextService.setUser(user);
      return next.handle();
    });
  }
}
