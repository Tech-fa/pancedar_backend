import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserType } from "./user.entity";
import { v4 as uuidv4 } from "uuid";
import * as bcrypt from "bcrypt";
import { UserDTO } from "./user.dto";
import { hashPassword } from "../util/helper-util";
import { EmailType } from "../common/dto";
import { QueuePublisher } from "../queue/queue.publisher";
import { Otp } from "./otp.entity";
import { RequestContextService } from "../history/request-context.service";
import { UserIncomingEmail } from "./user-incoming-emails.entity";
import { TeamService } from "../team/team.service";
import { UserRequest } from "../permissions/dto";
import { Connector } from "../connector/connector.entity";
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserIncomingEmail)
    private readonly incomingEmailRepository: Repository<UserIncomingEmail>,
    private readonly queuePublisher: QueuePublisher,
    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,
    private readonly teamService: TeamService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async findBy(cond, relations = [], select = {}): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { ...cond, deleted: false },
      relations,
      select,
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async findAllBySearch(
    search: string,
    user: UserRequest,
    userType?: string,
  ): Promise<User[]> {
    const query = this.userRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.permissionGroups", "pg")
      .leftJoinAndSelect("pg.permissionGroup", "pg2")
      .where("user.clientId = :clientId AND user.deleted = false", {
        clientId: user.clientId,
      });

    if (user.teamId) {
      query.innerJoin(
        "team_members",
        "tm",
        "tm.user_id = user.id AND tm.team_id = :teamId AND tm.client_id = :clientId",
        { teamId: user.teamId, clientId: user.clientId },
      );
    }

    query.andWhere(
      "(LOWER(user.fname) LIKE LOWER(:search) OR " +
        "LOWER(user.lname) LIKE LOWER(:search) OR " +
        "LOWER(CONCAT(user.fname, ' ', user.lname)) LIKE LOWER(:search))",
      { search: `%${search || ""}%` },
    );

    if (userType) {
      query.andWhere("user.userType = :userType", { userType });
    }

    query
      .orderBy("user.createdAt", "DESC")
      .select([
        "user.id",
        "user.fname",
        "user.lname",
        "user.email",
        "user.phone",
        "user.isActive",
        "user.createdAt",
        "user.deleted",
        "user.failedLogins",
        "user.userType",
        "pg.id",
        "pg2.name",
      ]);

    const users = await query.getMany();
    return users.map((u) => ({
      ...u,
      isAdmin: u.permissionGroups?.some(
        (pg) => pg.permissionGroup?.name === "Admin",
      ),
    }));
  }

  async findMembersByOrgUnits(orgUnitIds: string[]): Promise<User[]> {
    const users = await this.userRepository
      .createQueryBuilder("user")
      .leftJoin("user.permissionGroups", "userPermissionGroup")
      .leftJoin(
        "userPermissionGroup.permissionGroup",
        "userPermissionGroupGroup",
      )
      .leftJoin(
        "userPermissionGroup.userPermissionGroupOrganizationUnits",
        "upgou",
      )
      .where("user.deleted = :deleted", { deleted: false })
      .andWhere(
        "(upgou.organizationUnitId IN (:...orgUnitIds)) OR userPermissionGroupGroup.name = :name",
        { orgUnitIds, name: "Admin" },
      )
      .distinct(true)
      .getMany();

    return users;
  }

  private async emailExists(email: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { email, deleted: false },
    });
    return !!user;
  }

  public async checkUser(
    email: string,
    password: string,
  ): Promise<User & { teamId: string }> {
    const user = await this.findBy({ email, deleted: false }, [
      "client",
      "permissionGroups",
      "permissionGroups.permissionGroup",
      "createdBy",
    ]);
    if (!user) {
      throw new BadRequestException("User not found");
    }
    if (!user.isActive) {
      if (user.createdBy) {
        throw new BadRequestException(
          "User not active yet, please activate it from the form sent to your email",
        );
      } else {
        throw new BadRequestException(
          "User not active yet, please contact us to activate your account",
        );
      }
    }

    if (user.failedLogins >= 3) {
      throw new BadRequestException(
        "Account is locked. Please contact your administrator",
      );
    }
    if (!(await bcrypt.compare(password, user.password))) {
      await this.userRepository.increment({ id: user.id }, "failedLogins", 1);
      throw new BadRequestException("Invalid Credentials");
    }

    user.failedLogins = 0;
    user.lastLogin = new Date().valueOf();
    await this.userRepository.save(user);

    const team = await this.teamService.getDefaultTeamForUser({
      id: user.id,
      clientId: user.clientId,
      username: user.email,
      teamId: null,
    });
    if (!team) {
      throw new NotFoundException(
        "You are not a member of any team! ask your administrator to add you to a team",
      );
    }
    return { ...user, teamId: team.id };
  }

  async inactiveUser(userId: string, clientId: string, action: string) {
    const user = await this.findBy({
      id: userId,
      clientId,
    });
    if (!user.verifiedAt) {
      throw new BadRequestException(
        "Cannot activate or deactivate user if they have not verified their email",
      );
    }
    if (action === "inactive") {
      user.isActive = false;
    } else if (action === "activate") {
      user.isActive = true;
    }
    await this.userRepository.save(user);
  }

  async resetPassword(user: UserDTO, update = true): Promise<void> {
    const userDB = await this.findBy({
      email: user.email,
      deleted: false,
    });
    if (!userDB) throw new NotFoundException("User not found");
    if (update) {
      await this.updateUser(userDB.id, user);
    }
    const newPass = await hashPassword(user.password);
    await this.userRepository.update(userDB.id, {
      password: newPass,
      isActive: true,
      ...(!userDB?.verifiedAt ? { verifiedAt: new Date().valueOf() } : {}),
    });
  }

  public async updateUser(
    userId: string,
    updated: {
      fname?: string;
      lname?: string;
      phone?: string;
      isActive?: boolean;
      email?: string;
      userType?: UserType;
      skillIds?: string[];
      isAdmin?: boolean;
      assignments?: { teamId: string; groupIds: number[] }[];
    },
    activate?: boolean,
  ): Promise<{ id: string }> {
    // fetch user
    const user = await this.userRepository.findOne({
      where: { id: userId, deleted: false },
      relations: ["createdBy"],
    });
    let updatedUser = false;
    if (!user) throw new NotFoundException("User not found");

    const oldValues = { ...user };

    if (activate) {
      user.verifiedAt = new Date().valueOf();
    }
    // apply updates
    if (updated.fname) user.fname = updated.fname;
    if (updated.lname) user.lname = updated.lname;
    if (updated.phone) user.phone = updated.phone;
    if (updated.email && user.verifiedAt && user.email !== updated.email) {
      throw new BadRequestException(
        "Cannot change email if user has verified their email",
      );
    }
    if (updated.email && user.email !== updated.email) {
      user.email = updated.email;
      updatedUser = true;
    }
    if (updated.isActive !== user.isActive && updated.isActive !== undefined) {
      if (!user.verifiedAt) {
        throw new BadRequestException(
          "Cannot activate or deactivate user if they have not verified their email",
        );
      }
      user.isActive = updated.isActive;
    }
    if (updated.userType && updated.userType !== user.userType) {
      user.userType = updated.userType;
    }

    const updateData: any = {};
    for (const key in user) {
      if (oldValues[key] !== user[key]) {
        updateData[key] = user[key];
      }
    }

    if (Object.keys(updateData).length > 0) {
      await this.userRepository
        .createQueryBuilder()
        .update(User)
        .set(updateData)
        .where("id = :id", { id: user.id })
        .execute();

      const currentUser = this.requestContextService.getUser();
      if (currentUser) {
        // this.queuePublisher.recordHistory({
        //   entityName: 'User',
        //   entityId: user.id,
        //   oldValues,
        //   newValues: user,
        //   action: 'UPDATE',
        //   user: currentUser,
        // });
      }
    }

    if (updatedUser) {
      // Check if an OTP already exists for this email
      let existingOtp = await this.otpRepository.findOne({
        where: { email: updated.email },
      });
      const code = `${Math.floor(Math.random() * 90000000) + 10000000}`;
      const created = new Date().valueOf() + 1000 * 60 * 60 * 24;

      if (existingOtp) {
        // Update existing OTP record
        existingOtp.code = code;
        existingOtp.created = created;
        existingOtp.clientId = user.clientId;
        await this.otpRepository.save(existingOtp);
      } else {
        // Create new OTP record
        await this.otpRepository.save({
          email: updated.email,
          code: code,
          client: { id: user.clientId },
          created: created,
        });
      }

      const link = `${
        process.env.FRONTEND_URL
      }/activate?email=${encodeURIComponent(
        updated.email,
      )}&code=${encodeURIComponent(code)}`;
      this.queuePublisher.sendEmail({
        to: updated.email,
        type: EmailType.ACTIVATION,
        replaceString: {
          name: updated.fname,
          added_by: user.createdBy?.fname,
          link,
        },
      });
    }

    if (updated.isAdmin) {
      await this.teamService.setAsAdmin(user.clientId, userId);
    } else if (updated.assignments?.length) {
      await this.teamService.setTeams(user.clientId, {
        userId,
        assignments: updated.assignments,
      });
    }

    return { id: user.id };
  }

  async saveIncomingEmail(data: {
    connector: Connector;
    from: string;
    subject: string;
    htmlText: string;
    text: string;
    messageId: string;
    creationDate: number;
    attachments?: string[];
  }) {
    const incomingEmail = new UserIncomingEmail();
    incomingEmail.id = uuidv4();
    incomingEmail.connector = data.connector;
    incomingEmail.from = data.from;
    incomingEmail.subject = data.subject;
    incomingEmail.htmlText = data.htmlText;
    incomingEmail.text = data.text;
    incomingEmail.messageId = data.messageId;
    incomingEmail.creationDate = data.creationDate;
    incomingEmail.attachments = data.attachments || [];

    return await this.incomingEmailRepository.save(incomingEmail);
  }

  async findIncomingEmailById(id: string, relations: string[] = []) {
    return await this.incomingEmailRepository.findOne({
      where: { id },
      relations,
    });
  }

  async findIncomingEmailByMessageId(messageId: string) {
    return await this.incomingEmailRepository.findOne({
      where: { messageId },
    });
  }

  async findIncomingEmailsByConnectorId(
    connectorId: string,
    relations: string[] = [],
  ) {
    return await this.incomingEmailRepository.find({
      where: { connectorId },
      relations,
      order: { creationDate: "DESC" },
    });
  }

  public async createUser(dto: UserDTO, user: any): Promise<any> {
    const newUser = await this.createUserObject(dto, user);

    const result = await this.userRepository.save(newUser);
    const userDB = await this.findBy({ id: result.id }, ["client"]);

    if (dto.isAdmin) {
      await this.teamService.setAsAdmin(user.clientId, result.id);
    } else if (dto.assignments?.length) {
      await this.teamService.setTeams(user.clientId, {
        userId: result.id,
        assignments: dto.assignments,
      });
    }

    if (newUser.createdBy) {
      const code = `${Math.floor(Math.random() * 90000000) + 10000000}`;
      await this.otpRepository.save({
        email: newUser.email,
        code,
        client: { id: newUser.client.id },
        created: new Date().valueOf() + 1000 * 60 * 60 * 24,
      });
      const link = `${
        process.env.FRONTEND_URL
      }/activate?email=${encodeURIComponent(
        newUser.email,
      )}&code=${encodeURIComponent(code)}`;
      this.queuePublisher.sendEmail({
        to: newUser.email,
        type: EmailType.ACTIVATION,
        replaceString: {
          name: newUser.fname,
          added_by: newUser.createdBy.fname,
          link,
        },
      });
    }
    this.queuePublisher.publishComplianceCheck({
      userId: user.id,
      clientId: user.clientId,
      teamId: user.teamId,
    });
    return { id: userDB.id };
  }

  public async unlockUser(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId, deleted: false },
    });
    if (!user) throw new NotFoundException("User not found");
    user.failedLogins = 0;
    await this.userRepository.save(user);
    return { id: user.id };
  }

  public async createUserObject(dto: UserDTO, user: any): Promise<User> {
    const emailExists = await this.emailExists(dto.email);
    if (emailExists) {
      throw new BadRequestException("Email already exists");
    }
    let createdBy;
    if (user.id) {
      createdBy = await this.findBy({ id: user.id });
    }
    const newUser = {
      id: uuidv4(),
      email: dto.email,
      fname: dto.fname,
      lname: dto.lname,
      password: await hashPassword(uuidv4(), true),
      createdAt: new Date().valueOf(),
      phone: dto.phone,
      userType: dto.userType || UserType.STANDARD,
      client: {
        id: user.clientId,
      },
      createdBy: createdBy,
      failedLogins: 0,
    } as User;
    return newUser;
  }

  async deleteUser(userId: string, clientId: string) {
    const user = await this.findBy({ id: userId, client: { id: clientId } });
    if (!user) throw new NotFoundException("User not found");
    await this.userRepository.update(userId, {
      isActive: false,
      deleted: true,
      email: `${user.email}-deleted-${new Date().valueOf()}`,
    });
  }
}
