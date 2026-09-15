import { supabase } from '../../config/supabase.js';
import { getCurrentSession } from '../../services/auth.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog, showSubscriptionUpgradeModal } from '../../components/modal.js'; 
import { printOrderCustomerInvoice, fetchInvoicePrintSettings } from '../../utils/print.js?v=2';
import { getCurrentTenantId, getTenantStorageKey, getTenantOrderQuotaDetails } from '../../services/tenant_service.js';
import { logAuditEvent } from '../../services/audit_service.js';
import { escapeHtml } from '../../utils/sanitize.js';

function getTenantCartKey() {
    return getTenantStorageKey('devo_cart');
}

function getTenantEditOrderKey() {
    return getTenantStorageKey('devo_edit_order_data');
}

function getTenantEditOrderCacheKey() {
    return getTenantStorageKey('devo_edit_order_data_cache');
}

function getVisitorSavedCodesKey() {
    return getTenantStorageKey('devo_visitor_saved_codes');
}

function getVisitorLastPhoneKey() {
    return getTenantStorageKey('devo_visitor_last_phone');
}

function getTenantCustomerDraftKey() {
    return getTenantStorageKey('ultrasoft_customer_draft');
}

function getTenantCartTabKey() {
    return getTenantStorageKey('ultrasoft_cart_tab');
}

// 💾 حفظ مسودة بيانات العميل فورياً لكل مصنع لمنع فقدان البيانات عند التحديث أو إغلاق الموقع
function saveCustomerDraft() {
    if (editingOrderId || editingVisitorOrderId) return;
    try {
        const tenantKey = getTenantCustomerDraftKey();
        const tenantId = getCurrentTenantId() || 'default';
        const draft = {
            name: document.getElementById('c-name')?.value || '',
            phone1: document.getElementById('c-phone1')?.value || '',
            phone2: document.getElementById('c-phone2')?.value || '',
            address: document.getElementById('c-address')?.value || '',
            notes: document.getElementById('c-notes')?.value || '',
            deposit: document.getElementById('c-deposit')?.value || '0',
            receiver: document.getElementById('c-receiver')?.value || '',
            updatedAt: Date.now()
        };
        const hasContent = (draft.name.trim() || draft.phone1.trim() || draft.phone2.trim() || draft.address.trim() || draft.notes.trim() || (draft.deposit && draft.deposit !== '0') || draft.receiver.trim());
        if (hasContent) {
            const draftStr = JSON.stringify(draft);
            localStorage.setItem(tenantKey, draftStr);
            localStorage.setItem(`ultrasoft_customer_draft_${tenantId}`, draftStr);
        } else {
            localStorage.removeItem(tenantKey);
            localStorage.removeItem(`ultrasoft_customer_draft_${tenantId}`);
        }
    } catch (e) {}
}

// 🔄 استرجاع مسودة بيانات العميل المحفوظة
function restoreCustomerDraft() {
    if (editingOrderId || editingVisitorOrderId) return;
    try {
        const tenantKey = getTenantCustomerDraftKey();
        const tenantId = getCurrentTenantId() || 'default';
        const raw = localStorage.getItem(tenantKey) 
            || localStorage.getItem(`ultrasoft_customer_draft_${tenantId}`)
            || localStorage.getItem('ultrasoft_customer_draft_default')
            || localStorage.getItem('ultrasoft_customer_draft_00000000-0000-0000-0000-000000000001');
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (!draft) return;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined && val !== null && val !== '') {
                el.value = val;
            }
        };

        setVal('c-name', draft.name);
        setVal('c-phone1', draft.phone1);
        setVal('c-phone2', draft.phone2);
        setVal('c-address', draft.address);
        setVal('c-notes', draft.notes);
        if (draft.deposit && draft.deposit !== '0') {
            setVal('c-deposit', draft.deposit);
            const receiver = document.getElementById('c-receiver');
            if (receiver) receiver.required = parseFloat(draft.deposit) > 0;
        }
        setVal('c-receiver', draft.receiver);
    } catch (e) {
        console.warn('Error restoring customer draft:', e);
    }
}

// 🧹 تنظيف مسودة وحقول العميل فقط بعد الحفظ الناجح أو إفراغ السلة
function clearCustomerDraft() {
    try {
        localStorage.removeItem(getTenantCustomerDraftKey());
        const tenantId = getCurrentTenantId() || 'default';
        localStorage.removeItem(`ultrasoft_customer_draft_${tenantId}`);
        localStorage.removeItem('ultrasoft_customer_draft_default');
        localStorage.removeItem('ultrasoft_customer_draft_00000000-0000-0000-0000-000000000001');
    } catch (e) {}
    const form = document.getElementById('checkout-form');
    if (form) form.reset();
    ['c-name', 'c-phone1', 'c-phone2', 'c-address', 'c-notes', 'c-deposit', 'c-receiver'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const receiver = document.getElementById('c-receiver');
    if (receiver) receiver.required = false;
}

let currentUser = null;
let cartItems = [];
let itemToDeleteIndex = null;
let editingOrderId = null; 
let editingVisitorOrderId = null;
let cartRealtimeChannel = null;
let visitorOrdersRealtimeChannel = null;
let lastOrderForPrinting = null;
let lastVisitorOrderForPrinting = null;
let currentMainCartTab = 'current'; // 'current' or 'history'
let visitorTrackedOrders = [];

// ذاكرة تخزين مؤقت لتسريع الرسم الفوري ومنع تكرار الاتصال بالسيرفر
let cachedDbInventory = [];
let cachedDbModels = [];
let cachedOriginalOrderData = null;
let currentCartFilter = 'all'; // 'all', 'ok', 'error'

export function initCart() {
    const { session } = getCurrentSession();
    currentUser = session ? session.user : null;
    
    // ربط نموذج الدفع والطلب
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) {
        checkoutForm.onsubmit = (e) => {
            if (editingVisitorOrderId) {
                handleVisitorCheckout(e);
            } else if (currentUser) {
                handleCheckout(e);
            } else {
                handleVisitorCheckout(e);
            }
        };
    }

    // دوال عامة للنظام
    window.refreshCartView = loadAndRenderCart;
    window.showInvoiceModal = showInvoiceModal;
    window.setCartFilter = setCartFilter;
    window.filterCartItems = filterCartItems;

    // دوال نظام طلبات الزوار والتتبع
    window.switchCartMainTab = switchCartMainTab;
    window.handleVisitorTrackSearch = handleVisitorTrackSearch;
    window.refreshVisitorOrdersList = refreshVisitorOrdersList;
    window.clearVisitorSavedCodes = clearVisitorSavedCodes;
    window.removeSingleVisitorCode = removeSingleVisitorCode;
    window.copyVisitorOrderCode = copyVisitorOrderCode;
    window.printCurrentVisitorOrder = printCurrentVisitorOrder;
    window.goToVisitorOrdersHistory = goToVisitorOrdersHistory;
    window.closeSuccessModalAndBrowse = closeSuccessModalAndBrowse;
    window.closeVisitorOrderDetailsModal = closeVisitorOrderDetailsModal;
    window.openVisitorOrderDetails = openVisitorOrderDetails;
    window.editVisitorOrder = editVisitorOrder;
    window.printVisitorOrderById = printVisitorOrderById;
    
    document.getElementById('c-deposit')?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        const receiver = document.getElementById('c-receiver');
        if (receiver) receiver.required = val > 0;
    });

    // ربط الحفظ التلقائي لمسودة بيانات العميل فور الكتابة
    ['c-name', 'c-phone1', 'c-phone2', 'c-address', 'c-notes', 'c-deposit', 'c-receiver'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', saveCustomerDraft);
            el.addEventListener('change', saveCustomerDraft);
        }
    });

    setupCartUserInterface();
    restoreCustomerDraft();
    loadAndRenderCart();
    setupCartRealtime();
    setupVisitorOrdersRealtime();
    renderVisitorSavedCodesChips();

    // استعادة تبويب السلة النشط (الحالية أو السجل)
    const savedCartTab = localStorage.getItem(getTenantCartTabKey());
    if (savedCartTab === 'history') {
        switchCartMainTab('history');
    }

    // استعلام فوري عن طلبات الزائر إذا كانت لديه أكواد محفوظة
    const savedCodes = getVisitorSavedCodes();
    if (savedCodes.length > 0) {
        refreshVisitorOrdersList();
    }
}

// ==========================================
// 🌟 1. الرادار اللحظي للسلة
// ==========================================
function setupCartRealtime() {
    if (cartRealtimeChannel) return;
    
    const currentTenantId = getCurrentTenantId();
    cartRealtimeChannel = supabase.channel('cart_realtime_sync_' + (currentTenantId || 'default'))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'model_inventory' }, (payload) => {
            const { model_id, color_id, available_series } = payload.new;
            const itemInCart = cartItems.find(i => i.modelId === model_id && i.colorId === color_id);
            
            if (itemInCart && !editingOrderId) { // لا نزعج المستخدم بالرادار أثناء التعديل المباشر
                if (available_series === 0) {
                    showToast(`⚠️ الموديل (${itemInCart.modelName}) الموجود بسلتك قد نفذت كميته للتو!`, 'error');
                } else if (itemInCart.qty > available_series) {
                    showToast(`⚠️ انخفض مخزون الموديل (${itemInCart.modelName}) الموجود بسلتك، يرجى مراجعة السلة!`, 'warning');
                }
                
                // تحديث الكاش
                const cachedInv = cachedDbInventory.find(i => i.model_id === model_id && i.color_id === color_id);
                if (cachedInv) {
                    cachedInv.available_series = available_series;
                } else {
                    cachedDbInventory.push({ model_id, color_id, available_series });
                }

                if (!document.getElementById('view-cart')?.classList.contains('hidden')) {
                    renderCartFromCacheOrFetch();
                }
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'models' }, (payload) => {
            const isDeleted = payload.eventType === 'DELETE';
            const isDisabled = payload.eventType === 'UPDATE' && payload.new.is_active === false;
            
            if (isDeleted || isDisabled) {
                const targetId = isDeleted ? payload.old.id : payload.new.id;
                const itemInCart = cartItems.find(i => i.modelId === targetId);
                
                if (itemInCart) {
                    showToast(`⚠️ الموديل (${itemInCart.modelName}) لم يعد متاحاً للطلب! يرجى إزالته من السلة.`, 'error');
                    
                    // تحديث الكاش للموديلات
                    const cachedModel = cachedDbModels.find(m => m.id === targetId);
                    if (cachedModel) {
                        cachedModel.is_active = false;
                    }
                    
                    if (!document.getElementById('view-cart')?.classList.contains('hidden')) {
                        renderCartFromCacheOrFetch();
                    }
                }
            }
        })
        .subscribe();
}

// ==========================================
// 🌟 2. تحميل ورسم السلة (بمعادلة المتاح الحقيقي) 🌟
// ==========================================
async function loadAndRenderCart() {
    currentCartFilter = 'all';
    updateFilterButtonsUI();

    const tenantCartKey = getTenantCartKey();
    const tenantEditKey = getTenantEditOrderKey();
    let saved = localStorage.getItem(tenantCartKey);
    const savedOrderData = localStorage.getItem(tenantEditKey);

    if (saved) { try { cartItems = JSON.parse(saved); } catch(e) { cartItems = []; } }

    // 🌟 نقلنا تعبئة البيانات هنا لتعمل في كل مرة يفتح فيها الموظف السلة 🌟
    let originalOrderData = null;
    if (savedOrderData) {
        try {
            originalOrderData = JSON.parse(savedOrderData);
            editingOrderId = originalOrderData.id;
            document.getElementById('c-name').value = originalOrderData.customer_name || '';
            document.getElementById('c-phone1').value = originalOrderData.phone_1 || '';
            document.getElementById('c-phone2').value = originalOrderData.phone_2 || '';
            document.getElementById('c-address').value = originalOrderData.address || '';
            document.getElementById('c-notes').value = originalOrderData.notes || ''; 
            document.getElementById('c-deposit').value = originalOrderData.deposit || 0;
            document.getElementById('c-receiver').value = originalOrderData.deposit_receiver || '';
        } catch(e) {}
    } else {
        editingOrderId = null;
        restoreCustomerDraft();
    }

    updateCartHeaderEditState(editingOrderId, originalOrderData?.invoice_number);

    const container = document.getElementById('cart-items-container');
    const checkoutBtn = document.getElementById('btn-save-order') || document.getElementById('btn-checkout');
    
    const sumPriceEl = document.getElementById('sum-price');
    const sumModelsEl = document.getElementById('sum-models');
    const sumSeriesEl = document.getElementById('sum-series');

    if (cartItems.length === 0) {
        if (container) container.innerHTML = `<div class="text-center py-10 text-devo-muted"><i class="ph ph-shopping-cart-simple text-5xl mb-3 opacity-50"></i><p>السلة فارغة حالياً</p></div>`;
        if (sumPriceEl) sumPriceEl.textContent = '0'; 
        if (sumModelsEl) sumModelsEl.textContent = '0';
        if (sumSeriesEl) sumSeriesEl.textContent = '0';

        if (checkoutBtn) { 
            checkoutBtn.disabled = true; 
            checkoutBtn.innerHTML = editingOrderId ? `حفظ التعديلات` : `تأكيد وإصدار الفاتورة`; 
            checkoutBtn.classList.replace('bg-devo-orange', 'bg-devo-gray'); 
        }
        updateFloatingCart();
        return;
    }

    if (container) container.innerHTML = `<div class="text-center py-10"><i class="ph ph-spinner animate-spin text-3xl text-devo-orange"></i><p class="text-xs text-devo-muted mt-2">جاري مطابقة المخزون مع السيرفر...</p></div>`;

    const modelIds = [...new Set(cartItems.map(i => i.modelId))];

    const [{ data: dbInventory }, { data: dbModels }] = await Promise.all([
        supabase.from('model_inventory').select('model_id, color_id, available_series, color_system_code, color_factory_code').in('model_id', modelIds),
        supabase.from('models').select('id, is_active, factory_code, system_code, code_assignment_mode').in('id', modelIds)
    ]);

    // تخزين البيانات في الكاش
    cachedDbInventory = dbInventory || [];
    cachedDbModels = dbModels || [];
    cachedOriginalOrderData = originalOrderData;

    renderCartItems(cachedDbInventory, cachedDbModels, cachedOriginalOrderData);
    updateFloatingCart();
    
    if(window.filterCartItems) window.filterCartItems();
}

function updateCartHeaderEditState(editingOrderId, invoiceNumber) {
    const clearBtnText = document.getElementById('btn-clear-cart-text');
    const clearBtnIcon = document.getElementById('btn-clear-cart-icon');
    const clearBtn = document.getElementById('btn-clear-cart');
    const editBanner = document.getElementById('cart-edit-mode-banner');

    if (editingOrderId) {
        if (clearBtnText) clearBtnText.textContent = 'إلغاء تعديل الأوردر';
        if (clearBtnIcon) clearBtnIcon.className = 'ph ph-x-circle text-xl';
        if (clearBtn) clearBtn.title = 'إلغاء تعديل الأوردر وإفراغ السلة';
        
        if (editBanner) {
            editBanner.classList.remove('hidden');
            editBanner.innerHTML = `
                <div class="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 text-white p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs sm:text-sm font-bold shadow-lg ring-2 ring-amber-500/40 my-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                            <i class="ph-bold ph-pencil-line text-xl text-white"></i>
                        </div>
                        <span class="text-white drop-shadow-sm">أنت تقوم حالياً بتعديل الفاتورة رقم: <strong class="font-mono text-amber-100 bg-black/30 px-2.5 py-1 rounded-lg text-sm sm:text-base border border-white/20 font-extrabold">#${invoiceNumber || ''}</strong></span>
                    </div>
                    <span class="bg-white text-orange-700 px-3 py-1.5 rounded-xl text-xs font-extrabold shadow-md whitespace-nowrap flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-orange-600 animate-ping"></span>
                        وضع التعديل نشط
                    </span>
                </div>
            `;
        }
    } else {
        if (clearBtnText) clearBtnText.textContent = 'إفراغ السلة';
        if (clearBtnIcon) clearBtnIcon.className = 'ph ph-trash text-xl';
        if (clearBtn) clearBtn.title = 'إفراغ السلة';

        if (editBanner) {
            editBanner.classList.add('hidden');
            editBanner.innerHTML = '';
        }
    }
}

// 🌟 دالة إفراغ السلة بالكامل وإلغاء وضع التعديل 🌟
window.clearEntireCart = async () => {
    if (cartItems.length === 0 && !editingOrderId) {
        return showToast('السلة فارغة بالفعل', 'info');
    }

    const isEditMode = !!editingOrderId;
    const title = isEditMode ? 'إلغاء تعديل الأوردر' : 'إفراغ السلة';
    const message = isEditMode 
        ? 'هل أنت متأكد من رغبتك في إلغاء تعديل الأوردر وإفراغ السلة؟ سيتم إلغاء التعديل وإعادة فتح الأوردر بحالة (تم الإنشاء).' 
        : 'هل أنت متأكد من رغبتك في إفراغ السلة بالكامل؟';

    const confirmed = await confirmDialog({ 
        title: title, 
        message: message, 
        isDestructive: true 
    });
    
    if (confirmed) {
        if (editingOrderId) {
            const finalEditingOrderId = editingOrderId;
            await supabase.rpc('release_order_lock', { p_order_id: finalEditingOrderId });

            const userName = currentUser?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email || 'موظف';
            await logOrderAction(finalEditingOrderId, 'cart_edit_cancel', `تم إلغاء تعديل الأوردر وإفراغ السلة بواسطة (${userName})`);
        }

        cartItems = [];
        editingOrderId = null;
        cachedOriginalOrderData = null;
        cachedDbInventory = [];
        cachedDbModels = [];

        localStorage.removeItem(getTenantCartKey());
        localStorage.removeItem(getTenantEditOrderKey());
        localStorage.removeItem(getTenantEditOrderCacheKey());
        localStorage.removeItem('devo_cart');
        localStorage.removeItem('devo_edit_order_data');
        localStorage.removeItem('devo_edit_order_data_cache');
        
        clearCustomerDraft();

        updateCartHeaderEditState(null, null);
        updateFloatingCart();
        loadAndRenderCart();
        showToast(isEditMode ? 'تم إلغاء تعديل الأوردر وإعادة فتحه وإفراغ السلة بنجاح' : 'تم إفراغ السلة بنجاح', 'success');
    }
};

function renderCartItems(dbInventory, dbModels, originalOrderData) {
    const container = document.getElementById('cart-items-container');
    const checkoutBtn = document.getElementById('btn-save-order') || document.getElementById('btn-checkout');
    
    let html = '';
    let totalOrderPrice = 0;
    let totalSeriesCount = 0;
    let hasErrors = false;
    let errorModelsCount = 0;

    // 🌟 تجميع ألوان نفس الصنف داخل نفس الكارت 🌟
    const groupedMap = new Map();
    cartItems.forEach((item, index) => {
        if (!groupedMap.has(item.modelId)) {
            groupedMap.set(item.modelId, {
                modelId: item.modelId,
                modelName: item.modelName,
                factoryCode: item.factoryCode,
                price: item.price,
                image: item.image,
                sizesCount: item.sizesCount,
                colors: []
            });
        }
        groupedMap.get(item.modelId).colors.push({
            ...item,
            originalIndex: index
        });
    });

    groupedMap.forEach((modelGroup, modelId) => {
        let modelHasErrors = false;
        let modelTotalPrice = 0;
        let modelTotalSeries = 0;
        let colorsHtml = '';

        const pricePerPiece = parseFloat(modelGroup.price) || 0;
        const piecesPerSeries = parseInt(modelGroup.sizesCount) || 1; 
        const pricePerSeries = pricePerPiece * piecesPerSeries; 

        modelGroup.colors.forEach((item) => {
            const dbInv = dbInventory.find(i => i.model_id === item.modelId && i.color_id === item.colorId);
            const dbModel = dbModels.find(m => m.id === item.modelId);

            let errorMsg = null;
            let availableInDB = dbInv ? dbInv.available_series : 0;

            let ownedQty = 0;
            if (editingOrderId && originalOrderData && originalOrderData.original_items) {
                const oldItem = originalOrderData.original_items.find(oi => oi.model_id === item.modelId && oi.color_id === item.colorId);
                if (oldItem) ownedQty = oldItem.quantity;
            }
            
            const trueAvailable = availableInDB + ownedQty;

            if (!dbModel || !dbModel.is_active) {
                errorMsg = "الموديل غير متاح (تم إيقافه أو حذفه من الإدارة).";
                hasErrors = true;
                modelHasErrors = true;
            } else if (trueAvailable === 0) {
                errorMsg = "نفذت الكمية تماماً من المخزن.";
                hasErrors = true;
                modelHasErrors = true;
            } else if (item.qty > trueAvailable) {
                errorMsg = `المطلوب (${item.qty}) غير متاح. أقصى حد متاح لك: ${trueAvailable} سيريه.`;
                hasErrors = true;
                modelHasErrors = true;
            }

            const itemTotalPrice = pricePerSeries * item.qty; 

            if (!errorMsg) {
                totalOrderPrice += itemTotalPrice;
                totalSeriesCount += item.qty;
                modelTotalPrice += itemTotalPrice;
                modelTotalSeries += item.qty;
            }

            const colorRowClass = errorMsg ? 'bg-devo-error/20 border-devo-error/40' : 'bg-devo-black border-devo-gray/70';

            colorsHtml += `
                <div class="p-2.5 ${colorRowClass} border rounded-lg transition-all mb-2">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="w-3 h-3 rounded-full ${errorMsg ? 'bg-devo-error' : 'bg-devo-info'} shrink-0"></span>
                            <span class="text-white font-bold text-xs sm:text-sm"><i class="ph-fill ph-palette text-devo-info"></i> ${item.colorName}</span>
                            ${(item.colorSystemCode || dbInv?.color_system_code) ? `<span class="text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 rounded">كود: ${item.colorSystemCode || dbInv?.color_system_code}</span>` : ''}
                            ${(item.colorFactoryCode || dbInv?.color_factory_code) ? `<span class="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">مصنع: ${item.colorFactoryCode || dbInv?.color_factory_code}</span>` : ''}
                        </div>

                        ${errorMsg ? `
                            <div class="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full sm:w-auto justify-between">
                                <span class="text-devo-error text-[11px] font-bold flex items-center gap-1"><i class="ph ph-warning-circle text-sm"></i> ${errorMsg}</span>
                                <div class="flex items-center gap-2">
                                    ${trueAvailable > 0 ? `<button type="button" onclick="updateCartItemQty(${item.originalIndex}, ${trueAvailable}, ${trueAvailable})" class="text-[10px] bg-devo-orange text-white px-2.5 py-1 rounded shadow whitespace-nowrap hover:bg-devo-orangeHover transition-colors font-bold">تصحيح لـ ${trueAvailable}</button>` : ''}
                                    <button type="button" onclick="confirmRemoveFromCart(${item.originalIndex})" class="text-devo-error hover:bg-devo-error/20 p-1 rounded transition-colors" title="إزالة هذا اللون"><i class="ph ph-trash text-base"></i></button>
                                </div>
                            </div>
                        ` : `
                            <div class="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                                <div class="flex items-center bg-devo-dark border border-devo-gray rounded-lg overflow-hidden h-8">
                                    <button type="button" onclick="updateCartItemQty(${item.originalIndex}, ${item.qty - 1})" class="w-8 h-full flex items-center justify-center text-white hover:text-devo-orange hover:bg-white/5 transition-all shrink-0 cursor-pointer select-none" title="تقليل"><i class="ph-bold ph-minus text-xs"></i></button>
                                    <input type="number" readonly value="${item.qty}" class="w-9 h-full bg-transparent text-center text-white text-xs font-bold outline-none border-x border-devo-gray select-none">
                                    <button type="button" onclick="updateCartItemQty(${item.originalIndex}, ${item.qty + 1}, ${trueAvailable})" class="w-8 h-full flex items-center justify-center text-white hover:text-devo-orange hover:bg-white/5 transition-all shrink-0 cursor-pointer select-none" title="زيادة"><i class="ph-bold ph-plus text-xs"></i></button>
                                </div>
                                <div class="text-left flex items-center gap-2">
                                    <div>
                                        <p class="text-devo-orange font-black text-xs sm:text-sm">${itemTotalPrice.toLocaleString()} ج.م</p>
                                        <p class="text-devo-muted text-[9px]">(${item.qty * piecesPerSeries} قطعة)</p>
                                    </div>
                                    <button type="button" onclick="confirmRemoveFromCart(${item.originalIndex})" class="text-devo-error hover:bg-devo-error/20 p-1.5 rounded transition-colors" title="إزالة هذا اللون"><i class="ph ph-trash text-base md:text-lg"></i></button>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            `;
        });

        if (modelHasErrors) {
            errorModelsCount++;
        }

        const cardClass = modelHasErrors ? 'bg-devo-error/10 border-devo-error shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'bg-devo-dark border-devo-gray';
        const imgClass = modelHasErrors ? 'grayscale opacity-60' : '';

        const allCardSearchText = `${modelGroup.modelName} ${modelGroup.factoryCode || ''} ${modelGroup.colors.map(c => `${c.colorName} ${c.colorSystemCode || ''} ${c.colorFactoryCode || ''}`).join(' ')}`;
        html += `
            <div class="cart-item-card flex flex-col sm:flex-row gap-3 md:gap-4 p-3.5 ${cardClass} border rounded-xl relative transition-all duration-300 mb-4 shadow-sm" data-search="${allCardSearchText}" data-has-errors="${modelHasErrors}">
                <div class="flex gap-3 md:gap-4 items-start">
                    <img src="${modelGroup.image}" class="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover bg-devo-black shrink-0 ${imgClass}" onerror="this.src='./src/assets/icons/devo.png'">
                </div>

                <div class="flex flex-col flex-1 justify-between">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h4 class="text-white font-bold text-base line-clamp-1">${modelGroup.modelName}</h4>
                            <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                                <span class="text-devo-muted text-[10px] font-mono bg-devo-black px-2 py-0.5 rounded border border-devo-gray" title="كود الموديل"><i class="ph ph-barcode"></i> ${modelGroup.factoryCode || 'بدون كود'}</span>
                                <span class="text-devo-muted text-[10px] bg-devo-black px-2 py-0.5 rounded border border-devo-gray" title="عدد القطع في السيريه الواحد"><i class="ph ph-ruler"></i> ${piecesPerSeries} قطع</span>
                                <span class="text-devo-info text-[10px] bg-devo-info/10 px-2 py-0.5 rounded border border-devo-info/20" title="سعر القطعة الواحدة"><i class="ph ph-tag"></i> ق: ${pricePerPiece} ج</span>
                                <span class="text-devo-orange text-[10px] bg-devo-orange/10 px-2 py-0.5 rounded border border-devo-orange/20" title="سعر السيريه الكامل"><i class="ph ph-stack"></i> سيريه: ${pricePerSeries} ج</span>
                            </div>
                        </div>
                        <button type="button" onclick="confirmRemoveModelFromCart('${modelId}')" class="text-devo-error hover:bg-devo-error/20 px-2.5 py-1.5 rounded-lg transition-colors shrink-0 flex items-center gap-1 text-xs font-bold border border-devo-error/20" title="إزالة الموديل بالكامل بجميع ألوانه">
                            <i class="ph ph-trash text-base"></i> <span class="hidden sm:inline">حذف الموديل</span>
                        </button>
                    </div>

                    <div class="mt-2">
                        <p class="text-devo-muted text-xs font-bold mb-2 flex items-center gap-1"><i class="ph ph-palette text-devo-orange"></i> الألوان المحددة لهذا الموديل (${modelGroup.colors.length}):</p>
                        <div class="space-y-1.5">
                            ${colorsHtml}
                        </div>
                    </div>

                    <div class="flex justify-between items-center mt-3 pt-2 border-t border-devo-gray/50 text-xs">
                        <span class="text-devo-muted font-bold">إجمالي الموديل: <span class="text-white font-bold">${modelTotalSeries} سيريه</span> (${modelTotalSeries * piecesPerSeries} قطعة)</span>
                        <span class="text-devo-orange font-black text-base">${modelTotalPrice.toLocaleString()} ج.م</span>
                    </div>
                </div>
            </div>
        `;
    });

    if (container) container.innerHTML = html;
    
    const sumPriceEl = document.getElementById('sum-price');
    const sumModelsEl = document.getElementById('sum-models');
    const sumSeriesEl = document.getElementById('sum-series');
    const itemsCountEl = document.getElementById('cart-items-count');

    if (sumPriceEl) sumPriceEl.textContent = totalOrderPrice.toLocaleString();
    if (sumModelsEl) sumModelsEl.textContent = groupedMap.size;
    if (sumSeriesEl) sumSeriesEl.textContent = totalSeriesCount;
    if (itemsCountEl) itemsCountEl.textContent = `${groupedMap.size} موديلات في الأوردر (${totalSeriesCount} سيريه)`;

    const errorBadge = document.getElementById('cart-error-badge');
    if (errorBadge) {
        if (errorModelsCount > 0) {
            errorBadge.textContent = errorModelsCount;
            errorBadge.classList.remove('hidden');
        } else {
            errorBadge.classList.add('hidden');
        }
    }

    if (checkoutBtn) {
        if (hasErrors) {
            checkoutBtn.disabled = true;
            checkoutBtn.innerHTML = `<i class="ph ph-prohibit"></i> يرجى تصحيح الأخطاء أولاً`;
            checkoutBtn.classList.add('bg-devo-gray', 'cursor-not-allowed');
            checkoutBtn.classList.remove('bg-devo-orange', 'hover:bg-devo-orangeHover');
        } else {
            checkoutBtn.disabled = false;
            checkoutBtn.innerHTML = editingOrderId ? `حفظ التعديلات وإصدار الفاتورة` : `تأكيد وإصدار الفاتورة`;
            checkoutBtn.classList.remove('bg-devo-gray', 'cursor-not-allowed');
            checkoutBtn.classList.add('bg-devo-orange', 'hover:bg-devo-orangeHover');
        }
    }
}

// 🌟 دالة حذف الموديل بالكامل بجميع ألوانه 🌟
window.confirmRemoveModelFromCart = async (modelId) => {
    const modelItems = cartItems.filter(i => i.modelId === modelId);
    if (modelItems.length === 0) return;
    const modelName = modelItems[0].modelName || 'الموديل';

    const confirmed = await confirmDialog({ 
        title: 'حذف الموديل من السلة', 
        message: `هل أنت متأكد من رغبتك في حذف الموديل (${modelName}) بجميع ألوانه من السلة؟`, 
        isDestructive: true 
    });

    if (confirmed) {
        cartItems = cartItems.filter(i => i.modelId !== modelId);
        saveCart();
        renderCartFromCacheOrFetch();
        showToast(`تم حذف الموديل (${modelName}) من السلة`, 'success');
    }
};



function updateFilterButtonsUI() {
    const filters = {
        all: {
            activeClass: "px-4 py-2 rounded-lg font-bold transition-all bg-devo-orange text-white flex items-center gap-1.5 shadow-sm",
            inactiveClass: "px-4 py-2 rounded-lg font-bold transition-all text-devo-muted hover:text-white hover:bg-devo-gray/20 flex items-center gap-1.5"
        },
        ok: {
            activeClass: "px-4 py-2 rounded-lg font-bold transition-all bg-devo-orange text-white flex items-center gap-1.5 shadow-sm",
            inactiveClass: "px-4 py-2 rounded-lg font-bold transition-all text-devo-muted hover:text-white hover:bg-devo-gray/20 flex items-center gap-1.5"
        },
        error: {
            activeClass: "px-4 py-2 rounded-lg font-bold transition-all bg-devo-error text-white flex items-center gap-1.5 shadow-sm",
            inactiveClass: "px-4 py-2 rounded-lg font-bold transition-all text-devo-muted hover:text-white hover:bg-devo-gray/20 flex items-center gap-1.5"
        }
    };

    Object.keys(filters).forEach(type => {
        const btn = document.getElementById(`btn-cart-filter-${type}`);
        if (btn) {
            if (currentCartFilter === type) {
                btn.className = filters[type].activeClass;
            } else {
                btn.className = filters[type].inactiveClass;
            }
        }
    });
}

export function setCartFilter(filterType) {
    currentCartFilter = filterType;
    updateFilterButtonsUI();
    filterCartItems();
}

export function filterCartItems() {
    const term = document.getElementById('cart-search-input')?.value.toLowerCase().trim() || '';
    const cards = document.querySelectorAll('.cart-item-card');
    
    cards.forEach(card => {
        const searchText = (card.getAttribute('data-search') || '').toLowerCase();
        const hasErrors = card.getAttribute('data-has-errors') === 'true';
        
        const matchesSearch = term === '' || searchText.includes(term);
        let matchesFilter = true;
        if (currentCartFilter === 'ok') {
            matchesFilter = !hasErrors;
        } else if (currentCartFilter === 'error') {
            matchesFilter = hasErrors;
        }
        
        if (matchesSearch && matchesFilter) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

function renderCartFromCacheOrFetch() {
    if (cachedDbInventory && cachedDbInventory.length > 0 && cachedDbModels && cachedDbModels.length > 0) {
        renderCartItems(cachedDbInventory, cachedDbModels, cachedOriginalOrderData);
        updateFloatingCart();
        if (window.filterCartItems) window.filterCartItems();
    } else {
        loadAndRenderCart();
    }
}

window.updateCartItemQty = (index, newQty, maxAvailable = null) => {
    if (newQty < 1) return;
    if (maxAvailable !== null && newQty > maxAvailable) {
        return showToast(`أقصى كمية متاحة لك الآن هي ${maxAvailable}`, 'warning');
    }
    cartItems[index].qty = newQty;
    saveCart();
    renderCartFromCacheOrFetch(); 
};

// ==========================================
// 🌟 3. الدفع وتأكيد الأوردر مع المخزون 🌟
// ==========================================
async function handleCheckout(e) {
    e.preventDefault();
    if (cartItems.length === 0) return showToast('السلة فارغة!', 'error');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري التحقق والتأكيد...`;

    try {
        const modelIds = [...new Set(cartItems.map(i => i.modelId))];
        const [{ data: dbInv }, { data: dbMod }] = await Promise.all([
            supabase.from('model_inventory').select('model_id, color_id, available_series').in('model_id', modelIds),
            supabase.from('models').select('id, is_active').in('id', modelIds)
        ]);

        let originalOrderData = null;
        if (editingOrderId) {
            const savedData = localStorage.getItem(getTenantEditOrderKey());
            if (savedData) originalOrderData = JSON.parse(savedData);
        }

        let hasFinalErrors = false;
        cartItems.forEach(item => {
            const inv = dbInv?.find(i => i.model_id === item.modelId && i.color_id === item.colorId);
            const mod = dbMod?.find(m => m.id === item.modelId);
            
            let ownedQty = 0;
            if (editingOrderId && originalOrderData && originalOrderData.original_items) {
                 const oldItem = originalOrderData.original_items.find(oi => oi.model_id === item.modelId && oi.color_id === item.colorId);
                 if (oldItem) ownedQty = oldItem.quantity;
            }
            const trueAvail = (inv ? inv.available_series : 0) + ownedQty;

            if (!mod || !mod.is_active || trueAvail < item.qty) hasFinalErrors = true;
        });

        if (hasFinalErrors) {
            showToast('حدث تغيير في المخزن! يرجى مراجعة الأخطاء الموضحة باللون الأحمر في السلة.', 'error');
            await loadAndRenderCart(); 
            throw new Error('ValidationError');
        }

        const currentTenantId = getCurrentTenantId();
        const orderData = {
            tenant_id: currentTenantId,
            worker_id: currentUser.id,
            customer_name: document.getElementById('c-name').value,
            phone_1: document.getElementById('c-phone1').value,
            phone_2: document.getElementById('c-phone2').value || null,
            address: document.getElementById('c-address').value || null,
            notes: document.getElementById('c-notes').value || null, 
            total_price: cartItems.reduce((sum, item) => sum + (item.qty * (item.sizesCount || 1) * item.price), 0),
            total_series: cartItems.reduce((sum, item) => sum + item.qty, 0),
            deposit: parseFloat(document.getElementById('c-deposit').value) || 0,
            deposit_receiver: document.getElementById('c-receiver').value || null,
            status: 'created'
        };

        // 🌟 ملحوظة: كل خطوات إنشاء/تعديل الأوردر، خصم المخزون، وتسجيل الحركة
        // بقت بتحصل دفعة واحدة جوه دالة process_order_transaction على السيرفر
        // (نفس الدالة اللي بتستخدمها لوحة الأدمن)، عشان نضمن:
        // 1) التوافق مع صلاحيات RLS (العامل مالوش صلاحية كتابة مباشرة على orders/order_items/model_inventory).
        // 2) عدم تكرار رقم الفاتورة (الدالة بتستخدم sequence آمن مش حساب يدوي).
        // 3) قفل صفوف المخزون أثناء الخصم (FOR UPDATE) لمنع بيع نفس القطعة لعميلين في نفس اللحظة.
        // 4) عدم حدوث حالة "أوردر بلا أصناف" لو فشلت خطوة في النص، لأن كل حاجة بقت جوه معاملة واحدة.

        if (editingOrderId) {
            const { data: checkOrder } = await supabase.from('orders').select('is_locked, assigned_admin_name').eq('id', editingOrderId).single();
            if (checkOrder && checkOrder.is_locked) {
                const myName = currentUser?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email || '';
                // السماح بالحفظ فقط إذا كان حائز القفل هو نفس المستخدم الحالي
                if (checkOrder.assigned_admin_name !== myName) {
                    showToast('عفواً، لقد قامت الإدارة أو مستخدم آخر بقفل هذا الأوردر ولا يمكن تعديله الآن!', 'error');
                    btn.disabled = false;
                    btn.innerHTML = `حفظ التعديلات وإصدار الفاتورة`;
                    return;
                }
            }
        }

        if (!editingOrderId) {
            const quotaDetails = await getTenantOrderQuotaDetails();
            if (!quotaDetails.isUnlimited && quotaDetails.totalOrders >= quotaDetails.maxOrders) {
                btn.disabled = false;
                btn.innerHTML = `تأكيد وإصدار الفاتورة`;
                showSubscriptionUpgradeModal({
                    quotaType: 'orders',
                    limit: quotaDetails.maxOrders,
                    title: '⚠️ وصول للحد الأقصى للطلبات بالفاتورة',
                    message: `تعذر إصدار فاتورة جديدة: لقد وصلت إلى الحد الأقصى المسموح به للطلبات في باقتك الحالية (${quotaDetails.maxOrders} طلب).`
                });
                return;
            }
        }

        const orderItemsData = cartItems.map(item => ({
            model_id: item.modelId,
            color_id: item.colorId,
            qty: item.qty,
            model_name: item.modelName,
            price: item.price * (item.sizesCount || 1),
            total: item.qty * (item.sizesCount || 1) * item.price,
            sizes_count: item.sizesCount || 1,
            piece_price: item.price
        }));

        const { data: rpcData, error: rpcError } = await supabase.rpc('process_order_transaction', {
            p_order_id: editingOrderId || null,
            p_order_data: orderData,
            p_order_items: orderItemsData
        });

        if (rpcError) throw rpcError;

        const orderIdToPrint = editingOrderId || rpcData.order_id;
        const finalOrderObj = { id: orderIdToPrint, invoice_number: rpcData.invoice_number, ...orderData };

        if (editingOrderId) {
            // 🔄 تحرير القفل والإسناد وإعادة حالة الأوردر تلقائياً إلى "تم الإنشاء" بعد نجاح الحفظ
            await supabase.from('orders').update({
                status: 'created',
                is_locked: false,
                assigned_admin_name: null,
                assigned_worker_id: null
            }).eq('id', editingOrderId);

            await supabase.rpc('release_order_lock', { p_order_id: editingOrderId });
        }

        cartItems = [];
        saveCart();
        clearCustomerDraft();
        
        const finalEditingOrderId = editingOrderId;
        editingOrderId = null;
        localStorage.removeItem(getTenantEditOrderKey());
        localStorage.removeItem(getTenantEditOrderCacheKey());
        localStorage.removeItem('devo_edit_order_data');
        localStorage.removeItem('devo_edit_order_data_cache');

        const userName = currentUser?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email || 'موظف';
        const totalItemsCount = orderItemsData.reduce((acc, item) => acc + (item.qty || 0), 0);
        const orderMeta = {
            invoice_number: rpcData.invoice_number,
            customer_name: orderData.customer_name,
            phone: orderData.customer_phone,
            governorate: orderData.governorate,
            total_price: orderData.total_price,
            deposit: orderData.deposit || 0,
            remaining: (orderData.total_price || 0) - (orderData.deposit || 0),
            items_count: totalItemsCount
        };

        if (finalEditingOrderId) {
            await logOrderAction(orderIdToPrint, 'edited_in_cart', `تعديل أصناف الطلب (#${rpcData.invoice_number}) وإعادة حفظه للعميل "${orderData.customer_name}" بواسطة (${userName})`, orderMeta);
        } else {
            await logOrderAction(orderIdToPrint, 'created', `إنشاء فاتورة طلب جديدة (#${rpcData.invoice_number}) للعميل "${orderData.customer_name}" بواسطة (${userName})`, orderMeta);
        }

        if (window.refreshWorkerOrders) {
            window.refreshWorkerOrders();
        }

        document.getElementById('checkout-modal')?.classList.add('opacity-0');
        setTimeout(() => {
            document.getElementById('checkout-modal')?.classList.add('hidden');
            window.showInvoiceModal(finalOrderObj, orderItemsData);
        }, 300);

        showToast('تم إصدار الفاتورة وتحديث المخزون بنجاح!', 'success');

    } catch (err) {
        if (err.message && err.message.includes('SUBSCRIPTION_LIMIT_EXCEEDED')) {
            const match = err.message.match(/\d+/);
            showSubscriptionUpgradeModal({
                quotaType: 'orders',
                limit: match ? match[0] : 'المحدد',
                title: '⚠️ وصول للحد الأقصى للطلبات بالفاتورة',
                message: `تعذر إصدار فاتورة جديدة: تجاوز الحد المسموح به للطلبات بالباقة الحالية.`
            });
        } else if (err.message !== 'ValidationError') {
            console.error('Supabase Error:', err);
            showToast(`خطأ من السيرفر: ${err.message || 'فشل الاتصال بقاعدة البيانات'}`, 'error');
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = editingOrderId ? `حفظ التعديلات` : `تأكيد وإصدار الفاتورة`;
    }
}

window.confirmRemoveFromCart = async (index) => {
    const item = cartItems[index];
    if (!item) return;

    const confirmed = await confirmDialog({ 
        title: 'حذف اللون من السلة', 
        message: `هل أنت متأكد من رغبتك في حذف اللون (${item.colorName}) للموديل (${item.modelName}) من السلة؟`, 
        isDestructive: true 
    });

    if (confirmed) {
        cartItems.splice(index, 1);
        saveCart();
        renderCartFromCacheOrFetch();
        showToast(`تم إزالة اللون (${item.colorName}) بنجاح`, 'success');
    }
};

window.closeConfirmModal = () => {
    const modal = document.getElementById('confirm-modal');
    if(modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
    itemToDeleteIndex = null;
};



function saveCart() {
    localStorage.setItem(getTenantCartKey(), JSON.stringify(cartItems));
    updateFloatingCart();
}

function updateFloatingCart() {
    const countEl = document.getElementById('floating-cart-count');
    if (!countEl) return;
    const totalItems = cartItems.reduce((sum, item) => sum + item.qty, 0);
    countEl.textContent = totalItems;
    
    if (totalItems > 0) {
        countEl.parentElement.parentElement.classList.add('animate-bounce');
        setTimeout(() => countEl.parentElement.parentElement.classList.remove('animate-bounce'), 1000);
    }
}

async function showInvoiceModal(order, items) {
    const modalContent = document.querySelector('#invoice-modal .bg-white');
    if (modalContent) modalContent.scrollTop = 0;

    // Fetch the complete order with nested relations to ensure address, cashier name, model names and color names are perfectly accurate
    try {
        const { data: o, error } = await supabase
            .from('orders')
            .select(`
                *,
                system_users!orders_worker_id_fkey (full_name),
                order_items (
                    *,
                    models (
                        name,
                        factory_code,
                        system_code,
                        model_sizes (size_id),
                        classes (
                            class_sizes (size_id)
                        )
                    ),
                    colors (
                        id,
                        name,
                        color_code
                    )
                )
            `)
            .eq('id', order.id)
            .maybeSingle();
            
        if (!error && o) {
            lastOrderForPrinting = o;
        } else {
            lastOrderForPrinting = order;
        }
    } catch (e) {
        lastOrderForPrinting = order;
    }

    const oToUse = lastOrderForPrinting;

    // Load dynamic factory invoice print settings based on the issuing factory
    const invSettings = await fetchInvoicePrintSettings(oToUse?.tenant_id);
    const factNameEl = document.getElementById('inv-modal-factory-name');
    if (factNameEl) factNameEl.textContent = invSettings.factoryName;
    const factSubEl = document.getElementById('inv-modal-factory-subtitle');
    if (factSubEl) factSubEl.textContent = invSettings.subtitle;

    document.getElementById('inv-number').textContent = oToUse.invoice_number || oToUse.id;
    document.getElementById('inv-date').textContent = new Date(oToUse.created_at).toLocaleDateString('ar-EG');
    document.getElementById('inv-cust-name').textContent = oToUse.customer_name;
    document.getElementById('inv-cust-phone').textContent = oToUse.phone_1;
    
    const addressEl = document.getElementById('inv-cust-address');
    if (addressEl) addressEl.textContent = oToUse.address || '-';

    const workerEl = document.getElementById('inv-worker');
    if (workerEl) {
        workerEl.parentElement.classList.remove('hidden');
        workerEl.textContent = oToUse.system_users?.full_name || 'غير معروف';
    }

    const notesContainer = document.getElementById('inv-cust-notes-container');
    const notesEl = document.getElementById('inv-cust-notes');
    if (notesContainer && notesEl) {
        if (oToUse.notes && oToUse.notes.trim()) {
            notesContainer.classList.remove('hidden');
            notesEl.textContent = oToUse.notes.trim();
        } else {
            notesContainer.classList.add('hidden');
            notesEl.textContent = '';
        }
    }

    // Group order items by model matching the exact format of printOrderCustomerInvoice
    const groupedItems = {};
    if (oToUse.order_items && oToUse.order_items.length > 0) {
        oToUse.order_items.forEach((item, idx) => {
            const modelId = item.model_id || item.models?.id || (item.models?.name ? `${item.models.name}___${item.models.factory_code || ''}` : `model_${idx}`);
            const code = item.models?.factory_code || item.models?.system_code || item.factory_code || item.factoryCode || '';
            const colorName = item.colors?.name || item.color_name || '-';
            const qty = Number(item.quantity) || Number(item.qty) || 0;
            
            const classSizes = item.models?.classes?.class_sizes || [];
            const sizesCount = Number(item.sizes_count) || (classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1)) || 1; 
            const pieces = Number(item.pieces) || Number(item.total_pieces) || (qty * sizesCount);

            let piecePrice = 0;
            if (item.piece_price != null && Number(item.piece_price) > 0) {
                piecePrice = Number(item.piece_price);
            } else if (item.price != null && Number(item.price) > 0) {
                piecePrice = Number(item.price);
            } else if (item.price_per_series != null && Number(item.price_per_series) > 0) {
                const pps = Number(item.price_per_series);
                if (item.total_price && pieces > 0 && Math.abs(Number(item.total_price) - (qty * pps)) < 0.01 && sizesCount > 1) {
                    piecePrice = Number(item.total_price) / pieces;
                } else {
                    piecePrice = pps;
                }
            } else if (item.total_price && pieces > 0) {
                piecePrice = Number(item.total_price) / pieces;
            }

            piecePrice = Math.round(piecePrice);
            const itemTotalPrice = Math.round(Number(item.total_price) || (pieces * piecePrice) || (qty * (Number(item.price_per_series) || piecePrice || 0)));

            if (!groupedItems[modelId]) {
                groupedItems[modelId] = { 
                    modelName: item.models?.name || item.model_name || 'موديل', 
                    code: code, 
                    colorsList: [colorName], 
                    totalQty: qty, 
                    totalPieces: pieces, 
                    price: piecePrice, 
                    totalPrice: itemTotalPrice 
                };
            } else {
                if (!groupedItems[modelId].colorsList.includes(colorName)) {
                    groupedItems[modelId].colorsList.push(colorName);
                }
                groupedItems[modelId].totalQty += qty;
                groupedItems[modelId].totalPieces += pieces;
                groupedItems[modelId].totalPrice += itemTotalPrice;
            }
        });
    }

    const tbody = document.getElementById('inv-items-body');
    let totalModels = 0;
    let totalSeries = 0;
    let totalPieces = 0;

    if (tbody) {
        tbody.innerHTML = '';
        const groupedList = Object.values(groupedItems);
        if (groupedList.length > 0) {
            totalModels = groupedList.length;
            groupedList.forEach((item, idx) => {
                totalSeries += (item.totalQty || 0);
                totalPieces += (item.totalPieces || 0);
                const row = `
                    <tr class="text-xs sm:text-sm">
                        <td class="border border-gray-300 p-1 sm:p-2 text-center">${idx + 1}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 font-bold">
                            ${item.modelName} ${item.code ? `<span class="text-[10px] text-gray-500 font-mono pr-1">(${item.code})</span>` : ''}
                        </td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center text-gray-700 text-xs">${item.colorsList.join('، ')}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center whitespace-nowrap">
                            <span class="font-black text-amber-600">${item.totalQty}</span>
                            <span class="text-xs font-bold text-sky-600 mr-1">(${item.totalPieces} ق)</span>
                        </td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center font-bold">${Math.round(item.price)}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center font-black bg-gray-50">${Math.round(item.totalPrice)}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        } else if (items && items.length > 0) {
            const modelIds = new Set();
            items.forEach((item, idx) => {
                if (item.model_id || item.modelId) modelIds.add(item.model_id || item.modelId);
                const seriesQty = Number(item.quantity) || Number(item.qty) || 1;
                const sizesCount = Number(item.sizesCount || item.sizes_count) || 1;
                const pieces = Number(item.pieces) || (seriesQty * sizesCount);
                const piecePrice = Math.round(Number(item.piece_price != null ? item.piece_price : (item.price || 0)));
                const itemTotal = Math.round(Number(item.total_price || item.total) || (pieces * piecePrice));
                totalSeries += seriesQty;
                totalPieces += pieces;

                const row = `
                    <tr class="text-xs sm:text-sm">
                        <td class="border border-gray-300 p-1 sm:p-2 text-center">${idx + 1}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 font-bold">${item.model_name || item.models?.name || 'موديل'}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center text-gray-600">${item.color_name || item.colors?.name || 'لون'}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center whitespace-nowrap">
                            <span class="font-black text-amber-600">${seriesQty}</span>
                            <span class="text-xs font-bold text-sky-600 mr-1">(${pieces} ق)</span>
                        </td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center font-bold">${piecePrice}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center font-black bg-gray-50">${itemTotal}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
            totalModels = modelIds.size || items.length;
        }
    }

    const invTotalModels = document.getElementById('inv-total-models');
    if (invTotalModels) invTotalModels.textContent = totalModels;
    const invTotalSeries = document.getElementById('inv-total-series');
    if (invTotalSeries) invTotalSeries.textContent = totalSeries;
    const invTotalPieces = document.getElementById('inv-total-pieces');
    if (invTotalPieces) invTotalPieces.textContent = totalPieces;

    const invTotal = document.getElementById('inv-total-price');
    if (invTotal) invTotal.textContent = Math.round(Number(oToUse.total_price) || 0);
    const invDeposit = document.getElementById('inv-deposit');
    if (invDeposit) invDeposit.textContent = Math.round(Number(oToUse.deposit) || 0);
    const invRem = document.getElementById('inv-remaining');
    if (invRem) invRem.textContent = Math.round((Number(oToUse.total_price) || 0) - (Number(oToUse.deposit) || 0));

    const modal = document.getElementById('invoice-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
    localStorage.removeItem(getTenantEditOrderCacheKey());

    // Push state for back button navigation
    if (!window.invoiceModalHistoryPushed) {
        window.invoiceModalHistoryPushed = true;
        history.pushState({ invoiceModalOpen: true }, '', window.location.href);
    }
}

window.finishOrderAndRedirect = (isFromPopstate = false) => {
    const modal = document.getElementById('invoice-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => {
            modal.classList.add('hidden');
            cartItems = [];
            saveCart();
            if (editingOrderId) {
                editingOrderId = null;
                updateCartHeaderEditState();
            }
            if (typeof window.switchSiteView === 'function') {
                window.switchSiteView('view-gallery');
            }
        }, 300);
    }

    if (window.invoiceModalHistoryPushed) {
        window.invoiceModalHistoryPushed = false;
        if (!isFromPopstate && history.state?.invoiceModalOpen) {
            history.back();
        }
    }
};

window.executeInvoicePrint = () => {
    if (lastOrderForPrinting) {
        printOrderCustomerInvoice(lastOrderForPrinting);
    } else {
        showToast('لا توجد بيانات فاتورة صالحة للطباعة', 'error');
    }
};

window.addEventListener('beforeunload', () => {
    if(cartItems.length > 0) localStorage.setItem(getTenantEditOrderCacheKey(), JSON.stringify(cartItems));
});

// دالة لتسجيل حركات وتعديلات الأوردرات بسجل الملاحظات (للسلة والمبيعات)
async function logOrderAction(orderId, actionType, notes, extraMeta = {}) {
    try {
        const userId = currentUser?.id || null;
        const userName = currentUser?.full_name || currentUser?.user_metadata?.full_name || currentUser?.email || 'موظف';
        const currentTenantId = getCurrentTenantId();

        const enrichedDetails = {
            notes: notes,
            action: actionType,
            invoice_number: extraMeta.invoice_number ? `#${extraMeta.invoice_number}` : null,
            customer_name: extraMeta.customer_name || null,
            phone: extraMeta.phone || null,
            governorate: extraMeta.governorate || null,
            total_price: extraMeta.total_price ? `${extraMeta.total_price} ج.م` : null,
            deposit: extraMeta.deposit ? `${extraMeta.deposit} ج.م` : '0 ج.م',
            remaining: extraMeta.remaining !== undefined ? `${extraMeta.remaining} ج.م` : null,
            items_count: extraMeta.items_count ? `${extraMeta.items_count} قطعة/سري` : null,
            user_name: userName,
            ...extraMeta
        };
        
        const { error } = await supabase.from('order_logs').insert([{
            tenant_id: currentTenantId,
            order_id: orderId,
            user_id: userId,
            user_name: userName,
            action_type: actionType,
            notes: notes,
            details: JSON.stringify(enrichedDetails)
        }]);
        if (error) {
            console.error('Database error inserting order log:', error);
        }

        // 📝 تسـجيل الإجراء في سجلات النظام الشاملة
        logAuditEvent({
            module: 'orders',
            actionType: actionType === 'created' ? 'create' : 'update',
            entityType: 'order',
            entityId: orderId,
            details: enrichedDetails,
            tenantIdParam: currentTenantId,
            userNameParam: userName
        }).catch(e => console.warn(e));

    } catch (err) {
        console.error('Error logging order action:', err);
    }
}

// ===================================================================
// 🌟 6. نظام طلبات وتتبع الزوار (VISITOR ORDERING & LIVE TRACKING) 🌟
// ===================================================================

function setupCartUserInterface() {
    const checkoutTitle = document.getElementById('checkout-form-title');
    const checkoutSubtext = document.getElementById('checkout-form-subtext');
    const workerPaymentFields = document.getElementById('worker-payment-fields');
    const visitorHint = document.getElementById('visitor-form-hint');
    const btnSaveOrderText = document.getElementById('btn-save-order-text');
    const btnSaveOrderIcon = document.getElementById('btn-save-order-icon');
    const cartSummaryTitle = document.getElementById('cart-summary-title');
    const cartPageTitle = document.getElementById('cart-page-title');

    if (!currentUser || editingVisitorOrderId) {
        // واجهة الزائر أو تعديل طلب زائر معلق
        if (checkoutTitle) checkoutTitle.innerHTML = `<i class="ph ph-user text-devo-info"></i><span>بيانات التواصل</span>`;
        if (checkoutSubtext) {
            checkoutSubtext.classList.remove('hidden');
            checkoutSubtext.textContent = 'لن يتم خصم أي مخزون حتى يوافق فريقنا على طلبك';
        }
        if (workerPaymentFields) workerPaymentFields.classList.add('hidden');
        if (visitorHint) visitorHint.classList.remove('hidden');
        if (btnSaveOrderText) btnSaveOrderText.textContent = editingVisitorOrderId ? 'حفظ تعديلات الطلب' : 'إرسال الطلب';
        if (btnSaveOrderIcon) btnSaveOrderIcon.className = editingVisitorOrderId ? 'ph ph-check-circle text-xl' : 'ph ph-paper-plane-tilt text-xl';
        if (cartSummaryTitle) cartSummaryTitle.textContent = 'ملخص الطلب';
        if (cartPageTitle) cartPageTitle.textContent = 'طلبك';
    } else {
        // واجهة الموظف/الإدارة
        if (checkoutTitle) checkoutTitle.innerHTML = `<i class="ph ph-user text-devo-info"></i><span>بيانات العميل</span>`;
        if (checkoutSubtext) checkoutSubtext.classList.add('hidden');
        if (workerPaymentFields) workerPaymentFields.classList.remove('hidden');
        if (visitorHint) visitorHint.classList.add('hidden');
        if (btnSaveOrderText) btnSaveOrderText.textContent = editingOrderId ? 'حفظ التعديلات' : 'حفظ وإصدار الفاتورة';
        if (btnSaveOrderIcon) btnSaveOrderIcon.className = 'ph ph-receipt text-xl';
        if (cartSummaryTitle) cartSummaryTitle.textContent = 'ملخص الأوردر';
        if (cartPageTitle) cartPageTitle.textContent = 'سلة المشتريات';
    }
}

function switchCartMainTab(tab) {
    currentMainCartTab = tab;
    try {
        localStorage.setItem(getTenantCartTabKey(), tab);
    } catch (e) {}

    const tabCurrentBtn = document.getElementById('tab-btn-current-cart');
    const tabHistoryBtn = document.getElementById('tab-btn-my-orders');
    const tabCurrentSection = document.getElementById('cart-tab-current');
    const tabHistorySection = document.getElementById('cart-tab-history');

    if (tab === 'current') {
        if (tabCurrentBtn) {
            tabCurrentBtn.className = "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 bg-devo-orange text-white shadow-md cursor-pointer";
        }
        if (tabHistoryBtn) {
            tabHistoryBtn.className = "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 text-devo-muted hover:text-white border border-transparent hover:bg-devo-gray/30 cursor-pointer";
        }
        if (tabCurrentSection) tabCurrentSection.classList.remove('hidden');
        if (tabHistorySection) tabHistorySection.classList.add('hidden');
    } else {
        if (tabHistoryBtn) {
            tabHistoryBtn.className = "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 bg-devo-orange text-white shadow-md cursor-pointer";
        }
        if (tabCurrentBtn) {
            tabCurrentBtn.className = "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 text-devo-muted hover:text-white border border-transparent hover:bg-devo-gray/30 cursor-pointer";
        }
        if (tabCurrentSection) tabCurrentSection.classList.add('hidden');
        if (tabHistorySection) tabHistorySection.classList.remove('hidden');
        refreshVisitorOrdersList();
    }
}

// 📦 إدارة الأكواد المحفوظة محلياً للزائر
function getVisitorSavedCodes() {
    try {
        const raw = localStorage.getItem(getVisitorSavedCodesKey());
        return raw ? JSON.parse(raw) : [];
    } catch(e) {
        return [];
    }
}

function saveVisitorOrderCode(code) {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    let codes = getVisitorSavedCodes();
    if (!codes.includes(cleanCode)) {
        codes.unshift(cleanCode);
        if (codes.length > 20) codes = codes.slice(0, 20);
        localStorage.setItem(getVisitorSavedCodesKey(), JSON.stringify(codes));
    }
    renderVisitorSavedCodesChips();
}

function removeSingleVisitorCode(code) {
    let codes = getVisitorSavedCodes();
    codes = codes.filter(c => c !== code);
    localStorage.setItem(getVisitorSavedCodesKey(), JSON.stringify(codes));
    renderVisitorSavedCodesChips();
    refreshVisitorOrdersList();
}

function clearVisitorSavedCodes() {
    localStorage.removeItem(getVisitorSavedCodesKey());
    renderVisitorSavedCodesChips();
    refreshVisitorOrdersList();
    showToast('تم مسح سجل الأكواد المستعلم عنها', 'info');
}

function renderVisitorSavedCodesChips() {
    const container = document.getElementById('visitor-saved-codes-chips');
    const wrap = document.getElementById('visitor-saved-codes-container');
    const badge = document.getElementById('tab-orders-badge');
    const codes = getVisitorSavedCodes();

    if (badge) {
        if (codes.length > 0) {
            badge.textContent = codes.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    if (!container || !wrap) return;

    if (codes.length === 0) {
        wrap.classList.add('hidden');
        container.innerHTML = `<span class="text-devo-muted font-bold flex items-center gap-1"><i class="ph ph-clock-counter-clockwise"></i> سجل الأكواد المستعلم عنها:</span> <span class="text-devo-muted/60">لا توجد أكواد مسجلة</span>`;
        return;
    }

    wrap.classList.remove('hidden');
    container.innerHTML = `
        <span class="text-devo-muted font-bold flex items-center gap-1"><i class="ph ph-clock-counter-clockwise"></i> سجل الأكواد المستعلم عنها:</span>
        ${codes.map(code => `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-devo-orange/15 border border-devo-orange/30 text-devo-orange font-mono font-bold text-xs">
                <span class="cursor-pointer hover:underline" onclick="document.getElementById('visitor-track-input').value='${code}'; handleVisitorTrackSearch();"># ${code}</span>
                <button type="button" onclick="window.removeSingleVisitorCode('${code}')" class="text-devo-muted hover:text-devo-error p-0.5 rounded transition-colors" title="إزالة من السجل">
                    <i class="ph ph-x text-xs"></i>
                </button>
            </span>
        `).join('')}
    `;
}

// 🛒 معالجة إرسال طلب الزائر
async function handleVisitorCheckout(e) {
    e.preventDefault();

    if (cartItems.length === 0) {
        return showToast('سلة طلبك فارغة! يرجى إضافة موديلات أولاً.', 'error');
    }

    const cName = document.getElementById('c-name')?.value?.trim();
    const cPhone1 = document.getElementById('c-phone1')?.value?.trim();
    const cPhone2 = document.getElementById('c-phone2')?.value?.trim() || null;
    const cAddress = document.getElementById('c-address')?.value?.trim();
    const cNotes = document.getElementById('c-notes')?.value?.trim() || null;

    if (!cName || !cPhone1 || !cAddress) {
        return showToast('يرجى ملء جميع الحقول المطلوبة (الاسم، الهاتف، العنوان بالتفصيل).', 'warning');
    }

    const btn = document.getElementById('btn-save-order');
    const originalBtnHtml = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="ph ph-spinner animate-spin text-xl"></i> <span>جاري فحص وتأكيد الطلب...</span>`;
    }

    try {
        const tenantId = getCurrentTenantId() || 'default';

        // 1. فحص فوري للمخزون من قاعدة البيانات قبل الإرسال
        const modelIds = [...new Set(cartItems.map(i => i.modelId))];
        const colorIds = [...new Set(cartItems.map(i => i.colorId))];

        const { data: dbInv, error: invError } = await supabase
            .from('model_inventory')
            .select('model_id, color_id, available_series')
            .in('model_id', modelIds)
            .in('color_id', colorIds);

        if (invError) throw invError;

        let hasStockShortage = false;
        let shortageDetails = [];

        cartItems.forEach(item => {
            const row = dbInv?.find(r => r.model_id === item.modelId && r.color_id === item.colorId);
            const available = row ? (row.available_series || 0) : 0;
            if (item.qty > available) {
                hasStockShortage = true;
                shortageDetails.push(`الموديل (${item.modelName}) - لون (${item.colorName}): المتاح ${available} سيريه والمطلوب ${item.qty}`);
            }
        });

        if (hasStockShortage) {
            setCartFilter('error');
            await loadAndRenderCart();
            showToast(`⚠️ تعذر إرسال الطلب لوجود نقص بالمخزون: ${shortageDetails[0]}`, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
            return;
        }

        // 2. تجهيز بيانات الأصناف
        const orderItemsPayload = cartItems.map(item => {
            const sizesCount = Number(item.sizesCount) || 1;
            const piecePrice = Math.round(Number(item.price) || 0);
            const totalPieces = item.qty * sizesCount;
            const itemTotal = totalPieces * piecePrice;
            return {
                model_id: item.modelId,
                color_id: item.colorId,
                model_name: item.modelName,
                color_name: item.colorName,
                qty: item.qty,
                price: piecePrice,
                piece_price: piecePrice,
                sizes_count: sizesCount,
                total_pieces: totalPieces,
                price_per_series: piecePrice * sizesCount,
                total_price: itemTotal,
                factory_code: item.factoryCode || '',
                image: item.image || ''
            };
        });

        const totalAmount = orderItemsPayload.reduce((acc, i) => acc + i.total_price, 0);

        const orderDataPayload = {
            tenant_id: tenantId,
            customer_name: cName,
            customer_phone_1: cPhone1,
            customer_phone_2: cPhone2,
            customer_address: cAddress,
            notes: cNotes
        };

        let resultOrderCode = null;
        let resultOrderId = null;

        if (editingVisitorOrderId) {
            // حالة تعديل طلب معلق مسبقاً
            const totalModels = new Set(cartItems.map(i => i.modelId)).size;
            const totalSeries = cartItems.reduce((acc, i) => acc + i.qty, 0);

            const { data: updatedOrder, error: updateErr } = await supabase
                .from('visitor_orders')
                .update({
                    customer_name: cName,
                    customer_phone_1: cPhone1,
                    customer_phone_2: cPhone2,
                    customer_address: cAddress,
                    notes: cNotes,
                    items: orderItemsPayload,
                    total_models: totalModels,
                    total_series: totalSeries,
                    total_amount: totalAmount,
                    updated_at: new Date().toISOString()
                })
                .eq('id', editingVisitorOrderId)
                .eq('tenant_id', tenantId)
                .in('status', ['pending', 'assigned'])
                .select('id, order_code, total_amount')
                .single();

            if (updateErr) throw updateErr;

            resultOrderId = updatedOrder.id;
            resultOrderCode = updatedOrder.order_code;
            showToast('تم تحديث بيانات طلبك المعلق بنجاح!', 'success');
            editingVisitorOrderId = null;
            const editBanner = document.getElementById('cart-edit-mode-banner');
            if (editBanner) editBanner.classList.add('hidden');
        } else {
            // إنشاء طلب جديد عبر الدالة المخزنة submit_visitor_order
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('submit_visitor_order', {
                p_order_data: orderDataPayload,
                p_order_items: orderItemsPayload
            });

            if (rpcErr) {
                console.warn('RPC submit_visitor_order fallback to direct insert:', rpcErr);
                const orderCode = 'VO' + Math.random().toString(36).substring(2, 8).toUpperCase();
                const totalModels = new Set(cartItems.map(i => i.modelId)).size;
                const totalSeries = cartItems.reduce((acc, i) => acc + i.qty, 0);

                const { data: insData, error: insErr } = await supabase
                    .from('visitor_orders')
                    .insert([{
                        order_code: orderCode,
                        tenant_id: tenantId,
                        customer_name: cName,
                        customer_phone_1: cPhone1,
                        customer_phone_2: cPhone2,
                        customer_address: cAddress,
                        notes: cNotes,
                        status: 'pending',
                        items: orderItemsPayload,
                        total_models: totalModels,
                        total_series: totalSeries,
                        total_amount: totalAmount
                    }])
                    .select('id, order_code')
                    .single();

                if (insErr) throw insErr;
                resultOrderId = insData.id;
                resultOrderCode = insData.order_code;
            } else {
                resultOrderId = rpcRes.order_id;
                resultOrderCode = rpcRes.order_code;
            }
        }

        // حفظ الكود ورقم الهاتف في التخزين المحلي
        saveVisitorOrderCode(resultOrderCode);
        localStorage.setItem(getVisitorLastPhoneKey(), cPhone1);

        // تجهيز بيانات الفاتورة للطباعة الفورية
        lastVisitorOrderForPrinting = {
            id: resultOrderId,
            tenant_id: currentTenantId,
            order_code: resultOrderCode,
            invoice_number: resultOrderCode,
            customer_name: cName,
            phone_1: cPhone1,
            customer_phone_1: cPhone1,
            phone_2: cPhone2,
            address: cAddress,
            notes: cNotes,
            created_at: new Date().toISOString(),
            status: 'pending',
            total_price: totalAmount,
            deposit: 0,
            remaining: totalAmount,
            items: orderItemsPayload,
            order_items: orderItemsPayload.map(i => ({
                model_id: i.model_id || `${i.model_name || 'm'}_${i.factory_code || ''}`,
                quantity: i.qty,
                sizes_count: i.sizes_count || 1,
                pieces: i.total_pieces,
                price: i.piece_price,
                piece_price: i.piece_price,
                price_per_series: i.price_per_series,
                total_price: i.total_price,
                models: { 
                    id: i.model_id, 
                    name: i.model_name, 
                    factory_code: i.factory_code, 
                    system_code: i.factory_code,
                    model_sizes: { length: i.sizes_count || 1 }
                },
                colors: { name: i.color_name }
            }))
        };

        // إفراغ السلة المحلية وتنظيف مسودة العميل بعد نجاح حفظ الطلب
        const wasEditingByWorker = !!(currentUser && editingVisitorOrderId);
        cartItems = [];
        saveCart();
        clearCustomerDraft();
        loadAndRenderCart();

        setupCartUserInterface();

        if (wasEditingByWorker) {
            showToast('تم حفظ تعديلات طلب الزائر بنجاح وهو الآن جاهز للاعتماد من الإدارة!', 'success');
            if (window.refreshOrders) window.refreshOrders();
            if (window.switchSiteView) window.switchSiteView('view-orders');
        } else {
            // عرض نافذة النجاح للزائر
            showVisitorOrderSuccessModal(resultOrderCode, cName, cPhone1);
        }

    } catch (err) {
        console.error('Visitor order submission error:', err);
        showToast(err.message || 'حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
    }
}

let cachedFactoryWhatsAppContact = null;
async function getFactoryWhatsAppContact() {
    if (cachedFactoryWhatsAppContact !== null) return cachedFactoryWhatsAppContact;
    const currentTenantId = getCurrentTenantId();
    try {
        if (currentTenantId) {
            const { data } = await supabase
                .from('tenant_social_links')
                .select('whatsapp_number')
                .eq('tenant_id', currentTenantId)
                .maybeSingle();
            if (data?.whatsapp_number && data.whatsapp_number.trim() !== '') {
                cachedFactoryWhatsAppContact = data.whatsapp_number.trim();
                return cachedFactoryWhatsAppContact;
            }
        }
    } catch(e) {
        console.warn('Error fetching tenant whatsapp number:', e);
    }
    cachedFactoryWhatsAppContact = '';
    return '';
}

function formatWhatsAppUrl(rawPhone, text) {
    if (!rawPhone) return '#';
    let clean = String(rawPhone).replace(/[^\d+]/g, '');
    if (clean.startsWith('0') && clean.length === 11) {
        clean = '2' + clean;
    } else if (!clean.startsWith('2') && !clean.startsWith('+') && clean.length === 10) {
        clean = '20' + clean;
    }
    clean = clean.replace(/^\+/, '');
    return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

async function showVisitorOrderSuccessModal(orderCode, name, phone) {
    const modal = document.getElementById('visitor-order-success-modal');
    const nameEl = document.getElementById('succ-cust-name');
    const phoneEl = document.getElementById('succ-cust-phone');
    const codeEl = document.getElementById('succ-order-code');
    const waBtn = document.getElementById('succ-whatsapp-share-btn');

    if (nameEl) nameEl.textContent = name || '---';
    if (phoneEl) phoneEl.textContent = phone || '---';
    if (codeEl) codeEl.textContent = orderCode || '---';

    if (waBtn) {
        const factoryPhone = await getFactoryWhatsAppContact();
        const totalAmount = lastVisitorOrderForPrinting?.total_price || 0;
        const totalSeries = lastVisitorOrderForPrinting?.items?.reduce((acc, i) => acc + (i.qty || 0), 0) || 0;
        const msg = 
`السلام عليكم ورحمة الله،
لقد قمت بعمل طلب جديد عبر الموقع:
🔖 كود الطلب: #${orderCode}
👤 اسم العميل: ${name || '-'}
📞 رقم الهاتف: ${phone || '-'}
📦 إجمالي السريات: ${totalSeries} سيريه
💰 إجمالي القيمة: ${Number(totalAmount).toLocaleString()} ج.م
أرجو تأكيد ومتابعة الطلب، شكراً لكم!`;

        if (factoryPhone) {
            waBtn.href = formatWhatsAppUrl(factoryPhone, msg);
        } else {
            waBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
        }
    }

    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
}

function closeSuccessModalAndBrowse() {
    const modal = document.getElementById('visitor-order-success-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
    if (typeof window.switchSiteView === 'function') {
        window.switchSiteView('view-gallery');
    }
}

function goToVisitorOrdersHistory() {
    const modal = document.getElementById('visitor-order-success-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
    switchCartMainTab('history');
}

async function copyVisitorOrderCode() {
    const codeEl = document.getElementById('succ-order-code');
    const code = codeEl?.textContent?.trim();
    if (!code || code === '---') return;

    try {
        await navigator.clipboard.writeText(code);
        showToast(`تم نسخ كود الطلب (#${code}) بنجاح!`, 'success');
    } catch(e) {
        showToast('فشل نسخ الكود', 'error');
    }
}

function printCurrentVisitorOrder() {
    if (lastVisitorOrderForPrinting) {
        printOrderCustomerInvoice(lastVisitorOrderForPrinting);
    } else {
        showToast('لا توجد بيانات للطباعة', 'error');
    }
}

// 🔍 الاستعلام والبحث عن طلبات الزائر
async function handleVisitorTrackSearch() {
    const input = document.getElementById('visitor-track-input');
    const term = input?.value?.trim();
    if (!term) {
        return showToast('يرجى إدخال كود الطلب أو رقم الهاتف للاستعلام.', 'warning');
    }

    if (term.length >= 6 && !/^\d+$/.test(term)) {
        saveVisitorOrderCode(term);
    }

    await refreshVisitorOrdersList(term);
}

async function refreshVisitorOrdersList(searchTerm = null) {
    const container = document.getElementById('visitor-orders-list');
    const emptyState = document.getElementById('visitor-orders-empty');
    if (!container) return;

    const savedCodes = getVisitorSavedCodes();
    const lastPhone = localStorage.getItem(getVisitorLastPhoneKey()) || '';
    const term = searchTerm || document.getElementById('visitor-track-input')?.value?.trim() || lastPhone;
    const tenantId = getCurrentTenantId() || 'default';

    container.innerHTML = `
        <div class="flex items-center justify-center py-12 text-devo-orange gap-2">
            <i class="ph ph-spinner animate-spin text-2xl"></i>
            <span class="text-sm font-bold">جاري جلب الطلبات من النظام الحي...</span>
        </div>
    `;

    try {
        let query = supabase
            .from('visitor_orders')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_deleted', false);

        if (term) {
            if (/^\d+$/.test(term)) {
                // رقم هاتف
                query = query.or(`customer_phone_1.eq.${term},customer_phone_2.eq.${term}`);
            } else {
                // كود طلب
                query = query.ilike('order_code', `%${term}%`);
            }
        } else if (savedCodes.length > 0) {
            query = query.in('order_code', savedCodes);
        } else {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        const { data: orders, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        visitorTrackedOrders = orders || [];

        if (visitorTrackedOrders.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        container.innerHTML = visitorTrackedOrders.map(order => {
            const dateStr = new Date(order.created_at).toLocaleString('ar-EG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            // شارات الحالة المطابقة للتصميم
            let statusBadge = '';
            if (order.status === 'approved') {
                statusBadge = `<span class="px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-full text-xs font-black flex items-center gap-1.5"><i class="ph ph-check-circle"></i> معتمد</span>`;
            } else if (order.status === 'rejected') {
                statusBadge = `<span class="px-3 py-1 bg-red-500/15 border border-red-500/30 text-red-400 rounded-full text-xs font-black flex items-center gap-1.5"><i class="ph ph-x-circle"></i> مرفوض</span>`;
            } else if (order.status === 'assigned') {
                statusBadge = `<span class="px-3 py-1 bg-sky-500/15 border border-sky-500/30 text-sky-400 rounded-full text-xs font-black flex items-center gap-1.5"><i class="ph ph-user"></i> قيد المراجعة</span>`;
            } else {
                statusBadge = `<span class="px-3 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-full text-xs font-black flex items-center gap-1.5"><i class="ph ph-clock"></i> قيد المراجعة</span>`;
            }

            const rejectionBox = (order.status === 'rejected' && order.rejection_reason)
                ? `<div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 my-3 font-bold flex items-center gap-2"><i class="ph ph-warning-circle text-base shrink-0"></i><span>سبب الرفض: ${order.rejection_reason}</span></div>`
                : '';

            const isPending = order.status === 'pending' || order.status === 'assigned';

            return `
                <div class="bg-devo-dark border border-devo-gray rounded-2xl p-5 shadow-sm transition-all hover:border-devo-orange/40 space-y-3" id="vorder-card-${order.id}">
                    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-devo-gray/50 pb-3">
                        <div class="flex items-center gap-2.5">
                            <span class="w-8 h-8 rounded-xl bg-devo-orange/15 border border-devo-orange/30 text-devo-orange flex items-center justify-center font-bold text-sm">
                                <i class="ph ph-receipt"></i>
                            </span>
                            <div>
                                <div class="flex items-center gap-1.5">
                                    <span class="text-white font-mono font-black text-sm sm:text-base tracking-wider">#${order.order_code}</span>
                                    <button type="button" onclick="navigator.clipboard.writeText('${order.order_code}'); showToast('تم نسخ الكود!', 'success');" class="text-devo-muted hover:text-white p-0.5 rounded transition-colors" title="نسخ الكود">
                                        <i class="ph ph-copy text-sm"></i>
                                    </button>
                                </div>
                                <span class="text-[11px] text-devo-muted font-medium">${dateStr}</span>
                            </div>
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>

                    ${rejectionBox}

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                        <div>
                            <span class="text-devo-muted block mb-0.5">العميل:</span>
                            <span class="text-white font-bold">${order.customer_name}</span>
                        </div>
                        <div>
                            <span class="text-devo-muted block mb-0.5">الهاتف:</span>
                            <span class="text-white font-mono font-bold" dir="ltr">${order.customer_phone_1}</span>
                        </div>
                        <div>
                            <span class="text-devo-muted block mb-0.5">إجمالي السريات:</span>
                            <span class="text-devo-orange font-bold">${order.total_series} سيريه</span>
                        </div>
                        <div>
                            <span class="text-devo-muted block mb-0.5">إجمالي القيمة:</span>
                            <span class="text-devo-orange font-black">${Number(order.total_amount).toLocaleString()} ج.م</span>
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-devo-gray/40">
                        <button type="button" onclick="window.openVisitorOrderDetails('${order.id}')" class="px-3.5 py-2 bg-devo-orange/15 hover:bg-devo-orange/25 border border-devo-orange/40 text-devo-orange rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer">
                            <i class="ph ph-eye text-sm"></i>
                            <span>عرض التفاصيل</span>
                        </button>
                        <button type="button" onclick="window.printVisitorOrderById('${order.id}')" class="px-3.5 py-2 bg-devo-gray/30 hover:bg-devo-gray/50 border border-devo-gray text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer">
                            <i class="ph ph-printer text-sm"></i>
                            <span>طباعة</span>
                        </button>
                        ${isPending ? `
                            <button type="button" onclick="window.editVisitorOrder('${order.id}')" class="px-3.5 py-2 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer">
                                <i class="ph ph-pencil-simple text-sm"></i>
                                <span>تعديل الطلب</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

    } catch(err) {
        console.error('Error querying visitor orders:', err);
        container.innerHTML = `<div class="p-4 text-center text-devo-error bg-devo-error/10 border border-devo-error/20 rounded-xl text-xs font-bold">حدث خطأ أثناء جلب الطلبات، يرجى المحاولة مرة أخرى.</div>`;
    }
}

// 📡 التزامن اللحظي للزائر لمعرفة تغيير حالة طلبه فور اعتماد الأدمن أو رفضه
function setupVisitorOrdersRealtime() {
    if (visitorOrdersRealtimeChannel) return;

    const tenantId = getCurrentTenantId() || 'default';
    const filterConfig = (tenantId && tenantId !== 'default') ? { filter: `tenant_id=eq.${tenantId}` } : {};
    visitorOrdersRealtimeChannel = supabase.channel('visitor_orders_live_' + tenantId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_orders', ...filterConfig }, (payload) => {
            const savedCodes = getVisitorSavedCodes();
            const orderCode = payload.new?.order_code || payload.old?.order_code;

            if (orderCode && savedCodes.includes(orderCode)) {
                if (payload.eventType === 'UPDATE') {
                    if (payload.new.status === 'approved') {
                        showToast(`🎉 تهانينا! تمت الموافقة على طلبك رقم (#${orderCode}) وجاري تجهيزه!`, 'success');
                    } else if (payload.new.status === 'rejected') {
                        showToast(`⚠️ تنبيه: تم رفض طلبك رقم (#${orderCode}) لسبب: ${payload.new.rejection_reason || 'غير محدد'}`, 'error');
                    }
                } else if (payload.eventType === 'DELETE') {
                    showToast(`تم حذف الطلب رقم (#${orderCode}) من قبل الإدارة.`, 'info');
                }

                if (!document.getElementById('cart-tab-history')?.classList.contains('hidden')) {
                    refreshVisitorOrdersList();
                }
            }
        })
        .subscribe();
}

// 📄 عرض تفاصيل أصناف طلب الزائر
async function openVisitorOrderDetails(orderId) {
    const order = visitorTrackedOrders.find(o => o.id === orderId);
    if (!order) return;

    const modal = document.getElementById('visitor-order-details-modal');
    const titleEl = document.getElementById('vod-title');
    const contentEl = document.getElementById('vod-content');
    const printBtn = document.getElementById('vod-print-btn');

    if (titleEl) titleEl.textContent = `تفاصيل الطلب (#${order.order_code})`;
    if (printBtn) printBtn.onclick = () => printVisitorOrderById(order.id);

    const items = order.items || [];
    const totalModels = new Set(items.map(i => i.model_id || i.modelId || i.model_name)).size;
    const totalSeries = items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);
    const totalPieces = items.reduce((acc, i) => acc + ((Number(i.qty) || 0) * (Number(i.sizes_count) || 1)), 0);

    // 🌟 تجميع الأصناف حسب الموديل 🌟
    const modelMap = new Map();
    items.forEach(item => {
        const modelId = item.model_id || item.modelId || item.model_name || 'unknown';
        if (!modelMap.has(modelId)) {
            const sizesCount = Number(item.sizes_count) || 1;
            const seriesPrice = Number(item.price) || 0;
            const piecePrice = sizesCount > 0 ? Math.round(seriesPrice / sizesCount) : seriesPrice;

            modelMap.set(modelId, {
                modelId,
                modelName: item.model_name || 'موديل',
                code: item.factory_code || '',
                imageUrl: item.image || item.image_url || './src/assets/icons/devo.png',
                sizesCount: sizesCount,
                seriesPrice: seriesPrice,
                piecePrice: piecePrice,
                totalSeries: 0,
                totalPieces: 0,
                totalPrice: 0,
                items: []
            });
        }
        const group = modelMap.get(modelId);
        const qty = Number(item.qty) || 0;
        const pieces = qty * group.sizesCount;
        const itemTotal = qty * group.seriesPrice;

        group.totalSeries += qty;
        group.totalPieces += pieces;
        group.totalPrice += itemTotal;

        group.items.push({
            colorName: item.color_name || 'لون',
            colorCode: item.color_code,
            quantity: qty,
            pieces: pieces,
            itemTotal: itemTotal,
            price_per_series: group.seriesPrice
        });
    });

    const modelGroups = Array.from(modelMap.values());
    let modelsCardsHtml = '';

    if (modelGroups.length === 0) {
        modelsCardsHtml = `
            <div class="p-8 text-center bg-devo-black/60 border border-devo-gray rounded-2xl">
                <i class="ph ph-package text-3xl text-devo-muted mb-2 block"></i>
                <p class="text-devo-muted text-sm font-bold">لا توجد أصناف مسجلة في هذا الطلب.</p>
            </div>
        `;
    } else {
        modelsCardsHtml = modelGroups.map(group => {
            return `
                <div class="bg-devo-black/50 border border-devo-gray/70 hover:border-devo-orange/40 rounded-2xl p-4 transition-all shadow-sm mb-3">
                    <!-- هيدر الموديل -->
                    <div class="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-devo-gray/60">
                        <div class="flex items-center gap-3">
                            <img src="${group.imageUrl}" alt="${escapeHtml(group.modelName)}" class="w-14 h-14 rounded-xl object-cover border border-devo-gray bg-devo-black shrink-0 shadow-sm" onerror="this.src='./src/assets/icons/devo.png'">
                            <div>
                                <div class="flex flex-wrap items-center gap-2">
                                    <h4 class="text-white font-black text-sm sm:text-base">${escapeHtml(group.modelName)}</h4>
                                    ${group.code ? `<span class="bg-devo-gray/70 border border-devo-gray text-devo-text px-2 py-0.5 rounded-lg text-xs font-mono font-bold">${group.code}</span>` : ''}
                                    <span class="bg-devo-gray/70 border border-devo-gray text-devo-muted px-2 py-0.5 rounded-lg text-xs font-medium">${group.sizesCount} قطع</span>
                                    <span class="bg-sky-500/15 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded-lg text-xs font-bold font-mono">ق: ${(group.piecePrice || 0).toLocaleString()} ج</span>
                                    <span class="bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono">سيريه: ${(group.seriesPrice || 0).toLocaleString()} ج</span>
                                </div>
                                <div class="text-xs text-devo-muted flex items-center gap-1.5 mt-1.5 font-medium">
                                    <i class="ph ph-palette text-devo-orange"></i>
                                    <span>الألوان المسجلة لهذا الموديل (${group.items.length}):</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- صفوف ألوان الموديل -->
                    <div class="space-y-2">
                        ${group.items.map(item => `
                            <div class="flex items-center justify-between p-2.5 sm:p-3 bg-devo-dark/60 border border-devo-gray/50 hover:border-devo-gray rounded-xl transition-colors">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20 shadow-sm" style="background-color: ${item.colorCode || '#38BDF8'}"></span>
                                    <span class="text-white text-xs sm:text-sm font-bold">${escapeHtml(item.colorName)}</span>
                                </div>
                                <div class="flex items-center gap-3 sm:gap-5">
                                    <span class="bg-devo-black/80 border border-devo-gray/60 px-3 py-1.5 rounded-xl text-devo-text text-xs font-bold shadow-inner">
                                        ${item.quantity} سيريه <span class="text-[11px] text-devo-muted font-normal">(${item.pieces} قطعة)</span>
                                    </span>
                                    <div class="text-left min-w-[90px] sm:min-w-[110px]">
                                        <span class="text-devo-orange font-black font-mono text-sm block">${(item.itemTotal || 0).toLocaleString()} ج.م</span>
                                        <span class="text-[10px] text-devo-muted font-mono block">سعر السيريه: ${(item.price_per_series || 0).toLocaleString()} ج</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- فوتر إجمالي الموديل -->
                    <div class="flex items-center justify-between pt-2.5 mt-2.5 border-t border-devo-gray/50 text-xs">
                        <span class="text-devo-muted font-bold">إجمالي الموديل: <span class="text-white font-bold">${group.totalSeries} سيريه</span> (${group.totalPieces} قطعة)</span>
                        <span class="text-devo-orange font-black font-mono text-sm sm:text-base">${group.totalPrice.toLocaleString()} ج.م</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    if (contentEl) {
        const factoryPhone = await getFactoryWhatsAppContact();
        const msg = `السلام عليكم، أود الاستفسار عن طلبي رقم #${order.order_code} المسجل باسم ${order.customer_name}.`;
        const waUrl = factoryPhone ? formatWhatsAppUrl(factoryPhone, msg) : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

        contentEl.innerHTML = `
            <!-- بيانات العميل -->
            <div class="bg-devo-black/60 p-3.5 sm:p-4 rounded-xl border border-devo-gray/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-3">
                <div><span class="text-devo-muted block mb-0.5 font-bold">اسم العميل:</span> <strong class="text-white text-sm">${order.customer_name}</strong></div>
                <div><span class="text-devo-muted block mb-0.5 font-bold">الهاتف:</span> <strong class="text-white font-mono text-sm" dir="ltr">${order.customer_phone_1}</strong></div>
                <div><span class="text-devo-muted block mb-0.5 font-bold">العنوان:</span> <strong class="text-white">${order.customer_address || '-'}</strong></div>
            </div>

            <!-- ملخص الإحصائيات (الأصناف - السريات - القطع) -->
            <div class="grid grid-cols-3 gap-2 bg-devo-black/50 border border-devo-gray/60 p-2.5 sm:p-3 rounded-xl text-center text-xs mb-3 shadow-sm">
                <div class="border-l border-devo-gray/50 pl-2">
                    <span class="text-devo-muted text-[11px] block mb-0.5 font-bold">إجمالي الأصناف:</span>
                    <strong class="text-white font-black text-xs sm:text-sm">${modelGroups.length} موديل</strong>
                </div>
                <div class="border-l border-devo-gray/50 px-2">
                    <span class="text-devo-muted text-[11px] block mb-0.5 font-bold">إجمالي السريات:</span>
                    <strong class="text-devo-orange font-black text-xs sm:text-sm">${totalSeries} سيريه</strong>
                </div>
                <div class="pr-2">
                    <span class="text-devo-muted text-[11px] block mb-0.5 font-bold">إجمالي القطع:</span>
                    <strong class="text-emerald-400 font-black text-xs sm:text-sm">${totalPieces} قطعة</strong>
                </div>
            </div>

            ${order.notes ? `<div class="p-3 bg-devo-black/40 rounded-xl text-xs text-devo-muted mb-3 border border-devo-gray/40"><strong>ملاحظات:</strong> <span class="text-white">${order.notes}</span></div>` : ''}
            
            <!-- كروت الموديلات المجمعة -->
            <div class="space-y-3">
                <h6 class="text-xs sm:text-sm font-bold text-white mb-2 flex items-center justify-between">
                    <span class="flex items-center gap-1.5"><i class="ph ph-stack text-devo-orange"></i> قائمة الموديلات المطلوبة (${modelGroups.length}):</span>
                </h6>
                <div class="space-y-3">
                    ${modelsCardsHtml}
                </div>
            </div>

            <!-- الشريط السفلي -->
            <div class="mt-5 pt-4 border-t border-devo-gray/60 flex flex-wrap justify-between items-center gap-3 text-sm">
                <a href="${waUrl}" target="_blank" class="px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition-all">
                    <i class="ph ph-whatsapp-logo text-base"></i>
                    <span>مراسلة المصنع عبر واتساب</span>
                </a>
                <div class="flex items-center gap-2">
                    <span class="text-devo-muted font-bold text-xs sm:text-sm">إجمالي الطلب:</span>
                    <span class="text-devo-orange font-black text-base sm:text-xl">${Number(order.total_amount).toLocaleString()} ج.م</span>
                </div>
            </div>
        `;
    }

    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
}

function closeVisitorOrderDetailsModal() {
    const modal = document.getElementById('visitor-order-details-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

// ✏️ تعديل طلب الزائر المعلق (تحميل الأصناف بالسلة لتعديلها)
async function editVisitorOrder(orderId) {
    let order = visitorTrackedOrders.find(o => o.id === orderId);
    
    if (!order) {
        // جلب الطلب مباشرة من قاعدة البيانات إذا لم يكن موجوداً بالكاش (مثلما يحدث مع العامل المسند إليه الطلب)
        try {
            const { data, error } = await supabase
                .from('visitor_orders')
                .select('*')
                .eq('id', orderId)
                .maybeSingle();
            if (!error && data) {
                order = data;
            }
        } catch (e) {
            console.error('Error fetching visitor order to edit:', e);
        }
    }

    if (!order) return showToast('الطلب غير موجود للتعديل', 'error');

    if (order.status !== 'pending' && order.status !== 'assigned') {
        return showToast('لا يمكن تعديل هذا الطلب لأنه لم يعد في حالة الانتظار.', 'warning');
    }

    editingVisitorOrderId = order.id;

    // تحويل الأصناف للسلة
    cartItems = (order.items || []).map(item => ({
        modelId: item.model_id,
        colorId: item.color_id,
        modelName: item.model_name,
        colorName: item.color_name,
        price: item.price,
        qty: item.qty,
        image: item.image,
        sizesCount: item.sizes_count || 1,
        factoryCode: item.factory_code || ''
    }));

    saveCart();
    loadAndRenderCart();

    // ملء بيانات التواصل
    if (document.getElementById('c-name')) document.getElementById('c-name').value = order.customer_name || '';
    if (document.getElementById('c-phone1')) document.getElementById('c-phone1').value = order.customer_phone_1 || '';
    if (document.getElementById('c-phone2')) document.getElementById('c-phone2').value = order.customer_phone_2 || '';
    if (document.getElementById('c-address')) document.getElementById('c-address').value = order.customer_address || '';
    if (document.getElementById('c-notes')) document.getElementById('c-notes').value = order.notes || '';

    // تفعيل بنر التعديل
    const editBanner = document.getElementById('cart-edit-mode-banner');
    if (editBanner) {
        editBanner.classList.remove('hidden');
        editBanner.innerHTML = `
            <div class="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 text-white p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs sm:text-sm font-bold shadow-lg ring-2 ring-amber-500/40 my-3">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                        <i class="ph-bold ph-pencil-line text-xl text-white"></i>
                    </div>
                    <span>تعديل طلب الزائر المعلق رقم: <strong class="font-mono text-amber-100 bg-black/30 px-2.5 py-1 rounded-lg text-sm sm:text-base border border-white/20 font-extrabold">#${order.order_code}</strong></span>
                </div>
                <button type="button" onclick="cancelVisitorOrderEdit()" class="bg-white text-orange-700 px-3 py-1.5 rounded-xl text-xs font-black shadow hover:bg-gray-100 transition-colors">إلغاء التعديل</button>
            </div>
        `;
    }

    const btnSaveOrderText = document.getElementById('btn-save-order-text');
    if (btnSaveOrderText) btnSaveOrderText.textContent = 'حفظ تعديلات الطلب';

    setupCartUserInterface();
    switchCartMainTab('current');
    if (window.switchSiteView) window.switchSiteView('view-cart');
    showToast(`تم تحميل أصناف الطلب (#${order.order_code}) بالسلة للتعديل`, 'info');
}

window.cancelVisitorOrderEdit = () => {
    editingVisitorOrderId = null;
    cartItems = [];
    saveCart();
    loadAndRenderCart();
    setupCartUserInterface();
    const editBanner = document.getElementById('cart-edit-mode-banner');
    if (editBanner) editBanner.classList.add('hidden');
    const btnSaveOrderText = document.getElementById('btn-save-order-text');
    if (btnSaveOrderText) btnSaveOrderText.textContent = 'إرسال الطلب';
    showToast('تم إلغاء تعديل الطلب وإفراغ السلة', 'info');
};

function printVisitorOrderById(orderId) {
    const order = visitorTrackedOrders.find(o => o.id === orderId) || lastVisitorOrderForPrinting;
    if (!order) return showToast('الطلب غير موجود', 'error');

    const printable = {
        id: order.id,
        tenant_id: order.tenant_id,
        invoice_number: order.order_code,
        customer_name: order.customer_name,
        phone_1: order.customer_phone_1,
        address: order.customer_address,
        notes: order.notes,
        created_at: order.created_at,
        total_price: Math.round(Number(order.total_amount) || 0),
        deposit: 0,
        remaining: Math.round(Number(order.total_amount) || 0),
        order_items: (order.items || []).map(i => {
            const sizesCount = Number(i.sizes_count) || 1;
            const qty = Number(i.qty) || 0;
            const piecePrice = Math.round(Number(i.piece_price != null ? i.piece_price : (i.price || 0)));
            const pieces = Number(i.pieces || i.total_pieces) || (qty * sizesCount);
            const totalPrice = Math.round(Number(i.total_price || i.total) || (pieces * piecePrice));
            return {
                model_id: i.model_id || i.modelId || `${i.model_name || 'm'}_${i.factory_code || ''}`,
                quantity: qty,
                sizes_count: sizesCount,
                pieces: pieces,
                price: piecePrice,
                piece_price: piecePrice,
                price_per_series: piecePrice * sizesCount,
                total_price: totalPrice,
                models: { 
                    id: i.model_id || i.modelId, 
                    name: i.model_name, 
                    factory_code: i.factory_code, 
                    system_code: i.factory_code,
                    model_sizes: { length: sizesCount }
                },
                colors: { name: i.color_name }
            };
        })
    };

    printOrderCustomerInvoice(printable);
}

// 🌐 تصدير الدوال للنافذة العامة لاستدعائها من عناصر الـ DOM وبطاقات العمال والزوار
window.openVisitorOrderDetails = openVisitorOrderDetails;
window.closeVisitorOrderDetailsModal = closeVisitorOrderDetailsModal;
window.editVisitorOrder = editVisitorOrder;
window.printVisitorOrderById = printVisitorOrderById;