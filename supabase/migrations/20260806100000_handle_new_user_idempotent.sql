-- =============================================================================
-- handle_new_user: idempotent org provisioning (trigger-hardening debt fix)
-- -----------------------------------------------------------------------------
-- The signup trigger predates the repo migration history; this file captures
-- the LIVE definition (pg_get_functiondef, 2026-08-06) with two minimal fixes:
--
--   * 1c2: both organization_apps inserts gain ON CONFLICT (organization_id,
--     app_id) DO NOTHING. Without it, the SECOND user created with
--     organization_id metadata for the same org re-ran the app-init inserts,
--     hit the unique key, and the whole auth user creation failed with
--     "Failed to initialize user" (found live 2026-08-05 during offboarding
--     E2E).
--   * 1c: the organization_members insert becomes an upsert on
--     (organization_id, email): a pre-existing INVITED row upgrades to the
--     real account (user_id set, status active) instead of colliding.
--
-- Everything else is byte-identical to the live body. public.users,
-- user_points_summary and user_profiles already upsert; purchased_modules
-- already guards with WHERE NOT EXISTS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  org_id UUID;
  org_name TEXT;
  meta_full_name TEXT;
  meta_primary_app TEXT;
  meta_role TEXT;
BEGIN
  BEGIN
    RAISE LOG 'handle_new_user: Starting for user %', NEW.id;

    -- Read metadata, with sensible defaults for any missing keys
    org_id           := (NEW.raw_user_meta_data->>'organization_id')::UUID;
    org_name         := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.email);
    meta_full_name   := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');
    meta_primary_app := COALESCE(NEW.raw_user_meta_data->>'primary_app', 'suite');
    meta_role        := COALESCE(NEW.raw_user_meta_data->>'role', 'owner');

    -- Defensive: clamp primary_app to known values
    IF meta_primary_app NOT IN ('suite', 'hse') THEN
      meta_primary_app := 'suite';
    END IF;

    -- ------------------------------------------------------------------------
    -- 1a. If signup flow (no org_id passed in metadata), create the org
    -- ------------------------------------------------------------------------
    IF org_id IS NULL THEN
      RAISE LOG 'handle_new_user: Creating new organization for user %', NEW.id;

      INSERT INTO public.organizations (
        name,
        contact_email,
        created_by,
        created_via,
        organization_type,
        subscription_tier,
        subscription_status,
        hse_status,
        suite_status,
        setup_completed,
        created_at
      )
      VALUES (
        org_name,
        NEW.email,
        NEW.id,
        'signup',
        'customer',
        'free',
        'active',
        'ACTIVE',                                         -- HSE is free for everyone
        CASE WHEN meta_primary_app = 'suite' THEN 'TRIAL' ELSE 'NONE' END,
        FALSE,                                            -- setup wizard not yet run
        NOW()
      )
      RETURNING id INTO org_id;
    END IF;

    -- ------------------------------------------------------------------------
    -- 1b. Upsert public.users
    -- ------------------------------------------------------------------------
    INSERT INTO public.users (
        id,
        email,
        organization_id,
        primary_app,
        subscribed_modules,
        last_accessed_app,
        app_preferences,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        org_id,
        meta_primary_app,
        ARRAY['hse_free']::text[],
        meta_primary_app,
        jsonb_build_object(
          meta_primary_app,
          jsonb_build_object(
            'onboarding_completed', FALSE,
            'preferred_language',   'en',
            'notifications_enabled', TRUE
          )
        ),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        primary_app     = EXCLUDED.primary_app,
        updated_at      = NOW();

    -- ------------------------------------------------------------------------
    -- 1c. Add the user as an organization member (NEW table: organization_members)
    --     Replaces the deprecated organization_users insert.
    --     For signup creator: status='active', role='owner', joined NOW.
    -- ------------------------------------------------------------------------
    INSERT INTO public.organization_members (
        organization_id,
        user_id,
        full_name,
        email,
        role,
        status,
        joined_at,
        created_at,
        updated_at
    )
    VALUES (
        org_id,
        NEW.id,
        meta_full_name,
        NEW.email,
        meta_role,                                         -- 'owner'
        'active',                                          -- creator joins active, not invited
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (organization_id, email) DO UPDATE SET
        user_id    = EXCLUDED.user_id,
        full_name  = COALESCE(public.organization_members.full_name, EXCLUDED.full_name),
        status     = 'active',
        joined_at  = COALESCE(public.organization_members.joined_at, NOW()),
        updated_at = NOW();

    -- ------------------------------------------------------------------------
    -- 1c2. Provision app access (NEW table: organization_apps)
    --      Free HSE for every new org. Suite signups also get suite app
    --      provisioned in TRIAL state — actual entitlement gated downstream
    --      by purchased_modules and the org's suite_status.
    -- ------------------------------------------------------------------------
    INSERT INTO public.organization_apps (
        organization_id,
        app_id,
        module_id,
        seats_allocated,
        seats_used,
        status,
        created_at
    )
    VALUES (
        org_id,
        'hse',
        'hse_free',
        999,                                               -- unlimited for free tier
        0,
        'ACTIVE',
        NOW()
    )
    ON CONFLICT (organization_id, app_id) DO NOTHING;

    IF meta_primary_app = 'suite' THEN
      INSERT INTO public.organization_apps (
          organization_id,
          app_id,
          module_id,
          seats_allocated,
          seats_used,
          status,
          created_at
      )
      VALUES (
          org_id,
          'suite',
          'suite_trial',
          5,                                               -- nominal trial seat allocation
          0,
          'ACTIVE',
          NOW()
      )
      ON CONFLICT (organization_id, app_id) DO NOTHING;
    END IF;

    -- ------------------------------------------------------------------------
    -- 1d. Free HSE entitlement record in purchased_modules
    -- ------------------------------------------------------------------------
    INSERT INTO public.purchased_modules (
        organization_id,
        module_id,
        module_name,
        status,
        subscription_status,
        purchase_date,
        seats_allocated,
        auto_renew
    )
    SELECT
        org_id,
        'hse_free',
        'HSE Free Tier',
        'active',
        'active',
        NOW(),
        999,
        FALSE
    WHERE NOT EXISTS (
        SELECT 1 FROM public.purchased_modules
        WHERE organization_id = org_id AND module_id = 'hse_free'
    );

    -- ------------------------------------------------------------------------
    -- 1e. user_points_summary
    -- ------------------------------------------------------------------------
    INSERT INTO public.user_points_summary (
        user_id,
        organization_id,
        total_points,
        points_earned,
        points_redeemed,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        org_id,
        0,
        0,
        0,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        updated_at      = NOW();

    -- ------------------------------------------------------------------------
    -- 1f. user_profiles
    -- ------------------------------------------------------------------------
    INSERT INTO public.user_profiles (
        id,
        org_id,
        full_name,
        updated_at
    )
    VALUES (
        NEW.id,
        org_id,
        meta_full_name,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        org_id    = COALESCE(EXCLUDED.org_id, public.user_profiles.org_id),
        full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name);

    RAISE LOG 'handle_new_user: Successfully completed for user % (org %)', NEW.id, org_id;

  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'handle_new_user: ERROR for user % - %', NEW.id, SQLERRM;
    RAISE EXCEPTION 'Failed to initialize user: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
