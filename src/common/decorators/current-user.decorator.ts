import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

/**
 * Extracts the authenticated user from the request object.
 *
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: User) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Omit<User, 'password'> => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
