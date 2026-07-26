import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/** Retouches manuelles depuis le dashboard. Aucune n'est écrasée par un import. */
export class UpdateChannelDto {
  @ApiPropertyOptional({ description: 'Nom affiché dans la TV (remplace le nom source)' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  customName?: string | null;

  @ApiPropertyOptional({ description: 'Logo personnalisé (URL absolue)' })
  @IsUrl({ require_protocol: true })
  @IsOptional()
  customLogo?: string | null;

  @ApiPropertyOptional({ description: 'Groupe M3U forcé (group-title)', example: 'France' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  customGroup?: string | null;

  @ApiPropertyOptional({ description: 'Catégorie principale', example: 'news' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  category?: string | null;

  @ApiPropertyOptional({ description: 'Désactiver la chaîne (exclue de toutes les playlists)' })
  @IsBoolean()
  @IsOptional()
  isDisabled?: boolean;
}

export class AddManualStreamDto {
  @ApiPropertyOptional({ description: 'URL du flux dont tu disposes légalement' })
  @IsUrl({ require_protocol: true })
  url!: string;

  @ApiPropertyOptional({ example: '1080p' })
  @IsString()
  @IsOptional()
  quality?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  userAgent?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referrer?: string;
}
