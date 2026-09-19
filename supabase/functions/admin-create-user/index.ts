// admin-create-user: deployed from the Horizons era and never committed;
// brought into the repo by the platform-admin security fix (2026-09-19).
// Caller must be a platform super admin (public.platform_admins).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'
import { escapeHtml, requirePlatformAdmin } from '../_shared/platform-admin.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with Service Role Key for admin privileges
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Security fix 2026-09-19: this ran with verify_jwt off and NO caller
    // check, so anyone could create confirmed accounts for any address and
    // have Petrolord mail them. Platform super admins only now.
    const guard = await requirePlatformAdmin(supabase, req)
    if (!guard.ok) {
      return new Response(JSON.stringify({ error: guard.error }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: guard.status
      })
    }

    const { email, name, role } = await req.json()

    if (!email) {
      throw new Error('Email is required')
    }

    // Generate a secure random password
    const password = Math.random().toString(36).slice(-8) + 
                     Math.random().toString(36).slice(-8) + 
                     "A1!"; // Enforce some complexity if policies require it

    // 1. Create the user in Supabase Auth
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name: name, system_role: role }
    })

    if (createError) {
      console.error("Auth creation error:", createError)
      // Check if user already exists
      if (createError.message.includes("already registered")) {
         // Optionally fetch the user if they exist to link them, 
         // but for safety, return error so admin knows.
         return new Response(JSON.stringify({ error: "User with this email already exists." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
         })
      }
      throw createError
    }

    const userId = user?.user?.id;

    // 2. Send Welcome Email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const senderEmail = Deno.env.get('SENDER_EMAIL') || 'no-reply@petrolord.com'

    if (resendApiKey) {
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: senderEmail,
                to: email,
                subject: 'Welcome to Petrolord HSE - Your Login Credentials',
                html: `
                  <div style="font-family: sans-serif; color: #333;">
                    <h1>Welcome to Petrolord HSE</h1>
                    <p>Hello <strong>${escapeHtml(name || 'User')}</strong>,</p>
                    <p>Your account has been successfully created. You can now access the platform using the following credentials:</p>
                    <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                      <p style="margin: 5px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
                      <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
                    </div>
                    <p>Please log in and change your password immediately.</p>
                    <p><a href="https://petrolord-hse.com/login" style="background: #007bff; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login to Dashboard</a></p>
                    <p style="font-size: 12px; color: #777; margin-top: 30px;">If you did not request this account, please contact support.</p>
                  </div>
                `
            })
        })
        
        if (!emailRes.ok) {
            const errorText = await emailRes.text()
            console.error("Failed to send welcome email:", errorText)
            // We don't fail the whole request if email fails, but we log it
        }
    }

    return new Response(JSON.stringify({ user_id: userId, success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
