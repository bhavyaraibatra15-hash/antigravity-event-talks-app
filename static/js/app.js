// State management
let allUpdates = [];
let filteredUpdates = [];
let selectedUpdate = null;

let activeCategory = 'all';
let searchQuery = '';
let sortOrder = 'desc'; // 'desc' or 'asc'

// DOM Elements
const timeline = document.getElementById('timeline');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const btnRefresh = document.getElementById('btn-refresh');
const refreshSpinner = btnRefresh.querySelector('.icon-spin-target');
const searchInput = document.getElementById('search-input');
const clearSearch = document.getElementById('clear-search');
const categoryPills = document.getElementById('category-pills');
const sortSelect = document.getElementById('sort-select');
const syncTime = document.getElementById('sync-time');

// Stats DOM Elements
const statTotal = document.getElementById('stat-total');
const statFeatures = document.getElementById('stat-features');
const statAnnouncements = document.getElementById('stat-announcements');

// Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCounter = document.getElementById('char-counter');
const btnShortenTweet = document.getElementById('btn-shorten-tweet');
const btnPublishTweet = document.getElementById('btn-publish-tweet');
const btnCancelTweet = document.getElementById('btn-cancel-tweet');
const closeModal = document.getElementById('close-modal');

const previewCategory = document.getElementById('preview-category');
const previewDate = document.getElementById('preview-date');
const previewText = document.getElementById('preview-text');

// API Warnings banner
const apiWarning = document.getElementById('api-warning');
const apiWarningText = document.getElementById('api-warning-text');

// Init
document.addEventListener('DOMContentLoaded', () => {
    fetchReleaseNotes();
    setupEventListeners();
});

// Event Listeners setup
function setupEventListeners() {
    // Refresh Button
    btnRefresh.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Search Input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        clearSearch.style.display = searchQuery ? 'block' : 'none';
        applyFilters();
    });

    // Clear Search button
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearch.style.display = 'none';
        applyFilters();
        searchInput.focus();
    });

    // Category pills selection
    categoryPills.addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        
        // Remove active class from previous
        categoryPills.querySelector('.pill.active').classList.remove('active');
        // Add to current
        pill.classList.add('active');
        
        activeCategory = pill.dataset.category;
        applyFilters();
    });

    // Sorting select
    sortSelect.addEventListener('change', (e) => {
        sortOrder = e.target.value;
        applyFilters();
    });

    // Modal Events
    closeModal.addEventListener('click', hideTweetModal);
    btnCancelTweet.addEventListener('click', hideTweetModal);
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) hideTweetModal();
    });

    tweetTextarea.addEventListener('input', updateTweetCharCount);
    btnShortenTweet.addEventListener('click', autoShortenTweet);
    btnPublishTweet.addEventListener('click', publishTweet);
}

// Fetch Release Notes
async function fetchReleaseNotes(forceRefresh = false) {
    try {
        // Show loading spinner
        refreshSpinner.classList.add('icon-spin');
        btnRefresh.disabled = true;
        
        if (forceRefresh || allUpdates.length === 0) {
            loadingState.style.display = 'flex';
            timeline.style.display = 'none';
            emptyState.style.display = 'none';
            apiWarning.style.display = 'none';
        }

        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        allUpdates = data.updates || [];
        
        // Show API Warning banner if warning exists
        if (data.warning) {
            apiWarningText.textContent = data.warning;
            apiWarning.style.display = 'flex';
        }

        // Set last updated time label
        updateSyncTimeLabel(data.last_fetched);
        
        // Update stats
        updateStats();

        // Render notes
        applyFilters();

    } catch (error) {
        console.error('Error fetching release notes:', error);
        showToast(error.message || 'Failed to fetch release notes.', 'error');
        
        if (allUpdates.length === 0) {
            loadingState.style.display = 'none';
            emptyState.style.display = 'flex';
            emptyState.querySelector('h3').textContent = 'Unable to Load Data';
            emptyState.querySelector('p').textContent = 'We encountered an error while connecting to the BigQuery Feed API.';
        }
    } finally {
        refreshSpinner.classList.remove('icon-spin');
        btnRefresh.disabled = false;
        loadingState.style.display = 'none';
    }
}

// Update last sync time label helper
function updateSyncTimeLabel(timestamp) {
    if (!timestamp) {
        syncTime.textContent = '';
        return;
    }
    const date = new Date(timestamp * 1000);
    
    // Auto-update message
    const formatter = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    
    syncTime.textContent = `Last synced: ${formatter.format(date)}`;
}

// Calculate Stats Dashboard
function updateStats() {
    statTotal.textContent = allUpdates.length;
    
    const featuresCount = allUpdates.filter(u => u.category.toLowerCase() === 'feature').length;
    const announcementsCount = allUpdates.filter(u => u.category.toLowerCase() === 'announcement').length;
    
    statFeatures.textContent = featuresCount;
    statAnnouncements.textContent = announcementsCount;
}

// Apply Filters, Search and Sorting
function applyFilters() {
    filteredUpdates = allUpdates.filter(item => {
        // Category Filter
        const matchesCategory = activeCategory === 'all' || item.category.toLowerCase() === activeCategory;
        
        // Search Filter
        const matchesSearch = !searchQuery || 
            item.category.toLowerCase().includes(searchQuery) ||
            item.date.toLowerCase().includes(searchQuery) ||
            item.content_text.toLowerCase().includes(searchQuery);
            
        return matchesCategory && matchesSearch;
    });

    // Sorting
    filteredUpdates.sort((a, b) => {
        const dateA = new Date(a.updated_iso);
        const dateB = new Date(b.updated_iso);
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    renderTimeline();
}

// Render Timeline Content
function renderTimeline() {
    timeline.innerHTML = '';
    
    if (filteredUpdates.length === 0) {
        timeline.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    emptyState.style.display = 'none';
    timeline.style.display = 'block';

    // Group updates by date
    const grouped = {};
    filteredUpdates.forEach(update => {
        if (!grouped[update.date]) {
            grouped[update.date] = [];
        }
        grouped[update.date].push(update);
    });

    // Since filteredUpdates is already sorted, Object.keys(grouped) might lose order,
    // so we iterate over sorted unique dates instead.
    const uniqueDates = [...new Set(filteredUpdates.map(u => u.date))];

    uniqueDates.forEach(date => {
        const updatesForDate = grouped[date];
        
        // Create timeline group
        const groupEl = document.createElement('div');
        groupEl.className = 'timeline-group';
        
        // Date indicator
        const dateNode = document.createElement('div');
        dateNode.className = 'timeline-date-node';
        const dateBadge = document.createElement('span');
        dateBadge.className = 'timeline-date';
        dateBadge.textContent = date;
        dateNode.appendChild(dateBadge);
        groupEl.appendChild(dateNode);
        
        // Card wrapper
        const updatesWrapper = document.createElement('div');
        updatesWrapper.className = 'timeline-updates';
        
        updatesForDate.forEach(update => {
            const card = createCardElement(update);
            updatesWrapper.appendChild(card);
        });
        
        groupEl.appendChild(updatesWrapper);
        timeline.appendChild(groupEl);
    });
}

// HTML Card Generator
function createCardElement(update) {
    const card = document.createElement('article');
    card.className = 'release-card';
    card.dataset.category = update.category.toLowerCase();
    
    // Header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    
    const badgeWrapper = document.createElement('div');
    badgeWrapper.className = 'badge-wrapper';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.category = update.category.toLowerCase();
    badge.textContent = update.category;
    badgeWrapper.appendChild(badge);
    
    cardHeader.appendChild(badgeWrapper);
    card.appendChild(cardHeader);
    
    // Body (inject original HTML)
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    cardBody.innerHTML = update.content_html;
    
    // Force anchors to open in new tab
    cardBody.querySelectorAll('a').forEach(anchor => {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
    });
    
    card.appendChild(cardBody);
    
    // Actions
    const cardActions = document.createElement('div');
    cardActions.className = 'card-actions';
    
    // Tweet Button
    const btnTweet = document.createElement('button');
    btnTweet.className = 'card-btn card-btn-tweet';
    btnTweet.innerHTML = `<svg class="icon"><use href="#icon-x"></use></svg><span>Tweet</span>`;
    btnTweet.addEventListener('click', () => openTweetModal(update));
    
    // Copy Button
    const btnCopy = document.createElement('button');
    btnCopy.className = 'card-btn card-btn-copy';
    btnCopy.innerHTML = `<svg class="icon btn-copy-icon"><use href="#icon-copy"></use></svg><span class="btn-copy-text">Copy</span>`;
    btnCopy.addEventListener('click', () => copyToClipboard(update, btnCopy));
    
    cardActions.appendChild(btnTweet);
    cardActions.appendChild(btnCopy);
    
    // External Link (View in Docs)
    if (update.link) {
        const linkDocs = document.createElement('a');
        linkDocs.className = 'card-btn card-btn-link';
        linkDocs.href = update.link;
        linkDocs.target = '_blank';
        linkDocs.rel = 'noopener noreferrer';
        linkDocs.innerHTML = `<span>Docs</span><svg class="icon"><use href="#icon-external"></use></svg>`;
        cardActions.appendChild(linkDocs);
    }
    
    card.appendChild(cardActions);
    return card;
}

// Copy plain text of update to clipboard
async function copyToClipboard(update, buttonElement) {
    try {
        const textToCopy = `Google Cloud BigQuery Update (${update.date}) [${update.category}]:\n\n${update.content_text}\n\nRead more: ${update.link}`;
        await navigator.clipboard.writeText(textToCopy);
        
        // Success state UI
        const btnText = buttonElement.querySelector('.btn-copy-text');
        const btnIcon = buttonElement.querySelector('.btn-copy-icon use');
        
        buttonElement.classList.add('success');
        btnText.textContent = 'Copied!';
        btnIcon.setAttribute('href', '#icon-check');
        
        showToast('Update copied to clipboard!', 'success');
        
        setTimeout(() => {
            buttonElement.classList.remove('success');
            btnText.textContent = 'Copy';
            btnIcon.setAttribute('href', '#icon-copy');
        }, 2000);
        
    } catch (err) {
        console.error('Clipboard copy failed:', err);
        showToast('Failed to copy to clipboard.', 'error');
    }
}

// Open Tweet Composer Modal
function openTweetModal(update) {
    selectedUpdate = update;
    
    // Setup preview block
    previewCategory.textContent = update.category;
    previewCategory.dataset.category = update.category.toLowerCase();
    previewDate.textContent = update.date;
    previewText.textContent = update.content_text;
    
    // Compose Default Tweet text
    const defaultText = `Google Cloud BigQuery Update (${update.date})\n\n[${update.category}] ${update.content_text}\n\nRead more: ${update.link}`;
    
    tweetTextarea.value = defaultText;
    tweetModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Lock background scroll
    
    updateTweetCharCount();
}

// Hide Tweet Composer Modal
function hideTweetModal() {
    tweetModal.style.display = 'none';
    document.body.style.overflow = ''; // Unlock scroll
    selectedUpdate = null;
}

// Update character count
function updateTweetCharCount() {
    const text = tweetTextarea.value;
    const len = text.length;
    
    charCounter.textContent = `${len} / 280`;
    
    // Clear styles
    charCounter.className = 'char-counter';
    btnPublishTweet.disabled = false;
    
    if (len > 280) {
        charCounter.classList.add('danger');
        btnPublishTweet.disabled = true;
    } else if (len > 250) {
        charCounter.classList.add('warning');
    }
}

// Auto Shorten Tweet Logic
function autoShortenTweet() {
    if (!selectedUpdate) return;
    
    const prefix = `Google Cloud BigQuery Update (${selectedUpdate.date})\n\n[${selectedUpdate.category}] `;
    const suffix = `\n\nRead more: ${selectedUpdate.link}`;
    
    // Available length for the main text body
    const maxBodyLen = 280 - prefix.length - suffix.length;
    
    if (maxBodyLen <= 0) {
        showToast('Link and date are too long to fit in 280 characters!', 'error');
        return;
    }
    
    let mainBody = selectedUpdate.content_text;
    if (mainBody.length > maxBodyLen) {
        mainBody = mainBody.substring(0, maxBodyLen - 3) + '...';
    }
    
    tweetTextarea.value = `${prefix}${mainBody}${suffix}`;
    updateTweetCharCount();
    showToast('Tweet content trimmed to 280 characters!', 'info');
}

// Open Twitter intent to tweet
function publishTweet() {
    const text = tweetTextarea.value;
    if (text.length > 280) {
        showToast('Tweet text exceeds the 280 character limit!', 'error');
        return;
    }
    
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterIntentUrl, '_blank', 'noopener,noreferrer');
    hideTweetModal();
}

// Toast Notifications Helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = '<svg class="icon"><use href="#icon-check"></use></svg>';
    } else if (type === 'error') {
        iconSvg = '<svg class="icon"><use href="#icon-info"></use></svg>';
    } else {
        iconSvg = '<svg class="icon"><use href="#icon-info"></use></svg>';
    }
    
    toast.innerHTML = `
        ${iconSvg}
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Trigger slide out
    setTimeout(() => {
        toast.classList.add('slide-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000);
}
