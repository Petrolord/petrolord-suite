CREATE OR REPLACE FUNCTION public.manual_verify_quote(p_quote_id text, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_quote record;
    v_app jsonb;
    v_app_record record;
    v_module_uuid uuid;
    v_seats int;
    v_user_id uuid;
    v_app_uuid uuid;
    v_module_slug text;
    v_app_name text;
    v_app_id_ref text;
    v_result jsonb := '{"status": "success", "processed": [], "skipped": []}'::jsonb;
    -- Fallback mapping if module_id is missing in master_apps for older records
    v_mapping jsonb := '{
        "geoscience": "f44a23a1-c0e0-4ed1-8961-91b3c6c2f091",
        "reservoir": "59fea9fb-ce7f-4534-b523-d4c0f8126032",
        "drilling": "7fbf3e09-6895-4e53-b6b5-86f928c4503e",
        "production": "d8c36e69-ccdf-454f-87ac-29ffb43ea4fb",
        "economics": "f938a5c0-257c-47f8-ac45-db4c9c96acc3",
        "assurance": "fd118d6f-5db6-423a-9eb4-b5dfdad3a199"
    }';
BEGIN
    RAISE NOTICE 'Starting manual_verify_quote for Quote: %', p_quote_id;

    -- 1. Fetch Quote Details
    SELECT * INTO v_quote FROM public.quotes 
    WHERE quote_id = p_quote_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE NOTICE 'Quote not found: %', p_quote_id;
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', 'Quote not found for the given ID and Organization.',
            'quote_id', p_quote_id
        );
    END IF;

    -- Setup Seats & User
    v_seats := COALESCE(v_quote.seats, 7);
    v_user_id := v_quote.user_id;

    -- Fallback user: Org Owner/Admin if quote user is null
    IF v_user_id IS NULL THEN
        SELECT user_id INTO v_user_id 
        FROM public.organization_users 
        WHERE organization_id = p_organization_id AND role IN ('owner','admin')
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    RAISE NOTICE 'User for assignment: %, Seats: %', v_user_id, v_seats;

    -- 2. Loop through Purchased Apps
    IF v_quote.apps IS NULL OR jsonb_array_length(v_quote.apps) = 0 THEN
        RAISE NOTICE 'No apps array in quote';
        RETURN jsonb_build_object('status', 'empty', 'message', 'No apps in quote');
    END IF;

    FOR v_app IN SELECT * FROM jsonb_array_elements(v_quote.apps)
    LOOP
        v_module_slug := v_app->>'module'; 
        v_app_name := TRIM(BOTH ' ' FROM (v_app->>'name'));
        v_app_id_ref := v_app->>'id';
        
        RAISE NOTICE 'Processing item: Name="%", ID="%", Module="%"', v_app_name, v_app_id_ref, v_module_slug;
        
        -- Reset record
        v_app_record := NULL;

        -- ROBUST MATCHING STRATEGY
        SELECT * INTO v_app_record 
        FROM public.master_apps 
        WHERE 
            (v_app_id_ref IS NOT NULL AND id::text = v_app_id_ref) OR -- ID Match
            (app_name ILIKE v_app_name) OR                            -- Exact Name
            (slug = v_app_name OR slug = v_app_id_ref) OR             -- Slug Match
            (app_name ILIKE v_app_name || '%') OR                     -- Starts With
            (v_app_name ILIKE app_name || '%')                        -- Contained In
        ORDER BY 
            CASE 
                WHEN (v_app_id_ref IS NOT NULL AND id::text = v_app_id_ref) THEN 1
                WHEN app_name ILIKE v_app_name THEN 2
                WHEN (slug = v_app_name OR slug = v_app_id_ref) THEN 3
                ELSE 4
            END
        LIMIT 1;

        IF v_app_record.id IS NOT NULL THEN
            v_app_uuid := v_app_record.id;
            v_module_uuid := v_app_record.module_id;
            
            -- Fallback Module UUID lookup if null in master_apps
            IF v_module_uuid IS NULL AND v_mapping ? v_module_slug THEN
                v_module_uuid := (v_mapping->>v_module_slug)::uuid;
            END IF;

            RAISE NOTICE 'MATCH FOUND: % (UUID: %) - Module: %', v_app_record.app_name, v_app_uuid, v_module_uuid;

            -- 3. Upsert Purchased Module (App Level)
            INSERT INTO public.purchased_modules (
                organization_id, 
                module_id, 
                app_id,    
                app_uuid,
                module_uuid,
                module_name, 
                seats_allocated, 
                status, 
                quote_id, 
                purchase_date, 
                expiry_date, 
                subscription_status
            ) VALUES (
                p_organization_id, 
                COALESCE(v_module_uuid::text, v_module_slug), 
                v_app_uuid::text,
                v_app_uuid,
                v_module_uuid,
                v_app_record.module,
                v_seats, 
                'active', 
                v_quote.id, -- Using UUID from quotes table
                NOW(), 
                v_quote.expiry_date, 
                'active'
            )
            ON CONFLICT (organization_id, app_id) DO UPDATE SET
                seats_allocated = EXCLUDED.seats_allocated,
                status = 'active',
                expiry_date = EXCLUDED.expiry_date;

            -- 4. Upsert Parent Module (Module Level) if needed
            IF v_module_uuid IS NOT NULL THEN
                 INSERT INTO public.purchased_modules (
                    organization_id, 
                    module_id, 
                    module_uuid,
                    module_name, 
                    seats_allocated, 
                    status, 
                    quote_id, 
                    purchase_date, 
                    expiry_date, 
                    subscription_status
                ) VALUES (
                    p_organization_id, 
                    v_module_uuid::text,
                    v_module_uuid,
                    v_module_slug,
                    v_seats, 
                    'active', 
                    v_quote.id, -- Using UUID from quotes table
                    NOW(), 
                    v_quote.expiry_date, 
                    'active'
                )
                ON CONFLICT (organization_id, module_id) WHERE app_id IS NULL DO UPDATE SET
                    status = 'active',
                    expiry_date = EXCLUDED.expiry_date;
            END IF;

            -- 5. Seat Assignments
            IF v_user_id IS NOT NULL THEN
                INSERT INTO public.app_seat_assignments (
                    organization_id, app_id, user_id, seat_number, 
                    assigned_by, is_admin_seat, created_at, updated_at
                ) VALUES (
                    p_organization_id, v_app_uuid::text, v_user_id, 1,
                    v_user_id, true, NOW(), NOW()
                )
                ON CONFLICT (organization_id, app_id, seat_number) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    is_admin_seat = true,
                    updated_at = NOW();
            END IF;

            IF v_seats > 1 THEN
                FOR i IN 2..v_seats LOOP
                    INSERT INTO public.app_seat_assignments (
                        organization_id, app_id, user_id, seat_number, 
                        assigned_by, is_admin_seat, created_at, updated_at
                    ) VALUES (
                        p_organization_id, v_app_uuid::text, NULL, i,
                        v_user_id, false, NOW(), NOW()
                    )
                    ON CONFLICT (organization_id, app_id, seat_number) DO NOTHING;
                END LOOP;
            END IF;

            v_result := jsonb_set(v_result, '{processed}', v_result->'processed' || jsonb_build_object(
                'app', v_app_name, 
                'status', 'activated',
                'matched_master_app', v_app_record.app_name,
                'uuid', v_app_uuid
            ));
        ELSE
            RAISE WARNING 'NO MATCH for app: %', v_app_name;
             v_result := jsonb_set(v_result, '{skipped}', v_result->'skipped' || jsonb_build_object(
                'app', v_app_name, 
                'reason', 'no_match_in_master_apps'
            ));
        END IF;
    END LOOP;

    -- 6. Update Quote Status
    UPDATE public.quotes 
    SET status = 'ENTITLEMENTS_CREATED', updated_at = NOW()
    WHERE id = v_quote.id;

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error in manual_verify_quote: %', SQLERRM;
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$function$