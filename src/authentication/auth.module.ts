import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { jwtConstants } from "../util/constants";
import { JwtStrategy } from "./jwt.strategy";
import { LocalStrategy } from "./local.strategy";
import { Otp } from "../user/otp.entity";
import { UsersModule } from "../user/user.module";
import { QueueModule } from "../queue/queue.module";
import { TeamModule } from "../team/team.module";
@Module({
  imports: [
    TypeOrmModule.forFeature([Otp]),
    UsersModule,
    PassportModule,
    JwtModule.register({
      secret: jwtConstants.secret || "secret",
      signOptions: {
        expiresIn: process.env.NODE_ENV === "production" ? "30m" : "24h",
      },
    }),
    QueueModule,
    TeamModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
