export default defineEventHandler((event) => {
  const origin = getRequestURL(event).origin
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /account',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /verify-email',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
})
