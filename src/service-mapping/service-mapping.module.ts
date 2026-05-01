import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServiceMapProvider } from "./service.map";
import { ENTITIES, SCHEMAS } from "./models";

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    MongooseModule.forFeature(SCHEMAS),
  ],
  providers: [ServiceMapProvider],
  exports: [ServiceMapProvider],
})
export class ServiceMappingModule {}
