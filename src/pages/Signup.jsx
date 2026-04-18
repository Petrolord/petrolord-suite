import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  Loader2, 
  Building2, 
  User, 
  Mail, 
  Phone, 
  Lock, 
  AlertCircle,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';

const BLOCKED_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 
  'protonmail.com', 'zoho.com', 'yandex.com', 'mail.com', 'live.com'
];

const Signup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    orgName: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({});

  // Password Strength Calculation
  const getPasswordStrength = (pass) => {
    let score = 0;
    if (!pass) return 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const passwordStrength = getPasswordStrength(formData.password);

  // Validation Logic
  const validateField = (name, value) => {
    let error = '';
    
    switch (name) {
      case 'orgName':
        if (!value.trim()) error = 'Organization Name is required';
        break;
      case 'fullName':
        if (!value.trim()) error = 'Full Name is required';
        break;
      case 'email':
        if (!value) {
          error = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          error = 'Invalid email format';
        } else {
          const domain = value.split('@')[1]?.toLowerCase();
          if (domain && BLOCKED_DOMAINS.includes(domain)) {
            error = 'Please use your company email address (no free domains)';
          }
        }
        break;
      case 'phone':
        if (!value) error = 'Phone Number is required';
        else if (value.replace(/\D/g,'').length < 10) error = 'Please enter a valid phone number';
        break;
      case 'password':
        if (!value) error = 'Password is required';
        else if (value.length < 8) error = 'Password must be at least 8 characters';
        else if (!/[A-Z]/.test(value)) error = 'Must contain at least one uppercase letter';
        else if (!/[0-9]/.test(value)) error = 'Must contain at least one number';
        else if (!/[^A-Za-z0-9]/.test(value)) error = 'Must contain at least one special character';
        break;
      case 'confirmPassword':
        if (!value) error = 'Please confirm your password';
        else if (value !== formData.password) error = 'Passwords do not match';
        break;
      default:
        break;
    }
    return error;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Real-time validation for touched fields
    if (touched[name] || value.length > 0) {
      setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
    }
    
    // Special case: update confirm password error when password changes
    if (name === 'password' && touched.confirmPassword) {
      setErrors(prev => ({ 
        ...prev, 
        confirmPassword: formData.confirmPassword && value !== formData.confirmPassword ? 'Passwords do not match' : '' 
      }));
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const isFormValid = () => {
    const newErrors = {};
    let isValid = true;
    Object.keys(formData).forEach(key => {
      const error = validateField(key, formData[key]);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    });
    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Mark all as touched
    setTouched(Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
    
    if (!isFormValid()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form before submitting.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            organization_name: formData.orgName,
            phone_number: formData.phone,
            role: 'owner',
            user_role: 'org_admin',
            organization_status: 'PENDING_VERIFICATION' // Passed as metadata for trigger to use
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Account Created Successfully!",
        description: "We've sent a confirmation email to verify your account.",
        duration: 6000,
        className: "bg-green-600 border-green-700 text-white"
      });
      
      // Redirect to confirmation page instead of login
      navigate('/auth/confirm', { state: { email: formData.email } });

    } catch (error) {
      console.error('Signup Error:', error);
      toast({
        title: "Registration Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Create Organization Account - Petrolord</title>
        <meta name="description" content="Register as an Organization Admin for Petrolord Suite." />
      </Helmet>

      <div className="min-h-screen flex flex-col lg:flex-row bg-slate-950 font-sans text-slate-100">
        
        {/* Left Side - Form */}
        <div className="w-full lg:w-1/2 flex flex-col p-6 lg:p-12 relative overflow-y-auto h-full min-h-screen order-2 lg:order-1">
          {/* Nav */}
          <Link 
            to="/" 
            className="inline-flex items-center text-slate-400 hover:text-[#FCD34D] transition-colors mb-8 w-fit group"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </Link>

          <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
            
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3 tracking-tight">
                Create Your Organization Account
              </h1>
              <p className="text-slate-400 text-lg">
                Register as an Organization Admin
              </p>
            </motion.div>

            {/* Info Box */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-[#FCD34D]/5 border border-[#FCD34D]/20 rounded-xl p-5 mb-8"
            >
              <ul className="space-y-3">
                {[
                  "You are registering as an Organization Admin",
                  "You must use a valid company email address",
                  "Your organization will be verified before activation",
                  "Manage team members & billing from your dashboard"
                ].map((item, index) => (
                  <li key={index} className="flex items-start text-sm text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              
              {/* Org Name */}
              <div className="space-y-2">
                <Label htmlFor="orgName" className="text-slate-200">Organization Name <span className="text-red-400">*</span></Label>
                <div className="relative group">
                  <Building2 className="absolute left-3 top-3 w-5 h-5 text-slate-500 group-focus-within:text-[#FCD34D] transition-colors" />
                  <Input
                    id="orgName"
                    name="orgName"
                    placeholder="e.g., Acme Oil & Gas Ltd"
                    value={formData.orgName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`pl-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] h-11 transition-all ${
                      errors.orgName && touched.orgName ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                    aria-invalid={!!errors.orgName}
                    aria-describedby="orgName-error"
                  />
                </div>
                <AnimatePresence>
                  {errors.orgName && touched.orgName && (
                    <motion.p 
                      id="orgName-error"
                      initial={{opacity:0, height:0}} 
                      animate={{opacity:1, height:'auto'}} 
                      exit={{opacity:0, height:0}} 
                      className="text-red-400 text-xs flex items-center mt-1"
                    >
                      <AlertCircle className="w-3 h-3 mr-1" /> {errors.orgName}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-slate-200">Full Name <span className="text-red-400">*</span></Label>
                <div className="relative group">
                  <User className="absolute left-3 top-3 w-5 h-5 text-slate-500 group-focus-within:text-[#FCD34D] transition-colors" />
                  <Input
                    id="fullName"
                    name="fullName"
                    placeholder="e.g., John Doe"
                    value={formData.fullName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`pl-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] h-11 transition-all ${
                      errors.fullName && touched.fullName ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                  />
                </div>
                <AnimatePresence>
                  {errors.fullName && touched.fullName && (
                    <motion.p initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="text-red-400 text-xs flex items-center mt-1">
                      <AlertCircle className="w-3 h-3 mr-1" /> {errors.fullName}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-200">Company Email <span className="text-red-400">*</span></Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-500 group-focus-within:text-[#FCD34D] transition-colors" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`pl-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] h-11 transition-all ${
                      errors.email && touched.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                  />
                </div>
                <AnimatePresence>
                  {errors.email && touched.email && (
                    <motion.p initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="text-red-400 text-xs flex items-center mt-1">
                      <AlertCircle className="w-3 h-3 mr-1" /> {errors.email}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-200">Phone Number <span className="text-red-400">*</span></Label>
                <div className="relative group">
                  <Phone className="absolute left-3 top-3 w-5 h-5 text-slate-500 group-focus-within:text-[#FCD34D] transition-colors" />
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={formData.phone}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`pl-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] h-11 transition-all ${
                      errors.phone && touched.phone ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                  />
                </div>
                <AnimatePresence>
                  {errors.phone && touched.phone && (
                    <motion.p initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="text-red-400 text-xs flex items-center mt-1">
                      <AlertCircle className="w-3 h-3 mr-1" /> {errors.phone}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-200">Password <span className="text-red-400">*</span></Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500 group-focus-within:text-[#FCD34D] transition-colors" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`pl-10 pr-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] h-11 transition-all ${
                      errors.password && touched.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                
                {/* Strength Indicator */}
                <div className="flex gap-1 h-1 mt-2">
                  {[1, 2, 3, 4].map((level) => (
                    <div 
                      key={level} 
                      className={`flex-1 rounded-full transition-all duration-300 ${
                        passwordStrength >= level 
                          ? passwordStrength <= 2 ? 'bg-red-500' : passwordStrength === 3 ? 'bg-yellow-500' : 'bg-green-500' 
                          : 'bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex justify-between items-center">
                  <span>Min 8 chars, uppercase, number, special char</span>
                  {passwordStrength > 0 && (
                    <span className={`font-medium ${
                      passwordStrength <= 2 ? 'text-red-400' : passwordStrength === 3 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {passwordStrength <= 2 ? 'Weak' : passwordStrength === 3 ? 'Medium' : 'Strong'}
                    </span>
                  )}
                </div>
                <AnimatePresence>
                  {errors.password && touched.password && (
                    <motion.p initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="text-red-400 text-xs flex items-center mt-1">
                      <AlertCircle className="w-3 h-3 mr-1" /> {errors.password}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-200">Confirm Password <span className="text-red-400">*</span></Label>
                <div className="relative group">
                  <ShieldCheck className="absolute left-3 top-3 w-5 h-5 text-slate-500 group-focus-within:text-[#FCD34D] transition-colors" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`pl-10 pr-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] h-11 transition-all ${
                      errors.confirmPassword && touched.confirmPassword ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-slate-500 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <AnimatePresence>
                  {errors.confirmPassword && touched.confirmPassword && (
                    <motion.p initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="text-red-400 text-xs flex items-center mt-1">
                      <XCircle className="w-3 h-3 mr-1" /> {errors.confirmPassword}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                disabled={loading} 
                className="w-full bg-[#FCD34D] hover:bg-yellow-500 text-slate-900 font-bold h-12 text-base shadow-lg shadow-yellow-500/10 hover:shadow-yellow-500/20 transition-all duration-300 mt-6"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Organization Account'
                )}
              </Button>

              <p className="text-center text-slate-400 text-sm mt-6">
                Already have an account?{' '}
                <Link to="/login" className="text-[#FCD34D] hover:text-yellow-400 font-medium hover:underline transition-colors">
                  Login here
                </Link>
              </p>

            </form>
          </div>
        </div>

        {/* Right Side - Image */}
        <div className="hidden lg:block w-1/2 relative bg-slate-900 order-1 lg:order-2 h-full min-h-screen">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1629787155650-9ce3697dcb38')] bg-cover bg-center"></div>
          {/* Overlays for better text contrast */}
          <div className="absolute inset-0 bg-slate-950/40 mix-blend-multiply"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-transparent to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>
          
          <div className="absolute bottom-16 left-12 right-12 z-10">
            <motion.blockquote 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="border-l-4 border-[#FCD34D] pl-6 py-2 backdrop-blur-sm bg-slate-900/30 rounded-r-lg p-4"
            >
              <p className="text-2xl font-light text-white italic mb-4 leading-relaxed">
                "The digital transformation of our operations has been seamless. The enterprise suite provides exactly the control and oversight we needed."
              </p>
              <footer className="text-slate-200 font-medium flex items-center gap-2">
                <span className="w-8 h-[1px] bg-[#FCD34D]"></span>
                Enterprise Partner
              </footer>
            </motion.blockquote>
          </div>
        </div>

      </div>
    </>
  );
};

export default Signup;