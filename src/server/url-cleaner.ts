const TRACKING_PARAMS = new Set([
  // UTM
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
  // Google
  'gclid', 'gclsrc', 'dclid',
  // Facebook
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_ref', 'fb_source',
  // Mailchimp
  'mc_eid', 'mc_cid',
  // HubSpot
  'hsCtaTracking', '_hsenc', '_hsmi',
  // Marketo
  'mkt_tok',
  // Generic referral/source
  'ref', 'source', 'referrer', 'origin',
  // Twitter
  'twclid',
  // Microsoft
  'msclkid',
  // Bing
  'bingclickid',
  // Drip
  '__s',
  // Vero
  'vero_id', 'vero_conv',
  // Campaign Monitor
  'cm_null',
])

export function cleanUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return rawUrl
  }

  const params = parsed.searchParams
  const toDelete: string[] = []
  for (const key of params.keys()) {
    if (TRACKING_PARAMS.has(key)) {
      toDelete.push(key)
    }
  }
  for (const key of toDelete) {
    params.delete(key)
  }

  // Reconstruct cleanly — remove trailing ? if no params remain
  return parsed.toString()
}
