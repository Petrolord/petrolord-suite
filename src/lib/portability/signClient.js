// Ask the platform to sign a manifest and issue a Certificate of Export
// (Project Portability PP5). Never blocks an export: when the function is
// not deployed, not configured, or unreachable, the package stays unsigned
// and the caller shows that plainly.

import { supabase } from '@/lib/customSupabaseClient';

/**
 * @returns {Promise<{ signature: {alg, key_id, value}, certificate: { certificate_no, verification_code, download_url, manifest_digest } } | { signature: null, reason: string }>}
 */
export async function requestSignature(manifest, { exporterEmail = null, organizationName = null } = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('pld-sign', {
      body: { action: 'sign', manifest, exporter_email: exporterEmail, organization_name: organizationName },
    });
    if (error) return { signature: null, reason: error.message || 'signing service unavailable' };
    if (!data?.signature) return { signature: null, reason: data?.reason || 'unconfigured' };
    return data;
  } catch (e) {
    return { signature: null, reason: e?.message || 'signing service unavailable' };
  }
}

/** A fresh download link for the caller's own certificate, or null. */
export async function certificateLink(packageId) {
  try {
    const { data, error } = await supabase.functions.invoke('pld-sign', { body: { action: 'certificate', package_id: packageId } });
    if (error || !data?.found) return null;
    return { certificate_no: data.certificate_no, download_url: data.download_url };
  } catch (e) {
    return null;
  }
}

/** Plain copy for the export summary. */
export function signingNote(result) {
  if (result?.signature) return `Signed by Petrolord (key ${result.signature.key_id}). Certificate of Export ${result.certificate?.certificate_no || ''} issued.`.trim();
  const why = result?.reason === 'unconfigured' ? 'signing is not set up on this platform yet' : (result?.reason || 'the signing service was unavailable');
  return `This package is not signed (${why}). Its file checksums still let an importer verify it is complete.`;
}
