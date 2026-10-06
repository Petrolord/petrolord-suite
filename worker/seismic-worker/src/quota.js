// A user's seismic storage quota and usage, as the bucket policy computes
// them (QI Q0b-4). seismic_storage_quota_bytes_for follows the user's
// organization tier; before that migration is applied the flat
// seismic_storage_quota_bytes() (20 GiB) answers instead, so deploys do not
// depend on the apply order.
export async function seismicQuota(admin, uid) {
  const [usage, tier] = await Promise.all([
    admin.rpc('seismic_storage_usage_bytes_for', { p_user_id: uid }),
    admin.rpc('seismic_storage_quota_bytes_for', { p_user_id: uid }),
  ]);
  if (usage.error) throw new Error(`Could not check the storage quota: ${usage.error.message}`);
  let quota = tier.data;
  if (tier.error) {
    const flat = await admin.rpc('seismic_storage_quota_bytes');
    if (flat.error) throw new Error(`Could not check the storage quota: ${flat.error.message}`);
    quota = flat.data;
  }
  return { used: Number(usage.data) || 0, quota: Number(quota) };
}

/** The user-facing refusal when `need` more bytes do not fit. */
export function overQuotaMessage(what, need, { used, quota }) {
  const gib = (v) => (Number(v) / 1024 ** 3).toFixed(1);
  return `${what} needs ${gib(need)} GiB and you have ${gib(quota - used)} GiB of your ${gib(quota)} GiB seismic storage left. Delete a volume or ask for more space.`;
}
