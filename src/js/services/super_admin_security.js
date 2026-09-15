import { supabase } from '../config/supabase.js';

/**
 * 🔒 Super Admin Security Service
 * Handles Master PIN Verification, Lockout Guard, Audit Logs & Accounts Supervision
 */

// Cached client IP to avoid repeated API calls
let cachedClientIp = null;

// Helper to get client IP and User Agent
async function getClientMeta() {
    if (!cachedClientIp) {
        try {
            const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            cachedClientIp = data.ip || 'unknown';
        } catch (e) {
            cachedClientIp = 'unknown';
        }
    }
    return {
        ip: cachedClientIp,
        userAgent: navigator?.userAgent || 'Unknown Browser'
    };
}

/**
 * 🔑 Verify Master Security PIN for Super Admin
 */
export async function verifySuperAdminPin(userId, pinCode) {
    try {
        const meta = await getClientMeta();
        const { data, error } = await supabase.rpc('verify_super_admin_security_pin', {
            p_user_id: userId,
            p_pin: pinCode,
            p_ip: meta.ip,
            p_user_agent: meta.userAgent
        });

        if (error) {
            console.error('Verify PIN RPC error:', error);
            // Fallback checking directly if RPC fails
            return { success: false, message: error.message || 'خطأ في عملية التحقق من كود الـ PIN' };
        }

        if (data?.success) {
            // Set transient verified session token in localStorage
            const verifyToken = {
                userId,
                verifiedAt: new Date().getTime(),
                expiresAt: new Date().getTime() + (15 * 60 * 1000) // 15 minutes validity
            };
            localStorage.setItem(`super_admin_pin_verified_${userId}`, JSON.stringify(verifyToken));
        }

        return data;
    } catch (err) {
        console.error('Verify PIN exception:', err);
        return { success: false, message: err.message || 'حدث خطأ في النظام أثناء التحقق' };
    }
}

/**
 * 🛡️ Check if the active Super Admin session has completed valid PIN verification
 */
export function isSuperAdminPinVerified(userId) {
    if (!userId) return false;
    const tokenStr = localStorage.getItem(`super_admin_pin_verified_${userId}`);
    if (!tokenStr) return false;
    try {
        const token = JSON.parse(tokenStr);
        if (token.userId !== userId) return false;
        const now = new Date().getTime();
        if (now > token.expiresAt) {
            localStorage.removeItem(`super_admin_pin_verified_${userId}`);
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 🚪 Revoke Super Admin Security Verification
 */
export function revokeSuperAdminPinVerification(userId) {
    if (userId) {
        localStorage.removeItem(`super_admin_pin_verified_${userId}`);
    }
}

/**
 * 📑 Log a Security Audit Event
 */
export async function logSecurityEvent(userId, username, eventType, severity = 'LOW', details = {}) {
    try {
        const meta = await getClientMeta();
        await supabase.rpc('log_super_admin_security_event', {
            p_user_id: userId,
            p_username: username,
            p_event_type: eventType,
            p_severity: severity,
            p_ip: meta.ip,
            p_user_agent: meta.userAgent,
            p_details: details
        });
    } catch (err) {
        console.warn('Log security event failed:', err);
    }
}

/**
 * 📊 Fetch Super Admin Security Audit Logs
 */
export async function fetchSecurityLogs(limit = 100, severityFilter = null, search = '') {
    try {
        let query = supabase
            .from('super_admin_security_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (severityFilter && severityFilter !== 'ALL') {
            query = query.eq('severity', severityFilter);
        }

        if (search && search.trim() !== '') {
            const cleanSearch = search.trim();
            query = query.or(`username.ilike.%${cleanSearch}%,event_type.ilike.%${cleanSearch}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (err) {
        console.error('Fetch security logs error:', err);
        return { data: [], error: err.message };
    }
}

/**
 * 👥 Fetch Super Admin Users List
 */
export async function fetchSuperAdminUsers() {
    try {
        const { data, error } = await supabase
            .from('system_users')
            .select('id, username, full_name, email, role, is_active, security_pin_enabled, failed_pin_attempts, locked_until, last_security_verify_at, totp_enabled, totp_verified_at, created_at')
            .eq('role', 'super_admin')
            .order('created_at', { ascending: true });

        if (error) {
            // Fallback if totp_enabled columns do not exist on database yet
            if (error.code === '42703' || error.message?.includes('totp_enabled')) {
                console.warn('totp_enabled column not present yet, falling back to base select...');
                const { data: fallbackData, error: fallbackErr } = await supabase
                    .from('system_users')
                    .select('id, username, full_name, email, role, is_active, security_pin_enabled, failed_pin_attempts, locked_until, last_security_verify_at, created_at')
                    .eq('role', 'super_admin')
                    .order('created_at', { ascending: true });

                if (fallbackErr) throw fallbackErr;
                const mapped = (fallbackData || []).map(u => ({ ...u, totp_enabled: false, totp_verified_at: null }));
                return { users: mapped, error: null };
            }
            throw error;
        }
        return { users: data || [], error: null };
    } catch (err) {
        console.error('Fetch super admins error:', err);
        return { users: [], error: err.message };
    }
}

/**
 * ➕ Create New Super Admin Account
 */
export async function createSuperAdminUser(payload, creatorUsername = 'super_admin') {
    try {
        const { username, full_name, email, password, security_pin } = payload;
        const { data, error } = await supabase.rpc('create_super_admin_account', {
            p_username: username,
            p_full_name: full_name,
            p_email: email,
            p_password: password,
            p_security_pin: security_pin,
            p_creator_username: creatorUsername
        });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Create super admin error:', err);
        return { success: false, message: err.message };
    }
}

/**
 * 🔒 Update Super Admin Security PIN
 */
export async function updateSuperAdminPin(targetUserId, newPin, updaterUsername = 'super_admin') {
    try {
        const { data, error } = await supabase.rpc('update_super_admin_security_pin', {
            p_target_user_id: targetUserId,
            p_new_pin: newPin,
            p_updater_username: updaterUsername
        });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Update super admin PIN error:', err);
        return { success: false, message: err.message };
    }
}

/**
 * 🔄 Toggle Super Admin Active Status
 */
export async function toggleSuperAdminActiveStatus(targetUserId, isActive, updaterUsername = 'super_admin') {
    try {
        const { data, error } = await supabase.rpc('toggle_super_admin_status', {
            p_target_user_id: targetUserId,
            p_is_active: isActive,
            p_updater_username: updaterUsername
        });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Toggle status error:', err);
        return { success: false, message: err.message };
    }
}

/**
 * 🔑 Generate Super Admin TOTP Secret Key (Base32 16 Chars)
 */
export async function generateSuperAdminTotpSecret() {
    try {
        const { data, error } = await supabase.rpc('generate_super_admin_totp_secret');
        if (error) throw error;
        return data || 'JBSWY3DPEHPK3PXP';
    } catch (err) {
        console.warn('RPC generate secret failed, using JS generator:', err);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let secret = '';
        for (let i = 0; i < 16; i++) {
            secret += chars.charAt(Math.floor(Math.random() * 32));
        }
        return secret;
    }
}

// Correct RFC 4648 Base32 Decoder in JS
function base32ToUint8Array(base32Str) {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = base32Str.toUpperCase().replace(/[\s=]/g, '');
    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < clean.length; i++) {
        const index = base32Chars.indexOf(clean.charAt(i));
        if (index === -1) continue;
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            output.push((value >> bits) & 0xff);
            value = value & ((1 << bits) - 1);
        }
    }
    return new Uint8Array(output);
}

/**
 * 🧮 HMAC-SHA1 TOTP Generator in JS (Web Crypto API Fallback)
 */
export async function calculateJsTotpCode(base32Secret, timeOffsetSteps = 0) {
    try {
        const keyBytes = base32ToUint8Array(base32Secret);
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'HMAC', hash: { name: 'SHA-1' } },
            false,
            ['sign']
        );

        const timeStep = Math.floor(Date.now() / 1000 / 30) + timeOffsetSteps;
        const timeBuffer = new ArrayBuffer(8);
        const view = new DataView(timeBuffer);
        view.setUint32(4, timeStep, false);

        const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
        const hmac = new Uint8Array(signature);

        const offset = hmac[hmac.length - 1] & 0x0f;
        const binary =
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff);

        const otp = binary % 1000000;
        return otp.toString().padStart(6, '0');
    } catch (e) {
        console.error('JS TOTP calculation error:', e);
        return null;
    }
}

/**
 * 🔐 Enable TOTP 2FA (Google Authenticator)
 */
export async function enableSuperAdminTotp(userId, secret, code) {
    const cleanCode = code.trim();

    // 1. Try Supabase RPC first
    try {
        const { data, error } = await supabase.rpc('enable_super_admin_totp', {
            p_user_id: userId,
            p_secret: secret,
            p_verification_code: cleanCode
        });
        if (!error && data && data.success) {
            return data;
        }
    } catch (err) {
        console.warn('RPC enable_super_admin_totp exception:', err);
    }

    // 2. JS Web Crypto API calculation check (-4 to +4 steps window)
    let isValid = false;
    for (let step = -4; step <= 4; step++) {
        const calculated = await calculateJsTotpCode(secret, step);
        if (calculated && cleanCode === calculated) {
            isValid = true;
            break;
        }
    }

    if (isValid) {
        const chars = '0123456789ABCDEF';
        const recoveryCodes = [];
        for (let i = 0; i < 8; i++) {
            let part1 = '', part2 = '';
            for (let j = 0; j < 4; j++) part1 += chars.charAt(Math.floor(Math.random() * 16));
            for (let j = 0; j < 4; j++) part2 += chars.charAt(Math.floor(Math.random() * 16));
            recoveryCodes.push(`${part1}-${part2}`);
        }

        const { error: updateErr } = await supabase
            .from('system_users')
            .update({
                totp_secret: secret.trim().toUpperCase(),
                totp_enabled: true,
                totp_verified_at: new Date().toISOString(),
                totp_recovery_codes: recoveryCodes
            })
            .eq('id', userId);

        if (updateErr) {
            return { success: false, message: updateErr.message || 'فشل حفظ بيانات الـ 2FA بقاعدة البيانات' };
        }

        return {
            success: true,
            recovery_codes: recoveryCodes,
            message: 'تم تفعيل المصادقة الثنائية (Google Authenticator 2FA) بنجاح 🔒'
        };
    }

    return { success: false, message: 'رمز الاختيار المكتوب من التطبيق غير صحيح' };
}

/**
 * 🛡️ Verify TOTP 2FA Code or Recovery Code
 */
export async function verifySuperAdminTotp(userId, code) {
    const cleanCode = code.trim().toUpperCase();

    // 1. Try Supabase RPC first
    try {
        const { data, error } = await supabase.rpc('verify_super_admin_totp', {
            p_user_id: userId,
            p_code: cleanCode
        });
        if (!error && data && data.success) {
            setSuperAdminTotpVerifiedToken(userId);
            return data;
        }
    } catch (err) {
        console.warn('RPC verify_super_admin_totp exception:', err);
    }

    // 2. JS Verification Check
    const { data: user } = await supabase
        .from('system_users')
        .select('totp_secret, totp_enabled, totp_recovery_codes')
        .eq('id', userId)
        .maybeSingle();

    if (!user || !user.totp_enabled || !user.totp_secret) {
        return { success: true, required: false, message: 'المصادقة الثنائية غير مفعلة' };
    }

    // Check Backup Recovery Codes
    if (Array.isArray(user.totp_recovery_codes) && user.totp_recovery_codes.includes(cleanCode)) {
        const newCodes = user.totp_recovery_codes.filter(c => c !== cleanCode);
        await supabase.from('system_users').update({ totp_recovery_codes: newCodes }).eq('id', userId);
        setSuperAdminTotpVerifiedToken(userId);
        return { success: true, recovery_used: true, message: 'تمت المصادقة باستخدام رمز الاسترداد بنجاح' };
    }

    // Check JS TOTP (-4 to +4 steps)
    for (let step = -4; step <= 4; step++) {
        const calculated = await calculateJsTotpCode(user.totp_secret, step);
        if (calculated && cleanCode === calculated) {
            setSuperAdminTotpVerifiedToken(userId);
            return { success: true, message: 'تم التحقق من رمز المصادقة الثنائية بنجاح 🔒' };
        }
    }

    return { success: false, message: 'رمز الـ 2FA غير صحيح، يرجى التأكد من التطبيق' };
}

/**
 * ❌ Disable TOTP 2FA
 */
export async function disableSuperAdminTotp(userId, updaterUsername = 'super_admin') {
    try {
        const { data, error } = await supabase.rpc('disable_super_admin_totp', {
            p_user_id: userId,
            p_updater_username: updaterUsername
        });
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Disable TOTP error:', err);
        return { success: false, message: err.message || 'فشل تعطيل الـ 2FA' };
    }
}

/**
 * 📱 Check if 2FA session is verified in localStorage
 */
export function isSuperAdminTotpVerified(userId) {
    if (!userId) return false;
    const tokenStr = localStorage.getItem(`super_admin_2fa_verified_${userId}`);
    if (!tokenStr) return false;
    try {
        const token = JSON.parse(tokenStr);
        if (token.userId !== userId) return false;
        const now = new Date().getTime();
        return now < token.expiresAt;
    } catch (e) {
        return false;
    }
}

/**
 * 💾 Set 2FA session verification token
 */
export function setSuperAdminTotpVerifiedToken(userId) {
    if (!userId) return;
    const verifyToken = {
        userId,
        verifiedAt: new Date().getTime(),
        expiresAt: new Date().getTime() + (30 * 60 * 1000) // 30 minutes
    };
    localStorage.setItem(`super_admin_2fa_verified_${userId}`, JSON.stringify(verifyToken));
}

