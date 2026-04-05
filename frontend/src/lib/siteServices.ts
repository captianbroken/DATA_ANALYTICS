export type ServiceCode = 'PPE' | 'FRS';
export type SiteServiceStatus = 'active' | 'suspended' | 'inactive';

export interface SiteServiceRecord {
  id: number;
  site_id: number;
  service_id: number;
  service_code: ServiceCode;
  display_name: string;
  status: SiteServiceStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const getSiteServiceMap = (services: SiteServiceRecord[]) =>
  new Map<ServiceCode, SiteServiceRecord>(services.map(service => [service.service_code, service]));

export const getActiveServiceCodes = (services: SiteServiceRecord[]) =>
  services.filter(service => service.status === 'active').map(service => service.service_code);

export const hasActiveService = (services: SiteServiceRecord[], serviceCode: ServiceCode) =>
  services.some(service => service.service_code === serviceCode && service.status === 'active');

export const buildCameraModelOptions = (services: SiteServiceRecord[]) => {
  const activeCodes = new Set(getActiveServiceCodes(services));
  const options: Array<{ value: string; label: string }> = [];

  if (activeCodes.has('FRS')) {
    options.push({ value: 'FRS', label: 'FRS Only' });
  }

  if (activeCodes.has('PPE')) {
    options.push({ value: 'PPE', label: 'PPE Only' });
  }

  if (activeCodes.has('FRS') && activeCodes.has('PPE')) {
    options.push({ value: 'FRS+PPE', label: 'FRS + PPE' });
  }

  if (!options.length) {
    options.push({ value: 'PPE', label: 'No Active Service' });
  }

  return options;
};
