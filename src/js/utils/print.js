import { supabase } from '../config/supabase.js';
import { getCurrentTenantId } from '../services/tenant_service.js';

export async function fetchInvoicePrintSettings() {
    try {
        const currentTenantId = getCurrentTenantId();
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
            factoryName: settings['invoice_factory_name'] || 'UltraSoft Collection',
            subtitle: settings['invoice_subtitle'] || 'Phone: +20 12 12751111',
            customerTitle: settings['invoice_customer_title'] || 'فاتورة تفصيلية للعميل',
            adminTitle: settings['invoice_admin_title'] || 'فاتورة تفصيلية للإدارة',
            notes: settings['invoice_notes'] || '',
            siteUrl: settings['ultrasoft_site_url'] || 'https://ultrasoft.site'
        };
    } catch (e) {
        return {
            factoryName: 'UltraSoft Collection',
            subtitle: 'Phone: +20 12 12751111',
            customerTitle: 'فاتورة تفصيلية للعميل',
            adminTitle: 'فاتورة تفصيلية للإدارة',
            notes: '',
            siteUrl: 'https://ultrasoft.site'
        };
    }
}

export function getUltraSoftBarcodeSVG(url = 'https://ultrasoft.site') {
    return `
    <div style="margin-top: 12px; padding: 6px 12px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: space-between; direction: rtl; page-break-inside: avoid;">
        <span style="font-size: 10px; font-weight: bold; color: #000; white-space: nowrap;">جميع الحقوق محفوظة لدى شركة UltraSoft للبرمجيات ©</span>
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

export async function printOrderCustomerInvoice(o) {
    const invSettings = await fetchInvoicePrintSettings();

    const remaining = o.total_price - (o.deposit || 0);
    const printDate = new Date(o.created_at);
    const dateString = `${printDate.getFullYear()}-${String(printDate.getMonth() + 1).padStart(2, '0')}-${String(printDate.getDate()).padStart(2, '0')}`;
    const pdfFileName = `${o.customer_name}_${o.phone_1}_${dateString}`;
    const groupedItems = {};
    
    o.order_items.forEach(item => {
        const modelId = item.model_id;
        const code = item.models?.factory_code || item.models?.system_code || '';
        const colorName = item.colors?.name || '-';
        const qty = item.quantity;
        
        const classSizes = item.models?.classes?.class_sizes || [];
        const sizesCount = classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1); 
        const pieces = qty * sizesCount;
        
        const colorWithQty = colorName; 

        const piecePrice = item.price_per_series / sizesCount;

        if (!groupedItems[modelId]) {
            groupedItems[modelId] = { 
                modelName: item.models?.name, 
                code: code, 
                colorsList: [colorWithQty], 
                totalQty: qty, 
                totalPieces: pieces, 
                price: piecePrice, 
                totalPrice: item.total_price 
            };
        } else {
            if (!groupedItems[modelId].colorsList.includes(colorWithQty)) {
                groupedItems[modelId].colorsList.push(colorWithQty);
            }
            groupedItems[modelId].totalQty += qty;
            groupedItems[modelId].totalPieces += pieces;
            groupedItems[modelId].totalPrice += item.total_price;
        }
    });

    const custHtml = Object.values(groupedItems).map((item, idx) => `
        <tr>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${idx + 1}</td>
            <td style="padding: 4px; border: 1px solid #ccc; font-weight: bold;">
                ${item.modelName} ${item.code ? `<span style="font-size:10px; color:#555; font-family: monospace; margin-right: 4px;">(${item.code})</span>` : ''}
            </td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center; font-size:10px;">${item.colorsList.join('، ')}</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center; font-weight: bold;">${item.totalPieces}</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center;">${item.price}</td>
            <td style="padding: 4px; border: 1px solid #ccc; text-align: center; font-weight: bold; background: #f9f9f9 !important; -webkit-print-color-adjust: exact;">${item.totalPrice}</td>
        </tr>
    `).join('');

    const finalHtml = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>${pdfFileName}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap');
                @page { margin: 0.5cm; }
                body { font-family: 'Tajawal', sans-serif; background: white; margin: 0; color: black; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .inv-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid black; padding-bottom: 6px; margin-bottom: 10px; }
                .inv-header h1 { margin: 0; font-size: 22px; font-weight: 900; }
                .inv-header p { margin: 2px 0 0 0; font-size: 11px; font-weight: bold; color: #333; }
                .inv-title-box { text-align: left; background: #f3f4f6; padding: 4px 10px; border-radius: 4px; border: 1px solid #ccc; }
                .inv-title-box h2 { margin: 0; font-size: 13px; font-weight: bold; color: black; }
            </style>
        </head>
        <body>
        <div class="inv-header">
            <div>
                <h1>${invSettings.factoryName}</h1>
                <p dir="ltr" style="text-align: right;">${invSettings.subtitle}</p>
            </div>
            <div class="inv-title-box">
                <h2>${invSettings.customerTitle}</h2>
                <p style="margin-top: 2px; font-[monospace]; font-size: 12px; color: red;">رقم الأوردر: #${o.invoice_number}</p>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:4px; margin-bottom: 8px;">
            <div><b>التاريخ:</b> ${new Date(o.created_at).toLocaleDateString('ar-EG')}</div>
            <div><b>الكاشير:</b> ${o.system_users?.full_name || 'غير معروف'}</div>
        </div>
        <div style="background: #f8fafc; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; margin-bottom: 12px; font-size: 12px;"><b>العميل:</b> ${o.customer_name} &nbsp;|&nbsp; <b>العنوان:</b> ${o.address || '-'} &nbsp;|&nbsp; <b>هاتف:</b> <span dir="ltr">${o.phone_1}</span></div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px; border: 1px solid black;">
            <thead style="background: #e5e7eb !important; color: black !important; -webkit-print-color-adjust: exact;"><tr><th style="padding: 6px; border: 1px solid black;">م</th><th style="padding: 6px; border: 1px solid black;">الموديل</th><th style="padding: 6px; border: 1px solid black;">اللون</th><th style="padding: 6px; border: 1px solid black;">الكمية (ق)</th><th style="padding: 6px; border: 1px solid black;">السعر</th><th style="padding: 6px; border: 1px solid black;">الإجمالي</th></tr></thead>
            <tbody>${custHtml}</tbody>
        </table>
        <div style="display: flex; justify-content: flex-end; page-break-inside: avoid;">
            <div style="border: 2px solid black; width: 250px; border-radius: 4px; overflow: hidden;">
                <div style="padding: 6px; border-bottom: 1px solid #ccc; display: flex; justify-content: space-between; font-size: 12px;"><span>الإجمالي:</span> <b>${o.total_price}</b></div>
                <div style="padding: 6px; border-bottom: 1px solid #ccc; display: flex; justify-content: space-between; font-size: 12px; background: #f9f9f9 !important; -webkit-print-color-adjust: exact;"><span>المدفوع:</span> <b style="color: green;">${o.deposit}</b></div>
                <div style="padding: 8px; display: flex; justify-content: space-between; font-size: 14px; background: #e5e7eb !important; color: black !important; font-weight: bold; border-top: 1px solid #ccc; -webkit-print-color-adjust: exact;"><span>المتبقي:</span> <b>${remaining} ج.م</b></div>
            </div>
        </div>
        ${invSettings.notes ? `<div style="text-align: center; margin-top: 15px; font-size: 10px; color: #555; border-top: 1px dashed #ccc; padding-top: 6px; font-weight: bold;">${invSettings.notes}</div>` : ''}
        ${getUltraSoftBarcodeSVG(invSettings.siteUrl)}
        </body>
        </html>
    `;

    printHtmlInIframe(finalHtml);
}
