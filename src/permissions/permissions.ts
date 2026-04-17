export enum PermissionScope {
  CLIENT = "client",
  ORG_UNIT = "org-unit",
}
export enum PermissionEnum {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
  MANAGE = "manage",
}

export const actions = ["create", "read", "update", "delete"];
export const vehicleJobPermission = {
  subject: "vehicle_jobs",
  label: "Vehicle Job",
  actions: actions,
  service_tag: "vehicle_jobs",
  base_route: "vehicle-jobs",
};
export const vehicleJobTypePermission = {
  subject: "vehicle_job_types",
  label: "Vehicle Job Type",
  actions: actions,
  service_tag: "vehicle_job_types",
  base_route: "vehicle-jobs/vehicle-job-types",
};

export const jobPermission = {
  subject: "jobs",
  label: "Job",
  actions: [],
  submodules: [vehicleJobPermission, vehicleJobTypePermission],
};

export const permissionPermission = {
  subject: "permissions",
  label: "Permission",
  actions: actions,
  service_tag: "permission",
  adminOnly: true,
};
export const cronJobPermission = {
  subject: "cron_jobs",
  label: "Cron Job",
  actions: actions,
  service_tag: "cron_jobs",
  base_route: "cron-jobs",
};
export const clientPermission = {
  subject: "clients",
  label: "Client",
  actions: actions,
  service_tag: "client",
  adminOnly: true,
};
export const userPermission = {
  subject: "users",
  label: "User",
  actions: actions,
  service_tag: "user",
};

export const approvalStrategyPermission = {
  subject: "approval_strategies",
  label: "Approval Strategy",
  actions: actions,
  service_tag: "documents",
  entityName: "ApprovalStrategy",
};

export const DocumentTypePermission = {
  subject: "document_types",
  label: "Document Type",
  actions: actions,
  service_tag: "documents",
  base_route: "plan/documents/settings",
};

export const checklistPermission = {
  subject: "checklists",
  label: "Checklist",
  actions: actions,
  service_tag: "checklists",
  base_route: "checklists",
};
export const changeRequestPermission = {
  subject: "change_requests",
  label: "Change Request",
  actions: actions,
  service_tag: "documents",
  base_route: "plan/documents/change-requests",
  entityName: "ChangeRequest",
};

export const DocumentPermission = {
  subject: "documents",
  label: "Document",
  actions: [...actions, "override_approve"],
  submodules: [
    DocumentTypePermission,
    approvalStrategyPermission,
    changeRequestPermission,
  ],
  service_tag: "documents",
  entityName: "Document",
};

export const reportPermission = {
  subject: "reports",
  label: "Report",
  actions: [PermissionEnum.READ],
  service_tag: "reports",
  base_route: "reports",
};

// Asset Management Permissions
export const assetsPermission = {
  subject: "assets",
  label: "Asset",
  actions: actions,
  service_tag: "assets",
  base_route: "assets",
  entity_route: "assets/@@id@@",
};

export const assetCategoryPermission = {
  subject: "asset_categories",
  label: "Asset Category",
  actions: actions,
  service_tag: "assets",
  base_route: "assets/categories",
};

export const assetModelPermission = {
  subject: "asset_models",
  label: "Asset Model",
  actions: actions,
  service_tag: "assets",
  base_route: "assets/models",
};

export const skillPermission = {
  subject: "skills",
  label: "Skill",
  actions: actions,
  service_tag: "skill",
  base_route: "skills",
};

export const teamPermission = {
  subject: "teams",
  label: "Team",
  actions: actions,
  service_tag: "teams",
  base_route: "teams",
};

export const workflowPermission = {
  subject: "workflows",
  label: "Workflow",
  actions: actions,
  service_tag: "workflows",
  base_route: "workflows",
};

export const emailWorkflowCategoryPermission = {
  subject: "email_workflow_categories",
  label: "Email Workflow Category",
  actions: actions,
  service_tag: "workflows",
  base_route: "email-categories",
};

export const connectorPermission = {
  subject: "connectors",
  label: "Connector",
  actions: actions,
  service_tag: "connectors",
  base_route: "connectors",
};

export const customerPermission = {
  subject: "customers",
  label: "Customer",
  actions: actions,
  service_tag: "customers",
  base_route: "customers",
};

interface PermissionTree {
  subject: string;
  label: string;
  actions: string[];
  submodules?: PermissionTree[];
  service_tag?: string;
  entityName?: string;
  adminOnly?: boolean;
}

export const permissions: {
  [key: string]: PermissionTree;
} = {
  userPermission,
  workflowPermission,
  emailWorkflowCategoryPermission,
  teamPermission,
};

export const permissionTree: {
  [key: string]: PermissionTree;
} = {
  teamPermission,
  userPermission,
  emailWorkflowCategoryPermission,
};

export const defaultPermissionGroups = [
  {
    name: "Admin",
    permissions: [
      {
        subject: "all",
        action: "manage",
      },
    ],
    description:
      "Admin permission group gives access to all modules and features",
  },
  {
    name: "Team Manager",
    permissions: Object.values(permissions)
      .filter((permission) => !permission.adminOnly)
      .map((permission) => ({
        subject: permission.subject,
        action: "manage",
      })),
    description: "Fleet Ops permission group gives access to Fleet Ops Modules",
  },
];
