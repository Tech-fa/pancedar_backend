import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TwilioVoiceController } from "./twilio-voice.controller";
import { TwilioVoiceService } from "./twilio-voice.service";
import { TwilioMediaGateway } from "./twilio-media.gateway";
import { WorkflowModule } from "src/workflows/workflow.module";
import { RagModule } from "../../rag/rag.module";

@Module({
  imports: [ConfigModule, WorkflowModule, RagModule],
  controllers: [TwilioVoiceController],
  providers: [TwilioVoiceService, TwilioMediaGateway],
  exports: [TwilioVoiceService],
})
export class TwilioVoiceModule {}
