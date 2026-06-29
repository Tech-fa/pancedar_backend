import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServiceMapProvider } from "./service.map";
import { ENTITIES, SCHEMAS } from "./models";

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
  ],
  providers: [ServiceMapProvider],
  exports: [ServiceMapProvider],
})
export class ServiceMappingModule {}
