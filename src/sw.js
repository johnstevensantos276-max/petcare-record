// Minimal service worker so Chrome/Edge offer "Install app" for PetCare.
// It does not cache anything: every request still goes to the server, so
// accounts stay in sync across devices.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
