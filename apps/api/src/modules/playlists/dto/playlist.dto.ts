import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlaylistSort } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Règles de sélection d'une playlist. Elles s'additionnent (union) : une chaîne
 * entre dans la playlist si elle satisfait AU MOINS une règle, puis les filtres
 * globaux (actif, HD…) s'appliquent en intersection.
 *
 * Sans aucune règle, la playlist retombe sur la curation (`onlyWanted`) — jamais
 * sur « toutes les chaînes » : c'est exactement ce qu'on cherche à éviter.
 */
export class PlaylistRulesDto {
  @ApiPropertyOptional({ example: ['FR', 'CI'], description: 'Codes pays' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  countries?: string[];

  @ApiPropertyOptional({ example: ['AFR'], description: 'Codes régions' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  regions?: string[];

  @ApiPropertyOptional({ example: ['fra'], description: 'Codes langue ISO 639-3' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];

  @ApiPropertyOptional({ example: ['news', 'documentary'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @ApiPropertyOptional({ description: 'Groupes de curation', example: ['France', 'Documentaire'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  groups?: string[];

  @ApiPropertyOptional({ description: 'Chaînes ajoutées explicitement (id, slug ou id iptv-org)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  channels?: string[];

  @ApiPropertyOptional({ description: 'Chaînes exclues (id, slug ou id iptv-org)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  excludeChannels?: string[];

  @ApiPropertyOptional({ default: false, description: 'Inclure tous les favoris' })
  @IsBoolean()
  @IsOptional()
  includeFavorites?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Inclure toutes les chaînes curées' })
  @IsBoolean()
  @IsOptional()
  includeWanted?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Exclure les chaînes sans flux qui répond' })
  @IsBoolean()
  @IsOptional()
  onlyActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Inclure les chaînes dont le seul flux est un direct YouTube officiel. ' +
      'Désactivé par défaut : TiviMate et la plupart des lecteurs Android TV ne savent pas les lire (VLC, oui).',
  })
  @IsBoolean()
  @IsOptional()
  includeYoutube?: boolean;

  @ApiPropertyOptional({
    type: () => [PlaylistRulesDto],
    description:
      'Ensembles ajoutés en OU, chacun avec ses propres dimensions en ET. ' +
      'Ex. pays FR+CI dans la règle principale, et `union: [{ regions: ["AFR"], languages: ["fra"] }]` ' +
      'pour ajouter les africaines francophones. Un seul niveau de profondeur.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistRulesDto)
  @IsOptional()
  union?: PlaylistRulesDto[];

  @ApiPropertyOptional({ default: false, description: 'HD uniquement (720p+)' })
  @IsBoolean()
  @IsOptional()
  hdOnly?: boolean;

  @ApiPropertyOptional({ description: 'Plafond de chaînes par rubrique' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxPerGroup?: number;

  @ApiPropertyOptional({ description: 'Plafond global de chaînes' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}

export class CreatePlaylistDto {
  @ApiPropertyOptional({ example: 'Playlist Maison' })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Slug de l’URL. Généré depuis le nom si absent.' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: PlaylistRulesDto })
  @ValidateNested()
  @Type(() => PlaylistRulesDto)
  @IsOptional()
  rules?: PlaylistRulesDto;

  @ApiPropertyOptional({ enum: PlaylistSort, default: PlaylistSort.PRIORITY })
  @IsEnum(PlaylistSort)
  @IsOptional()
  sort?: PlaylistSort;
}

export class UpdatePlaylistDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: PlaylistRulesDto })
  @ValidateNested()
  @Type(() => PlaylistRulesDto)
  @IsOptional()
  rules?: PlaylistRulesDto;

  @ApiPropertyOptional({ enum: PlaylistSort })
  @IsEnum(PlaylistSort)
  @IsOptional()
  sort?: PlaylistSort;
}
