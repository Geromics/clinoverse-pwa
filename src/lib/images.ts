// Provider logos are served by clino at /images/<providerImage> (compose volumes/common/images).
import { getServerUrl } from './settings';

export const providerImageUrl = (image?: string) => (image ? `${getServerUrl()}/images/${encodeURIComponent(image)}` : null);

/* Fallback avatar: the first letter or digit of the name. */
export const initialOf = (name?: string) => (name?.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
