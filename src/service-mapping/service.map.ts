import { Provider } from "@nestjs/common";
import { UsersService } from "../user/user.service";
import { HistoryService } from "../history/history.service";
import { PermissionService } from "../permissions/permission.service";

export const SERVICE_MAP = "SERVICE_MAP";

export const ServiceMapProvider: Provider = {
  provide: SERVICE_MAP,
  useFactory: (
    userService: UsersService,
    permissionService: PermissionService,
    historyService: HistoryService,
  ) => ({
    users: userService,
    permissions: permissionService,
    history: historyService,  
  }),
  inject: [
    UsersService,
    PermissionService,  
    HistoryService,
  ],
};
