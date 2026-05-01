import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  GoogleAccount,
  GoogleAccountDocument,
} from "./schemas/google-account.schema";

@Injectable()
export class GoogleAccountsService {
  constructor(
    @InjectModel(GoogleAccount.name)
    private readonly googleAccountModel: Model<GoogleAccountDocument>,
  ) {}

  async findAll() {
    return this.googleAccountModel.find().sort({ createdAt: -1 }).lean().exec();
  }
}
