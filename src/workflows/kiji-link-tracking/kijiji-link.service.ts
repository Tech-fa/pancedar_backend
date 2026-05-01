import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  KijijiLink,
  KijijiLinkDocument,
} from "./schemas/kijiji-link.schema";

const DEFAULT_LINK_LIMIT = 100;
const MAX_LINK_LIMIT = 500;

@Injectable()
export class KijijiLinkService {
  constructor(
    @InjectModel(KijijiLink.name)
    private readonly kijijiLinkModel: Model<KijijiLinkDocument>,
  ) {}

  async findByConnectorId(connectorId: string, limit = DEFAULT_LINK_LIMIT) {
    const safeLimit = Math.min(Math.max(limit, 1), MAX_LINK_LIMIT);

    return this.kijijiLinkModel
      .find({ connectorId })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .select({
        connectorId: 1,
        sourceUrl: 1,
        link: 1,
        collectedAt: 1,
        lastSeenAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean();
  }
}
