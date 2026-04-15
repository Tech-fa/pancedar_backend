import { History } from "../history/history.entity";
import { Otp } from "../user/otp.entity";
import { User } from "../user/user.entity";
import { Client } from "../client/client.entity";
import { UserCredential } from "../user/userCredendtial.entity";
import { UserIncomingEmail } from "../user/user-incoming-emails.entity";
import { Team, TeamMember } from "../team/team.entity";
export const ENTITIES = [
  History,
  Otp,
  User,
  Client,
  UserCredential,
  UserIncomingEmail,
  Team,
  TeamMember,
];
