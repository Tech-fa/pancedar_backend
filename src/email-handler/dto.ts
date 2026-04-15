import { EmailType } from '../common/dto';

export interface EmailHandlerDTO {
  to: string;
  type: EmailType;
  replaceString: { [key: string]: string };
  subject?: string;
}
