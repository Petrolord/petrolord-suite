-- =============================================================================
-- manual_verify_quote: paid quotes set their own end dates (renewals stack,
-- top-ups never shorten, a re-run never wipes or re-stacks)
-- -----------------------------------------------------------------------------
-- OWNER-APPROVED 2026-09-28 (payment path; lead recommendations). NOT YET APPLIED.
-- Apply BEFORE deploying the edge functions changed on fix/renewal-expiry-sync
-- (they call the 3-argument form created here).
--
-- Defect (found 2026-09-28, after PR #767 routed Renew through quote-and-pay):
-- the two ON CONFLICT branches updated an org's EXISTING purchased_modules rows
-- without touching quote_id and set expiry_date = quotes.expiry_date, which
-- generate-quote never writes (always NULL). The finalizers then set the end
-- date only on rows WHERE quote_id = <the paid quote>, so a paid renewal left
-- held rows on the old quote with expiry NULL ("never expires" to
-- usePurchasedModules and get-user-entitlements), and any second RPC run for a
-- quote (the Paystack webhook after the verify page) wiped a set end date.
--
-- Rules (owner decision 2026-09-28). This function is now the ONLY place that
-- sets purchased_modules.expiry_date for a paid quote, on every rail (Paystack
-- verify page, Paystack webhook, Stripe, bank transfer); the finalizers no
-- longer run their own "UPDATE ... SET expiry_date" sync.
--   term   = quotes.billing_period, else quotes.billing_term, in months
--            (monthly 1, quarterly 3, annual/yearly 12, 2year 24, 3year 36;
--            anything else 12), the same table as _shared/billing-term.ts.
--   paid   = p_paid_at, else quotes.payment_verified_at, else now().
--   App row, first purchase:                  paid + term.
--   App row held, current end in the future:  current end + term (stacks;
--                                             no days lost).
--   App row held, expired or NULL end:        paid + term.
--   App row already on THIS quote (re-run):   unchanged (a NULL end is filled
--                                             with paid + term), so a second
--                                             run never stacks twice.
--   Module row (container):                   the later of its current end and
--                                             the end just set on the quote's
--                                             app in that module; a shorter
--                                             top-up never moves it earlier.
-- Month arithmetic is done in UTC and clamps to the month end (Jan 31 + 1
-- month = Feb 28/29), as addMonths() does in TypeScript.
-- The result jsonb gains expiry_date (the latest end set on this quote's app
-- rows), paid_at and term_months; finalizers use expiry_date as the
-- subscriptions.end_date so the subscription row and the entitlements agree.
--
-- Objects:
--   * manual_verify_quote(text, uuid, timestamptz): new, does the work.
--     New functions inherit the public-schema default ACL (anon and
--     authenticated EXECUTE), so EXECUTE is revoked from PUBLIC, anon and
--     authenticated and granted to service_role, matching 20260929130100.
--   * manual_verify_quote(text, uuid): CREATE OR REPLACE (keeps the owner and
--     the service_role-only ACL applied by 20260929130100) as a wrapper with
--     p_paid_at NULL, for any caller still on the two-argument form.
-- Idempotent; no transaction lines of its own.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.manual_verify_quote(p_quote_id text, p_organization_id uuid, p_paid_at timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
    v_quote record;
    v_app jsonb;
    v_app_record record;
    v_module_uuid uuid;
    v_seats int;
    v_app_uuid uuid;
    v_module_slug text;
    v_app_name text;
    v_app_id_ref text;
    v_result jsonb := '{"status": "success", "processed": [], "skipped": []}'::jsonb;
    v_paid timestamptz;
    v_months int;
    v_term text;
    v_new_end timestamptz;
    v_row_end timestamptz;
    v_latest_end timestamptz;
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

    -- 1b. Paid date and term. The term table mirrors _shared/billing-term.ts:
    -- a stored billing_period wins over billing_term; unknown counts as annual.
    v_paid := COALESCE(p_paid_at, v_quote.payment_verified_at, NOW());
    v_term := lower(btrim(COALESCE(v_quote.billing_period, '')));
    IF v_term NOT IN ('monthly','quarterly','annual','yearly','2year','3year') THEN
        v_term := lower(btrim(COALESCE(v_quote.billing_term, '')));
    END IF;
    v_months := CASE v_term
        WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3
        WHEN 'annual' THEN 12 WHEN 'yearly' THEN 12
        WHEN '2year' THEN 24 WHEN '3year' THEN 36
        ELSE 12 END;
    -- End of a term bought on the paid date (UTC month arithmetic).
    v_new_end := ((v_paid AT TIME ZONE 'UTC') + make_interval(months => v_months)) AT TIME ZONE 'UTC';

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
        -- Per-app seat allocation (cap for assign_app_seat); fallbacks: global, 7.
        v_seats := COALESCE(NULLIF(v_app->>'seats','')::int, v_quote.seats, 7);

        RAISE NOTICE 'Processing item: Name="%", ID="%", Module="%", Seats=%',
                     v_app_name, v_app_id_ref, v_module_slug, v_seats;

        v_app_record := NULL;

        -- ROBUST MATCHING STRATEGY
        SELECT * INTO v_app_record
        FROM public.master_apps
        WHERE
            (v_app_id_ref IS NOT NULL AND id::text = v_app_id_ref) OR
            (app_name ILIKE v_app_name) OR
            (slug = v_app_name OR slug = v_app_id_ref) OR
            (app_name ILIKE v_app_name || '%') OR
            (v_app_name ILIKE app_name || '%')
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

            IF v_module_uuid IS NULL AND v_mapping ? v_module_slug THEN
                v_module_uuid := (v_mapping->>v_module_slug)::uuid;
            END IF;

            RAISE NOTICE 'MATCH FOUND: % (UUID: %) - Module: % - Seats: %',
                         v_app_record.app_name, v_app_uuid, v_module_uuid, v_seats;

            -- 3. Upsert Purchased Module (App Level) — seats_allocated = per-app cap
            INSERT INTO public.purchased_modules (
                organization_id, module_id, app_id, app_uuid, module_uuid,
                module_name, seats_allocated, status, quote_id,
                purchase_date, expiry_date, subscription_status
            ) VALUES (
                p_organization_id,
                COALESCE(v_module_uuid::text, v_module_slug),
                v_app_uuid::text, v_app_uuid, v_module_uuid,
                v_app_record.module, v_seats, 'active', v_quote.id,
                NOW(), v_new_end, 'active'
            )
            -- A held app: re-point it at this quote and set its end date.
            --   same quote already applied (re-run): keep the end date;
            --   current end in the future: stack the term on it;
            --   expired or NULL: paid date + term.
            ON CONFLICT (organization_id, app_id) DO UPDATE SET
                seats_allocated = EXCLUDED.seats_allocated,
                status = 'active',
                quote_id = EXCLUDED.quote_id,
                expiry_date = CASE
                    WHEN public.purchased_modules.quote_id IS NOT DISTINCT FROM EXCLUDED.quote_id
                        THEN COALESCE(public.purchased_modules.expiry_date, EXCLUDED.expiry_date)
                    WHEN public.purchased_modules.expiry_date > v_paid
                        THEN ((public.purchased_modules.expiry_date AT TIME ZONE 'UTC')
                              + make_interval(months => v_months)) AT TIME ZONE 'UTC'
                    ELSE GREATEST(EXCLUDED.expiry_date, public.purchased_modules.expiry_date)
                END
            RETURNING expiry_date INTO v_row_end;

            IF v_latest_end IS NULL OR v_row_end > v_latest_end THEN
                v_latest_end := v_row_end;
            END IF;

            -- 4. Upsert Parent Module (Module Level) if applicable
            IF v_module_uuid IS NOT NULL THEN
                 INSERT INTO public.purchased_modules (
                    organization_id, module_id, module_uuid, module_name,
                    seats_allocated, status, quote_id,
                    purchase_date, expiry_date, subscription_status
                ) VALUES (
                    p_organization_id, v_module_uuid::text, v_module_uuid, v_module_slug,
                    v_seats, 'active', v_quote.id,
                    NOW(), v_row_end, 'active'
                )
                -- The module row ends with its latest app: the later of its
                -- current end and the end just set on this app. Never earlier.
                ON CONFLICT (organization_id, module_id) WHERE app_id IS NULL DO UPDATE SET
                    status = 'active',
                    quote_id = EXCLUDED.quote_id,
                    expiry_date = GREATEST(public.purchased_modules.expiry_date, EXCLUDED.expiry_date);
            END IF;

            -- NOTE: No seat rows are created here. Seats are assigned on demand by
            -- an org admin via public.assign_app_seat(); the admin is never
            -- auto-charged a seat.

            v_result := jsonb_set(v_result, '{processed}', v_result->'processed' || jsonb_build_object(
                'app', v_app_name,
                'status', 'activated',
                'matched_master_app', v_app_record.app_name,
                'uuid', v_app_uuid,
                'seats_allocated', v_seats
            ));
        ELSE
            RAISE WARNING 'NO MATCH for app: %', v_app_name;
             v_result := jsonb_set(v_result, '{skipped}', v_result->'skipped' || jsonb_build_object(
                'app', v_app_name,
                'reason', 'no_match_in_master_apps'
            ));
        END IF;
    END LOOP;

    -- 5. Update Quote Status
    UPDATE public.quotes
    SET status = 'ENTITLEMENTS_CREATED', updated_at = NOW()
    WHERE id = v_quote.id;

    v_result := v_result || jsonb_build_object(
        'expiry_date', v_latest_end,
        'paid_at', v_paid,
        'term_months', v_months
    );

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error in manual_verify_quote: %', SQLERRM;
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$function$;

-- Two-argument form: kept for callers not yet redeployed. Same rules, with the
-- paid date taken from quotes.payment_verified_at (else now()).
CREATE OR REPLACE FUNCTION public.manual_verify_quote(p_quote_id text, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
    RETURN public.manual_verify_quote(p_quote_id, p_organization_id, NULL::timestamptz);
END;
$function$;

-- The new overload would otherwise inherit the schema default ACL (anon and
-- authenticated EXECUTE). Provisioning is service-role only (20260929130100).
REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid, timestamptz) TO service_role;
-- Re-assert the two-argument ACL too (no-op when 20260929130100 is applied).
REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.manual_verify_quote(text, uuid) TO service_role;

-- PostgREST: pick up the new overload.
NOTIFY pgrst, 'reload schema';
