import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;    // userId
  mobile: string;
  role: UserRole;
}
