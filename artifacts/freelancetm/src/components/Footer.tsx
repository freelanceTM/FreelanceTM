import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t bg-card text-card-foreground">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              FreelanceTM
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The no-nonsense marketplace for professionals. Fast, efficient, and reliable freelance services.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Categories</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/catalog" className="hover:text-primary transition-colors">Web Development</Link></li>
              <li><Link href="/catalog" className="hover:text-primary transition-colors">Design & UI/UX</Link></li>
              <li><Link href="/catalog" className="hover:text-primary transition-colors">Digital Marketing</Link></li>
              <li><Link href="/catalog" className="hover:text-primary transition-colors">Writing & Translation</Link></li>
              <li><Link href="/catalog" className="hover:text-primary transition-colors">Video & Animation</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/tenders" className="hover:text-primary transition-colors">Browse Tenders</Link></li>
              <li><Link href="/catalog" className="hover:text-primary transition-colors">Browse Gigs</Link></li>
              <li><Link href="/login" className="hover:text-primary transition-colors">Log In</Link></li>
              <li><Link href="/register" className="hover:text-primary transition-colors">Sign Up</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Refund Policy</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} FreelanceTM. All rights reserved.</p>
          <div className="flex gap-4">
            <span>Built with precision.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
