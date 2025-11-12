import { supabaseAdmin } from '@/lib/supabase/admin'

export interface CompanyLogoSetting {
  readonly url: string | null
  readonly storage_path: string | null
}

/**
 * Recupera le impostazioni per il logo aziendale da Supabase.
 */
export async function getCompanyLogoSetting(): Promise<CompanyLogoSetting> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'company_logo')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return { url: null, storage_path: null }
    }
    console.error('[settings-service] Failed to load company logo:', error)
    throw error
  }

  const value = (data?.value ?? {}) as Partial<CompanyLogoSetting> | null
  return {
    url: value?.url ?? null,
    storage_path: value?.storage_path ?? null,
  }
}


