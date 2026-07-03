// JaSH OTT - Main Application Logic
// Stremio Addon: https://stremiotesting-production.up.railway.app

const BASE_URL = (window.JASH_CONFIG && window.JASH_CONFIG.BASE_URL) 
    ? window.JASH_CONFIG.BASE_URL 
    : 'https://stremiotesting-production.up.railway.app';

let currentCatalog = { type: 'movie', id: 'm3u-movies', skip: 0 };
let currentItems = [];
let currentPlayer = null;
let loadedCount = 0; // Track how many items are currently displayed

const catalogCache = {};

const ITEMS_PER_PAGE = 12;
const RENDER_BATCH = 4;

function initializeTailwind() {
    const style = document.createElement('style');
    style.innerHTML = `
        .catalog-tab.active { background: rgba(0, 240, 255, 0.1); color: #00f0ff; border-color: #00f0ff; }
        .poster-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; }
        .poster-card:hover { transform: translateY(-12px) scale(1.03); }
        .poster-card::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 40%, rgba(15, 23, 42, 0.85) 90%); }
        .poster-img { transition: transform .4s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .poster-card:hover .poster-img { transform: scale(1.08); }
    `;
    document.head.appendChild(style);
}

function showLoading(show) {
    const loader = document.getElementById('loading-indicator');
    if (!loader) return;
    
    if (show) {
        loader.classList.remove('hidden');
        loader.classList.add('flex');
    } else {
        loader.classList.remove('flex');
        loader.classList.add('hidden');
    }
}

async function fetchCatalog(type, catalogId, skip = 0, limit = null) {
    const cacheKey = `${type}-${catalogId}`;

    // If we have cache and asking for first page
    if (catalogCache[cacheKey] && skip === 0) {
        const cachedItems = catalogCache[cacheKey];
        return limit ? cachedItems.slice(0, limit) : cachedItems;
    }

    showLoading(true);
    try {
        const url = `${BASE_URL}/catalog/${type}/${catalogId}.json?skip=${skip}`;
        const res = await fetch(url);
        const data = await res.json();
        let items = data.metas || [];

        // Only cache first page
        if (skip === 0) {
            catalogCache[cacheKey] = items;
        }

        // Apply limit only for initial load
        if (skip === 0 && limit) {
            items = items.slice(0, limit);
        }

        return items;
    } catch (err) {
        console.error(err);
        return [];
    } finally {
        showLoading(false);
    }
}

async function fetchStreams(type, id) {
    try {
        const url = `${BASE_URL}/stream/${type}/${id}.json`;
        const res = await fetch(url);
        const data = await res.json();
        return data.streams || [];
    } catch (err) {
        console.error('Error fetching streams:', err);
        return [];
    }
}

function renderItems(items, append = false) {
    const grid = document.getElementById('content-grid');
    if (!grid) return;

    if (!append) {
        grid.innerHTML = '';
        currentItems = items;
    } else {
        currentItems = [...currentItems, ...items];
    }

    let index = 0;

    function renderBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(index + RENDER_BATCH, items.length);

        for (let i = index; i < end; i++) {
            const item = items[i];
            const card = document.createElement('div');
            card.className = `poster-card cursor-pointer group bg-slate-900 border border-slate-700 hover:border-cyan-700/60 rounded-3xl overflow-hidden shadow-xl`;
            
            card.innerHTML = `
                <div class="relative">
                    <img src="${item.poster || 'https://picsum.photos/id/1015/600/900'}" 
                         class="poster-img w-full aspect-[2/2.95] object-cover" 
                         loading="lazy"
                         onerror="this.src='https://picsum.photos/id/1015/600/900'">
                    
                    <div class="absolute top-3 right-3">
                        <div class="px-2 py-1 text-[10px] font-extrabold flex items-center justify-center bg-black/70 backdrop-blur-md text-white rounded-[2rem]" style="font-size:9.5px; padding-top:1.5px; padding-bottom:1.5px; padding-left:7.5px; padding-right:7.5px;">
                            <span>${item.year || '2026'}</span>
                        </div>
                    </div>
                    
                    <div class="px-3 py-[7.5px] absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent flex items-end">
                        <div class="px-3 pb-3 w-full">
                            <div class="font-extrabold text-white text-[13.5px] line-clamp-2 leading-[1.05] tracking-tighter">${item.name}</div>
                        </div>
                    </div>
                    
                    <div class="px-3 absolute top-3 left-3">
                        <div class="px-[7.5px] text-center text-white flex items-center justify-center text-[8.5px] font-black py-[.5px] bg-gradient-to-r from-cyan-400 to-teal-300 rounded-[2.5rem] text-slate-900" style="font-size: 8.3px; height: 15.5px; padding-left: 7px; padding-right: 7px;">
                            <span class="font-extrabold">${item.type.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            `;
            
            card.onclick = () => showItemModal(item.id, item.type, card);
            fragment.appendChild(card);
        }

        grid.appendChild(fragment);
        index = end;

        if (index < items.length) {
            setTimeout(renderBatch, 25);
        }
    }
    
    renderBatch();

    const countEl = document.getElementById('catalog-count');
    if (countEl) countEl.innerHTML = currentItems.length;
}

async function switchCatalog(type, catalogId, element) {
    document.querySelectorAll('.catalog-tab').forEach(el => {
        el.classList.remove('active', 'border-cyan-400');
        el.classList.add('border-transparent');
    });
    
    element.classList.add('active', 'border-cyan-400');
    element.classList.remove('border-transparent');
    
    currentCatalog = { type, id: catalogId, skip: 0 };
    loadedCount = 0;
    
    const cacheKey = `${type}-${catalogId}`;
    if (catalogCache[cacheKey]) {
        const firstBatch = catalogCache[cacheKey].slice(0, ITEMS_PER_PAGE);
        renderItems(firstBatch);
        loadedCount = firstBatch.length;
        
        const loadBtn = document.getElementById('load-more-btn');
        if (loadBtn) {
            loadBtn.style.display = (catalogCache[cacheKey].length > ITEMS_PER_PAGE) ? 'flex' : 'none';
            loadBtn.onclick = () => loadMoreContent();
        }
        return;
    }
    
    const items = await fetchCatalog(type, catalogId, 0, ITEMS_PER_PAGE);
    renderItems(items);
    loadedCount = items.length;
    
    const loadBtn = document.getElementById('load-more-btn');
    if (loadBtn) {
        const totalAvailable = catalogCache[cacheKey] ? catalogCache[cacheKey].length : 0;
        loadBtn.style.display = (totalAvailable > ITEMS_PER_PAGE) ? 'flex' : 'flex';
        loadBtn.onclick = () => loadMoreContent();
    }
}

async function loadMoreContent() {
    const loadBtn = document.getElementById('load-more-btn');
    if (loadBtn) loadBtn.style.display = 'none';

    const cacheKey = `${currentCatalog.type}-${currentCatalog.id}`;
    const cachedItems = catalogCache[cacheKey] || [];
    
    const nextBatch = cachedItems.slice(loadedCount, loadedCount + ITEMS_PER_PAGE);
    
    if (nextBatch.length > 0) {
        renderItems(nextBatch, true);
        loadedCount += nextBatch.length;
        
        // Show button again if more items exist
        if (loadedCount < cachedItems.length) {
            if (loadBtn) loadBtn.style.display = 'flex';
        }
    } else {
        // Fallback: fetch more from network
        currentCatalog.skip = loadedCount;
        const newItems = await fetchCatalog(currentCatalog.type, currentCatalog.id, currentCatalog.skip, ITEMS_PER_PAGE);
        
        if (newItems.length > 0) {
            renderItems(newItems, true);
            loadedCount += newItems.length;
            
            if (loadBtn) loadBtn.style.display = 'flex';
        }
    }
}

async function showItemModal(itemId, type, cardElement) {
    const modalsContainer = document.getElementById('modals-container');
    
    modalsContainer.innerHTML = `
        <div id="item-modal" onclick="if (event.target.id === 'item-modal') closeModal()" 
             class="fixed inset-0 bg-black/70 backdrop-blur-xl z-[90] flex items-end lg:items-center justify-center">
            <div onclick="event.stopImmediatePropagation()" 
                 class="modal w-full lg:w-[640px] lg:m-4 lg:rounded-3xl bg-slate-900 border border-slate-700 lg:max-h-[88vh] max-h-[92vh] overflow-hidden flex flex-col">
                
                <div class="px-5 pt-5 pb-3 flex justify-between items-center border-b border-slate-700">
                    <div class="flex items-center gap-x-3">
                        <div id="modal-type-pill" class="px-3 py-1 text-xs font-extrabold flex items-center justify-center bg-slate-800 rounded-2xl text-cyan-300" style="font-size: .68rem; padding-left: 10.5px; padding-right: 10.5px;"></div>
                        <div id="modal-year" class="text-xs px-1 font-extrabold text-white/60"></div>
                    </div>
                    <button onclick="closeModal()" class="w-9 h-9 flex items-center justify-center hover:bg-slate-800 transition-colors text-xl text-white/70 hover:text-white rounded-2xl">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
                
                <div class="flex flex-col lg:flex-row">
                    <div class="lg:w-[200px] px-5 pt-5 lg:pt-5 pb-2 lg:pb-5">
                        <img id="modal-poster" class="w-full aspect-[2/3] lg:w-[190px] shadow-xl object-cover rounded-3xl border border-slate-700" alt="">
                    </div>
                    
                    <div class="flex-1 px-5 pb-5 pt-3 lg:pt-5">
                        <div id="modal-name" class="font-extrabold text-3xl leading-none tracking-tighter"></div>
                        
                        <div class="mt-6">
                            <div class="flex items-center justify-between mb-3 px-1">
                                <div class="font-extrabold text-sm flex items-center gap-x-[5px]">
                                    <span>Available Streams</span>
                                </div>
                                <div id="stream-count" class="px-3 text-xs py-[1px] flex items-center justify-center font-black bg-cyan-900/20 text-cyan-300 rounded-[2rem]" style="font-size: 10.25px; padding-left: 8.5px; padding-right: 8.5px; height: 18px;"></div>
                            </div>
                            
                            <div id="streams-list" class="max-h-[210px] overflow-auto pr-1 content-grid space-y-[5px]"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = document.getElementById('item-modal');
    modal.style.display = 'flex';

    const item = currentItems.find(i => i.id === itemId) || {};
    
    document.getElementById('modal-name').innerHTML = item.name || 'Untitled';
    document.getElementById('modal-year').innerHTML = item.year || '';
    document.getElementById('modal-poster').src = item.poster || 'https://picsum.photos/id/1015/600/900';
    
    const pill = document.getElementById('modal-type-pill');
    pill.innerHTML = `<span class="font-black">${type.toUpperCase()}</span>`;

    const streamContainer = document.getElementById('streams-list');
    streamContainer.innerHTML = `
        <div class="flex items-center justify-center py-8 px-4">
            <div>
                <i class="fa-solid fa-spinner fa-spin text-cyan-300 text-lg mx-auto block mb-2"></i> 
                <span class="font-extrabold text-xs text-center block text-cyan-300">Fetching streams...</span>
            </div>
        </div>
    `;
    document.getElementById('stream-count').innerHTML = '0';

    const streams = await fetchStreams(type, itemId);
    streamContainer.innerHTML = '';
    document.getElementById('stream-count').innerHTML = streams.length;

    if (streams.length === 0) {
        streamContainer.innerHTML = `
            <div class="px-5 py-7 text-center bg-slate-950 border border-slate-700 rounded-3xl">
                <div class="text-xs text-center font-bold">No streams found for this title.</div>
            </div>
        `;
        return;
    }

    streams.forEach((stream, index) => {
        const streamName = stream.name || stream.title || `Stream #${index + 1}`;
        const quality = stream.quality || (stream.url.includes('.m3u8') ? 'HLS' : 'MP4');

        const streamEl = document.createElement('div');
        streamEl.className = `stream-item flex items-center justify-between px-4 py-[9.5px] bg-slate-800 border border-slate-700 hover:border-cyan-700/70 cursor-pointer rounded-3xl`;

        streamEl.innerHTML = `
            <div class="flex items-center gap-x-3">
                <div><i class="fa-solid fa-play text-cyan-300 ml-1 fa-fw"></i></div>
                <div>
                    <div class="font-extrabold text-sm">${streamName}</div>
                    <div class="text-xs flex items-center gap-2">
                        <span class="font-extrabold px-1 text-teal-300">${quality}</span>
                    </div>
                </div>
            </div>
            <div class="px-4 text-xs transition-colors flex items-center justify-center gap-2 font-extrabold py-[7px] bg-gradient-to-r from-cyan-300 to-teal-300 text-slate-900 hover:brightness-105 px-[13.5px] text-center rounded-[3rem]">
                <span class="font-black">PLAY</span>
            </div>
        `;

        streamEl.onclick = () => playStream(stream.url, streamName, item.name);
        streamContainer.appendChild(streamEl);
    });
}

function closeModal() {
    const modal = document.getElementById('item-modal');
    if (modal) modal.remove();
}

function playStream(streamUrl, streamTitle, itemTitle) {
    closeModal();
    
    const modalsContainer = document.getElementById('modals-container');
    
    modalsContainer.innerHTML = `
        <div id="video-modal" onclick="if (event.target.id === 'video-modal') closeVideoModal()" 
             class="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center">
            <div onclick="event.stopImmediatePropagation()" class="w-full max-w-[1050px] mx-4 lg:mx-auto">
                <div class="flex justify-between px-1 pb-3 items-center">
                    <div class="px-4">
                        <div id="video-modal-title" class="font-extrabold text-xl">${itemTitle}</div>
                        <div id="video-modal-stream-info" class="text-xs text-cyan-300 font-bold">${streamTitle}</div>
                    </div>
                    
                    <button onclick="closeVideoModal()" class="px-5 flex items-center justify-center text-sm font-extrabold py-2.5 px-4 bg-slate-900 hover:bg-red-900/30 transition-colors text-red-300 border border-red-900/30 rounded-3xl text-xs">
                        <i class="fa-solid fa-times mr-2"></i> <span>Close player</span>
                    </button>
                </div>
                
                <div class="video-container bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl">
                    <video id="player-video" class="w-full aspect-video bg-black" controls autoplay></video>
                    
                    <div class="px-5 py-[7px] flex items-center justify-between bg-slate-900 border-t border-slate-700">
                        <div class="px-1 flex items-center gap-x-2 text-xs">
                            <div class="px-3 flex items-center justify-center text-emerald-300 text-xs font-extrabold bg-emerald-900/10 h-6 px-[8.5px] rounded-2xl">
                                <span>HD</span>
                            </div>
                            <div class="text-xs font-medium text-white/50">Direct stream from M3U</div>
                        </div>
                        
                        <div onclick="attemptBypass('${streamUrl}', this)" class="cursor-pointer px-3 transition-colors text-xs flex items-center justify-center gap-1.5 hover:text-cyan-300 text-white/60 font-extrabold" style="font-size: .67rem">
                            <i class="fa-solid fa-shield-halved fa-fw"></i> 
                            <span>Bypass restriction</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const videoEl = document.getElementById('player-video');
    videoEl.src = streamUrl;
    videoEl.load();
    
    setTimeout(() => {
        videoEl.play().catch(() => {});
    }, 300);

    currentPlayer = videoEl;
    videoEl.onerror = () => handleVideoError(videoEl, streamUrl);
}

function handleVideoError(videoElement, originalUrl) {
    const container = videoElement.parentElement;
    container.innerHTML = `
        <div class="px-7 py-8 flex flex-col justify-center items-center text-center aspect-video bg-slate-900">
            <i class="fa-solid fa-exclamation-triangle text-amber-300 text-[42px]"></i>
            <div class="font-extrabold text-xl mt-4">Playback restricted</div>
            <div class="px-4 text-sm max-w-[260px] mx-auto mt-1 text-center text-white/60">
                This stream is blocked by Cloudflare.
            </div>
            <div class="flex items-center gap-x-2 mt-5">
                <button onclick="attemptBypass('${originalUrl}', this)" class="transition-colors px-5 text-xs font-extrabold flex items-center gap-2 justify-center py-[9.5px] bg-white text-black rounded-3xl px-7">
                    <span>Try bypass</span>
                </button>
                <button onclick="closeVideoModal()" class="transition-colors px-5 text-xs font-extrabold flex items-center gap-2 justify-center py-[9.5px] border border-white/20 text-white/80 hover:text-white px-5 rounded-3xl">
                    Close
                </button>
            </div>
        </div>
    `;
}

function attemptBypass(originalUrl = null, btnElement = null) {
    if (!originalUrl && currentPlayer) originalUrl = currentPlayer.src;
    if (!originalUrl) return;

    if (btnElement) btnElement.innerHTML = `Trying bypass...`;

    const newTab = window.open(originalUrl, '_blank');
    if (newTab) {
        closeVideoModal();
        showToastNotification('Opened in new tab — Cloudflare often allows this.');
        return;
    }

    showBypassOptions(originalUrl);
}

function showBypassOptions(streamUrl) {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.96);z-index:999999;display:flex;align-items:center;justify-content:center;';
    
    container.innerHTML = `
        <div class="max-w-[380px] w-full mx-4 bg-slate-900 border border-slate-700 rounded-3xl p-6">
            <div class="flex justify-between mb-5">
                <div class="font-extrabold text-2xl">Bypass Cloudflare</div>
                <button onclick="this.closest('.fixed').remove()" class="text-3xl leading-none text-white/50 hover:text-white">×</button>
            </div>
            
            <div class="space-y-2.5 text-sm">
                <div onclick="window.open('${streamUrl}', '_blank'); this.closest('.fixed').remove()" class="cursor-pointer px-5 py-4 flex gap-4 items-center bg-slate-800 hover:bg-emerald-900/20 transition-colors rounded-2xl">
                    <i class="fa-solid fa-external-link-alt w-5 text-emerald-400"></i>
                    <div><div class="font-extrabold">Open in New Tab</div><div class="text-xs text-emerald-300/70">Most effective method</div></div>
                </div>
                
                <div onclick="window.open('https://corsproxy.io/?${encodeURIComponent(streamUrl)}', '_blank'); this.closest('.fixed').remove()" class="cursor-pointer px-5 py-4 flex gap-4 items-center bg-slate-800 hover:bg-sky-900/20 transition-colors rounded-2xl">
                    <i class="fa-solid fa-globe w-5 text-sky-400"></i>
                    <div><div class="font-extrabold">Use CORS Proxy</div><div class="text-xs text-sky-300/70">Bypasses most restrictions</div></div>
                </div>
                
                <div onclick="copyStreamURL('${streamUrl}'); this.closest('.fixed').remove()" class="cursor-pointer px-5 py-4 flex gap-4 items-center bg-slate-800 hover:bg-violet-900/20 transition-colors rounded-2xl">
                    <i class="fa-solid fa-copy w-5 text-violet-400"></i>
                    <div><div class="font-extrabold">Copy Stream URL</div><div class="text-xs text-violet-300/70">Open in VLC / MX Player</div></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(container);
}

function copyStreamURL(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToastNotification('Stream URL copied to clipboard!');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToastNotification('Stream URL copied!');
    });
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    if (modal) modal.remove();
    
    if (currentPlayer) {
        currentPlayer.pause();
        currentPlayer.src = '';
    }
}

function showToastNotification(text) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translate(-50%, 0);z-index:999999';
    toast.className = `px-5 shadow-2xl text-xs font-extrabold flex items-center py-[10.5px] px-6 bg-slate-900 border border-slate-600 text-white rounded-[3rem]`;
    toast.innerHTML = `<div class="px-1 flex items-center"><span>${text}</span></div>`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transitionDuration = '210ms';
        toast.style.transitionProperty = 'all';
        toast.style.opacity = '0';
        setTimeout(() => toast.parentNode.removeChild(toast), 200);
    }, 3700);
}

function initializeSearch() {
    const searchInput = document.getElementById('global-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase().trim();
        const grid = document.getElementById('content-grid');
        
        if (!term) {
            grid.innerHTML = '';
            renderItems(currentItems);
            return;
        }
        
        const filtered = currentItems.filter(item => item.name.toLowerCase().includes(term));
        grid.innerHTML = '';
        
        if (filtered.length > 0) {
            renderItems(filtered);
        } else {
            grid.innerHTML = `<div class="col-span-full py-6 px-5 text-center"><div class="text-sm font-extrabold">No matches found.</div></div>`;
        }
    });
}

function showRandomContent() {
    if (!currentItems.length) return;
    const randomIndex = Math.floor(Math.random() * currentItems.length);
    const randomItem = currentItems[randomIndex];
    showItemModal(randomItem.id, randomItem.type);
}

async function preloadAllCatalogs() {
    const promises = [
        fetchCatalog('movie', 'm3u-movies', 0),
        fetchCatalog('series', 'm3u-series', 0),
        fetchCatalog('movie', 'm3u-dubbed', 0)
    ];
    
    await Promise.all(promises);
    console.log('%c[JaSH OTT] All catalogs preloaded for instant switching', 'color:#22c55e');
}

async function initializeApp() {
    initializeTailwind();
    
    const moviesTab = document.getElementById('movies-tab');
    if (moviesTab) {
        moviesTab.classList.add('active', 'border-cyan-400');
    }
    
    const initialItems = await fetchCatalog('movie', 'm3u-movies', 0);
    renderItems(initialItems);
    
    const loadBtn = document.getElementById('load-more-btn');
    if (loadBtn && initialItems.length >= 20) {
        loadBtn.style.display = 'flex';
    }
    
    initializeSearch();
    
    setTimeout(() => {
        preloadAllCatalogs();
    }, 600);
    
    console.log('%c[JaSH OTT] Ultra modern static Stremio frontend initialized.', 'color:rgb(163, 163, 172)');
}

window.onload = initializeApp;

document.addEventListener('keydown', function(e) {
    if (e.metaKey && e.key === "/") {
        e.preventDefault();
        const search = document.getElementById('global-search');
        if (search) search.focus();
    }
});