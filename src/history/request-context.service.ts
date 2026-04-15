import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { UserRequest } from '../permissions/dto';

@Injectable()
export class RequestContextService {
  private asyncLocalStorage = new AsyncLocalStorage<Map<string, any>>();

  /**
   * Set the current user for the request context
   */
  setUser(user: UserRequest): void {
    const store = this.getStore();
    if (store) {
      store.set('user', user);
    }
  }

  /**
   * Get the current user from the request context
   */
  getUser(): UserRequest | undefined {
    const store = this.getStore();
    return store?.get('user');
  }

  /**
   * Run a callback with a new request context
   */
  run<T>(callback: () => T): T {
    return this.asyncLocalStorage.run(new Map<string, any>(), callback);
  }

  /**
   * Get the current store
   */
  private getStore(): Map<string, any> | undefined {
    return this.asyncLocalStorage.getStore();
  }
} 