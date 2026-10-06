export function getUsernameInitials(username: string) {
  const parts = username.split('_').filter(Boolean)
  if (parts.length > 1) return parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return username.slice(0, 1).toUpperCase()
}
