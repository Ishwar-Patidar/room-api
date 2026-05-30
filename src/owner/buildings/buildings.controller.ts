import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BuildingsService } from './buildings.service';
import {
  BuildingResponseDto,
  BuildingSummaryDto,
  CreateBuildingDto,
  UpdateBuildingDto,
} from './dto/building.dto';

@ApiTags('Owner — Buildings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
@Controller('owner/buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  // ─── Create Building ───────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new building (OWNER only)' })
  @ApiCreatedResponse({ type: BuildingResponseDto })
  @ApiForbiddenResponse({ description: 'Only OWNER role can create buildings' })
  async createBuilding(
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: CreateBuildingDto,
  ): Promise<BuildingResponseDto> {
    return this.buildingsService.createBuilding(user.id, dto);
  }

  // ─── Get My Buildings ──────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get all buildings owned by the current user' })
  @ApiOkResponse({ type: [BuildingSummaryDto] })
  async getMyBuildings(
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<BuildingSummaryDto[]> {
    return this.buildingsService.getMyBuildings(user.id);
  }

  // ─── Get Building Details ──────────────────────────────────────────────────

  @Get(':buildingId')
  @ApiOperation({ summary: 'Get details of a specific building' })
  @ApiParam({ name: 'buildingId', type: String })
  @ApiOkResponse({ type: BuildingResponseDto })
  @ApiNotFoundResponse({ description: 'Building not found' })
  @ApiForbiddenResponse({ description: 'You do not own this building' })
  async getBuildingById(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @CurrentUser() user: Omit<User, 'password'>,
  ): Promise<BuildingResponseDto> {
    return this.buildingsService.getBuildingById(buildingId, user.id);
  }

  // ─── Update Building ───────────────────────────────────────────────────────

  @Patch(':buildingId')
  @ApiOperation({ summary: 'Update building details' })
  @ApiParam({ name: 'buildingId', type: String })
  @ApiOkResponse({ type: BuildingResponseDto })
  @ApiNotFoundResponse({ description: 'Building not found' })
  @ApiForbiddenResponse({ description: 'You do not own this building' })
  async updateBuilding(
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @CurrentUser() user: Omit<User, 'password'>,
    @Body() dto: UpdateBuildingDto,
  ): Promise<BuildingResponseDto> {
    return this.buildingsService.updateBuilding(buildingId, user.id, dto);
  }
}
