import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import {
  Connection,
  EntitySubscriberInterface,
  UpdateEvent,
  InsertEvent,
  RemoveEvent,
} from 'typeorm';
import { shouldTrackEntity } from './track-changes.decorator';
import { HistoryService } from './history.service';
import { RequestContextService } from './request-context.service';

@Injectable()
export class HistorySubscriber implements EntitySubscriberInterface {
  private oldEntityMap = new Map<string, any>();

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly historyService: HistoryService,
    private readonly requestContextService: RequestContextService,
  ) {
    connection.subscribers.push(this);
  }

  listenTo() {
    return Object;
  }

  async afterInsert(event: InsertEvent<any>): Promise<void> {
    if (!shouldTrackEntity(event.metadata?.target)) {
      return;
    }
    const entityName = event.metadata.targetName;
    const entityId = event.entity.id?.toString();
    if (!entityId) {
      return;
    }

    const user = this.requestContextService.getUser();
    if (!user) {
      return;
    }

    await this.historyService.recordEntityChanges(
      event.metadata.target,
      entityName,
      entityId,
      null,
      event.entity,
      'CREATE',
      user,
    );
  }

  /**
   * Load the full entity from the database before the update overwrites it,
   * so we have accurate old values for change tracking.
   */
  async beforeUpdate(event: UpdateEvent<any>): Promise<void> {
    if (!shouldTrackEntity(event.metadata.target)) {
      return;
    }

    const entityId = event.entity?.id?.toString();
    if (!entityId) return;

    const entityName = event.metadata.targetName;
    const key = `${entityName}:${entityId}`;

    const repo = event.manager.getRepository(event.metadata.target as any);
    const oldEntity = await repo.findOne({ where: { id: entityId } } as any);
    if (oldEntity) {
      this.oldEntityMap.set(key, oldEntity);
    }
  }

  async afterUpdate(event: UpdateEvent<any>): Promise<void> {
    if (!shouldTrackEntity(event.metadata.target)) {
      return;
    }
    const entityName = event.metadata.targetName;
    const entityId = event.entity?.id?.toString();
    if (!entityId) {
      return;
    }
    const user = this.requestContextService.getUser();
    if (!user) {
      return;
    }

    const key = `${entityName}:${entityId}`;
    const oldValues = this.oldEntityMap.get(key) || {};
    this.oldEntityMap.delete(key);

    const newValues = { ...event.entity };

    await this.historyService.recordEntityChanges(
      event.metadata.target,
      entityName,
      entityId,
      oldValues,
      newValues,
      'UPDATE',
      user,
    );
  }

  async beforeRemove(event: RemoveEvent<any>): Promise<void> {
    if (!shouldTrackEntity(event.metadata.target)) {
      return;
    }

    const entityName = event.metadata.targetName;
    const entityId = event.entityId?.toString() || event.entity?.id?.toString();

    if (!entityId) {
      return;
    }

    const user = this.requestContextService.getUser();
    if (!user) {
      return;
    }

    await this.historyService.recordEntityChanges(
      event.metadata.target,
      entityName,
      entityId,
      event.entity,
      null,
      'DELETE',
      user,
    );
  }
}
