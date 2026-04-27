import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EntityManager } from "typeorm";
import { InjectEntityManager } from "@nestjs/typeorm";
import { QueuePublisher } from "../../queue/queue.publisher";
import { CacheService } from "../../cache/cache.service";
import { Events } from "../../queue/queue-constants";

@Injectable()
export class GoogleCron {
  private logger = new Logger(GoogleCron.name);
  constructor(
    private readonly queuePublisher: QueuePublisher,
    @InjectEntityManager()
    private entityManager: EntityManager,
    private cache: CacheService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  public async renewWatch() {
    this.logger.log("renewing watchers");
    if (await this.cache.getData("RENEW_WATCH_KEY")) {
      this.logger.log("previous watch renewal in progress! will skip");
      return;
    }
    const query = this.entityManager.connection.createQueryRunner();
    try {
      await this.cache.setData("RENEW_WATCH_KEY", "1", 1800);
      const twoDaysAgo = new Date().valueOf() - 24 * 2 * 60 * 60 * 1000;
      const results = await query.query(
        `select c.id as id from connectors c where c.status = 'active' and c.name = 'Gmail' and ${twoDaysAgo} > COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.credentials, '$.watcher_date')) AS UNSIGNED), 0)`,
      );
      for (const { id } of results) {
        this.logger.log(`publishing renew watch event for user ${id}`);
        await this.queuePublisher.publish(Events.RENEW_WATCH, {
          connectorId: id,
        });
      }
    } catch (error) {
      this.logger.error("error renewing watchers");
      this.logger.error(error);
    } finally {
      await this.cache.evictData("RENEW_WATCH_KEY");
      query.release();
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  public async renewTokens() {
    this.logger.log("renewing expiring tokens");
    if (await this.cache.getData("RENEW_TOKEN_KEY")) {
      this.logger.log("previous token renewal in progress! will skip");
      return;
    }
    const query = this.entityManager.connection.createQueryRunner();
    try {
      await this.cache.setData("RENEW_TOKEN_KEY", "1", 3600);
      // Get credentials expiring in the next 10 minutes
      const tenMinutesFromNow = new Date().valueOf() + 10 * 60 * 1000;
      const results = await query.query(
        `select c.id as id from connectors c where c.status = 'active' and CAST(JSON_UNQUOTE(JSON_EXTRACT(c.credentials, '$.expiry_date')) AS UNSIGNED) < ${tenMinutesFromNow} and CAST(JSON_UNQUOTE(JSON_EXTRACT(c.credentials, '$.expiry_date')) AS UNSIGNED) > ${new Date().valueOf()}`,
      );
      for (const { id } of results) {
        this.logger.log(`publishing renew token event for user ${id}`);
        await this.queuePublisher.publish(Events.RENEW_TOKEN, {
          connectorId: id,
        });
      }
    } catch (error) {
      this.logger.error("error renewing tokens");
      this.logger.error(error);
    } finally {
      await this.cache.evictData("RENEW_TOKEN_KEY");
      query.release();
    }
  }
}
