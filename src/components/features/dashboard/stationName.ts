export function getLocalizedStationName(
  stationName: string | undefined | null,
  stationLabel: string,
) {
  if (!stationName) return stationLabel;

  const trimmed = stationName.trim();
  const match = trimmed.match(/^(?:tram|trạm|station)\s*(\d+)$/i);

  if (match) {
    return `${stationLabel} ${match[1]}`;
  }

  return trimmed;
}
