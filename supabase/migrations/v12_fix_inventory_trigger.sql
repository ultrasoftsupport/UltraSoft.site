-- Migration v12: Fix handle_inventory_out_of_stock trigger function for null color_id handling

CREATE OR REPLACE FUNCTION public.handle_inventory_out_of_stock()
RETURNS TRIGGER AS $$
DECLARE
    model_factory_code text;
    color_name text;
    notification_title text;
    notification_body text;
    v_color_id uuid;
BEGIN
    BEGIN
        v_color_id := (to_jsonb(NEW)->>'color_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_color_id := NULL;
    END;

    IF v_color_id IS NULL THEN
        v_color_id := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;

    IF (NEW.available_series = 0 AND (OLD.available_series > 0 OR OLD.available_series IS NULL)) THEN
        SELECT factory_code INTO model_factory_code FROM public.models WHERE id = NEW.model_id;
        IF v_color_id <> '00000000-0000-0000-0000-000000000000'::uuid THEN
            SELECT name INTO color_name FROM public.colors WHERE id = v_color_id;
        END IF;
        
        notification_title := '⚠️ نفاد كمية من المخزن!';
        notification_body := 'لقد نفد مخزون الموديل (' || COALESCE(model_factory_code, 'غير معروف') || ')' || 
            CASE WHEN color_name IS NOT NULL THEN ' للون (' || color_name || ')' ELSE '' END || ' بالكامل من المخزن.';
        
        INSERT INTO public.system_notifications (type, title, body, metadata)
        VALUES ('out_of_stock', notification_title, notification_body, jsonb_build_object('model_id', NEW.model_id, 'color_id', v_color_id, 'model_code', model_factory_code, 'color_name', color_name));
        
        INSERT INTO public.inventory_notification_queue (transaction_id, model_id, color_id, new_available_series)
        VALUES (pg_current_xact_id()::text, NEW.model_id, v_color_id, 0)
        ON CONFLICT (transaction_id, model_id, color_id) DO UPDATE SET new_available_series = 0;
        
    ELSIF (NEW.available_series > 0 AND (OLD.available_series = 0 OR OLD.available_series IS NULL)) THEN
        SELECT factory_code INTO model_factory_code FROM public.models WHERE id = NEW.model_id;
        IF v_color_id <> '00000000-0000-0000-0000-000000000000'::uuid THEN
            SELECT name INTO color_name FROM public.colors WHERE id = v_color_id;
        END IF;
        
        notification_title := '✅ عودة توفر صنف في المخزن!';
        notification_body := 'أصبح الموديل (' || COALESCE(model_factory_code, 'غير معروف') || ')' || 
            CASE WHEN color_name IS NOT NULL THEN ' للون (' || color_name || ')' ELSE '' END || ' متاحاً منه عدد (' || NEW.available_series || ') سري مرة أخرى.';
        
        INSERT INTO public.system_notifications (type, title, body, metadata)
        VALUES ('restocked', notification_title, notification_body, jsonb_build_object('model_id', NEW.model_id, 'color_id', v_color_id, 'model_code', model_factory_code, 'available_series', NEW.available_series));
        
        INSERT INTO public.inventory_notification_queue (transaction_id, model_id, color_id, new_available_series)
        VALUES (pg_current_xact_id()::text, NEW.model_id, v_color_id, NEW.available_series)
        ON CONFLICT (transaction_id, model_id, color_id) DO UPDATE SET new_available_series = EXCLUDED.new_available_series;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
