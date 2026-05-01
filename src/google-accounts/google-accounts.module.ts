import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { GoogleAccountsController } from "./google-accounts.controller";
import { GoogleAccountsService } from "./google-accounts.service";
import {
  GoogleAccount,
  GoogleAccountSchema,
} from "./schemas/google-account.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoogleAccount.name, schema: GoogleAccountSchema },
    ]),
  ],
  controllers: [GoogleAccountsController],
  providers: [GoogleAccountsService],
  exports: [GoogleAccountsService],
})
export class GoogleAccountsModule {}
