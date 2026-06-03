import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'piccnewyork.org',
    short_name: 'piccnewyork.org',
    description: 'piccnewyork.org territory, account, route, and calendar workflows in a mobile-first installable app.',
    start_url: '/territory',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#e6e6e9',
    theme_color: '#c93412',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
