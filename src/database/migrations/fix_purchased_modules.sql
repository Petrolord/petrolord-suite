/* 
 * Fix for purchased_modules inserts - Robust Version
 * Uses DELETE + INSERT pattern to avoid 'unique constraint' ambiguity or missing index issues.
 * Resolves 'invalid input syntax for type uuid' by looking up quote_id UUID.
 */

DO $$
DECLARE
    v_org_id uuid;
    v_quote_uuid uuid;
BEGIN
    -- 1. Identify Organization
    SELECT id INTO v_org_id FROM public.organizations WHERE name = 'Petrolord' LIMIT 1;
    
    -- 2. Identify Quote UUID
    SELECT id INTO v_quote_uuid FROM public.quotes WHERE quote_id = 'Q-202601-854' LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        -- 3. Clear existing entries to prevent violations (Fallback pattern)
        -- We delete existing records for these modules to ensure a clean slate 
        -- without needing to know the exact partial index definition.
        DELETE FROM public.purchased_modules 
        WHERE organization_id = v_org_id 
          AND module_id IN ('HSE', 'Geoscience')
          AND app_id IS NULL;

        -- 4. Insert HSE Module
        INSERT INTO public.purchased_modules (
            organization_id,
            module_id,
            module_name,
            seats_allocated,
            status,
            quote_id,
            purchase_date,
            expiry_date,
            subscription_status
        ) VALUES (
            v_org_id,
            'HSE',
            'HSE',
            100,
            'active',
            v_quote_uuid, -- UUID or NULL if not found
            NOW(),
            NOW() + INTERVAL '1 year',
            'active'
        );

        -- 5. Insert Geoscience Module
        INSERT INTO public.purchased_modules (
            organization_id,
            module_id,
            module_name,
            seats_allocated,
            status,
            quote_id,
            purchase_date,
            expiry_date,
            subscription_status
        ) VALUES (
            v_org_id,
            'Geoscience',
            'Geoscience',
            50,
            'active',
            v_quote_uuid, -- UUID or NULL if not found
            NOW(),
            NOW() + INTERVAL '1 year',
            'active'
        );
        
        RAISE NOTICE 'Modules HSE and Geoscience processed for Petrolord.';
    ELSE
        RAISE NOTICE 'Organization Petrolord not found.';
    END IF;
END $$;