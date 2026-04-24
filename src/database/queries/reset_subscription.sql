-- SQL to remove a subscription for a specific organization
-- Replace 'YOUR_ORG_ID_HERE' with the actual UUID of the organization
-- This does NOT delete the organization or users, only the subscription record.

DELETE FROM public.subscriptions 
WHERE organization_id = 'YOUR_ORG_ID_HERE';

-- Example:
-- DELETE FROM public.subscriptions WHERE organization_id = 'd0c24156-324f-4d23-8b5d-1234567890ab';