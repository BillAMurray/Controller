export function parseServices(yamlText) {
  if (!yamlText) return []
  const services = []
  const lines = yamlText.split('\n')
  let inServices = false
  let current = null

  for (const line of lines) {
    // New top-level key — track whether we're in the services block
    if (/^\S/.test(line)) {
      inServices = /^services\s*:/.test(line)
      current = null
      continue
    }

    // Two-space-indented service name (only inside services block)
    if (inServices) {
      const svcMatch = line.match(/^  (\w[\w-]*):\s*$/)
      if (svcMatch) {
        current = { name: svcMatch[1], image: '', containerName: svcMatch[1] }
        services.push(current)
        continue
      }
    }

    // Capture image and container_name for the current service
    if (current) {
      const img = line.match(/^\s+image:\s*(.+)/)
      if (img) current.image = img[1].trim().replace(/^["']|["']$/g, '')
      const cn = line.match(/^\s+container_name:\s*(.+)/)
      if (cn) current.containerName = cn[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  return services
}
