import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Connector } from "./connector.entity";
import { ConnectorService } from "./connector.service";
import { ConnectorController } from "./connector.controller";
import { QueueModule } from "src/queue/queue.module";

@Module({
  imports: [TypeOrmModule.forFeature([Connector]), QueueModule],
  providers: [ConnectorService],
  controllers: [ConnectorController],
  exports: [TypeOrmModule, ConnectorService],
})
export class ConnectorModule {}
