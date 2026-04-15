export class ClientDTO {
  id: string;
  companyName: string;
  workingDays: WorkingDaysDTO;
}

export class ClientAccountDTO {
  id: string;
  companyName: string;
  domain: string;
  logoKey: string | null;
  logoUrl: string | null;
}
export class WorkingDaysDTO {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}
