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
    const { modules = [], apps = [], seats = 1, billing_term = 'monthly', add_ons = [], user_id, organization_id, user_email, user_name } = await req.json();
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
    const BASE_PLATFORM_FEE = parseFloat(configMap['base_platform_fee'] || '299');
    const USER_SEAT_PRICE = parseFloat(configMap['user_seat_price'] || '49');
    let appsCost = 0;
    const lineItems = [];
    const validatedApps = []; // Track app IDs (UUIDs)
    const appNameMap = {}; // Map app ID to name for PDF
    lineItems.push({
      description: 'Platform Base Fee',
      amount: BASE_PLATFORM_FEE
    });
    // FIXED: Query master_apps table for ACTIVE apps only
    // Apps array contains app IDs (UUIDs) from frontend
    if (apps && apps.length > 0) {
      console.log(`[Generate Quote] Requested apps: ${JSON.stringify(apps)}`);
      const { data: activeApps, error: appsError } = await supabase.from('master_apps').select('id, app_name, price, status, slug, module, module_id').in('id', apps).ilike('status', 'active');
      if (appsError) {
        console.error('[Generate Quote] Error fetching apps:', appsError);
        throw appsError;
      }
      if (activeApps && activeApps.length > 0) {
        console.log(`[Generate Quote] Found ${activeApps.length} active apps from ${apps.length} requested`);
        activeApps.forEach((app)=>{
          const price = parseFloat(app.price || 0);
          appsCost += price;
          // Store an OBJECT (not just the UUID) so manual_verify_quote can match
          // on ->>'id' / ->>'name' / ->>'module' and provision entitlements.
          validatedApps.push({
            id: app.id,
            name: app.app_name,
            module: app.module
          });
          appNameMap[app.id] = app.app_name; // Map for PDF
          lineItems.push({
            description: `App: ${app.app_name}`,
            amount: price
          });
          console.log(`[Generate Quote] Added app: ${app.app_name} (${app.id}) - $${price}`);
        });
        // Log any apps that were requested but not found/inactive
        const foundAppIds = activeApps.map((a)=>a.id);
        const missingApps = apps.filter((id)=>!foundAppIds.includes(id));
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
    const seatsCost = seats * USER_SEAT_PRICE;
    lineItems.push({
      description: `${seats} User Seats @ $${USER_SEAT_PRICE}/mo`,
      amount: seatsCost
    });
    let addonsCost = 0;
    add_ons.forEach((addon)=>{
      const price = parseFloat(addon.price || 0);
      addonsCost += price;
      lineItems.push({
        description: `Add-on: ${addon.name}`,
        amount: price
      });
    });
    const monthlySubtotal = BASE_PLATFORM_FEE + appsCost + seatsCost + addonsCost;
    let termMultiplier = 1;
    let months = 1;
    let discountRate = 0;
    if (billing_term === 'annual') {
      months = 12;
      discountRate = 0.15;
    } else if (billing_term === 'quarterly') {
      months = 3;
      discountRate = 0.10;
    }
    const grossTotal = monthlySubtotal * months;
    const discountAmount = grossTotal * discountRate;
    const netTotal = grossTotal - discountAmount;
    if (discountRate > 0) {
      lineItems.push({
        description: `${billing_term.charAt(0).toUpperCase() + billing_term.slice(1)} Discount (${discountRate * 100}%)`,
        amount: -discountAmount
      });
    }
    const vatAmount = netTotal * VAT_RATE;
    const totalAmount = netTotal + vatAmount;
    // 3. Generate Quote ID
    const dateStr = new Date().toISOString().slice(0, 10);
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
    const quoteId = `QT-${dateStr}-${randomStr}`;
    const validityPeriod = new Date();
    validityPeriod.setDate(validityPeriod.getDate() + 14);
    // 4. Insert Quote Record - Store app IDs (UUIDs), not names
    console.log(`[Generate Quote] Storing validated apps: ${JSON.stringify(validatedApps)}`);
    const { error: quoteInsertError } = await supabase.from('quotes').insert({
      quote_id: quoteId,
      organization_id: orgId,
      modules: JSON.stringify(modules),
      apps: JSON.stringify(validatedApps),
      seats: seats,
      billing_term: billing_term,
      add_ons: JSON.stringify(add_ons),
      total_amount: totalAmount,
      currency: 'USD',
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
          orgSize: `${seats} Seats`,
          numUsers: seats,
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
        paystack: `https://checkout.paystack.com/pay/generic?amount=${Math.round(totalAmount * 100)}&email=${user_email}&metadata=${JSON.stringify({
          quote_id: quoteId,
          organization_id: orgId
        })}`
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
