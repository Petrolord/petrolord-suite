import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';

const BookDemoModal = ({ isOpen, onClose }) => {
  const { 
    register, 
    handleSubmit, 
    reset, 
    formState: { errors, isValid } 
  } = useForm({
    mode: 'onChange' // Enable real-time validation
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    
    try {
      // Call the Edge Function
      const { data: responseData, error: funcError } = await supabase.functions.invoke('send-demo-request', {
        body: {
          full_name: data.full_name,
          email: data.email,
          company_name: data.company_name,
          message: data.message
        }
      });

      if (funcError) throw funcError;
      
      // Check for application-level errors returned by the function
      if (responseData && responseData.success === false) {
        throw new Error(responseData.message || "Unknown error occurred");
      }

      toast({
        title: "Demo Request Received!",
        description: "We'll be in touch shortly (within 24 hours) to schedule your demo.",
        duration: 5000,
        className: "bg-green-600 text-white border-green-700"
      });
      
      reset();
      onClose();

    } catch (error) {
      console.error('BookDemoModal: Submission error', error);
      toast({
        title: "Submission Failed",
        description: error.message || "There was an error sending your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && onClose(open)}>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-slate-800 text-slate-100 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white tracking-tight">Book a Demo</DialogTitle>
          <DialogDescription className="text-slate-400">
            See how Petrolord Suite can transform your operations. Fill out the form below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-4">
          <div className="grid gap-5">
            {/* Full Name */}
            <div className="grid gap-2">
              <Label htmlFor="full_name" className="text-slate-200">Full Name <span className="text-red-400">*</span></Label>
              <div className="relative">
                <Input
                  id="full_name"
                  className={`bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] transition-all ${errors.full_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="John Doe"
                  disabled={isSubmitting}
                  {...register("full_name", { 
                    required: "Full Name is required",
                    minLength: { value: 2, message: "Name must be at least 2 characters" }
                  })}
                />
              </div>
              {errors.full_name && (
                <span className="text-red-400 text-xs flex items-center mt-1">
                  <AlertCircle className="w-3 h-3 mr-1" /> {errors.full_name.message}
                </span>
              )}
            </div>
            
            {/* Email */}
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-slate-200">Work Email <span className="text-red-400">*</span></Label>
              <Input
                id="email"
                type="email"
                className={`bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] transition-all ${errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="john@company.com"
                disabled={isSubmitting}
                {...register("email", { 
                  required: "Email is required",
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: "Invalid email address"
                  }
                })}
              />
              {errors.email && (
                <span className="text-red-400 text-xs flex items-center mt-1">
                  <AlertCircle className="w-3 h-3 mr-1" /> {errors.email.message}
                </span>
              )}
            </div>

            {/* Company */}
            <div className="grid gap-2">
              <Label htmlFor="company_name" className="text-slate-200">Company Name <span className="text-red-400">*</span></Label>
              <Input
                id="company_name"
                className={`bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] transition-all ${errors.company_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Acme Energy Inc."
                disabled={isSubmitting}
                {...register("company_name", { 
                  required: "Company Name is required",
                  minLength: { value: 2, message: "Company name must be at least 2 characters" }
                })}
              />
              {errors.company_name && (
                <span className="text-red-400 text-xs flex items-center mt-1">
                  <AlertCircle className="w-3 h-3 mr-1" /> {errors.company_name.message}
                </span>
              )}
            </div>

            {/* Message */}
            <div className="grid gap-2">
              <Label htmlFor="message" className="text-slate-200">Message (Optional)</Label>
              <Textarea
                id="message"
                className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-600 focus:border-[#FCD34D] focus:ring-1 focus:ring-[#FCD34D] min-h-[100px] resize-none transition-all"
                placeholder="Tell us about your specific needs..."
                disabled={isSubmitting}
                {...register("message", {
                  maxLength: { value: 500, message: "Message cannot exceed 500 characters" }
                })}
              />
              {errors.message && (
                <span className="text-red-400 text-xs flex items-center mt-1">
                  <AlertCircle className="w-3 h-3 mr-1" /> {errors.message.message}
                </span>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onClose(false)}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-[#FCD34D] text-slate-900 hover:bg-[#fbbf24] font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isSubmitting || !isValid}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Request Demo'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BookDemoModal;