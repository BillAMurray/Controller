export function parseServices(yamlText) {
  if (!yamlText) return []
  const services = []
  const lines = yamlText.split('\n')
  let inServices = false
  let current = null

  for (const line of lines) {
    if (/^services\s*:/.test(line)) { inServices = true; continue }
    if (inServices && /^  (\w[\w-]*):\s*$/.test(line)) {
      const name = line.trim().replace(':', '')
      current = { name, image: '', containerName: name }
      services.push(current)
    }
    if (current) {
      const img = line.match(/^\s+image:\s*(.+)/)
      if (img) current.image = img[1].trim()
      const cn = line.match(/^\s+container_name:\s*(.+)/)
      if (cn) current.containerName = cn[1].trim()
    }
  }
  return services
}
