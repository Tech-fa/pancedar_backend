import { Module } from "@nestjs/common";
import { UsersService } from "./user.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UserController } from "./user.controller";
import { QueueModule } from "../queue/queue.module";
import { Otp } from "./otp.entity";
import { UserIncomingEmail } from "./user-incoming-emails.entity";
import { TeamModule } from "../team/team.module";
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Otp,
      UserIncomingEmail,
    ]),
    QueueModule,
    TeamModule,
  ],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [UserController],
})
export class UsersModule {}
