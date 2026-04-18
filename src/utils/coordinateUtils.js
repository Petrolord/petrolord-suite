export const formatCoordinates = (lat, lon) => {
  if (lat === null || lon === null || lat === undefined || lon === undefined) return 'N/A';
  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
};

export const getExampleCoordinates = () => ({
  latitude: { decimal: '29.7604', dms: '29° 45\' 37.44" N' },
  longitude: { decimal: '-95.3698', dms: '95° 22\' 11.28" W' }
});

export const calculateDestinationPoint = (start, bearing, distance) => {
  // Simple flat earth approximation for UI responsiveness
  // In production, use Haversine or Vincenty
  const R = 6371e3; // Earth radius in meters
  const ad = distance / R; // angular distance
  const lat1 = start.lat * Math.PI / 180;
  const lon1 = start.lon * Math.PI / 180;
  const brng = bearing * Math.PI / 180;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ad) + Math.cos(lat1) * Math.sin(ad) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(ad) * Math.cos(lat1), Math.cos(ad) - Math.sin(lat1) * Math.sin(lat2));

  return {
    lat: lat2 * 180 / Math.PI,
    lon: lon2 * 180 / Math.PI
  };
};

export const decimalToDMS = (decimal, isLatitude) => {
  if (decimal === null || decimal === undefined || isNaN(decimal)) return '';
  
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(2);
  
  let direction = '';
  if (isLatitude) {
    direction = decimal >= 0 ? 'N' : 'S';
  } else {
    direction = decimal >= 0 ? 'E' : 'W';
  }
  
  return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
};

export const dmsToDecimal = (dmsString) => {
  if (!dmsString) return '';
  
  // Basic parsing logic - assumes format like 29° 45' 37.44" N
  // This regex is a bit simplified but covers standard formats
  const regex = /(\d+)[°\s]+(\d+)[',\s]+([\d.]+)[",\s]+([NSEW])/i;
  const match = dmsString.match(regex);
  
  if (!match) return dmsString; // Return original if parse fails, might be decimal already
  
  const degrees = parseFloat(match[1]);
  const minutes = parseFloat(match[2]);
  const seconds = parseFloat(match[3]);
  const direction = match[4].toUpperCase();
  
  let decimal = degrees + minutes / 60 + seconds / 3600;
  
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }
  
  return decimal;
};

export const validateCoordinate = (value, isLatitude) => {
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  
  if (isLatitude) {
    return num >= -90 && num <= 90;
  } else {
    return num >= -180 && num <= 180;
  }
};

export const latLngToUtm = (lat, lng) => {
  // WGS84 Constants
  const a = 6378137.0;
  const eccSquared = 0.00669438;
  const k0 = 0.9996;

  const toRadians = (deg) => (deg * Math.PI) / 180;

  // Determine Zone
  const zoneNumber = Math.floor((lng + 180) / 6) + 1;
  
  // Central Meridian of the zone
  const zoneCentralMeridian = (zoneNumber - 1) * 6 - 180 + 3;
  
  const latRad = toRadians(lat);
  const longRad = toRadians(lng);
  const longOriginRad = toRadians(zoneCentralMeridian);

  const eccPrimeSquared = eccSquared / (1 - eccSquared);

  const N = a / Math.sqrt(1 - eccSquared * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = eccPrimeSquared * Math.cos(latRad) * Math.cos(latRad);
  const A = Math.cos(latRad) * (longRad - longOriginRad);

  const M = a * (
    (1 - eccSquared / 4 - (3 * eccSquared * eccSquared) / 64 - (5 * eccSquared * eccSquared * eccSquared) / 256) * latRad -
    ((3 * eccSquared) / 8 + (3 * eccSquared * eccSquared) / 32 + (45 * eccSquared * eccSquared * eccSquared) / 1024) * Math.sin(2 * latRad) +
    ((15 * eccSquared * eccSquared) / 256 + (45 * eccSquared * eccSquared * eccSquared) / 1024) * Math.sin(4 * latRad) -
    ((35 * eccSquared * eccSquared * eccSquared) / 3072) * Math.sin(6 * latRad)
  );

  const UTMEasting = k0 * N * (A + (1 - T + C) * A * A * A / 6 + (5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSquared) * A * A * A * A * A / 120) + 500000.0;

  let UTMNorthing = k0 * (M + N * Math.tan(latRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24 + (61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSquared) * A * A * A * A * A * A / 720));

  if (lat < 0) {
    UTMNorthing += 10000000.0;
  }

  return {
    x: UTMEasting,
    y: UTMNorthing,
    zone: zoneNumber,
    hemisphere: lat >= 0 ? 'N' : 'S'
  };
};