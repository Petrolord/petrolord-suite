import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, User, LayoutDashboard, Settings } from 'lucide-react';
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
  return <header className="bg-slate-900/50 backdrop-blur-lg border-b border-slate-700 sticky top-0 z-50">
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <img className="h-10 w-auto" alt="Petrolord - Energy Industry Management" src="https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/petrolord-symbol-text-7X03X.png" />
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/solutions" className="text-slate-300 hover:text-white transition-colors">Solutions</Link>
            <Link to="/resources" className="text-slate-300 hover:text-white transition-colors">Resources</Link>
            <Link to="/nextgen" className="text-slate-300 hover:text-white transition-colors">NextGen</Link>
            <Link to="/about-us" className="text-slate-300 hover:text-white transition-colors">Company</Link>
            {user ? <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2 text-white hover:bg-slate-700">
                    <User className="h-5 w-5 text-lime-300" />
                    <span>{user.user_metadata?.display_name || user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-slate-800 border-slate-700 text-white">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <DropdownMenuItem onSelect={() => navigate('/dashboard')} className="cursor-pointer hover:!bg-slate-700">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Dashboard</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate('/profile')} className="cursor-pointer hover:!bg-slate-700">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Profile Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <DropdownMenuItem onSelect={handleLogout} className="cursor-pointer hover:!bg-slate-700 focus:!bg-red-500/20 focus:!text-red-300">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu> : <div className="flex items-center space-x-2">
                <Button variant="ghost" onClick={() => navigate('/login')} className="text-white hover:bg-slate-700">Login</Button>
                <Button onClick={() => navigate('/signup')} className="bg-gradient-to-r from-lime-400 to-teal-500 hover:from-lime-500 hover:to-teal-600 text-slate-900 font-bold">Sign Up</Button>
              </div>}
          </div>
        </div>
      </nav>
    </header>;
};
export default Header;