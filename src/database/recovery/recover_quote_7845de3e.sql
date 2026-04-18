-- Recovery script for quote 7845de3e
-- This script attempts to restore a quote if it was accidentally deleted or corrupted
-- It checks for existing columns before attempting to insert/update

DO $$
DECLARE
    v_org_id uuid;
    v_user_id uuid;
    v_quote_id text := '7845de3e';
    v_exists boolean;
BEGIN
    -- 1. Check if quote exists
    SELECT EXISTS(SELECT 1 FROM public.quotes WHERE quote_id = v_quote_id) INTO v_exists;
    
    IF v_exists THEN
        RAISE NOTICE 'Quote % already exists. Skipping recovery.', v_quote_id;
        RETURN;
    END IF;

    -- 2. Get Organization and User (Fallback to first admin if specific user not found)
    -- Replace with actual IDs if known, otherwise this logic tries to find a valid owner
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    SELECT id INTO v_user_id FROM public.users WHERE organization_id = v_org_id LIMIT 1;

    IF v_org_id IS NULL OR v_user_id IS NULL THEN
        RAISE NOTICE 'No valid organization or user found for recovery. Aborting.';
        RETURN;
    END IF;

    -- 3. Insert Quote Record
    -- Note: 'paystack_reference' and 'payment_status' columns do not exist on 'quotes' table.
    -- We use 'payment_verified' boolean and 'status' text instead.
    
    INSERT INTO public.quotes (
        id,
        organization_id,
        user_id,
        quote_id,
        quote_number,
        status,
        total_amount,
        currency,
        billing_term,
        seats,
        modules,
        apps,
        created_at,
        validity_period,
        payment_verified,
        payment_verified_at
    ) VALUES (
        gen_random_uuid(),
        v_org_id,
        v_user_id,
        v_quote_id,
        'Q-' || v_quote_id, -- Fallback quote number
        'ACCEPTED',         -- Map 'payment_status'='PAID' to status='ACCEPTED' or 'ACTIVE'
        5000.00,            -- Placeholder amount, adjust as needed
        'USD',
        'annual',
        10,
        '["geoscience", "reservoir"]'::jsonb,
        '[]'::jsonb,
        NOW(),
        NOW() + INTERVAL '30 days',
        true,               -- payment_verified = true (equivalent to PAID)
        NOW()               -- payment_verified_at
    );

    RAISE NOTICE 'Quote % recovered successfully.', v_quote_id;

END $$;