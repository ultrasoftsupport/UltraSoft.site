import { supabase } from '../../config/supabase.js';
import { getCurrentSession } from '../../services/auth.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog, showSubscriptionUpgradeModal } from '../../components/modal.js'; 
import { printOrderCustomerInvoice, fetchInvoicePrintSettings } from '../../utils/print.js?v=2';
import { getCurrentTenantId, getTenantOrderQuotaDetails } from '../../services/tenant_service.js';
import { logAuditEvent } from '../../services/audit_service.js';

function getTenantCartKey() {
    const tenantId = getCurrentTenantId() || 'default';
    return `devo_cart_${tenantId}`;
}

function getTenantEditOrderKey() {
    const tenantId = getCurrentTenantId() || 'default';
    return `devo_edit_order_data_${tenantId}`;
}

function getTenantEditOrderCacheKey() {
    const tenantId = getCurrentTenantId() || 'default';
    return `devo_edit_order_data_cache_${tenantId}`;
}

let currentUser = null;
let cartItems = [];
let itemToDeleteIndex = null;
let editingOrderId = null; 
let cartRealtimeChannel = null;
let lastOrderForPrinting = null;

// ذاكرة تخزين مؤقت لتسريع الرسم الفوري ومنع تكرار الاتصال بالسيرفر
let cachedDbInventory = [];
let cachedDbModels = [];
let cachedOriginalOrderData = null;
let currentCartFilter = 'all'; // 'all', 'ok', 'error'

export function initCart() {
    const { session } = getCurrentSession();
    currentUser = session ? session.user : null;
    
    if (currentUser) {
        document.getElementById('checkout-form')?.addEventListener('submit', handleCheckout);
        window.refreshCartView = loadAndRenderCart;
        window.showInvoiceModal = showInvoiceModal;
        window.setCartFilter = setCartFilter;
        window.filterCartItems = filterCartItems;
        
        document.getElementById('c-deposit')?.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            document.getElementById('c-receiver').required = val > 0;
        });

        loadAndRenderCart();
        setupCartRealtime(); 
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
        document.getElementById('checkout-form')?.reset();
    }

    updateCartHeaderEditState(editingOrderId, originalOrderData?.invoice_number);

    const container = document.getElementById('cart-items-container');
    const checkoutBtn = document.getElementById('btn-checkout');
    
    const sumPriceEl = document.getElementById('sum-price');
    const sumModelsEl = document.getElementById('sum-models');
    const sumSeriesEl = document.getElementById('sum-series');

    if (cartItems.length === 0) {
        if (container) container.innerHTML = `<div class="text-center py-10 text-devo-muted"><i class="ph ph-shopping-cart-simple text-5xl mb-3 opacity-50"></i><p>السلة فارغة حالياً</p></div>`;
        if (sumPriceEl) sumPriceEl.textContent = '0'; 
        if (sumModelsEl) sumModelsEl.textContent = '0';
        if (sumSeriesEl) sumSeriesEl.textContent = '0';

        if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.innerHTML = editingOrderId ? `حفظ التعديلات` : `تأكيد وإصدار الفاتورة`; checkoutBtn.classList.replace('bg-devo-orange', 'bg-devo-gray'); }
        updateFloatingCart();
        return;
    }

    if (container) container.innerHTML = `<div class="text-center py-10"><i class="ph ph-spinner animate-spin text-3xl text-devo-orange"></i><p class="text-xs text-devo-muted mt-2">جاري مطابقة المخزون مع السيرفر...</p></div>`;

    const modelIds = [...new Set(cartItems.map(i => i.modelId))];

    const [{ data: dbInventory }, { data: dbModels }] = await Promise.all([
        supabase.from('model_inventory').select('model_id, color_id, available_series').in('model_id', modelIds),
        supabase.from('models').select('id, is_active').in('id', modelIds)
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
        
        const form = document.getElementById('checkout-form');
        if (form) form.reset();
        
        ['c-name', 'c-phone1', 'c-phone2', 'c-address', 'c-notes', 'c-deposit', 'c-receiver'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        updateCartHeaderEditState(null, null);
        updateFloatingCart();
        loadAndRenderCart();
        showToast(isEditMode ? 'تم إلغاء تعديل الأوردر وإعادة فتحه وإفراغ السلة بنجاح' : 'تم إفراغ السلة بنجاح', 'success');
    }
};

function renderCartItems(dbInventory, dbModels, originalOrderData) {
    const container = document.getElementById('cart-items-container');
    const checkoutBtn = document.getElementById('btn-checkout');
    
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
                        <div class="flex items-center gap-2">
                            <span class="w-3 h-3 rounded-full ${errorMsg ? 'bg-devo-error' : 'bg-devo-info'} shrink-0"></span>
                            <span class="text-white font-bold text-xs sm:text-sm"><i class="ph-fill ph-palette text-devo-info"></i> ${item.colorName}</span>
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
                                    <button type="button" onclick="updateCartItemQty(${item.originalIndex}, ${item.qty - 1})" class="px-2 text-white hover:text-devo-orange transition-colors h-full"><i class="ph ph-minus text-xs"></i></button>
                                    <input type="number" readonly value="${item.qty}" class="w-9 h-full bg-transparent text-center text-white text-xs font-bold outline-none border-x border-devo-gray">
                                    <button type="button" onclick="updateCartItemQty(${item.originalIndex}, ${item.qty + 1}, ${trueAvailable})" class="px-2 text-white hover:text-devo-orange transition-colors h-full"><i class="ph ph-plus text-xs"></i></button>
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

        html += `
            <div class="cart-item-card flex flex-col sm:flex-row gap-3 md:gap-4 p-3.5 ${cardClass} border rounded-xl relative transition-all duration-300 mb-4 shadow-sm" data-search="${modelGroup.modelName} ${modelGroup.factoryCode || ''}" data-has-errors="${modelHasErrors}">
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
        e.target.reset();
        document.getElementById('c-receiver').required = false;
        
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

    // Load dynamic factory invoice print settings
    const invSettings = await fetchInvoicePrintSettings();
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

    // Group order items by model matching the exact format of printOrderCustomerInvoice
    const groupedItems = {};
    if (oToUse.order_items && oToUse.order_items.length > 0) {
        oToUse.order_items.forEach(item => {
            const modelId = item.model_id;
            const code = item.models?.factory_code || item.models?.system_code || '';
            const colorName = item.colors?.name || '-';
            const qty = item.quantity;
            
            const classSizes = item.models?.classes?.class_sizes || [];
            const sizesCount = classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1); 
            const pieces = qty * sizesCount;
            const piecePrice = item.price_per_series / sizesCount;

            if (!groupedItems[modelId]) {
                groupedItems[modelId] = { 
                    modelName: item.models?.name, 
                    code: code, 
                    colorsList: [colorName], 
                    totalQty: qty, 
                    totalPieces: pieces, 
                    price: piecePrice, 
                    totalPrice: item.total_price 
                };
            } else {
                if (!groupedItems[modelId].colorsList.includes(colorName)) {
                    groupedItems[modelId].colorsList.push(colorName);
                }
                groupedItems[modelId].totalQty += qty;
                groupedItems[modelId].totalPieces += pieces;
                groupedItems[modelId].totalPrice += item.total_price;
            }
        });
    }

    const tbody = document.getElementById('inv-items-body');
    if (tbody) {
        tbody.innerHTML = '';
        const groupedList = Object.values(groupedItems);
        if (groupedList.length > 0) {
            groupedList.forEach((item, idx) => {
                const row = `
                    <tr class="text-xs sm:text-sm">
                        <td class="border border-gray-300 p-1 sm:p-2 text-center">${idx + 1}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 font-bold">
                            ${item.modelName} ${item.code ? `<span class="text-[10px] text-gray-500 font-mono pr-1">(${item.code})</span>` : ''}
                        </td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center text-gray-700 text-xs">${item.colorsList.join('، ')}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 font-bold text-center">${item.totalPieces}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center">${item.price}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center font-bold bg-gray-50">${item.totalPrice}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        } else if (oToUse.order_items && oToUse.order_items.length > 0) {
            oToUse.order_items.forEach((item, idx) => {
                const classSizes = item.models?.classes?.class_sizes || [];
                const sizesCount = classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1);
                const pieces = item.quantity * sizesCount;
                const piecePrice = item.price_per_series / sizesCount;
                
                const row = `
                    <tr class="text-xs sm:text-sm">
                        <td class="border border-gray-300 p-1 sm:p-2 text-center">${idx + 1}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 font-bold">${item.models?.name || 'موديل'}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center text-gray-600">${item.colors?.name || 'لون'}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 font-bold text-center">${pieces}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center">${piecePrice}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center font-bold bg-gray-50">${item.total_price}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        } else {
            // Fallback if order_items are not fetched
            items.forEach((item, idx) => {
                const cachedItem = JSON.parse(localStorage.getItem(getTenantEditOrderCacheKey()) || '[]').find(i => i.modelId === item.model_id && i.colorId === item.color_id);
                const pieces = item.pieces || item.quantity * (item.sizesCount || 1) || item.qty * (item.sizesCount || 1);
                const priceVal = item.price || item.price_per_series;
                const row = `
                    <tr class="text-xs sm:text-sm">
                        <td class="border border-gray-300 p-1 sm:p-2">${idx + 1}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 font-bold">${cachedItem?.modelName || item.model_name || 'موديل'}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-gray-600">${cachedItem?.colorName || item.color_name || 'لون'}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 font-bold text-center">${pieces}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center">${priceVal}</td>
                        <td class="border border-gray-300 p-1 sm:p-2 text-center font-bold bg-gray-50">${item.total_price || item.total}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }
    }

    const invTotal = document.getElementById('inv-total-price');
    if (invTotal) invTotal.textContent = oToUse.total_price;
    const invDeposit = document.getElementById('inv-deposit');
    if (invDeposit) invDeposit.textContent = oToUse.deposit;
    const invRem = document.getElementById('inv-remaining');
    if (invRem) invRem.textContent = oToUse.total_price - oToUse.deposit;

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