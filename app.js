// ═══════════════════════════════════════════════════
// CONFIG — Your addon server URL (NO trailing slash)
// ═══════════════════════════════════════════════════
const ADDON_URL = 'https://stremiotesting-production.up.railway.app/manifest.json'; // ← CHANGE THIS

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
const state = {
    catalogs: {},
    allItems: [],
    currentPage: 'home',
    currentCatalog: 'all',
    currentItem: null,
    currentMeta: null,
    currentStreams: [],
    currentStreamUrl: null,
    currentStreamTitle: '',
    history: [],
    hls: null,
    searchTimeout: null,
    loaded: false
};

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App starting...');
    console.log('📡 Addon URL:', ADDON_URL);
    initSearch();
    initScroll();
    loadAllCatalogs();
});

function initScroll() {
    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('navbar');
        if (window.scrollY > 10) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
    });
}

function initSearch() {
    const input = document.getElementById('search-input');
    const mobileInput = document.getElementById('mobile-search-input');
    const clearBtn = document.getElementById('search-clear');

    function handleSearch(value) {
        clearTimeout(state.searchTimeout);
        if (clearBtn) clearBtn.classList.toggle('hidden', !value);

        state.searchTimeout = setTimeout(() => {
            if (value.trim().length >= 2) {
                performSearch(value.trim());
            } else if (value.trim().length === 0 && state.currentPage === 'search') {
                navigateTo('home');
            }
        }, 300);
    }

    if (input) input.addEventListener('input', (e) => handleSearch(e.target.value));
    if (mobileInput) mobileInput.addEventListener('input', (e) => handleSearch(e.target.value));
}

// ═══════════════════════════════════════════════════
// FETCH WITH ERROR HANDLING
// ═══════════════════════════════════════════════════
async function fetchJSON(url) {
    console.log('📡 Fetching:', url);

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        console.log('✅ Response OK:', url);
        return data;

    } catch (err) {
        console.error('❌ Fetch failed:', url, err.message);

        // Detect CORS error
        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
            console.error('🔴 This is likely a CORS error!');
            console.error('   Your addon server needs to send: Access-Control-Allow-Origin: *');
        }

        throw err;
    }
}

// ═══════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════
async function loadAllCatalogs() {
    showSkeletons();

    try {
        console.log('📦 Loading manifest from:', `${ADDON_URL}/manifest.json`);
        const manifest = await fetchJSON(`${ADDON_URL}/manifest.json`);

        if (!manifest || !manifest.catalogs) {
            throw new Error('Invalid manifest: no catalogs found');
        }

        console.log(`📚 Found ${manifest.catalogs.length} catalogs:`,
            manifest.catalogs.map(c => c.id).join(', '));

        const promises = manifest.catalogs.map(async (cat) => {
            try {
                const url = `${ADDON_URL}/catalog/${cat.type}/${cat.id}.json`;
                console.log(`📂 Loading catalog: ${cat.id}`);

                const data = await fetchJSON(url);
                const items = (data && data.metas) ? data.metas : [];

                console.log(`   ✅ ${cat.id}: ${items.length} items`);

                state.catalogs[cat.id] = {
                    id: cat.id,
                    name: cat.name,
                    type: cat.type,
                    items: items
                };

                items.forEach(item => {
                    item._catalogId = cat.id;
                    item._catalogType = cat.type;
                });

                return items;
            } catch (err) {
                console.warn(`   ⚠️ Failed catalog ${cat.id}:`, err.message);
                return [];
            }
        });

        await Promise.allSettled(promises);

        state.allItems = Object.values(state.catalogs).flatMap(c => c.items);
        state.loaded = true;

        console.log(`🎬 Total items loaded: ${state.allItems.length}`);

        if (state.allItems.length > 0) {
            renderHome();
            showToast(`✅ Loaded ${state.allItems.length} titles`);
        } else {
            showError('No content loaded', 'Catalogs returned empty. Check if your addon has finished processing.');
        }

    } catch (err) {
        console.error('💥 Fatal load error:', err);
        showError('Cannot connect to addon', err.message);
    }
}

function showError(title, message) {
    const container = document.getElementById('content-rows');
    const banner = document.getElementById('featured-banner');
    if (banner) banner.classList.add('hidden');

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">😵</div>
            <h3>${title}</h3>
            <p>${message}</p>
            <p style="margin-top:16px;font-size:0.8rem;color:var(--text3)">
                Addon URL: <code>${ADDON_URL}</code>
            </p>
            <button class="btn-play" style="margin-top:20px" onclick="location.reload()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                Retry
            </button>
        </div>
    `;
}

// ═══════════════════════════════════════════════════
// RENDER HOME
// ═══════════════════════════════════════════════════
function renderHome() {
    const container = document.getElementById('content-rows');
    container.innerHTML = '';

    const featured = pickFeatured();
    if (featured) {
        renderFeatured(featured);
        document.getElementById('featured-banner').classList.remove('hidden');
    } else {
        document.getElementById('featured-banner').classList.add('hidden');
    }

    const activeCatalog = state.currentCatalog;

    if (activeCatalog === 'all') {
        for (const [catId, catData] of Object.entries(state.catalogs)) {
            if (catData.items.length > 0) {
                container.appendChild(createRow(catData.name, catData.items));
            }
        }
    } else {
        const catData = state.catalogs[activeCatalog];
        if (catData && catData.items.length > 0) {
            container.appendChild(createRow(catData.name, catData.items));
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>No content found</h3>
                    <p>This catalog is empty or still loading in the background</p>
                </div>
            `;
        }
    }
}

function pickFeatured() {
    const activeCatalog = state.currentCatalog;
    let pool;

    if (activeCatalog === 'all') {
        pool = state.allItems.filter(i => i.poster && i.description);
    } else {
        const catData = state.catalogs[activeCatalog];
        pool = catData ? catData.items.filter(i => i.poster && i.description) : [];
    }

    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * Math.min(pool.length, 20))];
}

function renderFeatured(item) {
    const bg = document.getElementById('featured-bg');
    const title = document.getElementById('featured-title');
    const desc = document.getElementById('featured-desc');
    const meta = document.getElementById('featured-meta');

    const bgUrl = item.background || item.poster;
    bg.style.backgroundImage = bgUrl ? `url(${bgUrl})` : 'none';
    title.textContent = item.name || '';
    desc.textContent = item.description || '';

    let metaHTML = '';
    if (item.year) metaHTML += `<span>${item.year}</span>`;
    if (item.imdbRating) metaHTML += `<span class="rating">⭐ ${item.imdbRating}</span>`;
    metaHTML += `<span>${item.type === 'series' ? '📺 Series' : '🎬 Movie'}</span>`;
    meta.innerHTML = metaHTML;

    document.getElementById('featured-play').onclick = () => openDetail(item);
    document.getElementById('featured-info').onclick = () => openDetail(item);
}

// ═══════════════════════════════════════════════════
// CREATE ROW
// ═══════════════════════════════════════════════════
function createRow(title, items) {
    const row = document.createElement('div');
    row.className = 'content-row';

    row.innerHTML = `
        <div class="row-header">
            <h2 class="row-title">${title}</h2>
        </div>
        <div class="row-scroll"></div>
    `;

    const scroll = row.querySelector('.row-scroll');
    items.forEach(item => scroll.appendChild(createCard(item)));
    return row;
}

// ═══════════════════════════════════════════════════
// CREATE CARD
// ═══════════════════════════════════════════════════
function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => openDetail(item);

    const emoji = item.type === 'series' ? '📺' : '🎬';
    const poster = item.poster;
    const ratingBadge = item.imdbRating
        ? `<div class="card-rating">⭐ ${item.imdbRating}</div>`
        : '';

    card.innerHTML = `
        <div class="card-poster">
            ${poster
                ? `<img src="${poster}" alt="${escapeHTML(item.name)}" loading="lazy" class="loading"
                    onload="this.classList.remove('loading');this.classList.add('loaded')"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                : ''
            }
            <div class="card-poster-placeholder" style="${poster ? 'display:none' : ''}">${emoji}</div>
            ${ratingBadge}
            <div class="card-play">
                <div class="card-play-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                </div>
            </div>
        </div>
        <div class="card-title">${escapeHTML(item.name || 'Unknown')}</div>
        <div class="card-year">${item.year || ''}</div>
    `;

    return card;
}

// ═══════════════════════════════════════════════════
// SKELETONS
// ═══════════════════════════════════════════════════
function showSkeletons() {
    const container = document.getElementById('content-rows');
    const banner = document.getElementById('featured-banner');
    if (banner) banner.classList.add('hidden');

    container.innerHTML = '';

    for (let r = 0; r < 3; r++) {
        const row = document.createElement('div');
        row.className = 'content-row';
        row.innerHTML = `
            <div class="row-header">
                <div class="skeleton" style="width:160px;height:22px"></div>
            </div>
            <div class="row-scroll">
                ${Array(8).fill('').map(() => `
                    <div style="flex-shrink:0;width:150px">
                        <div class="skeleton" style="width:100%;aspect-ratio:2/3;margin-bottom:8px"></div>
                        <div class="skeleton" style="width:80%;height:14px;margin-bottom:4px"></div>
                        <div class="skeleton" style="width:40%;height:12px"></div>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(row);
    }
}

// ═══════════════════════════════════════════════════
// DETAIL PAGE
// ═══════════════════════════════════════════════════
async function openDetail(item) {
    state.currentItem = item;

    const bg = document.getElementById('detail-bg');
    const poster = document.getElementById('detail-poster');
    const title = document.getElementById('detail-title');
    const meta = document.getElementById('detail-meta');
    const desc = document.getElementById('detail-desc');
    const actions = document.getElementById('detail-actions');
    const episodesSection = document.getElementById('episodes-section');
    const streamsSection = document.getElementById('streams-section');

    bg.style.backgroundImage = `url(${item.background || item.poster || ''})`;
    poster.src = item.poster || '';
    poster.alt = item.name || '';
    title.textContent = item.name || 'Unknown';

    let metaHTML = '';
    if (item.year) metaHTML += `<span>${item.year}</span>`;
    if (item.imdbRating) metaHTML += `<span class="rating">⭐ ${item.imdbRating}</span>`;
    metaHTML += `<span class="type-badge">${item.type || 'movie'}</span>`;
    meta.innerHTML = metaHTML;

    desc.textContent = item.description || 'No description available.';
    episodesSection.classList.add('hidden');
    streamsSection.classList.add('hidden');
    actions.innerHTML = '<div class="spinner" style="width:24px;height:24px;border-width:2px"></div>';

    navigateTo('detail');

    try {
        const metaData = await fetchJSON(`${ADDON_URL}/meta/${item.type}/${item.id}.json`);
        state.currentMeta = metaData && metaData.meta ? metaData.meta : null;

        if (state.currentMeta && state.currentMeta.videos && state.currentMeta.videos.length > 0) {
            renderEpisodes(state.currentMeta.videos, item);
            episodesSection.classList.remove('hidden');
            actions.innerHTML = '';
        } else {
            const streamData = await fetchJSON(`${ADDON_URL}/stream/${item.type}/${item.id}.json`);
            state.currentStreams = streamData && streamData.streams ? streamData.streams : [];

            if (state.currentStreams.length > 0) {
                renderStreams(state.currentStreams, item.name);
                streamsSection.classList.remove('hidden');

                actions.innerHTML = `
                    <button class="btn-play" onclick="playFirstStream()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Play Now
                    </button>
                `;
            } else {
                actions.innerHTML = '<span style="color:var(--text3)">No streams available</span>';
            }
        }
    } catch (err) {
        console.error('Error loading detail:', err);
        actions.innerHTML = `<span style="color:var(--red)">Failed to load: ${err.message}</span>`;
    }
}

function playFirstStream() {
    if (state.currentStreams.length > 0 && state.currentItem) {
        playStream(state.currentStreams[0].url, state.currentItem.name);
    }
}

function renderEpisodes(videos, item) {
    const seasons = [...new Set(videos.map(v => v.season))].sort((a, b) => a - b);
    const selectorEl = document.getElementById('season-selector');

    selectorEl.innerHTML = seasons.map(s =>
        `<button class="season-btn ${s === seasons[0] ? 'active' : ''}" onclick="filterSeason(${s}, this)">Season ${s}</button>`
    ).join('');

    showSeasonEpisodes(seasons[0], videos, item);
}

function filterSeason(season, btn) {
    document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showSeasonEpisodes(season, state.currentMeta.videos, state.currentItem);
}

function showSeasonEpisodes(season, videos, item) {
    const gridEl = document.getElementById('episodes-grid');
    const eps = videos.filter(v => v.season === season).sort((a, b) => a.episode - b.episode);

    gridEl.innerHTML = eps.map(ep => `
        <div class="episode-card" onclick="playEpisode('${escapeAttr(ep.id)}', '${escapeAttr(item.name)} - ${escapeAttr(ep.title)}')">
            <div class="episode-num">${ep.episode}</div>
            <div class="episode-info">
                <div class="episode-title">${escapeHTML(ep.title || `Episode ${ep.episode}`)}</div>
                <div class="episode-sub">Season ${ep.season}</div>
            </div>
            <div class="episode-play">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
            </div>
        </div>
    `).join('');
}

async function playEpisode(videoId, title) {
    showToast('Loading episode...');

    try {
        const item = state.currentItem;
        const data = await fetchJSON(`${ADDON_URL}/stream/${item.type}/${videoId}.json`);
        const streams = data && data.streams ? data.streams : [];

        if (streams.length > 0) {
            playStream(streams[0].url, title);
        } else {
            showToast('❌ No stream found for this episode');
        }
    } catch (err) {
        console.error('Error loading episode:', err);
        showToast('❌ Failed to load episode');
    }
}

function renderStreams(streams, title) {
    const list = document.getElementById('streams-list');

    list.innerHTML = streams.map((stream, i) => `
        <div class="stream-card" onclick="playStream('${escapeAttr(stream.url)}', '${escapeAttr(title)}')">
            <div class="stream-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
            </div>
            <div class="stream-info">
                <div class="stream-title">${escapeHTML(stream.title || `Stream ${i + 1}`)}</div>
                <div class="stream-url-hint">${getStreamHint(stream.url)}</div>
            </div>
        </div>
    `).join('');
}

function getStreamHint(url) {
    try {
        const u = new URL(url);
        const ext = url.split('.').pop().split('?')[0].toLowerCase();
        if (ext === 'm3u8') return `HLS • ${u.hostname}`;
        if (ext === 'mp4') return `MP4 • ${u.hostname}`;
        if (ext === 'mkv') return `MKV • ${u.hostname}`;
        return u.hostname;
    } catch { return 'Direct'; }
}

// ═══════════════════════════════════════════════════
// VIDEO PLAYER
// ═══════════════════════════════════════════════════
function playStream(url, title) {
    if (!url) { showToast('❌ No URL'); return; }

    state.currentStreamUrl = url;
    state.currentStreamTitle = title || '';

    const video = document.getElementById('video-player');
    const playerTitle = document.getElementById('player-title');
    const loading = document.getElementById('player-loading');
    const error = document.getElementById('player-error');

    playerTitle.textContent = title || '';
    loading.classList.remove('hidden');
    error.classList.add('hidden');

    navigateTo('player');

    // Destroy existing HLS
    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }

    video.src = '';

    const ext = url.split('.').pop().split('?')[0].toLowerCase();
    const isHLS = ext === 'm3u8' || url.includes('.m3u8');

    if (isHLS && typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 120,
            startLevel: -1
        });

        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            loading.classList.add('hidden');
            video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
                loading.classList.add('hidden');
                error.classList.remove('hidden');
                document.getElementById('player-error-text').textContent =
                    `Stream error: ${data.type} - ${data.details}`;
            }
        });

        state.hls = hls;

    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
            loading.classList.add('hidden');
            video.play().catch(() => {});
        }, { once: true });
        video.addEventListener('error', () => {
            loading.classList.add('hidden');
            error.classList.remove('hidden');
        }, { once: true });

    } else {
        video.src = url;
        video.addEventListener('loadeddata', () => {
            loading.classList.add('hidden');
            video.play().catch(() => {});
        }, { once: true });
        video.addEventListener('canplay', () => {
            loading.classList.add('hidden');
        }, { once: true });
        video.addEventListener('error', () => {
            loading.classList.add('hidden');
            error.classList.remove('hidden');
            document.getElementById('player-error-text').textContent =
                'Failed to load video. Format may not be supported in browser.';
        }, { once: true });
    }

    // Try landscape lock
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch {}
}

function closePlayer() {
    const video = document.getElementById('video-player');

    if (state.hls) {
        state.hls.destroy();
        state.hls = null;
    }

    video.pause();
    video.removeAttribute('src');
    video.load();

    try { screen.orientation?.unlock?.(); } catch {}

    goBack();
}

function retryStream() {
    if (state.currentStreamUrl) {
        playStream(state.currentStreamUrl, state.currentStreamTitle);
    }
}

// ═══════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════
function performSearch(query) {
    const q = query.toLowerCase();
    const results = state.allItems.filter(item =>
        item.name && item.name.toLowerCase().includes(q)
    );

    document.getElementById('search-query-display').textContent = query;
    document.getElementById('search-count').textContent =
        `${results.length} result${results.length !== 1 ? 's' : ''}`;

    const grid = document.getElementById('search-results-grid');
    const empty = document.getElementById('search-empty');

    grid.innerHTML = '';

    if (results.length > 0) {
        results.forEach(item => grid.appendChild(createCard(item)));
        grid.classList.remove('hidden');
        empty.classList.add('hidden');
    } else {
        grid.classList.add('hidden');
        empty.classList.remove('hidden');
    }

    navigateTo('search');
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('mobile-search-input').value = '';
    document.getElementById('search-clear').classList.add('hidden');
    if (state.currentPage === 'search') navigateTo('home');
}

function toggleMobileSearch() {
    const ms = document.getElementById('mobile-search');
    ms.classList.toggle('hidden');
    if (!ms.classList.contains('hidden')) {
        document.getElementById('mobile-search-input').focus();
    }
}

// ═══════════════════════════════════════════════════
// CATALOG SWITCHING
// ═══════════════════════════════════════════════════
function switchCatalog(catalogId) {
    state.currentCatalog = catalogId;

    document.querySelectorAll('.cat-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.catalog === catalogId);
    });

    if (state.loaded) renderHome();
    if (state.currentPage !== 'home') navigateTo('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════
function navigateTo(page) {
    if (state.currentPage !== page && state.currentPage !== 'player') {
        state.history.push(state.currentPage);
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    state.currentPage = page;

    const backBtn = document.getElementById('nav-back');
    backBtn.classList.toggle('hidden', page === 'home');

    const catBar = document.getElementById('category-bar');
    catBar.style.display = (page === 'home') ? '' : 'none';

    document.querySelectorAll('.page').forEach(p => {
        if (page === 'home') {
            p.style.paddingTop = '';
        } else if (p.id !== 'page-player') {
            p.style.paddingTop = '76px';
        }
    });

    const bnav = document.getElementById('bottom-nav');
    const navbar = document.getElementById('navbar');

    if (page === 'player') {
        bnav.style.display = 'none';
        navbar.style.display = 'none';
    } else {
        bnav.style.display = '';
        navbar.style.display = '';
    }

    if (page !== 'player') window.scrollTo({ top: 0 });
}

function goBack() {
    if (state.history.length > 0) {
        navigateTo(state.history.pop());
    } else {
        navigateTo('home');
    }
}

function setActiveNav(btn) {
    document.querySelectorAll('.bnav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════
function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(state._toastTimer);
    state._toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// Handle back button on mobile
window.addEventListener('popstate', () => {
    if (state.currentPage === 'player') {
        closePlayer();
    } else {
        goBack();
    }
});