import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Expose the build timestamp to the app so users can verify they're on the
  // latest deploy (iOS PWAs cache aggressively — this is the ground truth).
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // new deploys update the installed app automatically
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'IRON',
        short_name: 'IRON',
        description: 'Daily discipline tracker — build consistency in workouts, habits, and skills.',
        start_url: '/',
        display: 'standalone',
        background_color: '#080808',
        theme_color: '#080808',
        orientation: 'portrait',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell so it loads instantly + offline.
        // NEVER cache Supabase or the Rooney API — those must hit the network live.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('supabase.co') || url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
})
