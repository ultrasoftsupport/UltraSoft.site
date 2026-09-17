import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';
import { getCurrentTenantId } from '../../services/tenant_service.js';
import { logAuditEvent } from '../../services/audit_service.js';
import { escapeHtml } from '../../utils/sanitize.js';

// ==========================================
// 🌟 State Variables 🌟
// ==========================================
let isInitialized = false;
let systemModels = []; // All models loaded from Supabase
let systemModelsByFactoryCode = new Map(); // factory_code.trim().toLowerCase() -> model
let scannedDriveGroups = []; // Array of scanned model groups: { factoryCode, folderName, files: [{id, name, url, thumbnail, isDuplicate}], systemModel, status }
let selectedFactoryCodes = new Set();
let activeFilterTab = 'all'; // 'all' | 'ready' | 'has_prev' | 'not_found'
let searchQuery = '';
let isFullscreen = false;
let currentLightboxImages = [];
let currentLightboxIndex = 0;

const STORAGE_LAST_SYNC_KEY = 'ultrasoft_last_drive_sync';
const STORAGE_API_KEY = 'google_drive_api_key';
const STORAGE_LAST_FOLDER_KEY = 'ultrasoft_last_drive_folder';

// ==========================================
// 🚀 1. Initialization
// ==========================================
export async function initImportImagesView() {
    renderLastSyncCard();
    checkApiKeyStatus();
    loadDefaultModelImageConfig();

    // Restore last folder if saved
    const savedFolder = localStorage.getItem(STORAGE_LAST_FOLDER_KEY);
    const folderInput = document.getElementById('drive-folder-url');
    if (folderInput && savedFolder && !folderInput.value) {
        folderInput.value = savedFolder;
    }

    if (!isInitialized) {
        attachEventListeners();
        isInitialized = true;
    }

    await loadSystemModels();
    updatePurgeImpactSummary();
}

// ==========================================
// 🔗 2. Event Listeners
// ==========================================
function attachEventListeners() {
    // Scan Button
    const btnScan = document.getElementById('btn-scan-drive');
    if (btnScan) {
        btnScan.addEventListener('click', handleDriveScan);
    }

    // Enter key on folder input
    const folderInput = document.getElementById('drive-folder-url');
    if (folderInput) {
        folderInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleDriveScan();
            }
        });
    }

    // Google API Settings modal
    const btnOpenApiModal = document.getElementById('btn-open-api-modal');
    if (btnOpenApiModal) {
        btnOpenApiModal.addEventListener('click', openApiKeyModal);
    }

    const btnSaveApiKey = document.getElementById('btn-save-api-key');
    if (btnSaveApiKey) {
        btnSaveApiKey.addEventListener('click', saveApiKey);
    }

    const btnCloseApiModal = document.getElementById('btn-close-api-modal');
    if (btnCloseApiModal) {
        btnCloseApiModal.addEventListener('click', closeApiKeyModal);
    }

    // Import Selected Button
    const btnImportSelected = document.getElementById('btn-import-selected-images');
    if (btnImportSelected) {
        btnImportSelected.addEventListener('click', handleImportSelected);
    }

    // Select Only New Button
    const btnSelectNewOnly = document.getElementById('btn-select-new-only');
    if (btnSelectNewOnly) {
        btnSelectNewOnly.addEventListener('click', handleSelectNewOnly);
    }

    // Open Purge Modal Button
    const btnOpenPurge = document.getElementById('btn-open-purge-modal');
    if (btnOpenPurge) {
        btnOpenPurge.addEventListener('click', openPurgeModal);
    }

    // Close Purge Modal
    const btnClosePurge = document.getElementById('btn-close-purge-modal');
    if (btnClosePurge) {
        btnClosePurge.addEventListener('click', closePurgeModal);
    }

    const btnCancelPurge = document.getElementById('btn-cancel-purge');
    if (btnCancelPurge) {
        btnCancelPurge.addEventListener('click', closePurgeModal);
    }

    // Confirm Purge Button
    const btnConfirmPurge = document.getElementById('btn-confirm-purge');
    if (btnConfirmPurge) {
        btnConfirmPurge.addEventListener('click', executeImagePurge);
    }

    // Purge Modal Radio Change Listeners
    document.querySelectorAll('input[name="purge-scope"], input[name="purge-target"]').forEach(radio => {
        radio.addEventListener('change', updatePurgeImpactSummary);
    });

    const customIndexInput = document.getElementById('purge-custom-index');
    if (customIndexInput) {
        customIndexInput.addEventListener('input', updatePurgeImpactSummary);
    }

    // Search Input
    const searchInput = document.getElementById('drive-studio-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderStudioTable();
        });
    }

    // Filter Tabs
    document.querySelectorAll('.drive-filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const filter = tab.getAttribute('data-filter') || 'all';
            switchFilterTab(filter);
        });
    });

    // Select All Checkbox in table header
    const selectAllHeader = document.getElementById('th-select-all-models');
    if (selectAllHeader) {
        selectAllHeader.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const visible = getFilteredGroups();
            visible.forEach(g => {
                if (g.systemModel) {
                    if (isChecked) {
                        selectedFactoryCodes.add(g.factoryCode);
                    } else {
                        selectedFactoryCodes.delete(g.factoryCode);
                    }
                }
            });
            updateSelectionBadge();
            renderStudioTableRowsOnly();
        });
    }

    // Fullscreen Toggle
    const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
    if (btnToggleFullscreen) {
        btnToggleFullscreen.addEventListener('click', toggleFullscreen);
    }

    // Lightbox Controls
    const btnCloseLightbox = document.getElementById('btn-close-lightbox');
    if (btnCloseLightbox) {
        btnCloseLightbox.addEventListener('click', closeLightbox);
    }
    const btnPrevLightbox = document.getElementById('btn-lightbox-prev');
    if (btnPrevLightbox) {
        btnPrevLightbox.addEventListener('click', () => navigateLightbox(-1));
    }
    const btnNextLightbox = document.getElementById('btn-lightbox-next');
    if (btnNextLightbox) {
        btnNextLightbox.addEventListener('click', () => navigateLightbox(1));
    }

    // Backdrop click to close modals
    const purgeModal = document.getElementById('image-purge-modal');
    if (purgeModal) {
        purgeModal.addEventListener('click', (e) => {
            if (e.target === purgeModal) closePurgeModal();
        });
    }
    const apiModal = document.getElementById('google-api-modal');
    if (apiModal) {
        apiModal.addEventListener('click', (e) => {
            if (e.target === apiModal) closeApiKeyModal();
        });
    }
    const lightboxModal = document.getElementById('image-lightbox-modal');
    if (lightboxModal) {
        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) closeLightbox();
        });
    }

    // Keyboard shortcuts for Lightbox & Modals
    window.addEventListener('keydown', (e) => {
        const lb = document.getElementById('image-lightbox-modal');
        if (lb && !lb.classList.contains('hidden')) {
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowRight') navigateLightbox(-1);
            else if (e.key === 'ArrowLeft') navigateLightbox(1);
        }
        const pm = document.getElementById('image-purge-modal');
        if (pm && !pm.classList.contains('hidden') && e.key === 'Escape') {
            closePurgeModal();
        }
    });
}

// ==========================================
// 🌟 Progress Modal for Images Operations 🌟
// ==========================================
let hideDriveImagesTimeout = null;

function showDriveImagesProgress(title, status, initialPercent = 0, counterText = '') {
    if (hideDriveImagesTimeout) {
        clearTimeout(hideDriveImagesTimeout);
        hideDriveImagesTimeout = null;
    }
    const modal = document.getElementById('drive-images-progress-modal');
    const content = document.getElementById('drive-images-progress-content');
    if (!modal || !content) return;

    const titleEl = document.getElementById('drive-images-progress-title');
    const statusEl = document.getElementById('drive-images-progress-status');
    const barEl = document.getElementById('drive-images-progress-bar');
    const percentEl = document.getElementById('drive-images-progress-percent');
    const counterEl = document.getElementById('drive-images-progress-counter');

    if (titleEl) titleEl.textContent = title;
    if (statusEl) statusEl.textContent = status;
    if (barEl) barEl.style.width = `${initialPercent}%`;
    if (percentEl) percentEl.textContent = `${initialPercent}%`;
    if (counterEl) counterEl.textContent = counterText;

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    });
}

function updateDriveImagesProgress(status, percent, counterText = '') {
    const statusEl = document.getElementById('drive-images-progress-status');
    const barEl = document.getElementById('drive-images-progress-bar');
    const percentEl = document.getElementById('drive-images-progress-percent');
    const counterEl = document.getElementById('drive-images-progress-counter');

    const cleanPercent = Math.min(100, Math.max(0, Math.round(percent)));
    if (statusEl) statusEl.textContent = status;
    if (barEl) barEl.style.width = `${cleanPercent}%`;
    if (percentEl) percentEl.textContent = `${cleanPercent}%`;
    if (counterEl && counterText) counterEl.textContent = counterText;
}

function hideDriveImagesProgress() {
    const modal = document.getElementById('drive-images-progress-modal');
    const content = document.getElementById('drive-images-progress-content');
    if (!modal || !content) return;

    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    if (hideDriveImagesTimeout) clearTimeout(hideDriveImagesTimeout);
    hideDriveImagesTimeout = setTimeout(() => {
        modal.classList.add('hidden');
        hideDriveImagesTimeout = null;
    }, 300);
}

// ==========================================
// 📦 3. System Models Fetching
// ==========================================
async function loadSystemModels() {
    try {
        const currentTenantId = getCurrentTenantId();
        let query = supabase
            .from('models')
            .select(`
                id,
                system_code,
                factory_code,
                name,
                image_url_1,
                image_url_2,
                image_url_3,
                categories(id, name),
                model_images(id, image_url, created_at)
            `);

        if (currentTenantId) query = query.eq('tenant_id', currentTenantId);

        const { data, error } = await query;
        if (error) throw error;

        systemModels = data || [];
        systemModelsByFactoryCode.clear();

        systemModels.forEach(m => {
            if (m.factory_code) {
                const cleanCode = String(m.factory_code).trim().toLowerCase();
                systemModelsByFactoryCode.set(cleanCode, m);
            }
        });

        updatePurgeImpactSummary();
    } catch (err) {
        console.error('Error loading system models:', err);
        showToast('تعذر تحميل بيانات الموديلات من النظام', 'error');
    }
}

// ==========================================
// 🔍 4. Google Drive Scanning Engine
// ==========================================
async function handleDriveScan() {
    const inputEl = document.getElementById('drive-folder-url');
    const rawInput = inputEl?.value?.trim() || '';

    if (!rawInput) {
        showToast('يرجى إدخال رابط أو معرف مجلد Google Drive أولاً', 'error');
        return;
    }

    const folderId = extractDriveFolderId(rawInput);
    if (!folderId) {
        showToast('رابط غير صحيح. يرجى لصق رابط مجلد صالح من Google Drive', 'error');
        return;
    }

    const apiKey = getGoogleApiKey();
    if (!apiKey) {
        openApiKeyModal();
        showToast('يرجى إدخال مفتاح Google API لمتابعة الفحص', 'info');
        return;
    }

    localStorage.setItem(STORAGE_LAST_FOLDER_KEY, rawInput);

    const btnScan = document.getElementById('btn-scan-drive');
    const originalText = btnScan ? btnScan.innerHTML : '';
    if (btnScan) {
        btnScan.disabled = true;
        btnScan.innerHTML = `<i class="ph ph-spinner animate-spin text-xl"></i> جاري فحص Google Drive...`;
    }

    try {
        await loadSystemModels(); // Refresh system models

        // Scan drive recursively
        const scannedItems = await fetchGoogleDriveFolderContents(folderId, apiKey);

        if (!scannedItems || scannedItems.length === 0) {
            showToast('لم يتم العثور على أي ملفات أو مجلدات صور داخل مجلد Drive المحدد', 'warning');
            scannedDriveGroups = [];
            renderStudioUI();
            return;
        }

        // Process items into groups by Factory Code
        scannedDriveGroups = processScannedItems(scannedItems);

        // Preselect all ready models
        selectedFactoryCodes.clear();
        scannedDriveGroups.forEach(group => {
            if (group.systemModel) {
                selectedFactoryCodes.add(group.factoryCode);
            }
        });

        renderStudioUI();
        showToast(`تم فحص المجلد بنجاح: العثور على ${scannedDriveGroups.length} كود مصنع`, 'success');
    } catch (err) {
        console.error('Drive scan error:', err);
        const errorMsg = err.message || 'فشل فحص مجلد Google Drive';
        showToast(`خطأ في فحص Drive: ${errorMsg}`, 'error');
    } finally {
        if (btnScan) {
            btnScan.disabled = false;
            btnScan.innerHTML = originalText;
        }
    }
}

// Extract folder ID from URL or raw ID
function extractDriveFolderId(input) {
    if (!input) return null;
    const str = input.trim();
    const folderMatch = str.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return folderMatch[1];
    const idMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) return idMatch[1];
    if (/^[a-zA-Z0-9_-]{15,}$/.test(str)) return str;
    return null;
}

// Fetch Google Drive folder items via Drive v3 REST API
async function fetchGoogleDriveFolderContents(folderId, apiKey) {
    const baseUrl = 'https://www.googleapis.com/drive/v3/files';
    const query = `'${folderId}' in parents and trashed = false`;
    const fields = 'nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink, imageMediaMetadata)';
    
    let allFiles = [];
    let pageToken = null;

    do {
        let url = `${baseUrl}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000&key=${apiKey}`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

        const response = await fetch(url);
        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            let msg = errJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;
            if (response.status === 403 && (msg.includes('insufficient') || errJson.error?.errors?.[0]?.reason === 'insufficientFilePermissions')) {
                msg = 'المجلد في Google Drive غير متاح للعامة. يرجى فتح المجلد في Google Drive والضغط على Share ثم تغيير الوصول إلى "Anyone with the link can view" (أي شخص لديه الرابط يمكنه العرض).';
            }
            throw new Error(msg);
        }

        const data = await response.json();
        if (data.files) {
            allFiles.push(...data.files);
        }
        pageToken = data.nextPageToken;
    } while (pageToken);

    // Now check if there are subfolders
    const subfolders = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const directImages = allFiles.filter(f => isImageItem(f));

    const result = [];

    // If subfolders exist, fetch images inside each subfolder (Subfolder Name = Factory Code)
    if (subfolders.length > 0) {
        for (const subfolder of subfolders) {
            const subQuery = `'${subfolder.id}' in parents and trashed = false`;
            let subFiles = [];
            let subPageToken = null;

            do {
                let subUrl = `${baseUrl}?q=${encodeURIComponent(subQuery)}&fields=${encodeURIComponent(fields)}&pageSize=100&key=${apiKey}`;
                if (subPageToken) subUrl += `&pageToken=${encodeURIComponent(subPageToken)}`;

                const subRes = await fetch(subUrl);
                if (subRes.ok) {
                    const subData = await subRes.json();
                    if (subData.files) subFiles.push(...subData.files);
                    subPageToken = subData.nextPageToken;
                } else {
                    subPageToken = null;
                }
            } while (subPageToken);

            const folderImages = subFiles.filter(f => isImageItem(f));
            if (folderImages.length > 0) {
                result.push({
                    type: 'folder',
                    factoryCode: subfolder.name.trim(),
                    folderName: subfolder.name,
                    files: folderImages
                });
            }
        }
    }

    // Direct image files in parent folder
    if (directImages.length > 0) {
        result.push({
            type: 'flat_files',
            files: directImages
        });
    }

    return result;
}

function isImageItem(file) {
    if (!file) return false;
    if (file.mimeType && file.mimeType.startsWith('image/')) return true;
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp') || name.endsWith('.gif');
}

// Convert Drive files and subfolders into structured groups
function processScannedItems(scannedItems) {
    const groupsMap = new Map(); // normalizedFactoryCode -> { factoryCode, folderName, files: [] }

    for (const item of scannedItems) {
        if (item.type === 'folder') {
            const factoryCode = item.factoryCode;
            const normKey = factoryCode.toLowerCase();

            // Sort files inside folder naturally (1.jpg, 2.jpg, etc.)
            const sortedFiles = sortFilesNaturally(item.files);

            if (!groupsMap.has(normKey)) {
                groupsMap.set(normKey, {
                    factoryCode: factoryCode,
                    folderName: item.folderName,
                    files: sortedFiles
                });
            } else {
                groupsMap.get(normKey).files.push(...sortedFiles);
            }
        } else if (item.type === 'flat_files') {
            // Extract factory code from filename: 1001_1.jpg, 1001_2.jpg, 1002.jpg
            for (const file of item.files) {
                const parsed = parseFactoryCodeFromFileName(file.name);
                if (parsed) {
                    const normKey = parsed.factoryCode.toLowerCase();
                    if (!groupsMap.has(normKey)) {
                        groupsMap.set(normKey, {
                            factoryCode: parsed.factoryCode,
                            folderName: null,
                            files: []
                        });
                    }
                    groupsMap.get(normKey).files.push({
                        ...file,
                        _sortIndex: parsed.sortIndex
                    });
                }
            }
        }
    }

    const result = [];

    groupsMap.forEach((groupVal, normKey) => {
        // Natural sort files
        const sortedFiles = groupVal.files.sort((a, b) => {
            if (a._sortIndex !== undefined && b._sortIndex !== undefined) {
                return a._sortIndex - b._sortIndex;
            }
            return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
        });

        // Find matching model in Supabase strictly by factory_code
        const matchedModel = systemModelsByFactoryCode.get(normKey) || null;

        // Build existing file IDs for duplicate detection
        const existingDriveFileIds = new Set();
        if (matchedModel) {
            const allImages = [...(matchedModel.model_images || [])];
            [matchedModel.image_url_1, matchedModel.image_url_2, matchedModel.image_url_3].forEach(u => {
                if (u) allImages.push({ image_url: u });
            });

            allImages.forEach(img => {
                const fid = extractDriveFileIdFromUrl(img.image_url);
                if (fid) existingDriveFileIds.add(fid);
            });
        }

        // Format files with direct URLs and duplicate check
        const processedFiles = sortedFiles.map((f, idx) => {
            const isDuplicate = existingDriveFileIds.has(f.id);
            // استخدم رابط thumbnailLink المعطى رسمياً من Google Drive API مع رفع دقته
            const cdnThumbnail = f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s400') : `https://lh3.googleusercontent.com/d/${f.id}=s400`;
            const directUrl = f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s1200') : buildDirectDriveImageUrl(f.id);

            return {
                id: f.id,
                name: f.name,
                url: directUrl,
                thumbnail: cdnThumbnail,
                thumbnailLink: f.thumbnailLink || null,
                sortOrder: idx + 1,
                isCover: idx === 0,
                isDuplicate: isDuplicate
            };
        });

        const hasPrevImages = matchedModel && (
            (matchedModel.model_images && matchedModel.model_images.length > 0) ||
            matchedModel.image_url_1
        );

        let status = 'ready';
        if (!matchedModel) {
            status = 'not_found';
        } else if (hasPrevImages) {
            status = 'has_prev';
        }

        result.push({
            factoryCode: groupVal.factoryCode,
            folderName: groupVal.folderName,
            files: processedFiles,
            systemModel: matchedModel,
            status: status,
            existingCount: matchedModel ? (matchedModel.model_images?.length || (matchedModel.image_url_1 ? 1 : 0)) : 0
        });
    });

    // Natural sort the groups by factory code
    result.sort((a, b) => a.factoryCode.localeCompare(b.factoryCode, undefined, { numeric: true, sensitivity: 'base' }));

    return result;
}

// Natural sort files
function sortFilesNaturally(files) {
    return [...files].sort((a, b) => {
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
    });
}

// Parse factory code from filename like: "1001_1.jpg", "7102-2.png", "1002 (1).jpg", "1002.jpg"
function parseFactoryCodeFromFileName(fileName) {
    if (!fileName) return null;
    const clean = fileName.trim();
    const match = clean.match(/^([a-zA-Z0-9\u0600-\u06FF_-]+?)(?:[_\-\s\(]+(\d+)\)?)?\.(?:jpg|jpeg|png|webp|gif)$/i);
    if (match) {
        return {
            factoryCode: match[1].trim(),
            sortIndex: match[2] ? parseInt(match[2], 10) : 1
        };
    }
    const dotIndex = clean.lastIndexOf('.');
    if (dotIndex > 0) {
        return {
            factoryCode: clean.substring(0, dotIndex).trim(),
            sortIndex: 1
        };
    }
    return null;
}

// Extract Drive file ID from any URL
function extractDriveFileIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

// Build standard high-res direct thumbnail image URL
function buildDirectDriveImageUrl(fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
}

// ==========================================
// 🎨 5. Rendering the Studio Interface
// ==========================================
function renderStudioUI() {
    const studioSection = document.getElementById('drive-studio-card');
    if (!studioSection) return;

    if (scannedDriveGroups.length === 0) {
        studioSection.classList.add('hidden');
        return;
    }

    studioSection.classList.remove('hidden');

    // Update top summary counters (Matching Image 2)
    const totalModels = scannedDriveGroups.length;
    const readyModels = scannedDriveGroups.filter(g => g.systemModel && g.status === 'ready').length;
    const prevImagesModels = scannedDriveGroups.filter(g => g.status === 'has_prev').length;
    const notFoundModels = scannedDriveGroups.filter(g => g.status === 'not_found').length;
    const totalImages = scannedDriveGroups.reduce((acc, g) => acc + g.files.length, 0);

    const elTotal = document.getElementById('studio-stat-total');
    const elReady = document.getElementById('studio-stat-ready');
    const elPrev = document.getElementById('studio-stat-prev');
    const elNotFound = document.getElementById('studio-stat-notfound');
    const elImages = document.getElementById('studio-stat-images');

    if (elTotal) elTotal.textContent = totalModels;
    if (elReady) elReady.textContent = readyModels;
    if (elPrev) elPrev.textContent = prevImagesModels;
    if (elNotFound) elNotFound.textContent = notFoundModels;
    if (elImages) elImages.textContent = totalImages;

    updateSelectionBadge();
    renderStudioTable();
}

function getFilteredGroups() {
    return scannedDriveGroups.filter(group => {
        // Tab Filter
        if (activeFilterTab === 'ready' && group.status !== 'ready') return false;
        if (activeFilterTab === 'has_prev' && group.status !== 'has_prev') return false;
        if (activeFilterTab === 'not_found' && group.status !== 'not_found') return false;

        // Search Query
        if (searchQuery) {
            const codeMatch = group.factoryCode.toLowerCase().includes(searchQuery);
            const nameMatch = group.systemModel?.name?.toLowerCase().includes(searchQuery);
            const sysCodeMatch = group.systemModel?.system_code?.toLowerCase().includes(searchQuery);
            if (!codeMatch && !nameMatch && !sysCodeMatch) return false;
        }

        return true;
    });
}

function renderStudioTable() {
    const tbody = document.getElementById('drive-studio-table-body');
    if (!tbody) return;

    const visibleGroups = getFilteredGroups();

    if (visibleGroups.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-12 text-devo-muted">
                    <i class="ph ph-magnifying-glass text-3xl mb-2 block opacity-40"></i>
                    لا توجد نتائج تطابق خيارات الفلترة أو البحث الحالية
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    visibleGroups.forEach(group => {
        const isChecked = selectedFactoryCodes.has(group.factoryCode);
        const hasModel = !!group.systemModel;
        const disabledAttr = hasModel ? '' : 'disabled';

        // Matching Model Column info
        let modelHtml = '';
        if (hasModel) {
            const m = group.systemModel;
            modelHtml = `
                <div class="flex flex-col">
                    <span class="font-bold text-white text-sm hover:text-devo-orange transition-colors">${m.name}</span>
                    <span class="text-xs text-devo-muted mt-0.5">كود المصنع: <span class="font-mono text-white/90 font-bold">${m.factory_code}</span> | كود السيستم: ${m.system_code || '-'}</span>
                </div>
            `;
        } else {
            modelHtml = `
                <div class="flex items-center gap-2 text-devo-error">
                    <i class="ph ph-warning-circle text-lg"></i>
                    <span class="font-bold text-xs">غير مسجل بالنظام</span>
                </div>
            `;
        }

        // Status Badge Column
        let statusBadge = '';
        if (!hasModel) {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-devo-error/15 text-devo-error border border-devo-error/30"><i class="ph ph-x-circle"></i> غير مسجل</span>`;
        } else if (group.status === 'has_prev') {
            statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-sm"><i class="ph ph-camera"></i> لديه ${group.existingCount} صور سابقة</span>`;
        } else {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-devo-success/15 text-devo-success border border-devo-success/30"><i class="ph ph-check-circle"></i> جديد - لا يملك صوراً</span>`;
        }

        // Thumbnails preview
        const thumbnailsHtml = group.files.map((file, idx) => {
            const isDup = file.isDuplicate;
            const borderClass = isDup ? 'border-amber-500/60 ring-1 ring-amber-500/40' : 'border-devo-gray hover:border-devo-orange';
            const badgeLabel = idx === 0 ? '<span class="absolute top-1 right-1 bg-devo-orange text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">غلاف</span>' : '';
            const dupBadge = isDup ? '<span class="absolute bottom-1 left-1 bg-amber-600/90 text-white text-[8px] font-bold px-1 rounded shadow">مرفوعة مسبقاً</span>' : '';

            return `
                <div class="relative group/thumb shrink-0 cursor-pointer" onclick="window.openDriveImageLightbox('${group.factoryCode}', ${idx})">
                    <img src="${file.thumbnail}" alt="${file.name}" referrerpolicy="no-referrer" class="w-14 h-16 object-cover rounded-lg border ${borderClass} bg-devo-black shadow-sm transition-transform group-hover/thumb:scale-105" decoding="async" onerror="if (!this.dataset.fallback) { this.dataset.fallback = '1'; this.src = 'https://drive.google.com/thumbnail?id=${file.id}&sz=w400'; } else if (this.dataset.fallback === '1') { this.dataset.fallback = '2'; this.src = 'https://drive.google.com/uc?export=view&id=${file.id}'; } else { this.src='./src/assets/icons/devo.png'; }">
                    ${badgeLabel}
                    ${dupBadge}
                </div>
            `;
        }).join('');

        html += `
            <tr class="border-b border-devo-gray/50 hover:bg-white/[0.02] transition-colors ${!hasModel ? 'opacity-60 bg-red-950/10' : ''}">
                <td class="py-3 px-4 text-center">
                    <input type="checkbox" data-factory="${group.factoryCode}" class="model-row-checkbox accent-devo-orange w-4 h-4 rounded cursor-pointer" ${isChecked ? 'checked' : ''} ${disabledAttr}>
                </td>
                <td class="py-3 px-4 font-mono font-black text-devo-orange text-sm">
                    <div class="flex items-center gap-2">
                        <span>${group.factoryCode}</span>
                        ${group.folderName ? `<span class="text-[10px] text-devo-muted font-normal bg-devo-black px-1.5 py-0.5 rounded border border-devo-gray/40">مجلد</span>` : ''}
                    </div>
                </td>
                <td class="py-3 px-4">${modelHtml}</td>
                <td class="py-3 px-4">${statusBadge}</td>
                <td class="py-3 px-4 text-center font-bold text-white text-sm">${group.files.length}</td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar max-w-sm">
                        ${thumbnailsHtml}
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Attach row checkbox handlers
    tbody.querySelectorAll('.model-row-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const fCode = e.target.getAttribute('data-factory');
            if (e.target.checked) {
                selectedFactoryCodes.add(fCode);
            } else {
                selectedFactoryCodes.delete(fCode);
            }
            updateSelectionBadge();
        });
    });

    updateHeaderSelectAllState();
}

function renderStudioTableRowsOnly() {
    renderStudioTable();
}

function updateHeaderSelectAllState() {
    const selectAllHeader = document.getElementById('th-select-all-models');
    if (!selectAllHeader) return;

    const visible = getFilteredGroups().filter(g => !!g.systemModel);
    if (visible.length === 0) {
        selectAllHeader.checked = false;
        selectAllHeader.indeterminate = false;
        return;
    }

    const allChecked = visible.every(g => selectedFactoryCodes.has(g.factoryCode));
    const someChecked = visible.some(g => selectedFactoryCodes.has(g.factoryCode));

    selectAllHeader.checked = allChecked;
    selectAllHeader.indeterminate = !allChecked && someChecked;
}

function updateSelectionBadge() {
    const badge = document.getElementById('studio-selected-count-badge');
    if (badge) {
        badge.textContent = `${selectedFactoryCodes.size} موديل محدد`;
    }
    updatePurgeImpactSummary();
}

function switchFilterTab(filter) {
    activeFilterTab = filter;
    document.querySelectorAll('.drive-filter-tab').forEach(t => {
        const f = t.getAttribute('data-filter') || 'all';
        if (f === filter) {
            t.className = 'drive-filter-tab px-4 py-1.5 rounded-lg text-xs font-bold bg-devo-orange text-white shadow-sm transition-all';
        } else {
            t.className = 'drive-filter-tab px-4 py-1.5 rounded-lg text-xs font-bold text-devo-muted hover:text-white bg-devo-black border border-devo-gray/60 transition-all';
        }
    });
    renderStudioTable();
}

function handleSelectNewOnly() {
    selectedFactoryCodes.clear();
    scannedDriveGroups.forEach(g => {
        if (g.systemModel && g.status === 'ready') {
            selectedFactoryCodes.add(g.factoryCode);
        }
    });
    updateSelectionBadge();
    renderStudioTable();
    showToast(`تم تحديد ${selectedFactoryCodes.size} موديل جديد فقط`, 'info');
}

function toggleFullscreen() {
    const card = document.getElementById('drive-studio-card');
    const btn = document.getElementById('btn-toggle-fullscreen');
    if (!card) return;

    isFullscreen = !isFullscreen;
    if (isFullscreen) {
        card.classList.add('fixed', 'inset-0', 'z-[180]', 'p-6', 'bg-devo-dark', 'overflow-y-auto');
        if (btn) btn.innerHTML = `<i class="ph ph-corners-in text-lg"></i> تصغير الشاشة`;
    } else {
        card.classList.remove('fixed', 'inset-0', 'z-[180]', 'p-6', 'bg-devo-dark', 'overflow-y-auto');
        if (btn) btn.innerHTML = `<i class="ph ph-corners-out text-lg"></i> ملء الشاشة`;
    }
}

// ==========================================
// 📥 6. Execute Images Import (With Duplicate Prevention)
// ==========================================
async function handleImportSelected() {
    if (selectedFactoryCodes.size === 0) {
        showToast('يرجى تحديد موديل واحد على الأقل للاستيراد', 'warning');
        return;
    }

    const currentTenantId = getCurrentTenantId();
    const groupsToImport = scannedDriveGroups.filter(g => selectedFactoryCodes.has(g.factoryCode) && g.systemModel);

    if (groupsToImport.length === 0) {
        showToast('الموديلات المحددة غير مسجلة بالنظام ولا يمكن استيراد صورها', 'error');
        return;
    }

    // Confirmation dialog
    const confirmed = await confirmDialog({
        title: 'تأكيد استيراد صور الموديلات',
        message: `أنت على وشك استيراد وربط صور ${groupsToImport.length} موديل بنظام المتجر.\nسيتم الرفع والحفظ على دفعات لضمان الاستقرار.\nهل تريد متابعة العملية وحفظ الصور؟`,
        confirmText: 'نعم، ابدأ الاستيراد',
        cancelText: 'إلغاء'
    });

    if (!confirmed) return;

    const btnImport = document.getElementById('btn-import-selected-images');
    const originalText = btnImport ? btnImport.innerHTML : '';
    if (btnImport) {
        btnImport.disabled = true;
        btnImport.innerHTML = `<i class="ph ph-spinner animate-spin text-xl"></i> جاري الاستيراد...`;
    }

    const totalModels = groupsToImport.length;
    // دفعات متوازنة بحجم 8 موديلات للدفعة الواحدة لمنع الـ timeout وتجاوز حدود الطلبات
    const BATCH_SIZE = 8;
    const totalBatches = Math.ceil(totalModels / BATCH_SIZE);

    showDriveImagesProgress(
        'استيراد وحفظ صور الموديلات',
        `جاري بدء رفع ومعالجة الصور لعدد ${totalModels} موديل...`,
        5,
        `0 / ${totalModels} موديل`
    );

    let updatedModelsCount = 0;
    let importedImagesCount = 0;
    let skippedModelsCount = 0;

    try {
        for (let b = 0; b < totalBatches; b++) {
            const batchStart = b * BATCH_SIZE;
            const chunk = groupsToImport.slice(batchStart, batchStart + BATCH_SIZE);
            const batchNum = b + 1;
            const chunkModelIds = chunk.map(g => g.systemModel.id);

            const percentStart = Math.round(5 + (batchStart / totalModels) * 90);
            updateDriveImagesProgress(
                `جاري معالجة ورفع الدفعة ${batchNum} من ${totalBatches}...`,
                percentStart,
                `${batchStart} / ${totalModels} موديل`
            );
            await new Promise(r => setTimeout(r, 20));

            // 1. فحص جماعي للصور المسجلة لموديلات هذه الدفعة دفعة واحدة
            const { data: existingImgs, error: fetchErr } = await supabase
                .from('model_images')
                .select('id, model_id, image_url')
                .in('model_id', chunkModelIds);

            if (fetchErr) throw fetchErr;

            const existingByModel = new Map();
            chunkModelIds.forEach(id => existingByModel.set(id, new Set()));

            (existingImgs || []).forEach(img => {
                const fid = extractDriveFileIdFromUrl(img.image_url);
                if (fid && existingByModel.has(img.model_id)) {
                    existingByModel.get(img.model_id).add(fid);
                }
            });

            // فحص أعمدة الصور القديمة بالموديل
            chunk.forEach(group => {
                const m = group.systemModel;
                const modelSet = existingByModel.get(m.id);
                [m.image_url_1, m.image_url_2, m.image_url_3].forEach(u => {
                    if (u) {
                        const fid = extractDriveFileIdFromUrl(u);
                        if (fid && modelSet) modelSet.add(fid);
                    }
                });
            });

            // 2. تجهيز الصور غير المكررة لهذه الدفعة
            const fullPayload = [];
            const basicPayload = [];
            const modelLegacyUpdates = [];

            chunk.forEach(group => {
                const modelId = group.systemModel.id;
                const modelSet = existingByModel.get(modelId) || new Set();
                const newImages = group.files.filter(f => !modelSet.has(f.id));

                if (newImages.length === 0) {
                    skippedModelsCount++;
                    return;
                }

                updatedModelsCount++;
                importedImagesCount += newImages.length;

                newImages.forEach(f => {
                    const row = {
                        model_id: modelId,
                        image_url: f.url,
                        drive_file_id: f.id,
                        sort_order: f.sortOrder,
                        is_cover: f.isCover
                    };
                    if (currentTenantId) row.tenant_id = currentTenantId;
                    fullPayload.push(row);

                    const basicRow = {
                        model_id: modelId,
                        image_url: f.url
                    };
                    if (currentTenantId) basicRow.tenant_id = currentTenantId;
                    basicPayload.push(basicRow);
                });

                // تحديث أعمدة الموديل الأساسية (image_url_1,2,3)
                const currentForModel = (existingImgs || []).filter(i => i.model_id === modelId).map(i => i.image_url);
                const allModelImages = [...currentForModel, ...newImages.map(f => f.url)];
                modelLegacyUpdates.push({
                    id: modelId,
                    image_url_1: allModelImages[0] || null,
                    image_url_2: allModelImages[1] || null,
                    image_url_3: allModelImages[2] || null
                });
            });

            // 3. إدراج الصور الجديدة دفعة واحدة (Bulk Insert)
            if (fullPayload.length > 0) {
                let { error: insertErr } = await supabase
                    .from('model_images')
                    .insert(fullPayload);

                if (insertErr && (insertErr.message?.includes('drive_file_id') || insertErr.message?.includes('schema cache') || insertErr.code === 'PGRST204')) {
                    const fallbackRes = await supabase.from('model_images').insert(basicPayload);
                    insertErr = fallbackRes.error;
                }

                if (insertErr) throw insertErr;
            }

            // 4. تحديث صور كروت الموديلات بالتوازي
            if (modelLegacyUpdates.length > 0) {
                await Promise.all(modelLegacyUpdates.map(u => 
                    supabase.from('models').update({
                        image_url_1: u.image_url_1,
                        image_url_2: u.image_url_2,
                        image_url_3: u.image_url_3
                    }).eq('id', u.id)
                ));
            }

            const doneCount = Math.min(totalModels, batchStart + chunk.length);
            const percentEnd = Math.round(5 + (doneCount / totalModels) * 90);
            updateDriveImagesProgress(
                `تم حفظ الدفعة ${batchNum} من ${totalBatches} (${doneCount} من ${totalModels} موديل)...`,
                percentEnd,
                `${doneCount} / ${totalModels} موديل`
            );
            await new Promise(r => setTimeout(r, 20));
        }

        updateDriveImagesProgress('اكتمل حفظ وتحديث كافة صور الموديلات بنجاح!', 100, `${totalModels} / ${totalModels} موديل`);

        // Save last sync summary in localStorage
        const syncResult = {
            timestamp: new Date().toISOString(),
            updatedModels: updatedModelsCount,
            importedImages: importedImagesCount,
            unregisteredModels: scannedDriveGroups.filter(g => g.status === 'not_found').length,
            skippedModels: skippedModelsCount,
            strategy: 'إلحاق / عدم تكرار'
        };
        localStorage.setItem(STORAGE_LAST_SYNC_KEY, JSON.stringify(syncResult));

        renderLastSyncCard();
        await loadSystemModels(); // Reload fresh database models

        // Refresh studio groups to reflect newly attached images
        scannedDriveGroups = processScannedItems(scannedDriveGroups.map(g => ({
            type: g.folderName ? 'folder' : 'flat_files',
            factoryCode: g.factoryCode,
            folderName: g.folderName,
            files: g.files
        })));
        renderStudioUI();

        await logAuditEvent({
            module: 'drive_images',
            actionType: 'import_drive_images',
            entityType: 'model_images',
            details: `استيراد صور Google Drive: تم تحديث ${updatedModelsCount} موديل وإضافة ${importedImagesCount} صورة.`
        });

        setTimeout(() => {
            hideDriveImagesProgress();
            showToast(`اكتملت المزامنة بنجاح! تم تحديث ${updatedModelsCount} موديل وإضافة ${importedImagesCount} صورة${skippedModelsCount > 0 ? ` (تم تخطي ${skippedModelsCount} موديل لعدم وجود صور جديدة)` : ''}.`, 'success');
        }, 500);

    } catch (err) {
        console.error('Import execution error:', err);
        hideDriveImagesProgress();
        showToast(`حدث خطأ أثناء حفظ الصور: ${err.message || err}`, 'error');
    } finally {
        if (btnImport) {
            btnImport.disabled = false;
            btnImport.innerHTML = originalText;
        }
    }
}

// ==========================================
// 🗑️ 7. Image Purge Engine (تفريغ ومسح صور الموديلات)
// ==========================================
function openPurgeModal() {
    updatePurgeImpactSummary();
    const modal = document.getElementById('image-purge-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closePurgeModal() {
    const modal = document.getElementById('image-purge-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function getSelectedPurgeScope() {
    const radio = document.querySelector('input[name="purge-scope"]:checked');
    return radio ? radio.value : 'selected';
}

function getSelectedPurgeTarget() {
    const radio = document.querySelector('input[name="purge-target"]:checked');
    return radio ? radio.value : 'all';
}

function getCustomPurgeIndex() {
    const input = document.getElementById('purge-custom-index');
    const val = parseInt(input?.value || '4', 10);
    return isNaN(val) || val < 1 ? 4 : val;
}

// Compute models and image counts for the purge impact card
function computePurgeImpact() {
    const scope = getSelectedPurgeScope();
    const target = getSelectedPurgeTarget();
    const customIndex = getCustomPurgeIndex();

    let targetModels = [];

    if (scope === 'drive_with_images') {
        // Scanned drive models that currently have images in system
        targetModels = scannedDriveGroups
            .filter(g => g.systemModel && (g.systemModel.model_images?.length > 0 || g.systemModel.image_url_1))
            .map(g => g.systemModel);
    } else if (scope === 'selected') {
        // Currently selected models in table
        targetModels = scannedDriveGroups
            .filter(g => selectedFactoryCodes.has(g.factoryCode) && g.systemModel)
            .map(g => g.systemModel);
    } else if (scope === 'filtered') {
        // Currently visible models in table
        targetModels = getFilteredGroups()
            .filter(g => g.systemModel)
            .map(g => g.systemModel);
    } else if (scope === 'all_system') {
        // All models in entire database
        targetModels = systemModels;
    }

    let affectedModelsCount = 0;
    let imagesToDeleteCount = 0;

    targetModels.forEach(m => {
        const imgs = m.model_images || [];
        const count = imgs.length || (m.image_url_1 ? 1 : 0);
        let modelAffected = false;

        if (target === 'all') {
            if (count > 0) {
                imagesToDeleteCount += count;
                modelAffected = true;
            }
        } else if (target === 'cover') {
            if (count >= 1) {
                imagesToDeleteCount += 1;
                modelAffected = true;
            }
        } else if (target === 'second') {
            if (count >= 2) {
                imagesToDeleteCount += 1;
                modelAffected = true;
            }
        } else if (target === 'third') {
            if (count >= 3) {
                imagesToDeleteCount += 1;
                modelAffected = true;
            }
        } else if (target === 'custom') {
            if (count >= customIndex) {
                imagesToDeleteCount += 1;
                modelAffected = true;
            }
        }

        if (modelAffected) affectedModelsCount++;
    });

    return {
        scope,
        target,
        customIndex,
        targetModels,
        affectedModelsCount,
        imagesToDeleteCount
    };
}

function updatePurgeImpactSummary() {
    const impact = computePurgeImpact();

    // Update scope badges on the modal radios
    const badgeDriveWithImages = document.getElementById('purge-badge-drive-images');
    const badgeSelected = document.getElementById('purge-badge-selected');
    const badgeFiltered = document.getElementById('purge-badge-filtered');
    const badgeAll = document.getElementById('purge-badge-all');

    if (badgeDriveWithImages) {
        const count = scannedDriveGroups.filter(g => g.systemModel && (g.systemModel.model_images?.length > 0 || g.systemModel.image_url_1)).length;
        badgeDriveWithImages.textContent = `${count} موديل`;
    }
    if (badgeSelected) {
        const count = scannedDriveGroups.filter(g => selectedFactoryCodes.has(g.factoryCode) && g.systemModel).length;
        badgeSelected.textContent = `${count} موديل`;
    }
    if (badgeFiltered) {
        const count = getFilteredGroups().filter(g => g.systemModel).length;
        badgeFiltered.textContent = `${count} موديل`;
    }
    if (badgeAll) {
        badgeAll.textContent = `${systemModels.length} موديل`;
    }

    // Update bottom impact box
    const elModelsCount = document.getElementById('purge-impact-models-count');
    const elImagesCount = document.getElementById('purge-impact-images-count');
    const elTextDesc = document.getElementById('purge-impact-desc');

    if (elModelsCount) elModelsCount.textContent = impact.affectedModelsCount;
    if (elImagesCount) elImagesCount.textContent = impact.imagesToDeleteCount;

    if (elTextDesc) {
        let actionDesc = 'تفريغ جميع الصور بالكامل';
        if (impact.target === 'cover') actionDesc = 'حذف صورة الغلاف وترقية الصورة التالية كغلاف';
        else if (impact.target === 'second') actionDesc = 'حذف الصورة الثانية فقط';
        else if (impact.target === 'third') actionDesc = 'حذف الصورة الثالثة فقط';
        else if (impact.target === 'custom') actionDesc = `حذف الصورة ذات الترتيب رقم ${impact.customIndex} فقط`;

        elTextDesc.textContent = `سيتم ${actionDesc} وحذف ${impact.imagesToDeleteCount} صورة من إجمالي ${impact.affectedModelsCount} موديل مستهدف بشكل آمن على دفعات.`;
    }
}

async function executeImagePurge() {
    const impact = computePurgeImpact();

    if (impact.affectedModelsCount === 0 || impact.imagesToDeleteCount === 0) {
        showToast('لا توجد صور لتفريغها ضمن النطاق المحدد', 'warning');
        return;
    }

    const confirmed = await confirmDialog({
        title: 'تأكيد مسح وتفريغ الصور نهائياً',
        message: `تحذير: سيتم حذف ${impact.imagesToDeleteCount} صورة من ${impact.affectedModelsCount} موديل.\nهذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟`,
        confirmText: 'نعم، احذف الصور الآن',
        cancelText: 'إلغاء'
    });

    if (!confirmed) return;

    closePurgeModal();

    const btnConfirm = document.getElementById('btn-confirm-purge');
    const origText = btnConfirm ? btnConfirm.innerHTML : '';
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `<i class="ph ph-spinner animate-spin text-xl"></i> جاري المسح والتفريغ...`;
    }

    const targetModelIds = impact.targetModels.map(m => m.id);
    const totalPurgeModels = targetModelIds.length;

    showDriveImagesProgress(
        'تفريغ ومسح صور الموديلات',
        `جاري بدء عملية التفريغ لعدد ${totalPurgeModels} موديل (${impact.imagesToDeleteCount} صورة)...`,
        5,
        `0 / ${totalPurgeModels} موديل`
    );

    try {
        if (impact.target === 'all') {
            const chunkSize = 25; // دفعات متوازنة لتجنب بطء الاستجابة
            const totalBatches = Math.ceil(targetModelIds.length / chunkSize);
            for (let i = 0; i < targetModelIds.length; i += chunkSize) {
                const chunk = targetModelIds.slice(i, i + chunkSize);
                const batchNum = Math.floor(i / chunkSize) + 1;
                const percent = Math.round(5 + (i / targetModelIds.length) * 90);

                updateDriveImagesProgress(
                    `جاري تفريغ الصور (الدفعة ${batchNum} من ${totalBatches})...`,
                    percent,
                    `${i} / ${totalPurgeModels} موديل`
                );
                await new Promise(r => setTimeout(r, 20));

                const { error: delErr } = await supabase
                    .from('model_images')
                    .delete()
                    .in('model_id', chunk);

                if (delErr) throw delErr;

                const { error: modErr } = await supabase
                    .from('models')
                    .update({
                        image_url_1: null,
                        image_url_2: null,
                        image_url_3: null
                    })
                    .in('id', chunk);

                if (modErr) throw modErr;
            }
        } else {
            const targetIdx = impact.target === 'cover' ? 0
                            : impact.target === 'second' ? 1
                            : impact.target === 'third' ? 2
                            : (impact.customIndex - 1);

            const chunkSize = 15;
            const totalBatches = Math.ceil(impact.targetModels.length / chunkSize);

            for (let i = 0; i < impact.targetModels.length; i += chunkSize) {
                const chunk = impact.targetModels.slice(i, i + chunkSize);
                const batchNum = Math.floor(i / chunkSize) + 1;
                const percent = Math.round(5 + (i / impact.targetModels.length) * 90);

                updateDriveImagesProgress(
                    `جاري حذف الصور المحددة (الدفعة ${batchNum} من ${totalBatches})...`,
                    percent,
                    `${i} / ${totalPurgeModels} موديل`
                );
                await new Promise(r => setTimeout(r, 20));

                for (const model of chunk) {
                    const { data: imgs, error: fetchErr } = await supabase
                        .from('model_images')
                        .select('id, image_url, created_at')
                        .eq('model_id', model.id)
                        .order('created_at', { ascending: true });

                    if (fetchErr) throw fetchErr;

                    if (imgs && imgs[targetIdx]) {
                        const imgToDelete = imgs[targetIdx];
                        const { error: delErr } = await supabase
                            .from('model_images')
                            .delete()
                            .eq('id', imgToDelete.id);

                        if (delErr) throw delErr;

                        const remaining = imgs.filter(img => img.id !== imgToDelete.id);
                        await supabase
                            .from('models')
                            .update({
                                image_url_1: remaining[0]?.image_url || null,
                                image_url_2: remaining[1]?.image_url || null,
                                image_url_3: remaining[2]?.image_url || null
                            })
                            .eq('id', model.id);
                    }
                }
            }
        }

        updateDriveImagesProgress('اكتمل تفريغ الصور بنجاح!', 100, `${totalPurgeModels} / ${totalPurgeModels} موديل`);

        await logAuditEvent({
            module: 'drive_images',
            actionType: 'purge_model_images',
            entityType: 'model_images',
            details: `تفريغ صور الموديلات: تم حذف ${impact.imagesToDeleteCount} صورة من ${impact.affectedModelsCount} موديل.`
        });

        await loadSystemModels();
        if (scannedDriveGroups.length > 0) {
            scannedDriveGroups = processScannedItems(scannedDriveGroups.map(g => ({
                type: g.folderName ? 'folder' : 'flat_files',
                factoryCode: g.factoryCode,
                folderName: g.folderName,
                files: g.files
            })));
            renderStudioUI();
        }

        setTimeout(() => {
            hideDriveImagesProgress();
            showToast(`تم تفريغ الصور بنجاح! تم حذف ${impact.imagesToDeleteCount} صورة من ${impact.affectedModelsCount} موديل.`, 'success');
        }, 500);

    } catch (err) {
        console.error('Purge error:', err);
        hideDriveImagesProgress();
        showToast(`حدث خطأ أثناء تفريغ الصور: ${err.message || err}`, 'error');
    } finally {
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = origText;
        }
    }
}

// ==========================================
// ⚙️ 8. Google API Key Management & Settings
// ==========================================
let settingsListenersAttached = false;

export function getGoogleApiKey() {
    return localStorage.getItem(STORAGE_API_KEY) || '';
}

export function checkApiKeyStatus() {
    const key = getGoogleApiKey();
    const hasValidKey = !!(key && key.trim().length > 10);

    // 1. Badge on Import Images page header
    const importBadge = document.getElementById('google-api-status-badge');
    if (importBadge) {
        if (hasValidKey) {
            importBadge.className = 'nav-link inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 transition-all hover:opacity-80';
            importBadge.innerHTML = `<i class="ph ph-check-circle"></i> مفتاح API مضبوط`;
        } else {
            importBadge.className = 'nav-link inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 cursor-pointer transition-all hover:opacity-80';
            importBadge.innerHTML = `<i class="ph ph-warning-circle"></i> لم يتم ضبط مفتاح API`;
        }
    }

    // 2. Badge in Google Drive Settings page
    const settingsBadge = document.getElementById('google-api-settings-status-badge');
    if (settingsBadge) {
        if (hasValidKey) {
            settingsBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
            settingsBadge.innerHTML = `<i class="ph ph-check-circle"></i> مفتاح API مضبوط ومفعل`;
        } else {
            settingsBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30';
            settingsBadge.innerHTML = `<i class="ph ph-warning-circle"></i> لم يتم ضبط مفتاح API`;
        }
    }

    // 3. Banner in Google Drive Settings page
    const banner = document.getElementById('google-api-status-banner');
    const bannerTitle = document.getElementById('google-api-banner-title');
    const bannerDesc = document.getElementById('google-api-banner-desc');
    if (banner && bannerTitle && bannerDesc) {
        const bannerIcon = banner.querySelector('i');
        if (hasValidKey) {
            banner.className = 'rounded-xl p-4 border transition-all text-xs flex items-start gap-3 bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
            if (bannerIcon) bannerIcon.className = 'ph ph-check-circle text-xl shrink-0 mt-0.5 text-emerald-400';
            bannerTitle.textContent = 'مفتاح Google Drive API مضبوط ومحفوظ محلياً';
            bannerDesc.textContent = 'جاهز للاستخدام! يمكنك الآن فحص واستيراد صور الموديلات من أي مجلد Google Drive عام بكل سهولة.';
        } else {
            banner.className = 'rounded-xl p-4 border transition-all text-xs flex items-start gap-3 bg-amber-500/10 border-amber-500/30 text-amber-300';
            if (bannerIcon) bannerIcon.className = 'ph ph-info text-xl shrink-0 mt-0.5 text-amber-400';
            bannerTitle.textContent = 'لم يتم ضبط مفتاح API بعد';
            bannerDesc.textContent = 'لن تتمكن من فحص مجلدات Google Drive واستيراد صور الموديلات قبل إدخال مفتاح API صالح ومفعل فيه Google Drive API.';
        }
    }
}

export function initGoogleApiSettingsView() {
    const input = document.getElementById('google-api-key-settings-input');
    if (input) {
        input.value = getGoogleApiKey();
    }
    
    checkApiKeyStatus();

    if (!settingsListenersAttached) {
        attachSettingsEventListeners();
        settingsListenersAttached = true;
    }
}

function attachSettingsEventListeners() {
    // 1. Password Visibility Toggle
    const btnToggleVis = document.getElementById('btn-toggle-api-key-vis');
    const input = document.getElementById('google-api-key-settings-input');
    const iconVis = document.getElementById('icon-toggle-api-key-vis');
    if (btnToggleVis && input && iconVis) {
        btnToggleVis.addEventListener('click', () => {
            if (input.type === 'password') {
                input.type = 'text';
                iconVis.className = 'ph ph-eye-slash text-lg text-devo-orange';
            } else {
                input.type = 'password';
                iconVis.className = 'ph ph-eye text-lg text-devo-muted';
            }
        });
    }

    // 2. Save Key Button
    const btnSave = document.getElementById('btn-save-settings-api-key');
    if (btnSave) {
        btnSave.addEventListener('click', () => {
            const val = input?.value?.trim() || '';
            if (!val) {
                showToast('يرجى كتابة مفتاح Google API صالح', 'warning');
                return;
            }
            localStorage.setItem(STORAGE_API_KEY, val);
            checkApiKeyStatus();
            showToast('تم حفظ مفتاح Google API بنجاح!', 'success');
            
            const resultBox = document.getElementById('google-api-test-result');
            if (resultBox) resultBox.classList.add('hidden');
        });
    }

    // 3. Test Connection Button
    const btnTest = document.getElementById('btn-test-settings-api-key');
    if (btnTest) {
        btnTest.addEventListener('click', () => {
            const val = input?.value?.trim() || getGoogleApiKey();
            testGoogleApiKey(val);
        });
    }

    // 4. Delete Key Button
    const btnDelete = document.getElementById('btn-delete-settings-api-key');
    if (btnDelete) {
        btnDelete.addEventListener('click', () => {
            const currentKey = getGoogleApiKey();
            if (!currentKey && !input?.value) {
                showToast('لا يوجد مفتاح محفوظ لحذفه', 'info');
                return;
            }
            if (confirm('هل أنت متأكد من حذف مفتاح Google API من هذا الجهاز؟')) {
                localStorage.removeItem(STORAGE_API_KEY);
                if (input) input.value = '';
                checkApiKeyStatus();
                const resultBox = document.getElementById('google-api-test-result');
                if (resultBox) resultBox.classList.add('hidden');
                showToast('تم حذف مفتاح Google API', 'info');
            }
        });
    }
}

async function testGoogleApiKey(key) {
    if (!key || !key.trim()) {
        showToast('يرجى إدخال مفتاح Google API لاختباره', 'warning');
        return;
    }

    const btn = document.getElementById('btn-test-settings-api-key');
    const resultBox = document.getElementById('google-api-test-result');
    const originalContent = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="ph ph-spinner animate-spin text-base text-sky-400"></i> <span>جاري الاختبار...</span>`;
    }

    try {
        const cleanKey = key.trim();
        // نفحص المفتاح عبر استعلام Google Drive v3 مع باراميتر q آمن
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='dummy'+in+parents&pageSize=1&key=${encodeURIComponent(cleanKey)}`);
        const data = await res.json();

        // في Google Drive v3 عند استخدام API Key:
        // إذا كان المفتاح صالحاً وخدمة Drive API مفعلة بالـ Google Cloud، الرد يكون 200 OK أو 404 (File not found لـ dummy)
        const isKeyValid = res.ok || (res.status === 404 && data?.error?.errors?.[0]?.reason === 'notFound');

        if (isKeyValid) {
            showToast('تم الاتصال بنجاح! مفتاح Google Drive API صالح ومفعل.', 'success');
            if (resultBox) {
                resultBox.className = 'mt-3 p-3.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5';
                resultBox.innerHTML = `<i class="ph ph-check-circle text-xl shrink-0 text-emerald-400"></i> <div><strong class="text-white block">نجاح الاتصال 100%:</strong> تم التحقق من المفتاح بنجاح ومكتبة Google Drive API مفعلة وجاهزة لاستيراد مجلدات الصور.</div>`;
                resultBox.classList.remove('hidden');
            }
        } else {
            let errorMsg = data?.error?.message || 'تعذر التحقق من المفتاح';
            if (data?.error?.errors?.[0]?.reason === 'API_KEY_INVALID' || errorMsg.includes('API key not valid')) {
                errorMsg = 'مفتاح API غير صالح. يرجى التأكد من نسخه بدقة من Google Cloud Console.';
            } else if (errorMsg.includes('Google Drive API has not been used') || errorMsg.includes('is disabled')) {
                errorMsg = 'مكتبة Google Drive API غير مفعلة بمشروعك في Google Cloud Console. يرجى البحث عنها وتفعيلها (Enable).';
            } else if (errorMsg.includes('Requests from this referer are blocked') || errorMsg.includes('IP address')) {
                errorMsg = 'المفتاح مقيد بنطاق (HTTP Referrer أو IP) يمنع هذا الموقع. يرجى إزالة القيود في Google Cloud.';
            }

            showToast(`فشل الاختبار: ${errorMsg}`, 'error');
            if (resultBox) {
                resultBox.className = 'mt-3 p-3.5 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5';
                resultBox.innerHTML = `<i class="ph ph-x-circle text-xl shrink-0 text-rose-400 mt-0.5"></i> <div class="space-y-1"><strong class="text-rose-400 block">فشل التحقق:</strong><span class="font-mono text-[11px] opacity-90 block">${escapeHtml(errorMsg)}</span></div>`;
                resultBox.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error('Error testing Google API key:', err);
        showToast('تعذر فحص المفتاح (تحقق من الاتصال بالإنترنت)', 'error');
        if (resultBox) {
            resultBox.className = 'mt-3 p-3.5 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5';
            resultBox.innerHTML = `<i class="ph ph-warning text-xl shrink-0 text-amber-400"></i> <span>تعذر الاتصال بخوادم Google (تحقق من اتصال الإنترنت).</span>`;
            resultBox.classList.remove('hidden');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

export function openApiKeyModal() {
    import('./router.js').then(r => {
        if (typeof r.switchView === 'function') r.switchView('view-settings');
        if (typeof r.switchSettingsSubtab === 'function') r.switchSettingsSubtab('view-google-drive-settings');
    });
}

export function closeApiKeyModal() {
    const modal = document.getElementById('google-api-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

export function saveApiKey() {
    const input = document.getElementById('google-api-key-input') || document.getElementById('google-api-key-settings-input');
    const val = input?.value?.trim() || '';

    if (!val) {
        showToast('يرجى كتابة مفتاح Google API صالح', 'warning');
        return;
    }

    localStorage.setItem(STORAGE_API_KEY, val);
    checkApiKeyStatus();
    closeApiKeyModal();
    showToast('تم حفظ مفتاح Google API بنجاح!', 'success');
}

// ==========================================
// 📊 9. Render Last Sync Card (Matching Image 3)
// ==========================================
function renderLastSyncCard() {
    const card = document.getElementById('drive-last-sync-card');
    if (!card) return;

    const raw = localStorage.getItem(STORAGE_LAST_SYNC_KEY);
    if (!raw) {
        card.classList.add('hidden');
        return;
    }

    try {
        const sync = JSON.parse(raw);
        card.classList.remove('hidden');

        const elDate = document.getElementById('last-sync-date');
        const elUpdated = document.getElementById('last-sync-updated-models');
        const elImported = document.getElementById('last-sync-imported-images');
        const elUnregistered = document.getElementById('last-sync-unregistered');
        const elSkipped = document.getElementById('last-sync-skipped');

        if (elDate && sync.timestamp) {
            const dateObj = new Date(sync.timestamp);
            elDate.textContent = dateObj.toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        if (elUpdated) elUpdated.textContent = `${sync.updatedModels || 0} ✓`;
        if (elImported) elImported.textContent = `${sync.importedImages || 0} ✓`;
        if (elUnregistered) elUnregistered.textContent = `${sync.unregisteredModels || 0} ⚠`;
        if (elSkipped) elSkipped.textContent = `${sync.skippedModels || 0}`;
    } catch (e) {
        console.error('Error rendering last sync card:', e);
    }
}

// ==========================================
// 🖼️ 10. Lightbox Viewer
// ==========================================
window.openDriveImageLightbox = function(factoryCode, initialIndex) {
    const group = scannedDriveGroups.find(g => g.factoryCode === factoryCode);
    if (!group || !group.files || group.files.length === 0) return;

    currentLightboxImages = group.files;
    currentLightboxIndex = initialIndex || 0;

    renderLightboxContent(group.factoryCode);

    const modal = document.getElementById('image-lightbox-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

function renderLightboxContent(factoryCode) {
    const currentImg = currentLightboxImages[currentLightboxIndex];
    if (!currentImg) return;

    const imgEl = document.getElementById('lightbox-main-image');
    const titleEl = document.getElementById('lightbox-title');
    const counterEl = document.getElementById('lightbox-counter');

    if (imgEl) {
        imgEl.setAttribute('referrerpolicy', 'no-referrer');
        const highResUrl = currentImg.thumbnailLink ? currentImg.thumbnailLink.replace(/=s\d+$/, '=s1600') : (currentImg.url || `https://lh3.googleusercontent.com/d/${currentImg.id}=s1600`);
        imgEl.src = highResUrl;
        imgEl.onerror = () => {
            if (imgEl.src !== currentImg.url) {
                imgEl.src = currentImg.url;
            }
        };
        imgEl.alt = currentImg.name;
    }
    if (titleEl) {
        titleEl.textContent = `كود المصنع: ${factoryCode} | ${currentImg.name}`;
    }
    if (counterEl) {
        counterEl.textContent = `الصورة ${currentLightboxIndex + 1} من ${currentLightboxImages.length}`;
    }
}

function navigateLightbox(step) {
    if (currentLightboxImages.length <= 1) return;
    currentLightboxIndex = (currentLightboxIndex + step + currentLightboxImages.length) % currentLightboxImages.length;
    renderLightboxContent(scannedDriveGroups.find(g => g.files.includes(currentLightboxImages[0]))?.factoryCode || '');
}

function closeLightbox() {
    const modal = document.getElementById('image-lightbox-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// ==========================================
// 🖼️ 11. إعدادات الصورة الافتراضية للموديلات (Default Model Image)
// ==========================================
const DEFAULT_FALLBACK_IMG = './src/assets/icons/devo.png';

function getDefaultModelImgCacheKey(tenantId) {
    return `devo_default_model_img_${tenantId || 'default'}`;
}

export async function loadDefaultModelImageConfig() {
    const tenantId = getCurrentTenantId();
    const previewEl = document.getElementById('default-model-img-preview');
    const inputEl = document.getElementById('default-model-img-url');
    
    // 1. القراءة الفورية من الكاش المحلي لمنع الوميض
    const cached = localStorage.getItem(getDefaultModelImgCacheKey(tenantId));
    if (cached) {
        if (previewEl) previewEl.src = cached;
        if (inputEl && !inputEl.value && !cached.startsWith('data:image')) inputEl.value = cached;
        window.tenantDefaultModelImage = cached;
    }

    // 2. التحميل من قاعدة البيانات (home_settings)
    try {
        let query = supabase
            .from('home_settings')
            .select('setting_value')
            .eq('setting_key', 'default_model_image');
        
        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
        }

        const { data, error } = await query.maybeSingle();
        if (!error && data && data.setting_value) {
            const val = data.setting_value.trim();
            if (previewEl) previewEl.src = val;
            if (inputEl && !inputEl.value && !val.startsWith('data:image')) inputEl.value = val;
            localStorage.setItem(getDefaultModelImgCacheKey(tenantId), val);
            window.tenantDefaultModelImage = val;
        } else if (!error && !data) {
            if (!cached) {
                if (previewEl) previewEl.src = DEFAULT_FALLBACK_IMG;
            }
        }
    } catch (err) {
        console.warn('Could not load default_model_image from home_settings:', err);
    }
}

// ضغط وتصغير الصورة قبل الحفظ لتكون خفيفة وسريعة في الحفظ والعرض
function compressImage(file, maxDimension = 800, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                let dataUrl = canvas.toDataURL('image/webp', quality);
                if (!dataUrl.startsWith('data:image/webp')) {
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error('فشل قراءة ملف الصورة'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('فشل قراءة الملف'));
        reader.readAsDataURL(file);
    });
}

function showDefaultImgStatusBadge(msg = 'تم تحديث الصورة الافتراضية بنجاح') {
    const badge = document.getElementById('default-img-status-badge');
    if (!badge) return;
    badge.innerHTML = `<i class="ph-bold ph-check-circle"></i> ${escapeHtml(msg)}`;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
    setTimeout(() => {
        badge.classList.add('hidden');
        badge.classList.remove('flex');
    }, 4000);
}

// دالة حفظ الصورة من الرابط المكتوب
window.saveDefaultModelImageFromInput = async function() {
    const inputEl = document.getElementById('default-model-img-url');
    const previewEl = document.getElementById('default-model-img-preview');
    const rawUrl = inputEl ? inputEl.value.trim() : '';

    if (!rawUrl) {
        showToast('يرجى إدخال رابط الصورة أولاً', 'warning');
        return;
    }

    // تطبيع روابط Google Drive إذا كانت مدخلة
    let finalUrl = rawUrl;
    if (finalUrl.includes('drive.google.com') || finalUrl.includes('drive.usercontent.google.com')) {
        const idMatch = finalUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || finalUrl.match(/id=([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) {
            finalUrl = `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
        }
    }

    try {
        const tenantId = getCurrentTenantId();
        const payload = {
            tenant_id: tenantId,
            setting_key: 'default_model_image',
            setting_value: finalUrl,
            description: 'الصورة الافتراضية للموديلات عند عدم وجود صورة'
        };

        const { error } = await supabase
            .from('home_settings')
            .upsert(payload, { onConflict: 'tenant_id,setting_key' });

        if (error) throw error;

        localStorage.setItem(getDefaultModelImgCacheKey(tenantId), finalUrl);
        window.tenantDefaultModelImage = finalUrl;
        if (previewEl) previewEl.src = finalUrl;

        showDefaultImgStatusBadge('تم حفظ وتطبيق الرابط بنجاح');
        showToast('تم حفظ الصورة الافتراضية بنجاح ✓', 'success');
    } catch (err) {
        console.error('Error saving default model image:', err);
        showToast('فشل حفظ الصورة الافتراضية: ' + (err.message || err), 'error');
    }
};

// دالة رفع صورة من الجهاز
window.handleUploadDefaultModelImage = async function(input) {
    if (!input || !input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
        showToast('يرجى اختيار ملف صورة صالح', 'error');
        return;
    }

    const previewEl = document.getElementById('default-model-img-preview');
    const inputEl = document.getElementById('default-model-img-url');

    try {
        showToast('جاري معالجة وضغط الصورة...', 'info');
        const compressedDataUrl = await compressImage(file, 800, 0.85);

        const tenantId = getCurrentTenantId();
        const payload = {
            tenant_id: tenantId,
            setting_key: 'default_model_image',
            setting_value: compressedDataUrl,
            description: 'الصورة الافتراضية للموديلات عند عدم وجود صورة'
        };

        const { error } = await supabase
            .from('home_settings')
            .upsert(payload, { onConflict: 'tenant_id,setting_key' });

        if (error) throw error;

        localStorage.setItem(getDefaultModelImgCacheKey(tenantId), compressedDataUrl);
        window.tenantDefaultModelImage = compressedDataUrl;
        if (previewEl) previewEl.src = compressedDataUrl;
        if (inputEl) inputEl.value = ''; // تم الرفع كملف

        showDefaultImgStatusBadge('تم رفع وحفظ الصورة بنجاح');
        showToast('تم حفظ وتعيين الصورة الافتراضية للمصنع بنجاح ✓', 'success');
    } catch (err) {
        console.error('Error uploading default model image:', err);
        showToast('حدث خطأ أثناء رفع الصورة: ' + (err.message || err), 'error');
    } finally {
        input.value = ''; // reset file input
    }
};

// دالة استعادة الشعار الافتراضي
window.resetDefaultModelImage = async function() {
    const isConfirmed = await confirmDialog({
        title: 'استعادة الصورة الافتراضية',
        message: 'هل تريد حذف الصورة المخصصة والعودة لشعار UltraSoft الافتراضي لجميع الموديلات التي ليس لها صور؟',
        confirmText: 'نعم، استعادة',
        cancelText: 'إلغاء'
    });
    if (!isConfirmed) return;

    try {
        const tenantId = getCurrentTenantId();
        let query = supabase
            .from('home_settings')
            .delete()
            .eq('setting_key', 'default_model_image');
        if (tenantId) query = query.eq('tenant_id', tenantId);
        
        await query;

        localStorage.removeItem(getDefaultModelImgCacheKey(tenantId));
        window.tenantDefaultModelImage = null;

        const previewEl = document.getElementById('default-model-img-preview');
        const inputEl = document.getElementById('default-model-img-url');
        if (previewEl) previewEl.src = DEFAULT_FALLBACK_IMG;
        if (inputEl) inputEl.value = '';

        showToast('تمت استعادة شعار UltraSoft الافتراضي بنجاح', 'success');
    } catch (err) {
        console.error('Error resetting default model image:', err);
        showToast('فشل استعادة الشعار: ' + (err.message || err), 'error');
    }
};
