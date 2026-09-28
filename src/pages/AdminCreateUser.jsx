import React, { useState } from 'react';
    import { Helmet } from 'react-helmet';
    import { motion } from 'framer-motion';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { UserPlus, Loader2 } from 'lucide-react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { Card } from '@/components/ui/card';
    import { AccountScope, AccountPage, AccountHeader } from '@/components/account/accountChrome';

    const AdminCreateUser = () => {
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [fullName, setFullName] = useState('');
      const [loading, setLoading] = useState(false);
      const [createdUsers, setCreatedUsers] = useState([]);
      const { toast } = useToast();

      const handleCreateUser = async (e) => {
        e.preventDefault();
        setLoading(true);

        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (error) {
          toast({
            variant: 'destructive',
            title: 'Error Creating User',
            description: error.message,
          });
        } else {
          toast({
            title: 'User Created Successfully!',
            description: `Account for ${email} has been created.`,
          });
          setCreatedUsers([...createdUsers, { email, password, fullName }]);
          setEmail('');
          setPassword('');
          setFullName('');
        }
        setLoading(false);
      };

      const handleBatchCreate = async () => {
        setLoading(true);
        const usersToCreate = [
          { email: 'ayodejiasaolu1@gmail.com', password: 'AyodejiPassword@2025', fullName: 'Ayodeji Asaolu' },
          { email: 'ojooluwaseyi90@gmail.com', password: 'OjoPassword@2025', fullName: 'Ojo Oluwaseyi' },
        ];

        let createdCount = 0;
        const results = [];

        for (const user of usersToCreate) {
          const { data, error } = await supabase.auth.admin.createUser({
            email: user.email,
            password: user.password,
            email_confirm: true,
            user_metadata: { full_name: user.fullName },
          });

          if (error) {
            toast({
              variant: 'destructive',
              title: `Error creating ${user.email}`,
              description: error.message,
            });
          } else {
            results.push(user);
            createdCount++;
          }
        }
        
        setCreatedUsers(prev => [...prev, ...results]);
        toast({
          title: 'Batch Creation Complete',
          description: `${createdCount} of ${usersToCreate.length} users created successfully.`,
        });

        setLoading(false);
      }


      return (
        <>
          <Helmet>
            <title>Admin - Create User - Petrolord Suite</title>
            <meta name="description" content="Administrator page to create new user accounts." />
          </Helmet>
          <AccountPage width="max-w-3xl">
            <AccountHeader
              eyebrow="Admin"
              title="Admin User Creation"
              description="Create new user accounts directly."
              icon={UserPlus}
              backTo="/dashboard"
              backLabel="Back to Dashboard"
            />
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full"
            >
              <Card className="p-4 sm:p-8">
                <div className="flex flex-col md:flex-row gap-8">
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold text-pl-text mb-4">Create Single User</h2>
                        <form onSubmit={handleCreateUser} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="fullName">Full Name</Label>
                                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                            <Button type="submit" disabled={loading} className="w-full font-semibold">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                                Create User
                            </Button>
                        </form>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-pl-border pt-8 md:pt-0 md:pl-8">
                        <h2 className="text-xl font-semibold text-pl-text mb-4">Batch Create Users</h2>
                        <p className="text-sm text-pl-muted mb-4 text-center break-words">Click to create accounts for:<br/> ayodejiasaolu1@gmail.com & ojooluwaseyi90@gmail.com</p>
                         <Button onClick={handleBatchCreate} disabled={loading} variant="outline" className="w-full font-semibold">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                            Create 2 New Users
                        </Button>
                    </div>
                </div>

                {createdUsers.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold text-pl-text">Created User Credentials</h3>
                    <div className="mt-4 rounded-lg border border-pl-border bg-pl-sunken p-4 space-y-2">
                      {createdUsers.map((user, index) => (
                        <div key={index} className="text-sm text-pl-text break-words">
                          <p><span className="font-semibold text-pl-muted">Email:</span> {user.email}</p>
                          <p><span className="font-semibold text-pl-muted">Password:</span> {user.password}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          </AccountPage>
        </>
      );
    };

    const AdminCreateUserPage = () => (
      <AccountScope testId="admin-create-user-theme-scope">
        <AdminCreateUser />
      </AccountScope>
    );

    export default AdminCreateUserPage;