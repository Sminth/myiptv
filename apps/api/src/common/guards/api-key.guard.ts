import { CanActivate, ExecutionContext, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { appConfig } from 'src/config/configuration';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Garde globale : l'API est privée. Tout ce qui n'est pas marqué `@Public()`
 * exige le header `x-api-key` (ou `?api_key=` pour les outils qui ne peuvent
 * pas envoyer de header).
 *
 * Si `ADMIN_API_KEY` est vide, la garde est désactivée avec un avertissement —
 * pratique en dev local, jamais en production (voir README).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private warned = false;

  constructor(
    private readonly reflector: Reflector,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.adminApiKey) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          '[Auth] ADMIN_API_KEY is empty — API guard disabled. Set it before exposing this server.',
        );
      }
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const provided =
      (request.headers['x-api-key'] as string | undefined) ??
      (typeof request.query.api_key === 'string' ? request.query.api_key : undefined);

    if (!provided || !safeEqual(provided, this.config.adminApiKey)) {
      throw new UnauthorizedException('Clé API invalide ou absente');
    }
    return true;
  }
}

/** Comparaison à temps constant (évite de fuiter la clé octet par octet). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
