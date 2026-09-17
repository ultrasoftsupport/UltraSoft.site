import { supabase } from '../config/supabase.js';
import { getCurrentTenantId, getCurrentTenant } from '../services/tenant_service.js';

export async function fetchInvoicePrintSettings(targetTenantId = null) {
    try {
        const currentTenantId = targetTenantId || getCurrentTenantId();
        let tenantObj = getCurrentTenant();

        // في حال تم تمرير targetTenantId لمصنع مختلف عن المحفوظ محلياً، نجلب بيانات المصنع فوراً
        if (targetTenantId && (!tenantObj || tenantObj.id !== targetTenantId)) {
            try {
                const { data: tData } = await supabase
                    .from('tenants')
                    .select('id, name, phone, mobile, whatsapp')
                    .eq('id', targetTenantId)
                    .maybeSingle();
                if (tData) {
                    tenantObj = tData;
                }
            } catch (tErr) {
                console.warn('Error fetching tenant details for invoice:', tErr);
            }
        }

        const fallbackName = tenantObj?.name || 'UltraSoft Collection';
        const phoneVal = tenantObj?.phone || tenantObj?.phone_1 || tenantObj?.mobile;
        const fallbackSub = phoneVal ? `هاتف: ${phoneVal}` : 'Phone: +20 12 12751111';

        // 1. محاولة القراءة من جدول tenant_invoice_settings المنظم أولاً
        if (currentTenantId) {
            const { data: invRow } = await supabase
                .from('tenant_invoice_settings')
                .select('*')
                .eq('tenant_id', currentTenantId)
                .maybeSingle();

            if (invRow && (invRow.factory_name || invRow.subtitle)) {
                return {
                    factoryName: invRow.factory_name || fallbackName,
                    subtitle: invRow.subtitle || fallbackSub,
                    customerTitle: invRow.customer_title || 'فاتورة تفصيلية للعميل',
                    adminTitle: invRow.admin_title || 'فاتورة تفصيلية للإدارة',
                    notes: invRow.notes || '',
                    siteUrl: 'https://ultrasoft.site'
                };
            }
        }

        // 2. كاش احتياطي من home_settings
        let query = supabase.from('home_settings').select('setting_key, setting_value');
        if (currentTenantId) query = query.eq('tenant_id', currentTenantId);

        const { data } = await query;
        const settings = {};
        if (data) {
            data.forEach(item => {
                settings[item.setting_key] = item.setting_value;
            });
        }

        return {
            factoryName: settings['invoice_factory_name'] || fallbackName,
            subtitle: settings['invoice_subtitle'] || fallbackSub,
            customerTitle: settings['invoice_customer_title'] || 'فاتورة تفصيلية للعميل',
            adminTitle: settings['invoice_admin_title'] || 'فاتورة تفصيلية للإدارة',
            notes: settings['invoice_notes'] || '',
            siteUrl: settings['ultrasoft_site_url'] || 'https://ultrasoft.site'
        };
    } catch (e) {
        const tenantObj = getCurrentTenant();
        return {
            factoryName: tenantObj?.name || 'UltraSoft Collection',
            subtitle: tenantObj?.phone_1 ? `هاتف: ${tenantObj.phone_1}` : 'Phone: +20 12 12751111',
            customerTitle: 'فاتورة تفصيلية للعميل',
            adminTitle: 'فاتورة تفصيلية للإدارة',
            notes: '',
            siteUrl: 'https://ultrasoft.site'
        };
    }
}

export function getUltraSoftBarcodeSVG(url = 'https://ultrasoft.site') {
    return `
    <div style="margin-top: 10px; padding: 5px 12px; background-color: #f8fafc; border-radius: 4px; border: 1.5px solid #000000; display: flex; align-items: center; justify-content: space-between; direction: rtl; page-break-inside: avoid; -webkit-print-color-adjust: exact;">
        <span style="font-size: 10.5px; font-weight: 900; color: #000000; white-space: nowrap;">جميع الحقوق محفوظة لدى شركة UltraSoft للبرمجيات ©</span>
        <div style="display: flex; align-items: center; justify-content: center; height: 24px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="120" height="24" viewBox="0 0 130 24" style="max-height: 24px; width: auto;">
                <rect width="100%" height="100%" fill="#ffffff"/>
                <g fill="#000000">
                    <rect x="2" width="2" height="22"/>
                    <rect x="5" width="1" height="22"/>
                    <rect x="8" width="3" height="22"/>
                    <rect x="13" width="1" height="22"/>
                    <rect x="16" width="2" height="22"/>
                    <rect x="20" width="4" height="22"/>
                    <rect x="26" width="1" height="22"/>
                    <rect x="29" width="2" height="22"/>
                    <rect x="33" width="3" height="22"/>
                    <rect x="38" width="1" height="22"/>
                    <rect x="41" width="2" height="22"/>
                    <rect x="45" width="1" height="22"/>
                    <rect x="48" width="3" height="22"/>
                    <rect x="53" width="2" height="22"/>
                    <rect x="57" width="1" height="22"/>
                    <rect x="60" width="4" height="22"/>
                    <rect x="66" width="2" height="22"/>
                    <rect x="70" width="1" height="22"/>
                    <rect x="73" width="3" height="22"/>
                    <rect x="78" width="2" height="22"/>
                    <rect x="82" width="1" height="22"/>
                    <rect x="85" width="3" height="22"/>
                    <rect x="90" width="1" height="22"/>
                    <rect x="93" width="2" height="22"/>
                    <rect x="97" width="4" height="22"/>
                    <rect x="103" width="1" height="22"/>
                    <rect x="106" width="2" height="22"/>
                    <rect x="110" width="3" height="22"/>
                    <rect x="115" width="1" height="22"/>
                    <rect x="118" width="2" height="22"/>
                    <rect x="122" width="1" height="22"/>
                    <rect x="125" width="3" height="22"/>
                </g>
            </svg>
        </div>
    </div>
    `;
}

export function printHtmlInIframe(htmlContent) {
    let iframe = document.getElementById('print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
    }
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 500);
}

export function generateOrderInvoiceHtml(o, options = {}) {
    const isAdmin = !!options.isAdmin;
    const invSettings = options.invSettings || {
        factoryName: 'UltraSoft Collection',
        subtitle: 'Phone: +20 12 12751111',
        customerTitle: 'فاتورة تفصيلية للعميل',
        adminTitle: 'فاتورة تفصيلية للإدارة',
        notes: '',
        siteUrl: 'https://ultrasoft.site'
    };

    const invoiceTitle = isAdmin ? (invSettings.adminTitle || 'فاتورة تفصيلية للإدارة') : (invSettings.customerTitle || 'فاتورة تفصيلية للعميل');
    const remaining = Math.round((Number(o.total_price) || 0) - (Number(o.deposit) || 0));
    const printDate = new Date(o.created_at || Date.now());
    const dateString = `${printDate.getFullYear()}-${String(printDate.getMonth() + 1).padStart(2, '0')}-${String(printDate.getDate()).padStart(2, '0')}`;
    const pdfFileName = `${o.customer_name || 'فاتورة'}_${o.phone_1 || ''}_${dateString}`;
    const groupedItems = {};
    const items = o.order_items || o.items || [];
    
    items.forEach((item, idx) => {
        const modelId = item.model_id || item.models?.id || (item.models?.name ? `${item.models.name}___${item.models.factory_code || ''}` : `model_${idx}`);
        const code = item.models?.factory_code || item.models?.system_code || item.factory_code || '';
        const colorName = item.colors?.name || item.color_name || '-';
        const qty = Number(item.quantity) || Number(item.qty) || 0;
        
        const classSizes = item.models?.classes?.class_sizes || [];
        const sizesCount = Number(item.sizes_count) || (classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1)) || 1; 
        const pieces = Number(item.pieces) || Number(item.total_pieces) || (qty * sizesCount);
        
        const colorDetailed = qty > 0 ? `${colorName} ${qty}` : colorName; 
        const colorSimple = colorName;

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
                colorsDetailed: [colorDetailed], 
                colorsSimple: [colorSimple], 
                totalQty: qty, 
                totalPieces: pieces, 
                price: piecePrice, 
                totalPrice: itemTotalPrice 
            };
        } else {
            if (!groupedItems[modelId].colorsDetailed.includes(colorDetailed)) {
                groupedItems[modelId].colorsDetailed.push(colorDetailed);
            }
            if (!groupedItems[modelId].colorsSimple.includes(colorSimple)) {
                groupedItems[modelId].colorsSimple.push(colorSimple);
            }
            groupedItems[modelId].totalQty += qty;
            groupedItems[modelId].totalPieces += pieces;
            groupedItems[modelId].totalPrice += itemTotalPrice;
        }
    });

    const totalModels = Object.keys(groupedItems).length;
    const totalSeries = Object.values(groupedItems).reduce((sum, item) => sum + (Number(item.totalQty) || 0), 0);
    const totalPieces = Object.values(groupedItems).reduce((sum, item) => sum + (Number(item.totalPieces) || 0), 0);

    const rowsHtml = Object.values(groupedItems).map((item, idx) => {
        const colorsDisplay = isAdmin 
            ? item.colorsDetailed.join(' / ') 
            : item.colorsSimple.join('، ');

        return `
        <tr>
            <td style="padding: 5px 3px; border: 1.5px solid #000; text-align: center; font-weight: 900; width: 32px; color: #000;">${idx + 1}</td>
            <td style="padding: 5px 6px; border: 1.5px solid #000; font-weight: 900; text-align: right; color: #000; font-size: 12px;">
                ${item.modelName} ${item.code ? `<span style="font-size: 10px; color: #000; font-weight: 900; font-family: monospace; margin-right: 4px;">(${item.code})</span>` : ''}
            </td>
            <td style="padding: 5px 6px; border: 1.5px solid #000; text-align: center; font-size: 11.5px; font-weight: 800; color: #000;">${colorsDisplay}</td>
            <td style="padding: 5px 4px; border: 1.5px solid #000; text-align: center; white-space: nowrap; width: 115px;">
                <b style="font-size: 13.5px; color: #000; font-weight: 900;">${item.totalQty}</b>
                <span style="font-size: 11.5px; color: #000; font-weight: 800; margin-right: 3px;">(${item.totalPieces} ق)</span>
            </td>
            <td style="padding: 5px 4px; border: 1.5px solid #000; text-align: center; font-weight: 900; font-size: 12.5px; color: #000; width: 68px;">${Math.round(item.price)}</td>
            <td style="padding: 5px 5px; border: 1.5px solid #000; text-align: center; font-weight: 900; font-size: 13px; color: #000; background: #f1f5f9 !important; -webkit-print-color-adjust: exact; width: 85px;">${Math.round(item.totalPrice)}</td>
        </tr>
        `;
    }).join('');

    const cashierName = o.system_users?.full_name || o.worker_name || 'غير معروف';

    return `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>${pdfFileName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
                * { 
                    box-sizing: border-box; 
                    -webkit-print-color-adjust: exact !important; 
                    print-color-adjust: exact !important; 
                }
                @page { 
                    size: A4 portrait; 
                    margin: 8mm 8mm 6mm 8mm; 
                }
                html, body { 
                    font-family: 'Tajawal', 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif; 
                    background: #ffffff; 
                    margin: 0; 
                    padding: 0; 
                    color: #000000; 
                    -webkit-print-color-adjust: exact !important; 
                    print-color-adjust: exact !important; 
                    font-size: 11.5px; 
                    line-height: 1.3;
                    text-rendering: optimizeLegibility;
                    -webkit-font-smoothing: antialiased;
                }
                .inv-wrapper {
                    width: 100%;
                    max-width: 100%;
                    margin: 0 auto;
                    padding: 0 2px;
                    box-sizing: border-box;
                }
                .inv-header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: flex-start; 
                    border-bottom: 2.5px solid #000000; 
                    padding-bottom: 5px; 
                    margin-bottom: 6px; 
                }
                .inv-header h1 { 
                    margin: 0; 
                    font-size: 20px; 
                    font-weight: 900; 
                    color: #000000; 
                    line-height: 1.15; 
                }
                .inv-header p { 
                    margin: 2px 0 0 0; 
                    font-size: 11px; 
                    font-weight: 800; 
                    color: #000000; 
                }
                .inv-title-box { 
                    text-align: left; 
                    background: #f1f5f9 !important; 
                    padding: 4px 10px; 
                    border-radius: 4px; 
                    border: 2px solid #000000; 
                    -webkit-print-color-adjust: exact;
                }
                .inv-title-box h2 { 
                    margin: 0; 
                    font-size: 13px; 
                    font-weight: 900; 
                    color: #000000; 
                }
                .inv-meta-row { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    padding: 3px 6px; 
                    margin-bottom: 6px; 
                    font-size: 11.5px; 
                    font-weight: 800;
                    color: #000000; 
                    border: 1.5px solid #000000;
                    background: #ffffff;
                    border-radius: 4px;
                }
                .inv-cust-box { 
                    background: #f8fafc !important; 
                    padding: 6px 10px; 
                    border: 2px solid #000000; 
                    border-radius: 4px; 
                    margin-bottom: 7px; 
                    font-size: 11.5px; 
                    color: #000000;
                    -webkit-print-color-adjust: exact;
                }
                .inv-cust-row { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    flex-wrap: wrap; 
                    gap: 8px; 
                }
                .inv-notes-row { 
                    margin-top: 5px; 
                    padding-top: 4px; 
                    border-top: 1.5px dashed #000000; 
                    color: #000000; 
                    font-size: 11px; 
                    font-weight: 800;
                    word-break: break-word; 
                }
                .inv-table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    font-size: 11.5px; 
                    margin-bottom: 7px; 
                    border: 2px solid #000000; 
                    box-sizing: border-box;
                }
                .inv-table th { 
                    padding: 6px 4px; 
                    border: 1.5px solid #000000; 
                    background: #e2e8f0 !important; 
                    color: #000000 !important; 
                    font-weight: 900; 
                    font-size: 12px;
                    -webkit-print-color-adjust: exact; 
                }
                .inv-table td { 
                    border: 1.5px solid #000000; 
                    padding: 5px 6px;
                    color: #000000;
                    vertical-align: middle; 
                }
                .inv-table tr { 
                    page-break-inside: avoid; 
                }
            </style>
        </head>
        <body>
        <div class="inv-wrapper">
            <div class="inv-header">
                <div>
                    <h1>${invSettings.factoryName}</h1>
                    <p dir="ltr" style="text-align: right;">${invSettings.subtitle}</p>
                </div>
                <div class="inv-title-box">
                    <h2>${invoiceTitle}</h2>
                    <p style="margin-top: 2px; font-family: monospace; font-size: 12px; font-weight: 900; color: #b91c1c;">رقم الأوردر: #${o.invoice_number}</p>
                </div>
            </div>

            <div class="inv-meta-row">
                <div><b>السيلز:</b> <span style="color: #000; font-weight: 900;">${cashierName}</span></div>
                <div><b>التاريخ:</b> <span style="color: #000; font-weight: 900;">${printDate.toLocaleDateString('ar-EG')}</span></div>
            </div>
            
            <div class="inv-cust-box">
                <div class="inv-cust-row">
                    <div><b>العميل:</b> <span style="font-weight: 900; font-size: 12.5px; color: #000;">${o.customer_name || '-'}</span></div>
                    <div><b>العنوان:</b> <span style="font-weight: 800; color: #000;">${o.address || '-'}</span></div>
                    <div><b>هاتف:</b> <span dir="ltr" style="font-weight: 900; font-family: monospace; color: #000;">${o.phone_1 || '-'}${o.phone_2 ? ' / ' + o.phone_2 : ''}</span></div>
                </div>
                ${o.notes ? `
                <div class="inv-notes-row">
                    <b>ملاحظات:</b> <span>${o.notes}</span>
                </div>` : ''}
            </div>

            <table class="inv-table">
                <thead>
                    <tr>
                        <th style="width: 32px; text-align: center;">${isAdmin ? '#' : 'م'}</th>
                        <th style="text-align: right;">الموديل</th>
                        <th style="text-align: center;">${isAdmin ? 'تفصيل الألوان' : 'اللون'}</th>
                        <th style="width: 115px; text-align: center; white-space: nowrap;">الكمية (سيريه / ق)</th>
                        <th style="width: 68px; text-align: center;">السعر</th>
                        <th style="width: 85px; text-align: center;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>

            <!-- مربع الإجماليات المنظم والمتوازن مع مراعاة المساحات -->
            <div style="display: flex; justify-content: space-between; align-items: stretch; margin-top: 7px; margin-bottom: 7px; gap: 8px; page-break-inside: avoid;">
                <!-- ملخص الأصناف والكميات -->
                <div style="flex: 1; border: 2px solid #000000; border-radius: 4px; overflow: hidden; background: #ffffff;">
                    <div style="background: #e2e8f0 !important; padding: 5px 10px; font-size: 11.5px; font-weight: 900; border-bottom: 1.5px solid #000000; color: #000000; display: flex; justify-content: space-between; align-items: center; -webkit-print-color-adjust: exact;">
                        <span>ملخص الأصناف والكميات ${isAdmin ? '(إداري)' : ''}</span>
                        <span style="font-size: 10px; color: #000000; font-weight: 800;">UltraSoft ERP</span>
                    </div>
                    <div style="display: flex; justify-content: space-around; align-items: center; padding: 7px 4px; height: calc(100% - 28px); box-sizing: border-box;">
                        <div style="text-align: center; flex: 1; border-left: 1.5px solid #000000; padding: 0 4px;">
                            <div style="font-size: 11px; color: #000000; font-weight: 900; margin-bottom: 2px;">إجمالي الموديلات</div>
                            <div style="font-size: 15px; font-weight: 900; color: #000000;">${totalModels} <span style="font-size: 11px; font-weight: 800; color: #000000;">موديل</span></div>
                        </div>
                        <div style="text-align: center; flex: 1; border-left: 1.5px solid #000000; padding: 0 4px;">
                            <div style="font-size: 11px; color: #000000; font-weight: 900; margin-bottom: 2px;">إجمالي السريات</div>
                            <div style="font-size: 15px; font-weight: 900; color: #c2410c;">${totalSeries} <span style="font-size: 11px; font-weight: 800; color: #000000;">سيريه</span></div>
                        </div>
                        <div style="text-align: center; flex: 1; padding: 0 4px;">
                            <div style="font-size: 11px; color: #000000; font-weight: 900; margin-bottom: 2px;">إجمالي القطع</div>
                            <div style="font-size: 15px; font-weight: 900; color: #0284c7;">${totalPieces} <span style="font-size: 11px; font-weight: 800; color: #000000;">قطعة</span></div>
                        </div>
                    </div>
                </div>

                <!-- ملخص الحساب المالي -->
                <div style="width: 260px; border: 2px solid #000000; border-radius: 4px; overflow: hidden; background: #ffffff;">
                    <div style="padding: 5px 10px; border-bottom: 1.5px solid #000000; display: flex; justify-content: space-between; font-size: 12px; background: #ffffff;">
                        <span style="font-weight: 900; color: #000000;">الإجمالي:</span>
                        <b style="font-size: 13.5px; font-weight: 900; color: #000000;">${Math.round(Number(o.total_price) || 0)} ج.م</b>
                    </div>
                    <div style="padding: 5px 10px; border-bottom: 1.5px solid #000000; display: flex; justify-content: space-between; font-size: 12px; background: #f8fafc !important; -webkit-print-color-adjust: exact;">
                        <span style="font-weight: 900; color: #000000;">المدفوع:</span>
                        <b style="font-size: 13.5px; font-weight: 900; color: #15803d;">${Math.round(Number(o.deposit) || 0)} ج.م</b>
                    </div>
                    <div style="padding: 5px 10px; display: flex; justify-content: space-between; font-size: 13.5px; background: #f1f5f9 !important; color: #000000 !important; font-weight: 900; border-top: 2px solid #000000; -webkit-print-color-adjust: exact;">
                        <span>المتبقي:</span>
                        <b style="color: #b91c1c; font-size: 15px; font-weight: 900;">${remaining} ج.م</b>
                    </div>
                </div>
            </div>

            ${invSettings.notes ? `<div style="text-align: center; margin-top: 6px; font-size: 10px; color: #000000; border-top: 1.5px dashed #000000; padding-top: 4px; font-weight: 800;">${invSettings.notes}</div>` : ''}
            ${getUltraSoftBarcodeSVG(invSettings.siteUrl)}
        </div>
        </body>
        </html>
    `;
}

export async function printOrderCustomerInvoice(o) {
    const invSettings = await fetchInvoicePrintSettings(o?.tenant_id);
    const finalHtml = generateOrderInvoiceHtml(o, { isAdmin: false, invSettings });
    printHtmlInIframe(finalHtml);
}

export async function printOrderAdminInvoice(o) {
    const invSettings = await fetchInvoicePrintSettings(o?.tenant_id);
    const finalHtml = generateOrderInvoiceHtml(o, { isAdmin: true, invSettings });
    printHtmlInIframe(finalHtml);
}
