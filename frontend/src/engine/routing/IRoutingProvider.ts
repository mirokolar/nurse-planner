import type { LatLng } from '../types';

export interface IRoutingProvider {
  /** Geocoduje adresu na GPS souřadnice. Vrátí null při selhání. */
  geocode(address: string): Promise<LatLng | null>;

  /**
   * Vrátí matici dob jízdy autem (v sekundách) mezi všemi dvojicemi bodů.
   * sources[i] -> destinations[j] = matrix[i][j]
   */
  getDurationMatrix(points: LatLng[]): Promise<number[][]>;
}
