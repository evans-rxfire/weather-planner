const CACHE_NAME = "RxWx-cache-v1";
const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./styles.css",
    "./manifest.json",
    "./js/main.js",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];


self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keyList) =>
        Promise.all(
            keyList.map((key) => {
            if (key !== CACHE_NAME) {
                return caches.delete(key);
            }
            })
        )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
