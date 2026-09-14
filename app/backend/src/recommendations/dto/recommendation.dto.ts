import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator'
import type { RankingPreferencesInput } from '../ranking-weights'

export type RankingPriority = 'Balanced' | 'Availability' | 'Speed' | 'Savings'

export class RecommendationDto {
  @IsOptional() @IsString() query?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number
  @IsOptional() @IsIn(['Balanced', 'Availability', 'Speed', 'Savings']) rankingPriority?: RankingPriority =
    'Balanced'
  @IsOptional() @IsObject() rankingPreferences?: RankingPreferencesInput
  @IsOptional() @IsBoolean() routeFromCurrentLocation?: boolean
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) routeOriginLatitude?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) routeOriginLongitude?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) routeDestinationLatitude?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) routeDestinationLongitude?: number
  @IsOptional()
  @IsIn(['Any', 'CCS2', 'Type 2', 'CHAdeMO'])
  connector: 'Any' | 'CCS2' | 'Type 2' | 'CHAdeMO' = 'Any'
  @IsOptional() @Type(() => Number) @Min(1) @Max(50) radiusKm?: number = 8
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(500) energyKwh?: number = 35
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) maxPrice?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) minPowerKw?: number
  @IsOptional() @IsBoolean() availableOnly?: boolean
  @IsOptional() @IsString() operator?: string
  @IsOptional() @IsDateString() evaluationAt?: string
}
