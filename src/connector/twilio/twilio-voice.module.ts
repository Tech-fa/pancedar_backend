import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TwilioVoiceController } from "./twilio-voice.controller";
import { TwilioVoiceService } from "./twilio-voice.service";
import { TwilioMediaGateway } from "./twilio-media.gateway";
import { WorkflowModule } from "src/workflows/workflow.module";
import { RagModule } from "../../rag/rag.module";
import { CachingModule } from "src/cache/cache.module";
import { QueueModule } from "src/queue/queue.module";
import { ServiceMappingModule } from "src/service-mapping/service-mapping.module";

@Module({
  imports: [
    ConfigModule,
    WorkflowModule,
    RagModule,
    CachingModule,
    QueueModule,
    ServiceMappingModule,
  ],
  controllers: [TwilioVoiceController],
  providers: [TwilioVoiceService, TwilioMediaGateway],
  exports: [TwilioVoiceService],
})
export class TwilioVoiceModule {}
