/**
 * 🛡️ أدوات تنظيف وحماية المدخلات من XSS
 * تُستخدم لتنظيف أي بيانات يتم عرضها عبر innerHTML
 */

/**
 * تحويل الأحرف الخطرة في HTML إلى HTML Entities آمنة
 * @param {string} str - النص المراد تنظيفه
 * @returns {string} - النص المنظف والآمن للعرض عبر innerHTML
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * تنظيف كائن كامل من الأحرف الخطرة (المستوى الأول فقط)
 * @param {Object} obj - الكائن المراد تنظيفه
 * @returns {Object} - كائن جديد بقيم منظفة
 */
export function escapeObjectValues(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            cleaned[key] = escapeHtml(value);
        } else {
            cleaned[key] = value;
        }
    }
    return cleaned;
}
