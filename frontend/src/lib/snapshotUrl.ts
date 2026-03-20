const flaskApiBase = (import.meta.env.VITE_FLASK_API_URL?.trim() || 'http://localhost:5000').replace(/\/+$/, '');

const encodePathSegments = (value: string) =>
  value
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');

export const resolveSnapshotUrl = (imagePath: string | null | undefined) => {
  const rawValue = imagePath?.trim();
  if (!rawValue) return null;

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  const normalized = rawValue.replace(/\\/g, '/');

  if (normalized.startsWith('/api/detections/')) {
    return `${flaskApiBase}${normalized}`;
  }

  if (normalized.startsWith('api/detections/')) {
    return `${flaskApiBase}/${normalized}`;
  }

  const detectionPathMatch = normalized.match(/(?:^|\/)detections\/(.+)$/i);
  if (detectionPathMatch?.[1]) {
    return `${flaskApiBase}/api/detections/${encodePathSegments(detectionPathMatch[1])}`;
  }

  const filenameMatch = normalized.match(/([^/]+\.(?:png|jpe?g|gif|webp|bmp|svg))$/i);
  if (filenameMatch?.[1]) {
    return `${flaskApiBase}/api/detections/${encodeURIComponent(filenameMatch[1])}`;
  }

  return null;
};
