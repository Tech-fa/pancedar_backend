import { Provider } from "@nestjs/common";

export const SERVICE_MAP = "SERVICE_MAP";

export const ServiceMapProvider: Provider = {
  provide: SERVICE_MAP,
  useFactory: () => ({
  }),
  inject: [],
};
