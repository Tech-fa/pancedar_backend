import { BadRequestException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UsersService } from "../user/user.service";
import { User } from "../user/user.entity";
import { RegisterDTO, UserDTO } from "../user/user.dto";
import { Otp } from "../user/otp.entity";
import { ClientService } from "../client/client.service";
import { Client } from "../client/client.entity";
import { PermissionGroup } from "../permissions/permission-group.entity";
import { defaultPermissionGroups } from "../permissions/permissions";
import { QueuePublisher } from "../queue/queue.publisher";
import { EmailType } from "../common/dto";
import { UserRequest } from "../permissions/dto";
import { hashPassword } from "../util/helper-util";
import { UserPermissionGroup } from "../permissions/user-permission-group.entity";
import { TeamService } from "../team/team.service";
import { Team, TeamMember } from "../team/team.entity";
import { v4 as uuidv4 } from "uuid";
@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly clientService: ClientService,
    private jwtService: JwtService,
    @InjectRepository(Otp)
    private otpRepository: Repository<Otp>,
    private readonly queuePublisher: QueuePublisher,
    private readonly teamService: TeamService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    return this.userService.checkUser(username, pass);
  }

  async login(user: User & { teamId: string }) {
    this.queuePublisher.publishHistory({
      entityType: "User",
      entityId: user.id,
      changes: {},
      action: "LOGIN",
      userId: user.id,
      clientId: user.client.id,
    });

    return {
      access_token: this.getToken(user, user.teamId),
      ...(await this.getUserDetails(user)),
    };
  }

  async renewToken(user: UserRequest, teamId?: string) {
    const userDB = await this.userService.findBy({ id: user.id }, [
      "client",
      "permissionGroups",
      "permissionGroups.permissionGroup",
    ]);
    const teamIds = await this.teamService.getTeamIdsForUser(user);
    if (teamId && !teamIds.includes(teamId)) {
      throw new BadRequestException("Invalid team");
    }

    return {
      access_token: this.getToken(userDB, teamId || user.teamId),
      ...(await this.getUserDetails(userDB)),
    };
  }

  getToken(user, teamId: string) {
    const payload = {
      username: user.email,
      id: user.id,
      clientId: user.client.id,
      teamId: teamId,
    };
    return this.jwtService.sign(payload);
  }
  async register(user: RegisterDTO) {
    const queryRunner = this.otpRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let client = await this.clientService.createClient(
        user.companyName,
        user.email.split("@")[1],
      );
      const newUser = await this.userService.createUserObject(
        {
          fname: user.fname,
          lname: user.lname,
          email: user.email,
          password: uuidv4(),
        } as UserDTO,
        { clientId: client.id },
      );
      newUser.password = await hashPassword(newUser.password);
      client = await queryRunner.manager.save(Client, {
        ...client,
      });
      let adminPermissionGroup: PermissionGroup;
      for (const permission of defaultPermissionGroups) {
        const newGroup = await queryRunner.manager.save(PermissionGroup, {
          name: permission.name,
          clientId: client.id,
          permissions: permission.permissions,
          description: permission.description,
        });
        if (permission.name === "Admin") {
          adminPermissionGroup = newGroup;
        }
      }

      await queryRunner.manager.save(User, {
        ...newUser,
      });
      const team = await queryRunner.manager.save(
        Team,
        new Team({
          name: "Default Team",
          clientId: client.id,
          createdAt: new Date().valueOf(),
          updatedAt: new Date().valueOf(),
        }),
      );
      const teamMember = new TeamMember({
        user: newUser,
        team: team,
        clientId: client.id,
        createdAt: Date.now(),
      });
      await queryRunner.manager.save(teamMember);
      await queryRunner.manager.save(UserPermissionGroup, {
        user: newUser,
        permissionGroup: adminPermissionGroup,
        client: { id: client.id },
        teamId: team.id,
      });

      await queryRunner.commitTransaction();
      const code = await this.createCode(user.email, client.id);
      this.queuePublisher.publishEmail({
        to: user.email,
        type: EmailType.REGISTRATION,
        replaceString: {
          company: user.companyName,
          name: user.fname + " " + user.lname,
          link: `${
            process.env.FRONTEND_URL
          }/activate/?code=${encodeURIComponent(
            code,
          )}&email=${encodeURIComponent(user.email)}`,
        },
      });
      return "done";
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createCode(email: string, clientId: string, long = false) {
    let otp = await this.otpRepository.findOne({ where: { email } });

    if (!otp) {
      otp = new Otp();
      otp.email = email;
    }

    otp.created = new Date().valueOf();
    if (long) {
      otp.created = new Date().valueOf() + 1000 * 60 * 60 * 24;
      otp.code = `${Math.floor(Math.random() * 90000000) + 10000000}`;
    } else {
      otp.code = `${Math.floor(Math.random() * 900000) + 100000}`;
    }
    otp.client = { id: clientId } as Client;

    await this.otpRepository.save(otp);
    return otp.code;
  }

  async createCodeForReset(email: string) {
    let user = await this.userService.findBy({ email, isActive: true }, [
      "createdBy",
      "client",
    ]);
    if (!user) {
      throw new BadRequestException("invalid user email");
    }
    const code = await this.createCode(email, user.client.id);
    this.queuePublisher.publishEmail({
      to: email,
      type: EmailType.RESET_PASSWORD,
      replaceString: {
        code,
      },
    });

    return user.createdBy ? "needs registration" : "done";
  }

  async createCodeForActivation(email: string, creator: UserRequest) {
    let user = await this.userService.findBy(
      { email, isActive: false, clientId: creator.clientId },
      ["createdBy", "client"],
    );
    if (!user) {
      throw new BadRequestException("invalid user email");
    }
    const code = await this.createCode(email, user.client.id, true);
    this.queuePublisher.publishEmail({
      to: email,
      type: EmailType.ACTIVATION,
      replaceString: {
        added_by: user.createdBy.fname + " " + user.createdBy.lname,
        name: user.fname + " " + user.lname,
        link: `${process.env.FRONTEND_URL}/activate/?code=${encodeURIComponent(
          code,
        )}&email=${encodeURIComponent(email)}`,
      },
    });
    return "done";
  }
  async verifyCode(email: string, code: string, timeout = 300000) {
    let otp = await this.otpRepository.findOne({
      where: { email, code },
    });
    if (!otp || +otp.created + timeout < new Date().valueOf()) {
      throw new BadRequestException("Invalid validation code!");
    }
    return otp;
  }
  async deleteCode(otp: Otp) {
    await this.otpRepository.delete(otp);
  }

  async resetPassword(user: UserDTO, code: string) {
    let otp = await this.verifyCode(user.email, code);
    await this.userService.resetPassword(user);
    await this.deleteCode(otp);

    return "done";
  }

  async activate(user: { code: string; email: string; password: string }) {
    let otp = await this.verifyCode(user.email, user.code, 1000 * 60 * 24 * 5);
    await this.userService.resetPassword(
      {
        email: user.email,
        password: user.password,
      } as UserDTO,
      false,
    );
    await this.deleteCode(otp);
  }

  async getUserDetails(user: User) {
    return {
      user: {
        id: user.id,
        companyName: user.client.companyName,
        permissions: user.permissionGroups
          .map((pg) =>
            pg.permissionGroup.permissions.map((p) => ({
              subject: p.subject,
              action: p.action,
            })),
          )
          .flat(),
      },
    };
  }
}
