import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AgentCommunicationController } from "./agent-communication.controller";
import { AgentCommunicationService } from "./agent-communication.service";
import {
  AgentCommunication,
  AgentCommunicationSchema,
} from "./schemas/agent-communication.schema";
import { AgentQueueHandler } from "./agent-queu-handler";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AgentCommunication.name, schema: AgentCommunicationSchema },
    ]),
  ],
  controllers: [AgentCommunicationController],
  providers: [AgentCommunicationService, AgentQueueHandler],
  exports: [AgentCommunicationService],
})
export class AgentCommunicationModule {}
