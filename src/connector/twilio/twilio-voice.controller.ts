import { Body, Controller, Get, Logger, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../../util/constants";
import { TwilioVoiceService } from "./twilio-voice.service";

@Public()
@Controller("connector/twilio/voice")
export class TwilioVoiceController {
  private readonly logger = new Logger(TwilioVoiceController.name);

  constructor(private readonly voice: TwilioVoiceService) {}

  /**
   * Configure this URL on your Twilio phone number (Voice & Fax → A call comes in).
   * Twilio POSTs application/x-www-form-urlencoded; response is TwiML.
   */
  @Post("incoming")
  async incoming(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, string>,
  ): Promise<void> {
    try {
      this.voice.assertValidTwilioRequest(req, body);
    } catch (e) {
      this.logger.warn(`Twilio signature validation failed: ${e}`);
      res.status(401).send("Unauthorized");
      return;
    }

    if (!this.voice.isVoiceEnabled()) {
      res.type("text/xml").send(this.voice.buildDisabledTwiML());
      return;
    }

    const calledNumber = body.To;
    const fromNumber = body.From;
    const twiml = await this.voice.buildIncomingTwiML(calledNumber, fromNumber);
    res.type("text/xml").send(twiml);
  }

  @Get("call")
  @Public()
  async media(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.voice.doCall("+18193296620");
    res.status(200).json({ message: "Call initiated" });
  }
}
