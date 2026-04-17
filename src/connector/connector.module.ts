import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Connector } from "./connector.entity";
import { ConnectorService } from "./connector.service";
import { ConnectorController } from "./connector.controller";

@Module({
  imports: [TypeOrmModule.forFeature([Connector])],
  providers: [ConnectorService],
  controllers: [ConnectorController],
  exports: [TypeOrmModule, ConnectorService],
})
export class ConnectorModule {}
