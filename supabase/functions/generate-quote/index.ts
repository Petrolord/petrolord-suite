import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { corsHeaders } from './cors.ts';
// Logo URLs
const LORDSWAY_LOGO_URL = 'https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/b55e5cb03a1912f6a06152592ab58d1c.png';
const PETROLORD_LOGO_URL = 'https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/b7bb1181c53d21d5cae68a1a79fddaa7.png';
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: corsHeaders
  });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { modules = [], apps = [], seats = 1, billing_term = 'monthly', add_ons = [], user_id, organization_id, user_email, user_name, service_tier = 'starter', storage_gb = 0, manual_discount = 0 } = await req.json();
    if (!user_id && !user_email) throw new Error('User ID or Email is required');
    let orgId = organization_id;
    let orgName = '';
    // 1. Handle Organization & User
    if (orgId) {
      const { data: org, error: orgError } = await supabase.from('organizations').select('*').eq('id', orgId).single();
      if (orgError) throw new Error('Organization not found');
      // Verify admin status if user_id is present.
      // Membership lives across three tables (org signup writes organization_members,
      // legacy code uses organization_users, some flows use org_members) — accept an
      // admin-ish role in ANY of them.
      if (user_id) {
        const ADMIN_ROLES = ['owner', 'admin', 'super_admin', 'org_admin'];
        const [ou, om, ogm] = await Promise.all([
          supabase.from('organization_users').select('role, user_role').eq('organization_id', orgId).eq('user_id', user_id).maybeSingle(),
          supabase.from('organization_members').select('role').eq('organization_id', orgId).eq('user_id', user_id).maybeSingle(),
          supabase.from('org_members').select('role').eq('org_id', orgId).eq('user_id', user_id).maybeSingle()
        ]);
        const roles = [ou.data?.role, ou.data?.user_role, om.data?.role, ogm.data?.role].filter(Boolean);
        if (!roles.some((r)=>ADMIN_ROLES.includes(r))) {
          throw new Error('Unauthorized: Must be an organization admin to generate a quote.');
        }
      }
      await supabase.from('organizations').update({
        suite_status: 'PENDING_PAYMENT'
      }).eq('id', orgId);
      orgName = org.name;
    } else {
      // Create New Org logic
      orgName = user_name ? `${user_name}'s Organization` : 'New Organization';
      if (user_id) {
        const { data: newOrg, error: createError } = await supabase.from('organizations').insert({
          name: orgName,
          contact_email: user_email,
          hse_status: 'NONE',
          suite_status: 'PENDING_PAYMENT',
          created_via: 'suite_quote',
          created_by: user_id,
          subscription_tier: 'free'
        }).select().single();
        if (createError) throw createError;
        orgId = newOrg.id;
        await supabase.from('organization_users').insert({
          organization_id: orgId,
          user_id: user_id,
          role: 'owner',
          modules: modules,
          apps: apps
        });
      }
    }
    // 2. Dynamic Pricing Engine
    const { data: pricingConfig } = await supabase.from('pricing_config').select('key, value');
    const configMap = {};
    pricingConfig?.forEach((item)=>configMap[item.key] = item.value);
    const VAT_RATE = parseFloat(configMap['vat_rate'] || '0.075');
    const BASE_PLATFORM_FEE_RAW = parseFloat(configMap['base_platform_fee'] || '299');
    const STORAGE_GB_PRICE = parseFloat(configMap['storage_gb_price'] || '0.5');
    // Graduated PER-APP seat tiers. Keep in sync with src/data/pricingModels.js
    // SEAT_TIERS. Optional override via pricing_config.seat_tiers (JSON array).
    let SEAT_TIERS = [
      { upTo: 5, price: 49 },
      { upTo: 15, price: 39 },
      { upTo: 40, price: 29 },
      { upTo: Infinity, price: 19 }
    ];
    try {
      if (configMap['seat_tiers']) {
        SEAT_TIERS = JSON.parse(configMap['seat_tiers']).map((t)=>({ upTo: t.upTo === null ? Infinity : t.upTo, price: t.price }));
      }
    } catch (_e) { /* keep defaults */ }
    const computeSeatCost = (n)=>{
      let remaining = Math.max(0, parseInt(n) || 0), prevCap = 0, cost = 0;
      for (const t of SEAT_TIERS) {
        if (remaining <= 0) break;
        const band = Math.min(remaining, t.upTo - prevCap);
        cost += band * t.price;
        remaining -= band;
        prevCap = t.upTo;
      }
      return cost;
    };
    // Service tiers (multiplier on the platform base fee) and billing periods.
    const TIER_MULTIPLIERS = { starter: 1.0, growth: 1.25, enterprise: 1.5 };
    const PERIODS = {
      monthly:   { months: 1,  discount: 0 },
      quarterly: { months: 3,  discount: 0.10 },
      annual:    { months: 12, discount: 0.15 },
      '2year':   { months: 24, discount: 0.20 },
      '3year':   { months: 36, discount: 0.25 }
    };
    const tierMultiplier = TIER_MULTIPLIERS[service_tier] ?? 1.0;
    const BASE_PLATFORM_FEE = BASE_PLATFORM_FEE_RAW * tierMultiplier;
    let appsCost = 0;
    let seatsCost = 0; // accumulated per-app via tiers
    const lineItems = [];
    const validatedApps = []; // Track app IDs (UUIDs)
    const appNameMap = {}; // Map app ID to name for PDF
    lineItems.push({
      description: 'Platform Base Fee',
      amount: BASE_PLATFORM_FEE
    });
    // Normalize apps: accept ["uuid", ...] (legacy) OR [{ id, seats }, ...] (per-app seats).
    const appEntries = (apps || [])
      .map((a)=> typeof a === 'string' ? { id: a, seats: null } : { id: a?.id, seats: (a?.seats != null ? parseInt(a.seats) : null) })
      .filter((a)=> a.id);
    const appIds = appEntries.map((a)=> a.id);
    const seatsByApp = Object.fromEntries(appEntries.map((a)=> [a.id, a.seats]));
    const perAppSeatMode = appEntries.some((a)=> a.seats != null);
    // Query master_apps for ACTIVE apps only
    if (appIds.length > 0) {
      console.log(`[Generate Quote] Requested apps: ${JSON.stringify(appEntries)}`);
      const { data: activeApps, error: appsError } = await supabase.from('master_apps').select('id, app_name, price, status, slug, module, module_id').in('id', appIds).ilike('status', 'active');
      if (appsError) {
        console.error('[Generate Quote] Error fetching apps:', appsError);
        throw appsError;
      }
      if (activeApps && activeApps.length > 0) {
        console.log(`[Generate Quote] Found ${activeApps.length} active apps from ${appIds.length} requested`);
        activeApps.forEach((app)=>{
          const price = parseFloat(app.price || 0);
          // Per-app seat count (the cap manual_verify_quote writes to seats_allocated).
          const appSeats = perAppSeatMode ? (seatsByApp[app.id] != null ? seatsByApp[app.id] : 1) : (Number(seats) || 1);
          const appSeatCost = computeSeatCost(appSeats); // graduated per-app tiers
          appsCost += price;
          seatsCost += appSeatCost;
          // Store an OBJECT (incl. per-app seats) so manual_verify_quote can match on
          // ->>'id'/'name'/'module' and set per-app seats_allocated.
          validatedApps.push({
            id: app.id,
            name: app.app_name,
            module: app.module,
            seats: appSeats
          });
          appNameMap[app.id] = app.app_name; // Map for PDF
          lineItems.push({
            description: `App: ${app.app_name}`,
            amount: price
          });
          lineItems.push({
            description: `   ${appSeats} seat${appSeats === 1 ? '' : 's'} — ${app.app_name}`,
            amount: appSeatCost
          });
          console.log(`[Generate Quote] Added app: ${app.app_name} (${app.id}) - $${price} - ${appSeats} seats - seatCost $${appSeatCost}`);
        });
        // Log any apps that were requested but not found/inactive
        const foundAppIds = activeApps.map((a)=>a.id);
        const missingApps = appIds.filter((id)=>!foundAppIds.includes(id));
        if (missingApps.length > 0) {
          console.warn(`[Generate Quote] ${missingApps.length} requested apps not found or inactive: ${JSON.stringify(missingApps)}`);
        }
      } else {
        console.warn(`[Generate Quote] No active apps found from requested list`);
      }
    }
    // Fallback module pricing (only if no apps selected)
    if (modules.length > 0 && validatedApps.length === 0) {
      console.log(`[Generate Quote] Processing ${modules.length} modules`);
      modules.forEach((m)=>{
        const modPrice = 500;
        appsCost += modPrice;
        lineItems.push({
          description: `Module Access: ${m}`,
          amount: modPrice
        });
      });
    }
    // seatsCost was accumulated per-app (graduated tiers) in the loop above.
    // totalSeats is the sum for display/storage.
    let totalSeats = validatedApps.reduce((acc, a)=> acc + (a.seats || 0), 0);
    // Module-only fallback (no apps selected): charge the global seats once.
    if (validatedApps.length === 0 && (Number(seats) || 0) > 0) {
      totalSeats = Number(seats) || 0;
      seatsCost = computeSeatCost(totalSeats);
      lineItems.push({ description: `${totalSeats} User Seats`, amount: seatsCost });
    }
    let addonsCost = 0;
    add_ons.forEach((addon)=>{
      const price = parseFloat(addon.price || 0);
      addonsCost += price;
      lineItems.push({
        description: `Add-on: ${addon.name}`,
        amount: price
      });
    });
    // Storage (first 10 GB free).
    const storageCost = Math.max(0, (Number(storage_gb) || 0) - 10) * STORAGE_GB_PRICE;
    if (storageCost > 0) {
      lineItems.push({ description: `Storage (${storage_gb} GB)`, amount: storageCost });
    }
    const monthlySubtotal = BASE_PLATFORM_FEE + appsCost + seatsCost + addonsCost + storageCost;
    // Term discount (per billing period) then optional manual discount, then ×months.
    const period = PERIODS[billing_term] || PERIODS.monthly;
    const months = period.months;
    const periodDiscountVal = monthlySubtotal * period.discount;
    const afterPeriod = monthlySubtotal - periodDiscountVal;
    const manualPct = Math.max(0, Math.min(100, Number(manual_discount) || 0)) / 100;
    const manualDiscountVal = afterPeriod * manualPct;
    const monthlyNet = afterPeriod - manualDiscountVal;
    if (period.discount > 0) {
      lineItems.push({ description: `Term Discount (${Math.round(period.discount * 100)}%)`, amount: -periodDiscountVal });
    }
    if (manualPct > 0) {
      lineItems.push({ description: `Special Discount (${Math.round(manualPct * 100)}%)`, amount: -manualDiscountVal });
    }
    const netTotal = monthlyNet * months;
    const vatAmount = netTotal * VAT_RATE;
    const totalAmount = netTotal + vatAmount;
    // 3. Generate Quote ID
    const dateStr = new Date().toISOString().slice(0, 10);
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
    const quoteId = `QT-${dateStr}-${randomStr}`;
    const validityPeriod = new Date();
    validityPeriod.setDate(validityPeriod.getDate() + 14);
    // 3b. Initialize a real Paystack transaction so the quote has a working
    // hosted-checkout link. NO currency conversion: the amount is sent in the
    // minor unit of the Paystack account's default currency, so a $X bill is
    // charged as X in that currency (e.g. $1000 -> ₦1000). We deliberately omit
    // the `currency` field so Paystack uses the account default. reference is set
    // to quoteId so the existing verify-by-quote-id flow keeps working.
    let paystackLink = null;
    let paystackReference = null;
    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (PAYSTACK_SECRET_KEY && user_email) {
      try {
        const appOrigin = req.headers.get('origin') || Deno.env.get('APP_URL') || '';
        const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: user_email,
            amount: Math.round(totalAmount * 100), // minor unit, no FX conversion
            reference: quoteId,
            metadata: {
              quote_id: quoteId,
              organization_id: orgId
            },
            // Only set callback_url when we know the calling app's origin; otherwise
            // Paystack falls back to the callback configured in its dashboard.
            ...(appOrigin ? { callback_url: `${appOrigin}/dashboard/quote/${quoteId}` } : {})
          })
        });
        const initJson = await initRes.json();
        if (initJson?.status && initJson?.data?.authorization_url) {
          paystackLink = initJson.data.authorization_url;
          paystackReference = initJson.data.reference || quoteId;
          console.log(`[Generate Quote] Paystack initialized: ref=${paystackReference}`);
        } else {
          console.error(`[Generate Quote] Paystack initialize failed: ${JSON.stringify(initJson)}`);
        }
      } catch (e) {
        // Don't lose the quote if Paystack is unreachable — store it without a link;
        // the dashboard shows a "contact sales" fallback in that case.
        console.error(`[Generate Quote] Paystack initialize error: ${e.message}`);
      }
    } else {
      console.warn('[Generate Quote] PAYSTACK_SECRET_KEY or user_email missing — no payment link generated.');
    }

    // 4. Insert Quote Record - Store app IDs (UUIDs), not names
    console.log(`[Generate Quote] Storing validated apps: ${JSON.stringify(validatedApps)}`);
    const { error: quoteInsertError } = await supabase.from('quotes').insert({
      quote_id: quoteId,
      organization_id: orgId,
      // modules/apps/add_ons are jsonb columns — pass arrays directly. Stringifying
      // would store a JSON *string scalar*, which breaks manual_verify_quote's
      // jsonb_array_elements(apps) provisioning loop.
      modules: modules,
      apps: validatedApps,
      seats: totalSeats,
      user_seats: totalSeats,
      billing_term: billing_term,
      add_ons: add_ons,
      total_amount: totalAmount,
      currency: 'USD',
      paystack_link: paystackLink,
      paystack_reference: paystackReference,
      validity_period: validityPeriod.toISOString(),
      status: 'PENDING',
      created_at: new Date().toISOString()
    });
    if (quoteInsertError) throw quoteInsertError;
    // 5. Generate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const primaryColor = rgb(1, 0.75, 0.03);
    const secondaryColor = rgb(0.3, 0.69, 0.31);
    const grayColor = rgb(0.4, 0.4, 0.4);
    // Basic PDF drawing logic
    page.drawRectangle({
      x: 0,
      y: height - 15,
      width,
      height: 15,
      color: secondaryColor
    });
    page.drawText('LORDSWAY ENERGY', {
      x: 40,
      y: height - 60,
      size: 24,
      font: boldFont,
      color: secondaryColor
    });
    page.drawText('QUOTE', {
      x: width - 150,
      y: height - 60,
      size: 24,
      font: boldFont,
      color: secondaryColor
    });
    page.drawText(`#${quoteId}`, {
      x: width - 150,
      y: height - 75,
      size: 10,
      font,
      color: rgb(0, 0, 0)
    });
    let y = height - 150;
    page.drawText('BILL TO:', {
      x: 40,
      y,
      size: 10,
      font: boldFont,
      color: secondaryColor
    });
    y -= 15;
    page.drawText(orgName, {
      x: 40,
      y,
      size: 11,
      font: boldFont
    });
    y -= 12;
    page.drawText(user_email || '', {
      x: 40,
      y,
      size: 10,
      font
    });
    y = height - 150;
    const rightColX = width - 200;
    page.drawText('Date:', {
      x: rightColX,
      y,
      size: 10,
      font: boldFont
    });
    page.drawText(new Date().toLocaleDateString(), {
      x: rightColX + 60,
      y,
      size: 10,
      font,
      align: 'right'
    });
    y -= 15;
    page.drawText('Valid Until:', {
      x: rightColX,
      y,
      size: 10,
      font: boldFont
    });
    page.drawText(validityPeriod.toLocaleDateString(), {
      x: rightColX + 60,
      y,
      size: 10,
      font
    });
    y -= 40;
    page.drawRectangle({
      x: 40,
      y: y - 5,
      width: width - 80,
      height: 20,
      color: secondaryColor
    });
    page.drawText('Description', {
      x: 50,
      y,
      size: 10,
      font: boldFont,
      color: rgb(1, 1, 1)
    });
    page.drawText('Amount (USD)', {
      x: width - 100,
      y,
      size: 10,
      font: boldFont,
      color: rgb(1, 1, 1)
    });
    y -= 25;
    lineItems.forEach((item)=>{
      page.drawText(item.description, {
        x: 50,
        y,
        size: 10,
        font
      });
      const amountStr = item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${item.amount.toFixed(2)}`;
      page.drawText(amountStr, {
        x: width - 100,
        y,
        size: 10,
        font
      });
      page.drawLine({
        start: {
          x: 40,
          y: y - 5
        },
        end: {
          x: width - 40,
          y: y - 5
        },
        thickness: 0.5,
        color: rgb(0.9, 0.9, 0.9)
      });
      y -= 20;
    });
    y -= 10;
    const totalX = width - 200;
    page.drawText('Subtotal (Net):', {
      x: totalX,
      y,
      size: 10,
      font: boldFont
    });
    page.drawText(`$${netTotal.toFixed(2)}`, {
      x: width - 100,
      y,
      size: 10,
      font
    });
    y -= 15;
    page.drawText('VAT (7.5%):', {
      x: totalX,
      y,
      size: 10,
      font
    });
    page.drawText(`$${vatAmount.toFixed(2)}`, {
      x: width - 100,
      y,
      size: 10,
      font
    });
    y -= 15;
    page.drawLine({
      start: {
        x: totalX,
        y: y + 5
      },
      end: {
        x: width - 40,
        y: y + 5
      },
      thickness: 1,
      color: secondaryColor
    });
    page.drawText('Total Amount:', {
      x: totalX,
      y,
      size: 12,
      font: boldFont,
      color: secondaryColor
    });
    page.drawText(`$${totalAmount.toFixed(2)}`, {
      x: width - 100,
      y,
      size: 12,
      font: boldFont,
      color: secondaryColor
    });
    const pdfBytes = await pdfDoc.save();
    const fileName = `${quoteId}.pdf`;
    const { error: uploadError } = await supabase.storage.from('quotes').upload(fileName, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true
    });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('quotes').getPublicUrl(fileName);
    // 7. Emails
    await supabase.functions.invoke('send-email', {
      body: JSON.stringify({
        to: user_email,
        template: 'quote_created',
        details: {
          orgName: orgName,
          orgSize: `${totalSeats} Seats`,
          numUsers: totalSeats,
          term: billing_term,
          calculation: {
            final: totalAmount
          },
          link: publicUrl
        }
      })
    });
    await supabase.functions.invoke('send-email-via-smtp', {
      body: JSON.stringify({
        to: 'sales@petrolord.com',
        subject: `New Quote: ${quoteId} - ${orgName}`,
        html: `<p>New quote generated.</p><p>Amount: $${totalAmount}</p><p><a href="${publicUrl}">View PDF</a></p>`
      })
    });
    return new Response(JSON.stringify({
      success: true,
      quote_id: quoteId,
      pdf_url: publicUrl,
      total_amount: totalAmount,
      validated_apps: validatedApps,
      payment_links: {
        paystack: paystackLink
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
