import { useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateTender, useListCategories } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  X,
  Briefcase,
  DollarSign,
  CalendarDays,
  Tag,
  ShieldX,
} from "lucide-react";

const formSchema = z.object({
  title: z.string().min(10, "Title must be at least 10 characters").max(120, "Title is too long"),
  description: z
    .string()
    .min(30, "Description must be at least 30 characters")
    .max(2000, "Description is too long"),
  budget: z
    .number({ invalid_type_error: "Please enter a valid budget" })
    .positive("Budget must be greater than 0")
    .max(1_000_000, "Budget exceeds maximum"),
  categoryId: z.number({ invalid_type_error: "Please select a category" }),
  deadline: z.string().optional(),
  skills: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

function SkillTagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().replace(/,+$/, "").trim();
    if (tag && !value.includes(tag) && value.length < 10) {
      onChange([...value, tag]);
    }
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div
      className="min-h-[44px] flex flex-wrap gap-1.5 items-center p-2 border rounded-md bg-background cursor-text focus-within:ring-1 focus-within:ring-ring"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="flex items-center gap-1 text-xs font-medium pr-1"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:text-destructive transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {value.length < 10 && (
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input); }}
          placeholder={value.length === 0 ? "e.g. React, Node.js, TypeScript..." : ""}
          className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}

export default function TenderNew() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: categoriesData } = useListCategories();
  const categories = categoriesData ?? [];

  const createMutation = useCreateTender();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      budget: undefined,
      categoryId: undefined,
      deadline: "",
      skills: [],
    },
  });

  // RBAC — freelancers cannot post tenders
  if (user?.role === "freelancer") {
    return (
      <Layout>
        <div className="container mx-auto max-w-xl px-4 py-24 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10 mb-6">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-extrabold mb-3">Buyers Only</h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Posting tenders is reserved for client accounts. Freelancers can browse open
            projects and submit proposals instead.
          </p>
          <div className="flex gap-3 justify-center">
            <Button asChild variant="outline">
              <Link href="/tenders">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Browse Projects
              </Link>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link href="/catalog">Explore Gigs</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  function onSubmit(values: FormValues) {
    const payload = {
      title: values.title,
      description: values.description,
      budget: values.budget,
      categoryId: values.categoryId,
      skills: values.skills ?? [],
      ...(values.deadline ? { deadline: new Date(values.deadline).toISOString() } : {}),
    };

    createMutation.mutate(
      { data: payload },
      {
        onSuccess: (created) => {
          toast({
            title: "Tender posted!",
            description: `"${created.title}" is now live on the Exchange.`,
          });
          setLocation("/tenders");
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Failed to post tender",
            description: "Please check your details and try again.",
          });
        },
      }
    );
  }

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto max-w-3xl px-4 py-10">
          <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground mb-4 -ml-2">
            <Link href="/tenders">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Exchange
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground p-2.5 rounded-xl">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Post a Tender</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Describe your project and let qualified freelancers reach out.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Project Title</FormLabel>
                  <FormDescription>
                    Write a clear, specific headline that sums up what you need.
                  </FormDescription>
                  <FormControl>
                    <Input
                      placeholder="e.g. Build a responsive e-commerce storefront in React"
                      {...field}
                      className="h-11"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Detailed Description</FormLabel>
                  <FormDescription>
                    Explain the scope, goals, and any technical requirements. More detail attracts
                    better proposals.
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Describe your project in detail: what you need, what success looks like, any constraints or preferences..."
                      {...field}
                      rows={7}
                      className="resize-none leading-relaxed"
                    />
                  </FormControl>
                  <div className="flex justify-between items-center">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {field.value?.length ?? 0}/2000
                    </span>
                  </div>
                </FormItem>
              )}
            />

            {/* Budget + Category row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Budget (USD)</FormLabel>
                    <FormDescription>Your total project budget.</FormDescription>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          placeholder="500"
                          className="h-11 pl-9"
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v === "" ? undefined : parseFloat(v));
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Category</FormLabel>
                    <FormDescription>Which domain does this project fall under?</FormDescription>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                      value={field.value != null ? String(field.value) : undefined}
                    >
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={String(cat.id)}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Skills */}
            <Controller
              control={form.control}
              name="skills"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold flex items-center gap-2">
                    <Tag className="h-4 w-4" /> Required Skills
                    <span className="text-muted-foreground font-normal text-sm">(optional)</span>
                  </FormLabel>
                  <FormDescription>
                    Press Enter or comma after each skill. Up to 10 tags.
                  </FormDescription>
                  <FormControl>
                    <SkillTagsInput
                      value={field.value ?? []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Deadline */}
            <FormField
              control={form.control}
              name="deadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" /> Deadline
                    <span className="text-muted-foreground font-normal text-sm">(optional)</span>
                  </FormLabel>
                  <FormDescription>
                    When do you need the project completed by?
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                      className="h-11 w-full sm:w-60"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Preview card */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Summary
              </p>
              <p className="font-semibold text-foreground line-clamp-1">
                {form.watch("title") || <span className="text-muted-foreground italic">Your project title</span>}
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {form.watch("budget") ? (
                  <span className="text-accent font-bold text-base">
                    ${form.watch("budget").toLocaleString()}
                  </span>
                ) : (
                  <span>Budget: —</span>
                )}
                {form.watch("categoryId") && categories.length > 0 && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary rounded-sm">
                    {categories.find((c) => c.id === form.watch("categoryId"))?.name}
                  </Badge>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-4 pt-2 border-t">
              <Button type="button" variant="ghost" asChild>
                <Link href="/tenders">Cancel</Link>
              </Button>
              <Button
                type="submit"
                className="px-10 h-11 font-bold bg-primary hover:bg-primary/90"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Posting…
                  </>
                ) : (
                  "Post Tender"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
