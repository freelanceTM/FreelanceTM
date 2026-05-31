import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister, type UserProfile } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Briefcase, ArrowLeft, Loader2, User, UserCircle } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["buyer", "freelancer"] as const, { required_error: "Please select a role" }),
});

export default function Register() {
  const [, setLocation] = useLocation();
  const { login: setAuthUser } = useAuth();
  const { toast } = useToast();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      role: "buyer",
    },
  });

  const registerMutation = useRegister();

  function onSubmit(values: z.infer<typeof formSchema>) {
    registerMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setAuthUser(data.user);
          toast({
            title: "Account created!",
            description: "Welcome to FreelanceTM.",
          });
          setLocation("/catalog");
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Registration failed",
            description: "An error occurred during registration. Please try again.",
          });
          console.error(error);
          
          // Fallback mock login for development if API fails
          if (import.meta.env.DEV) {
            console.log("Using fallback mock register");
            const mockUser: UserProfile = {
              id: Math.floor(Math.random() * 1000),
              email: values.email,
              username: values.username,
              role: values.role,
              displayName: values.username,
              skills: []
            };
            setAuthUser(mockUser);
            setLocation("/catalog");
          }
        },
      }
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="absolute top-4 left-4 sm:top-8 sm:left-8">
        <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to home
          </Link>
        </Button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8 mt-8">
        <div className="inline-flex bg-primary text-primary-foreground p-3 rounded-xl mb-4 shadow-lg shadow-primary/20">
          <Briefcase className="h-8 w-8" />
        </div>
        <h2 className="text-3xl font-extrabold text-foreground tracking-tight">Create an account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent hover:text-accent/80 transition-colors">
            Log in
          </Link>
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md mb-12">
        <div className="bg-card py-8 px-4 shadow-xl shadow-black/5 sm:rounded-2xl sm:px-10 border border-border/60">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>I want to join as a...</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-2 gap-4"
                      >
                        <FormItem>
                          <FormControl>
                            <RadioGroupItem value="buyer" className="sr-only" />
                          </FormControl>
                          <FormLabel 
                            className={cn(
                              "flex flex-col items-center justify-center p-4 border-2 rounded-xl cursor-pointer hover:bg-muted/50 transition-all",
                              field.value === "buyer" ? "border-primary bg-primary/5 shadow-sm" : "border-muted"
                            )}
                          >
                            <User className={cn("h-6 w-6 mb-2", field.value === "buyer" ? "text-primary" : "text-muted-foreground")} />
                            <span className="font-semibold">Client / Buyer</span>
                            <span className="text-xs text-muted-foreground mt-1 text-center font-normal">I need to hire talent</span>
                          </FormLabel>
                        </FormItem>
                        
                        <FormItem>
                          <FormControl>
                            <RadioGroupItem value="freelancer" className="sr-only" />
                          </FormControl>
                          <FormLabel 
                            className={cn(
                              "flex flex-col items-center justify-center p-4 border-2 rounded-xl cursor-pointer hover:bg-muted/50 transition-all",
                              field.value === "freelancer" ? "border-primary bg-primary/5 shadow-sm" : "border-muted"
                            )}
                          >
                            <UserCircle className={cn("h-6 w-6 mb-2", field.value === "freelancer" ? "text-primary" : "text-muted-foreground")} />
                            <span className="font-semibold">Freelancer</span>
                            <span className="text-xs text-muted-foreground mt-1 text-center font-normal">I want to offer services</span>
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 pt-4 border-t">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="johndoe" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input placeholder="name@example.com" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 text-base font-bold bg-primary hover:bg-primary/90 mt-2" 
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</>
                ) : (
                  "Create Account"
                )}
              </Button>
              
              <p className="text-xs text-center text-muted-foreground px-4">
                By joining, you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
