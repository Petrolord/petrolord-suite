import { supabase } from '@/lib/customSupabaseClient';

/**
 * Calculates the number of used seats for an organization based on its members.
 * Excluding privileged roles: super_admin, org_admin, staff_admin, consultant.
 * 
 * @param {Array} members - List of organization members
 * @returns {number} - Count of seats used
 */
export const calculateSeatsUsed = (members) => {
  if (!members || !Array.isArray(members)) {
    console.log("seatUtils: Invalid members array provided to calculateSeatsUsed");
    return 0;
  }
  
  console.log("seatUtils: Calculating seats used. Total members:", members.length);
  
  const excludedRoles = ['super_admin', 'org_admin', 'staff_admin', 'consultant'];

  const seatsUsed = members.filter(member => {
    const role = member?.role || member?.user_role || 'member'; // Handle different schema variations
    const isExcluded = excludedRoles.includes(role);
    
    // Log exclusion for debugging
    if (isExcluded) {
      console.log(`seatUtils: Excluding member ${member?.id} (${member?.email}) from seat count. Role: ${role}`);
    }
    return !isExcluded;
  }).length;

  console.log("seatUtils: Final Calculated Seats Used:", seatsUsed);
  return seatsUsed;
};

/**
 * Calculates available seats based on allocation and usage.
 * 
 * @param {number} seatsAllocated - Total seats allowed
 * @param {number} seatsUsed - Seats currently consumed
 * @returns {number} - Seats remaining
 */
export const getSeatsAvailable = (seatsAllocated, seatsUsed) => {
  const allocated = parseInt(seatsAllocated || 0, 10);
  const used = parseInt(seatsUsed || 0, 10);
  const available = allocated - used;
  
  console.log(`seatUtils: Seats Available Calculation: ${allocated} (Allocated) - ${used} (Used) = ${available} (Available)`);
  return available;
};

/**
 * Determines if a new member can be added based on seat availability.
 * Super Admins bypass seat limits.
 * 
 * @param {number} seatsAvailable - Number of available seats
 * @param {boolean} isInviteeSuperAdmin - Whether the new user will be a Super Admin
 * @returns {boolean} - True if member can be added
 */
export const canAddMember = (seatsAvailable, isInviteeSuperAdmin = false) => {
  console.log(`seatUtils: Checking canAddMember. Available: ${seatsAvailable}, InviteeSuperAdmin: ${isInviteeSuperAdmin}`);
  
  if (isInviteeSuperAdmin) {
    console.log("seatUtils: Access granted - Invitee is Super Admin (bypasses seat check)");
    return true;
  }

  const canAdd = seatsAvailable > 0;
  console.log(`seatUtils: Access ${canAdd ? 'granted' : 'denied'} - Seats Available: ${seatsAvailable}`);
  return canAdd;
};

/**
 * Async helper to fetch data and calculate stats (useful for server-side or initial load checks if needed)
 * 
 * @param {string} orgId 
 * @param {string} appId 
 * @returns {Promise<{seatsAllocated: number, seatsUsed: number, seatsAvailable: number}>}
 */
export const fetchSeatStats = async (orgId, appId = null) => {
  console.log(`seatUtils: Fetching seat stats for Org: ${orgId}, App: ${appId || 'Any'}`);
  
  try {
    // 1. Fetch Members
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', orgId);
      
    if (membersError) throw membersError;

    // 2. Fetch App Allocation
    let query = supabase
      .from('organization_apps')
      .select('seats_allocated')
      .eq('organization_id', orgId);
      
    if (appId) {
      query = query.eq('app_id', appId);
    }
    
    const { data: apps, error: appsError } = await query;
    if (appsError) throw appsError;

    const appData = apps && apps.length > 0 ? apps[0] : { seats_allocated: 0 }; 
    const seatsAllocated = appData.seats_allocated || 0;

    const seatsUsed = calculateSeatsUsed(members);
    const seatsAvailable = getSeatsAvailable(seatsAllocated, seatsUsed);

    return { seatsAllocated, seatsUsed, seatsAvailable };

  } catch (error) {
    console.error("seatUtils: Error fetching seat stats:", error);
    return { seatsAllocated: 0, seatsUsed: 0, seatsAvailable: 0 };
  }
};