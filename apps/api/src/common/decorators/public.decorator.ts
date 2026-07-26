import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Route accessible sans clé d'administration : typiquement les URL M3U/EPG
 * collées dans la TV (un lecteur IPTV ne sait pas envoyer de header custom).
 * Ces routes sont protégées par un jeton dans l'URL à la place.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
