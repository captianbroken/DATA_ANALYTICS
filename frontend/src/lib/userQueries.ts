import { supabase } from './supabase';

const isMissingSiteIdColumn = (error: any) =>
  error?.code === '42703' || /users\.site_id|column .*site_id.* does not exist/i.test(error?.message || '');

export interface UserQueryResult<T> {
  data: T[] | T | null;
  error: any;
  siteAssignmentAvailable: boolean;
}

export const selectUsersWithOptionalSite = async <T>(
  baseSelectWithSite: string,
  baseSelectWithoutSite: string,
  apply: (query: any) => any,
): Promise<UserQueryResult<T>> => {
  const firstQuery = apply(supabase.from('users').select(baseSelectWithSite));
  const firstResult = await firstQuery;

  if (!firstResult.error || !isMissingSiteIdColumn(firstResult.error)) {
    return {
      data: (firstResult.data as T[] | T | null) ?? null,
      error: firstResult.error,
      siteAssignmentAvailable: true,
    };
  }

  const fallbackQuery = apply(supabase.from('users').select(baseSelectWithoutSite));
  const fallbackResult = await fallbackQuery;

  return {
    data: (fallbackResult.data as T[] | T | null) ?? null,
    error: fallbackResult.error,
    siteAssignmentAvailable: false,
  };
};

export const userSiteIdColumnMissing = isMissingSiteIdColumn;
