import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, User, LayoutDashboard, Settings } from 'lucide-react';
import { PublicBrandBar } from '@/components/public/PublicPage';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
const Header = () => {
  const {
    user,
    signOut
  } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };
  // Batch 7C: the ink brand bar of the public pages (PublicBrandBar), with
  // the page links from md up and the account controls. Only Solutions and
  // Resources render this header, both inside PublicPage.
  return <PublicBrandBar>
      <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium md:flex">
        <Link to="/solutions" className="rounded-sm text-pl-muted transition-colors hover:text-pl-text">Solutions</Link>
        <Link to="/resources" className="rounded-sm text-pl-muted transition-colors hover:text-pl-text">Resources</Link>
        <a href="https://nextgen.petrolord.com" className="rounded-sm text-pl-muted transition-colors hover:text-pl-text">NextGen</a>
        <Link to="/about-us" className="rounded-sm text-pl-muted transition-colors hover:text-pl-text">Company</Link>
      </nav>
      {user ? <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex max-w-[12rem] items-center space-x-2 text-pl-text sm:max-w-none">
              <User className="h-5 w-5 shrink-0 text-pl-accent-text" />
              <span className="truncate">{user.user_metadata?.display_name || user.email}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/dashboard')} className="cursor-pointer">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/profile')} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Profile Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout} className="cursor-pointer focus:!bg-pl-danger-bg focus:!text-pl-danger-text">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu> : <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate('/login')} className="text-pl-text">Login</Button>
          <Button variant="accent" onClick={() => navigate('/signup')} className="font-semibold">Sign Up</Button>
        </div>}
    </PublicBrandBar>;
};
export default Header;