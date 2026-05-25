import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to specific roles.
 *
 * Usage:
 *   @Roles(UserRole.OWNER)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Get('buildings')
 *   getBuildings() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
