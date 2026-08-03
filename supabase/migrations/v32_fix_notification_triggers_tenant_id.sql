-- =========================================================================
-- 🚀 MIGRATION V32: FIX NOTIFICATION TRIGGERS TO INCLUDE TENANT_ID
-- 📦 Project: UltraSoft (ألترا سوفت)
-- 📅 Date: 2026-08-03
-- 💡 Description: 
--    Updates all notification-inserting triggers to correctly include
--    tenant_id from the source record (orders table), ensuring proper
--    multi-tenant isolation for the system_notifications table.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. FIX ORDER NOTIFICATIONS TRIGGER (handle_order_changes_notification)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_order_changes_notification()
RETURNS TRIGGER AS $$
DECLARE
    notification_title text;
    notification_body text;
    notification_type text;
    target_user_id uuid := NULL;
    v_tenant_id uuid;
BEGIN
    -- استخراج tenant_id من السجل الحالي
    v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

    -- أ) عند إضافة أوردر جديد بالسيستم
    IF (TG_OP = 'INSERT') THEN
        notification_type := 'order_created';
        notification_title := '🚨 أوردر جديد قد وصل!';
        notification_body := '🧾 رقم الأوردر: ' || COALESCE(NEW.invoice_number, 'غير محدد') || E'\n' ||
                             '👤 اسم العميل: ' || COALESCE(NEW.customer_name, 'غير معروف') || E'\n' ||
                             '📞 رقم الهاتف: ' || COALESCE(NEW.phone_1, 'غير محدد') || 
                             CASE WHEN NEW.phone_2 IS NOT NULL AND NEW.phone_2 <> '' THEN ' / ' || NEW.phone_2 ELSE '' END || E'\n' ||
                             '📍 العنوان: ' || COALESCE(NEW.address, 'غير محدد') || E'\n' ||
                             '💵 إجمالي المبلغ: ' || NEW.total_price || ' ج.م' ||
                             CASE WHEN NEW.notes IS NOT NULL AND NEW.notes <> '' THEN E'\n📝 ملاحظات: ' || NEW.notes ELSE '' END;
        
        INSERT INTO public.system_notifications (type, title, body, metadata, tenant_id)
        VALUES (notification_type, notification_title, notification_body,
                jsonb_build_object('order_id', NEW.id, 'customer_name', NEW.customer_name, 'total_price', NEW.total_price),
                v_tenant_id);
        
    -- ب) عند تعديل أوردر بالسيستم
    ELSIF (TG_OP = 'UPDATE') THEN
        -- 1. تحقق مما إذا كان هناك تغيير في العامل المسند إليه
        IF (NEW.worker_id IS DISTINCT FROM OLD.worker_id AND NEW.worker_id IS NOT NULL) THEN
            notification_type := 'order_assigned';
            notification_title := '📋 تم تعيين أوردر جديد لك!';
            notification_body := '📦 تم إسناد الأوردر رقم: ' || COALESCE(NEW.invoice_number, 'غير محدد') || E'\n' ||
                                 '👤 للعميل: ' || COALESCE(NEW.customer_name, 'غير معروف') || E'\n' ||
                                 'يرجى البدء في تحضير الطلب بالمخزن.';
            target_user_id := NEW.worker_id;
            
            INSERT INTO public.system_notifications (type, title, body, metadata, user_id, tenant_id)
            VALUES (notification_type, notification_title, notification_body,
                    jsonb_build_object('order_id', NEW.id),
                    target_user_id,
                    v_tenant_id);
        END IF;

        -- 2. إشعار بدء تعديل الأوردر فقط عند تحول حالته إلى 'editing'
        IF ((NEW.status = 'editing' OR NEW.status = 'in_progress') AND OLD.status NOT IN ('editing', 'in_progress')) THEN
            notification_type := 'order_edit_start';
            notification_title := '✏️ بدأ تعديل الأوردر #' || COALESCE(NEW.invoice_number, 'غير محدد');
            notification_body := '👤 اسم العميل: ' || COALESCE(NEW.customer_name, 'غير معروف') || E'\n' ||
                                 '👤 القائم بالتعديل: ' || COALESCE(NEW.assigned_admin_name, 'غير معروف') || E'\n' ||
                                 '💵 إجمالي المبلغ الحالي: ' || NEW.total_price || ' ج.م';
            
            INSERT INTO public.system_notifications (type, title, body, metadata, tenant_id)
            VALUES (notification_type, notification_title, notification_body,
                    jsonb_build_object('order_id', NEW.id, 'status', NEW.status, 'total_price', NEW.total_price),
                    v_tenant_id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------------------------
-- 2. FIX INVENTORY (OUT OF STOCK) NOTIFICATION TRIGGER
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_out_of_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_model_name text;
    v_color_name text;
    v_size_name text;
    v_tenant_id uuid;
BEGIN
    -- استخراج tenant_id من السجل
    v_tenant_id := NEW.tenant_id;

    IF NEW.quantity <= 0 AND (OLD.quantity IS NULL OR OLD.quantity > 0) THEN
        -- استخراج اسم الموديل واللون والمقاس من جداول التعريف
        SELECT m.name INTO v_model_name FROM public.models m WHERE m.id = NEW.model_id;
        SELECT c.name INTO v_color_name FROM public.colors c WHERE c.id = NEW.color_id;
        SELECT s.name INTO v_size_name FROM public.sizes s WHERE s.id = NEW.size_id;
        
        INSERT INTO public.system_notifications (type, title, body, metadata, tenant_id)
        VALUES (
            'out_of_stock',
            '⚠️ تحذير: نفاد مخزون!',
            '📦 الموديل: ' || COALESCE(v_model_name, 'غير محدد') || E'\n' ||
            '🎨 اللون: ' || COALESCE(v_color_name, 'غير محدد') || E'\n' ||
            '📏 المقاس: ' || COALESCE(v_size_name, 'غير محدد') || E'\n' ||
            'تنبيه: نفدت هذه الكمية من المخزون.',
            jsonb_build_object('model_id', NEW.model_id, 'color_id', NEW.color_id, 'size_id', NEW.size_id),
            v_tenant_id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
