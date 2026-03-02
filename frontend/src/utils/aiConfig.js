export function isAiConfigured(settings) {
  const provider = settings?.activeAiProvider
  if (!provider) return false
  const cfg = settings?.aiProviders?.[provider]
  if (!cfg?.key?.trim()) return false
  if (provider === 'custom' && !cfg?.url?.trim()) return false
  return true
}
