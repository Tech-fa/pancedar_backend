import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServiceMapProvider } from "./service.map";
import { ENTITIES, SCHEMAS } from "./models";
import { CollectInformationAction } from "src/workflows/steps/agent/collect-information";

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    MongooseModule.forFeature(SCHEMAS),
  ],
  providers: [ServiceMapProvider, CollectInformationAction],
  exports: [ServiceMapProvider],
})
export class ServiceMappingModule {}
