import type { IRoutingProvider } from './IRoutingProvider';
import { OrsProvider } from './OrsProvider';

export function createRoutingProvider(): IRoutingProvider {
  const provider = import.meta.env.VITE_MAP_PROVIDER ?? 'openrouteservice';
  if (provider === 'openrouteservice') {
    const key = import.meta.env.VITE_ORS_API_KEY;
    if (!key) throw new Error('Chybí VITE_ORS_API_KEY v .env');
    return new OrsProvider(key);
  }
  throw new Error(`Nepodporovaný mapový provider: ${provider}`);
}
