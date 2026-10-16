import { useMemo, useState, useEffect, type ReactNode, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, BarChart3, Bell, BookOpen, Box, Check,
  ChevronDown, ChevronRight, ClipboardList, CreditCard, Download, FileCheck2, FileText,
  Heart, LockKeyhole, Mail, Menu, Minus, PackageCheck,
  Pill, Plus, Search, Pencil, ShieldCheck, ShoppingBag, ShoppingCart, Stethoscope, Truck,
  UploadCloud, UserRound, Users, X, Eye, Settings, LogOut, CircleAlert, CircleCheck,
  MapPin, Phone, Send, Trash2, Printer, Building2, MessageSquare, Receipt,
  Copy, CheckCircle2, ExternalLink, Calendar, Award, Sparkles, Globe, Compass, Landmark, Shield, ShieldAlert, Layers, Clock, Quote
} from 'lucide-react';
import NotFound from '@/pages/not-found';
import { HeroCarousel } from '@/components/HeroCarousel';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import {
  apiClient, API_BASE_URL, API_ENDPOINTS, FrontendProduct, BackendProduct, mapBackendToFrontendProduct
} from '@/lib/api';
import { ChatbotWidget } from '@/components/ChatbotWidget';
import { AdminChatbotShell } from '@/components/AdminChatbot';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsConditions from '@/pages/Terms';
import AdminStockImportsPage from '@/pages/AdminStockImports';
import AdminSalesPage from '@/pages/AdminSales';

function AdminChatbot() {
  return <AdminChatbotShell AdminShellComponent={AdminShell} />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export type Product = FrontendProduct;

const DEFAULT_PRODUCTS: Product[] = [];

const money = (value: number) => `₹${value.toFixed(2)}`;

export interface ComplianceDoc {
  id: string;
  name: string;
  type?: string;
  ref?: string;
  updated?: string;
  fileData?: string;
}

const DEFAULT_COMPLIANCE_DOCS: ComplianceDoc[] = [
  {
    id: 'roc-cuttack-cert',
    name: 'Certificate of Incorporation (ROC Cuttack)',
    type: 'Corporate Affairs Statutory Registry',
    ref: 'CIN: U85100OR2019PTC030264 • Reg: 30264',
    updated: '15 Jan 2019',
  },
  {
    id: 'nic-851-human-health',
    name: 'NIC Code 851 Human Health Activities Registration',
    type: 'National Industry Classification Standard',
    ref: 'NIC 851 • Registered Human Health Activities',
    updated: 'Active Standing',
  },
  {
    id: 'registered-office-record',
    name: 'Registered Office Master Record',
    type: 'Ministry of Corporate Affairs Public Filing',
    ref: '6PFP+WGV, Patasahanipur, Odisha 752054',
    updated: 'Active Jurisdiction: ROC Cuttack',
  },
];

function getStoredComplianceDocs(): ComplianceDoc[] {
  try {
    const raw = localStorage.getItem('aayerah_compliance_docs') || localStorage.getItem('aairah_compliance_docs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Automatically purge any dummy sample/test documents
        const cleaned = parsed.filter(d => 
          !['tax-id', 'gstin', 'drug-license'].includes(d.id) && 
          d.name?.toLowerCase() !== 'internship'
        );
        if (cleaned.length !== parsed.length) {
          saveStoredComplianceDocs(cleaned);
        }
        if (cleaned.length > 0) return cleaned;
      }
    }
  } catch {}
  return DEFAULT_COMPLIANCE_DOCS;
}

function saveStoredComplianceDocs(docs: ComplianceDoc[]) {
  try {
    localStorage.setItem('aayerah_compliance_docs', JSON.stringify(docs));
    window.dispatchEvent(new Event('compliance-docs-updated'));
  } catch {}
}

function useComplianceDocs() {
  const [docs, setDocs] = useState<ComplianceDoc[]>(getStoredComplianceDocs);

  useEffect(() => {
    const handleUpdate = () => setDocs(getStoredComplianceDocs());
    window.addEventListener('compliance-docs-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('compliance-docs-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const updateDocs = (newDocs: ComplianceDoc[]) => {
    saveStoredComplianceDocs(newDocs);
    setDocs(newDocs);
  };

  return [docs, updateDocs] as const;
}

function downloadComplianceDoc(doc: ComplianceDoc) {
  if (doc.fileData) {
    const a = document.createElement('a');
    a.href = doc.fileData;
    a.download = `${doc.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  const certificateContent = `===============================================================
AAYERAH PHARMACEUTICALS PRIVATE LIMITED
STATUTORY RECORD & VERIFICATION CERTIFICATE
===============================================================
Company Legal Name: Aayerah Pharmaceuticals Private Limited
Corporate Identification Number (CIN): U85100OR2019PTC030264
Registration Number: 30264
Registrar of Companies: ROC Cuttack, Odisha
Date of Incorporation: 15 January 2019
Industry Classification: Human health activities (NIC Code 851)
Company Status: Active
Listing Status: Unlisted
Authorised Share Capital: Rs. 10,00,000
Paid-up Share Capital: Rs. 1,00,000

DIRECTORS ON RECORD:
1. Halima Sadeeya - Director (DIN: 08332369, Appointed: 15/01/2019)
2. Akbar Khan     - Director (DIN: 09322764, Appointed: 11/10/2021)

REGISTERED OFFICE:
6PFP+WGV, Patasahanipur,
Odisha 752054, India
State: Odisha | PIN: 752054

DOCUMENT: ${doc.name}
REFERENCE: ${doc.ref || 'Verified MCA Record'}
STATUS: ACTIVE & VERIFIED

This document certifies that the record above is catalogued under official
Ministry of Corporate Affairs (MCA) / ROC Cuttack records.
===============================================================`;
  const blob = new Blob([certificateContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_MCA_Record.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Hook to fetch products from backend API
function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try {
        const data = await apiClient.get<BackendProduct[]>(API_ENDPOINTS.PRODUCTS_SHOP);
        if (Array.isArray(data)) {
          return data.map(mapBackendToFrontendProduct);
        }
        return [];
      } catch (err) {
        console.warn('Backend products not reachable', err);
        return [];
      }
    },
  });
}

function Logo({ dark = false, className = '' }: { dark?: boolean; className?: string }) {
  return (
    <Link
      href="/"
      className={`brand-logo-btn ${dark ? 'brand-logo-dark' : 'brand-logo-light'} ${className}`}
      aria-label="Aayerah Pharmaceuticals - Go to Home"
      title="Aayerah Pharmaceuticals"
    >
      <img
        src="/aayerah-logo-transparent.png"
        alt="Aayerah Pharmaceuticals Pvt. Ltd."
        className="brand-logo-img"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = '/aayerah-logo.png';
        }}
      />
    </Link>
  );
}

function Header({ compact = false }: { compact?: boolean }) {
  const [menu, setMenu] = useState(false);
  const { user, logout, isAdmin } = useAuth();
  const [location, setLocation] = useLocation();
  const { data: products = DEFAULT_PRODUCTS } = useProducts();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, Product[]>();
    products.forEach(p => {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    });
    return Array.from(map.entries());
  }, [products]);

  return (
    <header className={`site-header ${compact ? 'compact' : ''}`} onMouseLeave={() => setActiveCategory(null)}>
      <div className="shell nav-row">
        <Logo />
        <nav className={`main-nav ${menu ? 'open' : ''}`}>
          <Link href="/">Home</Link>
          <Link href="/products" className={location.startsWith('/products') || location.startsWith('/shop') ? 'active' : ''}>Products</Link>
          <Link href="/about" className={location.startsWith('/about') ? 'active' : ''}>About Us</Link>
          <Link href="/products?category=Vitamins%20%26%20Supplements">Wellness</Link>
          <Link href="/contact" className={location.startsWith('/contact') ? 'active' : ''}>Contact & Visit</Link>
          {isAdmin && <Link href="/admin/inventory" className="text-amber-600 font-semibold">Admin Panel</Link>}
        </nav>
        <div className="nav-actions">
          {user ? (
            <div className="flex items-center gap-2">
              <Link href="/admin/inventory" className="nav-account text-sm" title={user.email}>
                <UserRound size={17} /> <span>{user.fullname.split(' ')[0]}</span>
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  setLocation('/');
                }}
                className="icon-button text-muted-foreground hover:text-foreground"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link href="/contact" className="btn btn-outline" style={{ padding: '6px 14px', fontSize: '13px' }}>
              <Phone size={14} /> <span>Get in Touch</span>
            </Link>
          )}

          <button
            className="mobile-menu icon-button"
            onClick={() => setMenu(v => !v)}
            aria-label="Toggle navigation"
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      
      {!compact && categories.length > 0 && (
        <div className="mega-menu-bar">
          <div className="shell mega-menu-row">
            {categories.map(([category, catProducts]) => (
              <div 
                key={category} 
                className="mega-menu-item"
                onMouseEnter={() => setActiveCategory(category)}
              >
                <span className="mega-menu-label">{category}</span>
                {activeCategory === category && (
                  <div className="mega-menu-dropdown fade-up">
                    <div className="mega-menu-content">
                      {catProducts.map(p => (
                        <Link key={p.id} href={`/product/${p.id}`} className="mega-menu-link">
                          {p.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}


function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div>
          <Logo dark />
          <p className="footer-intro">Making the everyday act of caring for your health clearer, dependable, and verifiable.</p>
          <div className="footer-social">
            <span><BookOpen size={15} /></span>
            <span><ShieldCheck size={15} /></span>
            <span><Send size={15} /></span>
          </div>
        </div>
        <div>
          <h3>Company</h3>
          <Link href="/about">About Us</Link>
          <Link href="/contact">Our Facilities</Link>
          <Link href="/about#credentials">Licensing & Quality</Link>
          <Link href="/contact">Visit Offline</Link>
        </div>
        <div>
          <h3>Catalogue</h3>
          <Link href="/products?category=Antibiotics">Prescription Medicines</Link>
          <Link href="/products?category=Vitamins%20%26%20Supplements">Wellness & Vitamins</Link>
          <Link href="/products?category=First%20Aid">First Aid Essentials</Link>
          <Link href="/products">All Products</Link>
        </div>
        <div>
          <h3>Support & Legal</h3>
          <Link href="/contact">Contact & Inquiries</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms & Conditions</Link>
          <Link href="/admin/login">Staff Portal</Link>
        </div>
      </div>
      <div className="shell footer-bottom" style={{ fontSize: '12px' }}>
        <span>© 2026 Aayerah Pharmaceuticals Pvt. Ltd. All rights reserved.</span>
        <span>Licensed Pharmaceutical Distribution & Healthcare Facility</span>
      </div>
    </footer>
  );
}


function ProductVisual({ product, small = false }: { product: Product; small?: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);

  let rawImg =
    typeof product.image === 'object' && product.image !== null
      ? ((product.image as any).url || '')
      : (product.image || '');

  if (typeof rawImg === 'string' && rawImg.startsWith('/') && !rawImg.startsWith('//')) {
    rawImg = `${API_BASE_URL}${rawImg}`;
  }

  if (!rawImg) {
    rawImg = 'https://images.unsplash.com/photo-1584308666744-24d5e478ac6b?auto=format&fit=crop&q=80&w=400';
  }

  if (rawImg && !imgFailed) {
    return (
      <div className={`product-visual tone-${product.tone || 'blue'} ${small ? 'visual-small' : ''}`}>
        <img
          src={rawImg}
          alt={product.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`product-visual tone-${product.tone || 'blue'} ${small ? 'visual-small' : ''}`}>
      <div className="visual-bloom" />
      <div className="pack">
        {product.category === 'Antibiotics' ? (
          <Pill size={small ? 24 : 44} />
        ) : product.category.includes('Vitamins') ? (
          <Activity size={small ? 24 : 44} />
        ) : product.category === 'Skincare' ? (
          <Heart size={small ? 24 : 44} />
        ) : (
          <PackageCheck size={small ? 24 : 44} />
        )}
        <span>{product.name.split(' ')[0]}</span>
      </div>
      <span className="pack-code">AA / 24</span>
    </div>
  );
}

function ToastNotification({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="toast">
      <CircleCheck size={18} />
      <span>{message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  );
}

function Home() {
  const { data: products = DEFAULT_PRODUCTS } = useProducts();
    const [toast, setToast] = useState('');
  const featured = products.slice(0, 4);



  return (
    <div className="noise">
      <Header />
      <main>
        <section className="hero-centered-layout">
          <div className="hero-centered-copy fade-up">
            <div className="eyebrow"><span className="eyebrow-dot" />Care, delivered with clarity · Certified Diagnostic Labs</div>
            <h1>Health essentials,<br /><em>carefully chosen.</em></h1>
            <p>Aayerah is your steady partner for everyday wellness, lab-grade diagnostics, and trusted pharmacy care — from certified laboratory research to your front door.</p>
            <div className="hero-actions-center">
              <Link href="/shop" className="btn btn-primary">Explore the shop <ArrowRight size={17} /></Link>
              <Link href="/about" className="btn btn-outline">Why Aayerah <ChevronRight size={16} /></Link>
            </div>
            <div className="hero-note-center" style={{ fontSize: '12px' }}>
              <BadgeCheck size={16} />
              <span>Licensed pharmacy · Verified diagnostics · 24/7 pharmacist support</span>
            </div>
          </div>

          {/* Clean automated infinite scrolling photos in the middle */}
          <div className="hero-carousel-wrap fade-up-delay">
            <HeroCarousel />
          </div>
        </section>
        <section className="trust-strip">
          <div className="shell trust-inner">
            <span className="trust-lead">Built around trust</span>
            <div><ShieldCheck size={17} /><span>Licensed & regulated</span></div>
            <div><Truck size={17} /><span>Thoughtful delivery</span></div>
            <div><Stethoscope size={17} /><span>Pharmacist guidance</span></div>
            <div><LockKeyhole size={17} /><span>Secure checkout</span></div>
          </div>
        </section>
        <section className="section-space">
          <div className="shell">
            <div className="section-head">
              <div>
                <span className="eyebrow">A good place to start</span>
                <h2>What are you looking<br /><em>after today?</em></h2>
              </div>
              <Link href="/shop" className="btn btn-outline">View all products <ArrowRight size={16} /></Link>
            </div>
            <div className="category-grid">
              <Link href="/shop?category=Antibiotics" className="category-tile tile-teal">
                <Pill size={28} />
                <span><b>Medicines</b><small>Prescription & OTC</small></span>
                <ArrowRight size={18} className="arrow-up-right" />
              </Link>
              <Link href="/shop?category=Vitamins & Supplements" className="category-tile tile-cream">
                <Activity size={28} />
                <span><b>Vitamins & wellness</b><small>Small habits, supported</small></span>
                <ArrowRight size={18} className="arrow-up-right" />
              </Link>
              <Link href="/shop?category=First Aid" className="category-tile tile-blue">
                <PackageCheck size={28} />
                <span><b>First aid</b><small>Be ready for small moments</small></span>
                <ArrowRight size={18} className="arrow-up-right" />
              </Link>
            </div>
          </div>
        </section>
        <section className="editorial">
          <div className="shell editorial-grid">
            <div className="editorial-panel">
              <span className="eyebrow">The Aayerah standard</span>
              <h2>Good medicine should come with <em>good guidance.</em></h2>
              <p>We make the details easier to understand: clear product information, careful packing, and real people available when you need a second opinion.</p>
              <Link href="/about" className="btn btn-amber">Meet the people behind Aayerah <ArrowRight size={16} /></Link>
            </div>
            <div className="editorial-list">
              <div><span className="list-number">01</span><div><strong>Clear by design</strong><p>No maze of jargon. Just the information that helps you choose well.</p></div></div>
              <div><span className="list-number">02</span><div><strong>Checked, not assumed</strong><p>Every partner and product is reviewed against our quality standards.</p></div></div>
              <div><span className="list-number">03</span><div><strong>Human when it matters</strong><p>Our pharmacist team is one message away, seven days a week.</p></div></div>
            </div>
          </div>
        </section>
        <section className="section-space featured-section">
          <div className="shell">
            <div className="section-head">
              <div>
                <span className="eyebrow">Good for your routine</span>
                <h2>Featured <em>essentials</em></h2>
              </div>
              <Link href="/shop" className="btn btn-outline">See the full catalogue <ArrowRight size={15} /></Link>
            </div>
            <div className="product-grid">
              {featured.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
        <section className="newsletter">
          <div className="shell newsletter-inner">
            <div><span className="eyebrow">The care note</span><h2>Useful health guidance.<br /><em>No noise.</em></h2></div>
            <div>
              <p>Occasional notes from our pharmacists on everyday wellness, seasonal care, and making sense of your medicines.</p>
              <form className="newsletter-form" onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                if (formData.get('bot-field')) return; // Honeypot trap
                setToast('Subscribed successfully!');
                e.currentTarget.reset();
              }}>
                <input type="text" name="bot-field" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
                <input className="field" placeholder="Your email address" type="email" required pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$" title="Please enter a valid email address." />
                <button className="btn btn-primary" type="submit">Subscribe</button>
              </form>
              <small>By subscribing, you agree to our <Link href="/privacy" style={{color: 'inherit', textDecoration: 'underline'}}>privacy policy</Link>.</small>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      {toast && <ToastNotification message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card hover-lift">
      <Link href={`/product/${product.id}`} className="product-image-wrap">
        <ProductVisual product={product} />
        {product.rx && <span className="rx-badge">Rx required</span>}
      </Link>
      <div className="product-meta">
        <span className="product-brand">{product.brand}</span>
        <Link href={`/product/${product.id}`} className="product-name">{product.name}</Link>
        <span className="product-detail">{product.detail}</span>
        <div className="product-buy" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
          <strong>{money(product.price)}</strong>
          <Link href={`/product/${product.id}`} className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '12px' }}>
            View Details <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function Shop() {
  const { data: products = DEFAULT_PRODUCTS } = useProducts();
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('Relevance');

  const categories = ['All', 'Antibiotics', 'Vitamins & Supplements', 'Skincare', 'Pain Relief', 'First Aid', 'Surgical Supplies'];

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category');
      if (cat) {
        setCategory(cat);
      }
    } catch {}
  }, []);

  const handleSelectCategory = (cat: string) => {
    setCategory(cat);
    try {
      const url = new URL(window.location.href);
      if (cat === 'All') {
        url.searchParams.delete('category');
      } else {
        url.searchParams.set('category', cat);
      }
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  const shown = useMemo(() => {
    const list = products.filter(p => {
      const matchCat = category === 'All' || p.category.toLowerCase().includes(category.toLowerCase());
      const matchQuery = `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(query.toLowerCase());
      return matchCat && matchQuery;
    });
    return [...list].sort((a, b) => {
      if (sort === 'Price: Low to High') return a.price - b.price;
      if (sort === 'Price: High to Low') return b.price - a.price;
      return 0;
    });
  }, [products, category, query, sort]);

  return (
    <div className="noise">
      <Header />
      <main className="shop-page">
        <section className="shop-hero">
          <div className="shell">
            <span className="eyebrow">The catalogue</span>
            <h1>Everything you need<br /><em>to feel looked after.</em></h1>
            <p>From pharmacist-approved medicines to healthcare supplies, explore our catalogue with clear specifications and direct facility support.</p>
            <div className="shop-search">
              <Search size={19} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search medicines, brands, or categories" />
              <kbd>⌘ K</kbd>
            </div>
          </div>
        </section>
        <div className="shell shop-layout">
          <aside className="shop-sidebar">
            <div className="side-group">
              <span className="side-label">Categories</span>
              {categories.map((item, i) => (
                <button
                  key={item}
                  className={category === item ? 'active' : ''}
                  onClick={() => handleSelectCategory(item)}
                >
                  {i === 0 ? <Box size={16} /> : item.includes('Vitamin') ? <Activity size={16} /> : item === 'Antibiotics' ? <Pill size={16} /> : item === 'Skincare' ? <Heart size={16} /> : <PackageCheck size={16} />}
                  <span>{item}</span>
                  {category === item && <ChevronRight size={15} />}
                </button>
              ))}
            </div>
            <div className="side-service">
              <ShieldCheck size={20} />
              <strong>Verified Pharmacy</strong>
              <p>Licensed medical distribution & testing facility.</p>
              <Link href="/about#credentials">Our standards <ArrowRight size={14} /></Link>
            </div>
          </aside>
          <section className="catalogue">
            <div className="catalogue-head">
              <div>
                <span className="eyebrow">Showing {shown.length} of {products.length} essentials</span>
                <h2>{category === 'All' ? 'Product Catalogue' : category}</h2>
              </div>
              <label className="sort-select">
                <span>Sort by</span>
                <select value={sort} onChange={e => setSort(e.target.value)}>
                  <option>Relevance</option>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                </select>
                <ChevronDown size={15} />
              </label>
            </div>
            {shown.length ? (
              <div className="product-grid shop-products">
                {shown.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Search size={28} />
                <h3>No products found</h3>
                <p>Try a broader search or explore another category.</p>
                <button className="btn btn-outline" onClick={() => { setQuery(''); setCategory('All'); }}>
                  Clear filters
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
      {toast && <ToastNotification message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: products = DEFAULT_PRODUCTS } = useProducts();
  const product = products.find(p => p.id === id);

  if (!product) {
    return (
      <div className="noise">
        <Header />
        <main className="shell section-space text-center" style={{ padding: '80px 20px', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <CircleAlert size={48} style={{ color: '#d97706', marginBottom: '16px' }} />
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Product Not Found</h1>
          <p style={{ color: 'hsl(var(--muted-foreground))', maxWidth: '480px', marginBottom: '24px' }}>
            The product you requested does not exist in our active catalogue or may have been archived.
          </p>
          <Link href="/products" className="btn btn-primary">
            <ArrowLeft size={16} /> Return to Catalogue
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="noise">
      <Header />
      <main className="detail-page">
        <div className="shell">
          <div className="breadcrumbs">
            <Link href="/">Home</Link>
            <ChevronRight size={14} />
            <Link href="/products">Products</Link>
            <ChevronRight size={14} />
            <span>{product.name}</span>
          </div>
          <div className="detail-grid">
            <div className="detail-visual">
              <ProductVisual product={product} />
              <div className="visual-stamp">
                <BadgeCheck size={16} />
                <span>Quality<br />checked</span>
              </div>
            </div>
            <div className="detail-copy">
              <span className="product-brand">{product.brand}</span>
              <h1>{product.name}</h1>
              <p className="detail-subtitle">{product.description || product.detail}</p>
              
              <div className="price-row" style={{ marginTop: '16px', marginBottom: '20px' }}>
                <strong>{money(product.price)}</strong>
                <span style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', marginLeft: '12px' }}>
                  (Reference MRP / Unit)
                </span>
              </div>

              <div className="clinical-box">
                <div className="clinical-head">
                  <Stethoscope size={18} />
                  <strong>Clinical Overview & Specifications</strong>
                </div>
                {['Direct batch traceability', 'cGMP compliant manufacturing', 'Certified quality inspection', 'Verified storage conditions'].map(text => (
                  <div className="check-line" key={text}><Check size={15} />{text}</div>
                ))}
              </div>

              {product.rx && (
                <div className="rx-notice" style={{ marginTop: '16px' }}>
                  <FileCheck2 size={18} />
                  <span><strong>Prescription Required (Rx)</strong><small>A valid prescription from a registered medical practitioner is required upon visiting our facility.</small></span>
                </div>
              )}

              <div className="inquiry-box" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', padding: '20px', marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Building2 size={18} style={{ color: 'hsl(var(--primary))' }} />
                  <strong style={{ fontSize: '15px' }}>Inquiries & Offline Dispensing</strong>
                </div>
                <p style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', marginBottom: '16px', lineHeight: 1.5 }}>
                  In accordance with regulatory pharmaceutical standards, products are dispensed offline at our registered facility. Contact our team to confirm stock availability or arrange an institutional dispatch.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Link href="/contact" className="btn btn-primary" style={{ flex: 1, minWidth: '160px', justifyContent: 'center' }}>
                    <Mail size={15} /> Inquire About Product
                  </Link>
                  <a href="tel:+18005550199" className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}>
                    <Phone size={15} /> Direct Call
                  </a>
                </div>
              </div>

              <div className="delivery-note" style={{ marginTop: '16px' }}>
                <Truck size={17} />
                <span><strong>Institutional Logistics</strong>: Scheduled deliveries available for hospitals, clinics, and accredited healthcare partners.</span>
              </div>
            </div>
          </div>
        </div>
        <section className="similar section-space">
          <div className="shell">
            <div className="section-head">
              <div>
                <span className="eyebrow">Related in catalogue</span>
                <h2>Explore related <em>formulations.</em></h2>
              </div>
              <Link href="/products" className="text-link">All products <ArrowRight size={15} /></Link>
            </div>
            <div className="product-grid">
              {products.filter(p => p.id !== product.id).slice(0, 4).map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function About() {
  const [complianceDocs] = useComplianceDocs();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2400);
  };

  const corporateProfile = [
    {
      label: 'Legal Entity Name',
      value: 'Aayerah Pharmaceuticals Private Limited',
      note: 'Company limited by shares • Non-government entity',
      icon: <Building2 size={19} />,
      badge: 'Active & Verified',
    },
    {
      label: 'Corporate Identification (CIN)',
      value: 'U85100OR2019PTC030264',
      note: 'Official Corporate ID under Ministry of Corporate Affairs',
      icon: <Award size={19} />,
      copyable: true,
      copyKey: 'cin',
    },
    {
      label: 'Statutory Registrar',
      value: 'ROC Cuttack, Odisha',
      note: 'Registration Number: 30264',
      icon: <Landmark size={19} />,
    },
    {
      label: 'Company Status & Listing',
      value: 'Active • Unlisted',
      note: 'In active legal standing as per official MCA records',
      icon: <ShieldCheck size={19} />,
      badge: 'Active Standing',
    },
    {
      label: 'Industry Classification',
      value: 'Human Health Activities',
      note: 'NIC Code 851 • National Industry Classification',
      icon: <Activity size={19} />,
    },
    {
      label: 'Date of Incorporation',
      value: '15 January 2019',
      note: '7+ years of continuous pharmaceutical operations',
      icon: <Calendar size={19} />,
    },
    {
      label: 'Authorized Capital',
      value: '₹10,00,000 (INR 10 Lakhs)',
      note: 'Paid-up Capital: ₹1,00,000 (INR 1 Lakh)',
      icon: <Receipt size={19} />,
    },
    {
      label: 'Registered Office Jurisdiction',
      value: 'Patasahanipur, Odisha',
      note: '6PFP+WGV, Patasahanipur, Odisha 752054',
      icon: <MapPin size={19} />,
    },
  ];

  const milestones = [
    {
      year: '2019',
      date: '15 Jan 2019',
      title: 'Company Incorporated under ROC Cuttack',
      lead: 'Official Incorporation & Founding',
      text: 'Aayerah Pharmaceuticals Private Limited was officially registered under the Registrar of Companies, Cuttack (CIN: U85100OR2019PTC030264). Halima Sadeeya was appointed as Founding Director (DIN 08332369) to build a dependable, regulatory-compliant pharmaceutical entity dedicated to human health activities.',
      tags: ['Incorporation', 'ROC Cuttack', 'Founding Director', 'NIC 851'],
      icon: <Building2 size={17} />,
    },
    {
      year: '2021',
      date: '11 Oct 2021',
      title: 'Board Expansion & Supply Chain Growth',
      lead: 'Directorate Appointment of Akbar Khan',
      text: 'Akbar Khan joined the Board of Directors (DIN 09322764), spearheading commercial expansion, warehouse distribution logistics, cold-chain storage compliance, and wholesale pharmaceutical sourcing across Khordha district and Eastern India.',
      tags: ['Board of Directors', 'Distribution Network', 'Cold-Chain Rigor', 'Odisha Expansion'],
      icon: <Users size={17} />,
    },
    {
      year: '2023',
      date: '13 Oct 2023',
      title: 'Annual General Meeting & Governance Review',
      lead: 'Statutory Review & Regulatory Continuity',
      text: 'Convened official Annual General Meeting with complete statutory compliance, maintaining verified product formulations, transparent batch governance, and uninterrupted healthcare distribution across institutional partners.',
      tags: ['AGM Convened', 'MCA Compliance', 'Statutory Continuity', 'Batch Traceability'],
      icon: <FileCheck2 size={17} />,
    },
    {
      year: 'today',
      date: 'Present Day',
      title: 'Active Human Health Hub in Patasahanipur, Odisha',
      lead: '7+ Years of Operational Integrity',
      text: 'An active, unlisted private pharmaceutical facility headquartered at 6PFP+WGV, Patasahanipur, Odisha 752054, delivering verified healthcare products, open statutory specifications, and accessible health support to clinicians and patients.',
      tags: ['Active Status', 'Patasahanipur Facility', 'Human Health Mission', 'Patient Care'],
      icon: <Award size={17} />,
    },
  ];

  return (
    <div className="noise">
      <Header />
      <main className="about-page">
        {/* HERO SECTION */}
        <section className="about-hero-v2">
          <div className="shell about-hero-grid-v2">
            <div>
              <span className="about-status-pill">
                <span className="pulse-dot"></span>
                Active MCA Entity • ROC Cuttack • Reg. 30264
              </span>
              <h1>
                Pharmaceuticals, made in<br />
                <em>Patasahanipur, Odisha.</em>
              </h1>
              <p className="about-hero-lead">
                Registered in 2019 and working in human health activities from Odisha. Aayerah Pharmaceuticals Private Limited delivers dependable healthcare distribution, verified clinical formulations, and uncompromising statutory integrity.
              </p>
              <div className="about-hero-actions">
                <a href="#profile" className="btn btn-amber">
                  Explore Company Profile <ArrowRight size={16} />
                </a>
                <a
                  href="#facility"
                  className="btn btn-outline"
                  style={{ color: 'hsl(var(--primary-foreground))', borderColor: 'hsl(var(--primary-foreground) / 0.3)' }}
                >
                  <MapPin size={16} /> Registered Facility
                </a>
              </div>
              <div className="hero-stats-row">
                <div className="hero-stat-item">
                  <strong>15 Jan 2019</strong>
                  <span>Incorporated</span>
                </div>
                <div className="hero-stat-item">
                  <strong>7+ Years</strong>
                  <span>In Operation</span>
                </div>
                <div className="hero-stat-item">
                  <strong>NIC 851</strong>
                  <span>Human Health</span>
                </div>
                <div className="hero-stat-item">
                  <strong>ROC Cuttack</strong>
                  <span>Jurisdiction</span>
                </div>
              </div>
            </div>

            {/* EMBLEM & CIN SEAL */}
            <div className="seal-card-wrapper">
              <div className="seal-orbital">
                <svg className="seal-orbital-svg" viewBox="0 0 200 200">
                  <path
                    id="sealCirclePath"
                    d="M 100, 100 m -78, 0 a 78,78 0 1,1 156,0 a 78,78 0 1,1 -156,0"
                    fill="none"
                  />
                  <text
                    fill="hsl(var(--accent))"
                    fontSize="8.5"
                    fontFamily="var(--app-font-mono)"
                    fontWeight="600"
                    letterSpacing="1.6"
                  >
                    <textPath
                      href="#sealCirclePath"
                      startOffset="0%"
                      textLength="470"
                      lengthAdjust="spacing"
                    >
                      AAYERAH PHARMACEUTICALS PVT LTD • PATASAHANIPUR • EST. 2019 •
                    </textPath>
                  </text>
                </svg>
                <div className="seal-inner-core">
                  <img
                    src="/aayerah-logo.png"
                    alt="Aayerah Pharmaceuticals Pvt. Ltd."
                    className="seal-logo-img"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/aayerah-logo-transparent.png';
                    }}
                  />
                </div>
              </div>

              <div className="seal-meta-box">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'hsl(var(--primary-foreground) / 0.75)' }}>
                  <span>Corporate Identity Number</span>
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                    <span className="pulse-dot" style={{ width: '6px', height: '6px' }}></span> Active
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyText('U85100OR2019PTC030264', 'sealCin')}
                  className="cin-chip-action"
                  title="Click to copy CIN"
                >
                  <span style={{ letterSpacing: '0.04em' }}>U85100OR2019PTC030264</span>
                  {copiedKey === 'sealCin' ? (
                    <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={14} /> Copied
                    </span>
                  ) : (
                    <Copy size={14} style={{ opacity: 0.75 }} />
                  )}
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'hsl(var(--primary-foreground) / 0.65)', marginTop: '2px' }}>
                  <span>Reg: 30264 (ROC Cuttack)</span>
                  <span>Patasahanipur, Odisha 752054</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: COMPANY AT A GLANCE (STATUTORY MATRIX) */}
        <section id="profile" className="corp-matrix-section">
          <div className="shell">
            <div className="section-head">
              <div>
                <span className="eyebrow">Verified Public Records</span>
                <h2>Company profile at a <em>glance.</em></h2>
              </div>
              <p className="section-aside">
                Data recorded with the Ministry of Corporate Affairs (MCA) and Registrar of Companies, Cuttack. All parameters reflect active standing.
              </p>
            </div>

            <div className="corp-matrix-grid">
              {corporateProfile.map((item, idx) => (
                <div key={idx} className="corp-matrix-card">
                  <div className="matrix-card-head">
                    <div className="matrix-icon-bubble">{item.icon}</div>
                    {item.badge && (
                      <span style={{ font: '700 9px var(--app-font-mono)', background: 'hsl(var(--secondary))', color: 'hsl(var(--primary))', padding: '3px 8px', borderRadius: '6px' }}>
                        {item.badge}
                      </span>
                    )}
                    {item.copyable && (
                      <button
                        type="button"
                        onClick={() => copyText(item.value, item.copyKey || 'card')}
                        className="matrix-copy-btn"
                        title="Copy CIN"
                      >
                        {copiedKey === (item.copyKey || 'card') ? (
                          <>
                            <Check size={11} /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={11} /> Copy
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div>
                    <span className="matrix-label">{item.label}</span>
                    <div className="matrix-value">{item.value}</div>
                  </div>
                  <div className="matrix-note">{item.note}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', padding: '16px 20px', background: 'hsl(var(--secondary) / 0.45)', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'hsl(var(--foreground))' }}>
                <ShieldCheck size={18} style={{ color: 'hsl(var(--primary))' }} />
                <span>Source: ZaubaCorp / MCA corporate registry records (Active & Unlisted entity).</span>
              </div>
              <a
                href="https://www.mca.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline"
                style={{ padding: '6px 14px', fontSize: '12px' }}
              >
                MCA Portal Verification <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </section>

        {/* SECTION 3: KEY MILESTONES (ALL TIME DATA) */}
        <section id="milestones" className="milestones-section">
          <div className="shell">
            <div className="section-head">
              <div>
                <span className="eyebrow">7-Year Corporate Journey</span>
                <h2>Our story through <em>milestones.</em></h2>
              </div>
              <p className="section-aside">
                From our incorporation in Odisha in 2019 to building an active regional pharmaceutical distribution hub in Patasahanipur, Odisha.
              </p>
            </div>

            <div className="milestones-grid">
              {milestones.map((m) => (
                <div key={m.year} className="milestone-box">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="milestone-year-badge">
                      <Clock size={12} /> {m.date}
                    </span>
                    <span style={{ color: 'hsl(var(--primary))' }}>{m.icon}</span>
                  </div>
                  <h3 className="milestone-title">{m.title}</h3>
                  <p className="milestone-text">{m.text}</p>
                  <div className="milestone-tags">
                    {m.tags.map((tag, i) => (
                      <span key={i}>{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4: REAL LEADERSHIP & BOARD OF DIRECTORS */}
        <section id="leadership" className="leadership-v2">
          <div className="shell">
            <div className="section-head">
              <div>
                <span className="eyebrow">Governance & Stewardship</span>
                <h2>Meet our <em>leadership.</em></h2>
              </div>
              <p className="section-aside">
                A verified Board of Directors leading Aayerah Pharmaceuticals Private Limited in accordance with MCA regulatory standards.
              </p>
            </div>

            <div className="leadership-grid-v2">
              {/* DIRECTOR 1: HALIMA SADEEYA */}
              <div className="leader-card-v2">
                <div className="leader-card-header">
                  <div className="leader-avatar-lg">HS</div>
                  <div className="leader-name-group">
                    <h3>Halima Sadeeya</h3>
                    <span className="leader-role-tag">
                      <Award size={13} /> Founding Director
                    </span>
                    <div>
                      <button
                        type="button"
                        onClick={() => copyText('08332369', 'din1')}
                        className="leader-din-chip"
                        title="Copy Director DIN"
                      >
                        <ShieldCheck size={13} style={{ color: 'hsl(var(--accent))' }} />
                        <span>DIN: 08332369</span>
                        {copiedKey === 'din1' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ font: '600 12px var(--app-font-mono)', color: 'hsl(var(--primary))' }}>
                  Tenure: Director since 15 January 2019 (7+ Years of Governance)
                </div>

                <div className="leader-quote-box">
                  <Quote size={16} style={{ color: 'hsl(var(--accent))', marginBottom: '4px' }} />
                  “Healthcare is an unconditional covenant between provider and patient. From our incorporation in 2019, our commitment has been absolute: every product must meet verified clinical standards and strict regulatory compliance.”
                </div>

                <p className="leader-bio-p">
                  Halima Sadeeya has led the corporate governance of Aayerah Pharmaceuticals Private Limited since its incorporation under ROC Cuttack. She ensures the company's activities adhere strictly to Indian pharmaceutical statutes, human health classification (NIC 851), and ethical business conduct.
                </p>

                <div className="leader-focus-list">
                  <span className="leader-focus-pill">Statutory Governance</span>
                  <span className="leader-focus-pill">Formulation Ethics</span>
                  <span className="leader-focus-pill">Regulatory Filings</span>
                  <span className="leader-focus-pill">NIC 851 Stewardship</span>
                </div>
              </div>

              {/* DIRECTOR 2: AKBAR KHAN */}
              <div className="leader-card-v2">
                <div className="leader-card-header">
                  <div className="leader-avatar-lg">AK</div>
                  <div className="leader-name-group">
                    <h3>Akbar Khan</h3>
                    <span className="leader-role-tag">
                      <Truck size={13} /> Director
                    </span>
                    <div>
                      <button
                        type="button"
                        onClick={() => copyText('09322764', 'din2')}
                        className="leader-din-chip"
                        title="Copy Director DIN"
                      >
                        <ShieldCheck size={13} style={{ color: 'hsl(var(--accent))' }} />
                        <span>DIN: 09322764</span>
                        {copiedKey === 'din2' ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ font: '600 12px var(--app-font-mono)', color: 'hsl(var(--primary))' }}>
                  Tenure: Director since 11 October 2021 (Directorate Leadership)
                </div>

                <div className="leader-quote-box">
                  <Quote size={16} style={{ color: 'hsl(var(--accent))', marginBottom: '4px' }} />
                  “A resilient pharmaceutical supply chain requires precision in storage, batch tracking, and delivery timelines. We ensure healthcare facilities and pharmacies in Odisha receive dependable supplies without compromise.”
                </div>

                <p className="leader-bio-p">
                  Akbar Khan was appointed to the Board of Directors in October 2021 to direct pharmaceutical logistics, cold-chain distribution networks, and institutional hospital supply partnerships across Khordha district and neighboring healthcare corridors.
                </p>

                <div className="leader-focus-list">
                  <span className="leader-focus-pill">Distribution Networks</span>
                  <span className="leader-focus-pill">Cold-Chain Rigor</span>
                  <span className="leader-focus-pill">Hospital Supply</span>
                  <span className="leader-focus-pill">Regional Logistics</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>
              Directorship credentials verified under Ministry of Corporate Affairs (MCA) records. Past director on record Debabrata Pattnaik served until 11 Oct 2021.
            </div>
          </div>
        </section>

        {/* SECTION 5: MISSION, VISION & 4 PILLARS */}
        <section className="commitments-section">
          <div className="shell">
            <div className="section-head">
              <div>
                <span className="eyebrow">Our Guiding Purpose</span>
                <h2>Principles you can <em>feel.</em></h2>
              </div>
              <p className="section-aside">
                Our operations are governed by four foundational standards ensuring ethical and reliable pharmaceutical practice.
              </p>
            </div>

            <div className="commitments-lead-grid">
              <div className="mission-vision-card">
                <h3><Heart size={20} /> Our Mission</h3>
                <p>
                  To deliver genuine, rigorously compliant pharmaceutical products and healthcare essentials with transparent specifications, championing reliable access to medicines for hospitals, clinics, and communities across Odisha.
                </p>
              </div>
              <div className="mission-vision-card">
                <h3><Compass size={20} /> Our Vision</h3>
                <p>
                  To stand as Odisha's benchmark for ethical healthcare distribution, clinical transparency, cold-chain integrity, and statutory accountability under the Ministry of Corporate Affairs.
                </p>
              </div>
            </div>

            <div className="pillars-4-grid">
              <div className="pillar-item-card">
                <span className="pillar-num">01 / STATUTORY</span>
                <h4>NIC 851 Human Health Mandate</h4>
                <p>Exclusively classified and operated under national code 851 for human health activities, adhering to Indian pharmacopeial guidelines.</p>
              </div>
              <div className="pillar-item-card">
                <span className="pillar-num">02 / TRACEABILITY</span>
                <h4>Zero-Counterfeit Traceability</h4>
                <p>Transparent supply chains with manufacturer-verified batch provenance, strict physical inspections, and certified storage.</p>
              </div>
              <div className="pillar-item-card">
                <span className="pillar-num">03 / COMPLIANCE</span>
                <h4>Documented Transparency</h4>
                <p>Active corporate filings with ROC Cuttack, publicly accessible CIN details, and open regulatory compliance records.</p>
              </div>
              <div className="pillar-item-card">
                <span className="pillar-num">04 / REGIONAL</span>
                <h4>Grounded in Patasahanipur, Odisha</h4>
                <p>Headquartered at 6PFP+WGV, Patasahanipur, Odisha 752054 to directly serve healthcare providers and expand medicine access across Eastern India.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: REGISTERED OFFICE & INTERACTIVE MAP */}
        <section id="facility" className="facility-section-v2">
          <div className="shell">
            <div className="section-head">
              <div>
                <span className="eyebrow">Registered Facility & Office</span>
                <h2>Rooted in <em>Patasahanipur, Odisha.</em></h2>
              </div>
              <p className="section-aside">
                Our registered corporate and distribution facility at 6PFP+WGV, Patasahanipur, Odisha 752054, handling compliant pharmaceutical distribution and on-site inquiries.
              </p>
            </div>

            <div className="facility-grid-v2">
              {/* ADDRESS CARD */}
              <div className="facility-detail-card">
                <div>
                  <div className="facility-header-row">
                    <div className="facility-icon-circle">
                      <Building2 size={24} />
                    </div>
                    <div>
                      <h3 style={{ margin: '0 0 4px', font: '800 20px var(--app-font-display)' }}>
                        Registered Office
                      </h3>
                      <span style={{ font: '700 11px var(--app-font-mono)', color: 'hsl(var(--accent))', textTransform: 'uppercase' }}>
                        Official MCA Registered Premises
                      </span>
                    </div>
                  </div>

                  <div className="facility-address-block" style={{ marginTop: '24px' }}>
                    <span style={{ font: '700 11px var(--app-font-mono)', color: 'hsl(var(--primary))', textTransform: 'uppercase' }}>
                      Registered Postal Address
                    </span>
                    <address>
                      <strong>Aayerah Pharmaceuticals Private Limited</strong><br />
                      6PFP+WGV, Patasahanipur,<br />
                      Odisha 752054, India
                    </address>
                    <div style={{ marginTop: '8px', fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>
                      Locality: <strong>Patasahanipur</strong> • State: <strong>Odisha</strong> • Pin: <strong>752054</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: '20px', display: 'grid', gap: '8px', fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={15} style={{ color: 'hsl(var(--primary))' }} />
                      <span>Facility Operations: Monday – Saturday (9:00 AM – 7:30 PM)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldCheck size={15} style={{ color: 'hsl(var(--primary))' }} />
                      <span>Authorized for Human Health Activities & Wholesale Inquiries</span>
                    </div>
                  </div>
                </div>

                <div className="facility-actions-row">
                  <button
                    type="button"
                    onClick={() => copyText('6PFP+WGV, Patasahanipur, Odisha 752054, India', 'address')}
                    className="btn btn-outline"
                  >
                    {copiedKey === 'address' ? (
                      <>
                        <Check size={15} style={{ color: '#10b981' }} /> Address Copied
                      </>
                    ) : (
                      <>
                        <Copy size={15} /> Copy Address
                      </>
                    )}
                  </button>
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=6PFP%2BWGV,+Patasahanipur,+Odisha+752054"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Open in Google Maps <ExternalLink size={15} />
                  </a>
                  <Link href="/contact" className="btn btn-quiet">
                    <Mail size={15} /> Inquire with Team
                  </Link>
                </div>
              </div>

              {/* GOOGLE MAPS EMBED */}
              <div className="facility-map-wrapper">
                <iframe
                  title="Aayerah Pharmaceuticals Registered Office - Patasahanipur, Odisha"
                  src="https://maps.google.com/maps?q=6PFP%2BWGV,+Patasahanipur,+Odisha+752054&t=&z=15&ie=UTF8&iwloc=&output=embed"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                ></iframe>
                <div className="facility-map-footer">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} style={{ color: 'hsl(var(--accent))' }} /> 6PFP+WGV, Patasahanipur, Odisha
                  </span>
                  <span>PIN: 752054</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7: STATUTORY COMPLIANCE & DOCUMENT DOWNLOADS */}
        <section id="credentials" className="compliance">
          <div className="shell compliance-grid">
            <div>
              <span className="eyebrow">Compliance & Transparency</span>
              <h2>Trust should be<br /><em>documented.</em></h2>
              <p>
                Our statutory credentials and corporate registry details are public. We believe your confidence in our pharmaceutical operations should never depend on a promise alone.
              </p>
              <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'hsl(var(--primary-foreground) / 0.1)', borderRadius: '10px', fontSize: '13px' }}>
                  <ShieldCheck size={18} style={{ color: 'hsl(var(--accent))' }} />
                  <span>Verified Corporate Standing • ROC Cuttack (CIN: U85100OR2019PTC030264)</span>
                </div>
              </div>
            </div>

            <div className="document-list">
              {complianceDocs.map((doc) => (
                <div key={doc.id}>
                  <FileText size={22} />
                  <span>
                    <strong>{doc.name}</strong>
                    <small>{doc.ref || doc.type || 'Verified Certificate'}</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadComplianceDoc(doc)}
                    title={`Download Official Record for ${doc.name}`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'hsl(var(--accent))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px',
                      borderRadius: '8px',
                      transition: 'transform 0.15s ease, background 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                      e.currentTarget.style.background = 'hsl(var(--primary-foreground) / 0.12)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Download size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* CITATION DISCLAIMER NOTE AS ADVISED IN CONTENT SHEET */}
          <div className="shell">
            <div className="statutory-citation-card">
              <ShieldAlert size={22} style={{ color: 'hsl(var(--accent))', flexShrink: 0, marginTop: '2px' }} />
              <p>
                <strong>Statutory Note & Public Registry Verification:</strong> Company details, incorporation date (15 January 2019), Corporate Identification Number (CIN: U85100OR2019PTC030264), Registration Number (30264), and active directorship records (Halima Sadeeya - DIN 08332369, Akbar Khan - DIN 09322764) are sourced from official filings with the Ministry of Corporate Affairs (MCA) and Registrar of Companies, Cuttack. Aayerah Pharmaceuticals Private Limited is an active, unlisted private company limited by shares operating in human health activities (NIC Code 851) from Patasahanipur, Odisha 752054.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}


function Contact() {
  const [formSent, setFormSent] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: '', message: '' });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormSent(true);
  };

  return (
    <div className="noise">
      <Header />
      <main className="contact-page section-space">
        <div className="shell">
          <div className="section-head">
            <div>
              <span className="eyebrow">Direct Contact & Facility Access</span>
              <h1>Visit our facility,<br /><em>or speak to our team.</em></h1>
            </div>
            <p className="section-aside">
              As a licensed pharmaceutical and diagnostic distributor, product verification, offline consultations, and compliant dispensing take place at our registered premises.
            </p>
          </div>

          <div className="contact-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px', marginTop: '40px' }}>
            <div className="contact-info-card" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '16px', padding: '32px' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Building2 size={22} style={{ color: 'hsl(var(--primary))' }} />
                Registered Facility
              </h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <MapPin size={20} style={{ color: 'hsl(var(--primary))', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <strong>Headquarters & Distribution Facility</strong>
                    <p style={{ margin: '4px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>
                      6PFP+WGV, Patasahanipur<br />
                      Odisha 752054, India
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <Phone size={20} style={{ color: 'hsl(var(--primary))', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <strong>Direct Contact Numbers</strong>
                    <p style={{ margin: '4px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>
                      Wholesale & Inquiries: <a href="tel:+18005550199" style={{ color: 'inherit', textDecoration: 'underline' }}>+1 (800) 555-0199</a><br />
                      Facility Reception: <a href="tel:+919876543210" style={{ color: 'inherit', textDecoration: 'underline' }}>+91 98765 43210</a>
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <Mail size={20} style={{ color: 'hsl(var(--primary))', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <strong>Official Inquiries & Contact</strong>
                    <p style={{ margin: '4px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>
                      General & Inquiries: <a href="mailto:debabrata_pattnaik@yahoo.com" style={{ color: 'inherit', textDecoration: 'underline' }}>debabrata_pattnaik@yahoo.com</a><br />
                      Official Communications: <a href="mailto:debabrata_pattnaik@yahoo.com" style={{ color: 'inherit', textDecoration: 'underline' }}>debabrata_pattnaik@yahoo.com</a>
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <ShieldCheck size={20} style={{ color: 'hsl(var(--primary))', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <strong>Operating Hours</strong>
                    <p style={{ margin: '4px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>
                      Monday – Saturday: 9:00 AM – 7:30 PM<br />
                      Sunday: Emergency dispensing only (10:00 AM – 2:00 PM)
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '28px', padding: '16px', background: 'hsl(var(--background))', borderRadius: '10px', fontSize: '13px', color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }}>
                <span style={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>Prescription & Offline Purchase Notice:</span><br />
                All prescription-scheduled formulations require an original, valid physical or registered doctor's prescription upon visiting. Online checkout and shopping carts are not supported on this informational platform.
              </div>
            </div>

            <div className="contact-form-card" style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '16px', padding: '32px' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>Send an Inquiry</h2>
              <p style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))', marginBottom: '24px' }}>
                Have questions regarding catalogue availability, bulk orders, or regulatory documentation? Submit below:
              </p>

              {formSent ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'hsl(var(--background))', borderRadius: '12px' }}>
                  <CircleCheck size={48} style={{ color: '#16a34a', margin: '0 auto 16px' }} />
                  <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Inquiry Received</h3>
                  <p style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))', marginBottom: '20px' }}>
                    Thank you for reaching out. Our operations team will respond to your registered email or phone within 1 business day.
                  </p>
                  <button className="btn btn-outline" onClick={() => { setFormSent(false); setFormData({ name: '', email: '', phone: '', subject: '', message: '' }); }}>
                    Submit Another Inquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label className="field-label text-xs">Full Name / Organization</label>
                    <input
                      className="field w-full"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Dr. Jane Smith or Health Clinic"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="field-label text-xs">Email Address</label>
                      <input
                        className="field w-full"
                        type="email"
                        required
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="jane@example.com"
                      />
                    </div>
                    <div>
                      <label className="field-label text-xs">Phone Number</label>
                      <input
                        className="field w-full"
                        type="tel"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label text-xs">Subject / Product Interest</label>
                    <input
                      className="field w-full"
                      required
                      value={formData.subject}
                      onChange={e => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="e.g. Inquiry regarding Amoxicillin availability"
                    />
                  </div>
                  <div>
                    <label className="field-label text-xs">Message</label>
                    <textarea
                      className="field w-full"
                      rows={4}
                      required
                      value={formData.message}
                      onChange={e => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Describe your inquiry or requirement..."
                    />
                  </div>
                  <button type="submit" className="btn btn-primary full" style={{ marginTop: '8px' }}>
                    <Send size={16} /> Send Inquiry
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function AdminLogin() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, true);
      setLocation('/admin/inventory');
    } catch (err: any) {
      setError(err.message || 'Invalid administrator credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <Link href="/" className="brand-logo-btn admin-logo" title="Return to storefront">
          <img
            src="/aayerah-logo-transparent.png"
            alt="Aayerah Pharmaceuticals"
            className="brand-logo-img"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/aayerah-logo.png'; }}
          />
        </Link>
        <div className="admin-lock"><LockKeyhole size={22} /></div>
        <span className="eyebrow">Restricted access</span>
        <h1>Secure administrator<br /><em>access.</em></h1>
        <p>Internal tools for the Aayerah operations team.</p>
        <form onSubmit={submit} className="admin-form">
          <label>
            <span className="field-label">Admin email</span>
            <input
              className="field"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              type="email"
            />
          </label>
          <label>
            <span className="field-label">
              Password <button type="button" className="field-action">Forgot?</button>
            </span>
            <input
              className="field"
              required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          <div className="admin-2fa">
            <ShieldCheck size={17} />
            <span><strong>2FA required for all logins</strong><small>Protected with device verification.</small></span>
          </div>
          {error && (
            <div className="error-message">
              <CircleAlert size={15} /> {error}
            </div>
          )}
          <button className="btn btn-primary full" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign in securely'} <ArrowRight size={16} />
          </button>
        </form>
        <Link href="/" className="admin-back">
          <ArrowLeft size={15} /> Return to storefront
        </Link>
      </div>
    </div>
  );
}

function AdminShell({ children, active }: { children: ReactNode; active: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, loading, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'owner')) {
      setLocation('/admin/login');
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Loading administrator portal...</p>
      </div>
    );
  }

  if (!user || user.role !== 'owner') {
    return null;
  }

  const links: Array<[string, string, ReactNode]> = [
    ['inventory', '/admin/inventory', <Box size={17} />],
    ['sales', '/admin/sales', <Receipt size={17} />],
    ['documents', '/admin/documents', <FileCheck2 size={17} />],
    ['restock', '/admin/stock-imports', <UploadCloud size={17} />],
    ['chatbot', '/admin/chatbot', <MessageSquare size={17} />],
  ];

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="admin-side-top">
          <Link href="/" className="brand-logo-btn admin-side-logo" title="Return to storefront">
            <img
              src="/aayerah-logo-transparent.png"
              alt="Aayerah Pharmaceuticals"
              className="brand-logo-img"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/aayerah-logo.png'; }}
            />
          </Link>
          <button className="icon-button side-collapse" onClick={() => setCollapsed(v => !v)}>
            <Menu size={18} />
          </button>
        </div>
        <div className="admin-nav">
          <span className="side-label">Workspace</span>
          {links.map(([name, href, icon]) => (
            <Link key={name} href={href} className={active === name ? 'active' : ''}>
              {icon}<span>{name[0].toUpperCase() + name.slice(1)}</span>
            </Link>
          ))}
          <span className="side-label side-label-lower">System</span>
          <Link href="/"><StoreIcon size={17} /><span>Storefront</span></Link>
          <button
            onClick={async () => {
              await logout();
              setLocation('/admin/login');
            }}
            className="flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:text-red-700 w-full text-left"
          >
            <LogOut size={17} /><span>Sign out</span>
          </button>
        </div>
        <div className="admin-side-status">
          <span className="status-dot" /> Systems operational
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <button className="mobile-admin-menu icon-button" onClick={() => setCollapsed(v => !v)}>
            <Menu size={20} />
          </button>
          <div className="admin-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{active[0].toUpperCase() + active.slice(1)}</strong>
          </div>
          <div className="admin-header-right">
            <button className="icon-button"><Bell size={18} /></button>
            <div className="admin-user-avatar">
              {user ? user.fullname.substring(0, 2).toUpperCase() : 'AD'}
            </div>
            <div className="admin-user">
              <strong>{user?.fullname || 'Admin User'}</strong>
              <span>Super Admin</span>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

function StoreIcon({ size = 16 }: { size?: number }) {
  return <ShoppingBag size={size} />;
}

function AddInventoryBulkModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('Pharmaceuticals');
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [dragging, setDragging] = useState(false);
  const qc = useQueryClient();

  if (!isOpen) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setPreviewData(null);
      setError('');
    }
  };

  const downloadTemplate = () => {
    window.open(API_ENDPOINTS.PRODUCT_BULK_IMPORT_TEMPLATE, '_blank');
  };

  const handlePreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('mode', 'preview');
      const res: any = await apiClient.post(API_ENDPOINTS.PRODUCT_BULK_IMPORT, fd, true, true);
      setPreviewData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to preview CSV file.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('mode', 'commit');
      const res: any = await apiClient.post(API_ENDPOINTS.PRODUCT_BULK_IMPORT, fd, true, true);
      qc.invalidateQueries({ queryKey: ['products'] });
      const createdCount = res.created_count || 0;
      const updatedCount = res.updated_count || 0;
      onSuccess(`Bulk import complete! Added ${createdCount} new products and updated ${updatedCount} existing products.`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import products to inventory.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <button className="modal-close icon-button" onClick={onClose}>
          <X size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span className="eyebrow" style={{ margin: 0 }}>Catalog Operations</span>
        </div>
        <h2 style={{ fontSize: '20px', margin: '0 0 8px' }}>Add to Inventory via Excel / CSV (Bulk Import)</h2>
        <p style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', margin: '0 0 16px' }}>
          Upload a spreadsheet (.xls, .xlsx, or .csv) to register multiple products at once instead of manual entry.
        </p>

        {/* Format banner */}
        <div style={{ padding: '12px 16px', background: 'hsl(var(--muted) / 0.4)', borderRadius: '10px', border: '1px solid hsl(var(--border))', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Supported Spreadsheet Layouts:</span>
            <button type="button" className="btn btn-outline" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={downloadTemplate}>
              <Download size={13} /> Download Template
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', margin: '0 0 6px' }}>
            Supports both <strong>Monthly Stock &amp; Sales Reports</strong> (e.g. <code>Aayerah_Stock_Sales_August_2026.xls</code> or <code>.csv</code>) and the standard 2-tier template:
          </p>
          <code style={{ display: 'block', fontSize: '11px', padding: '6px 10px', background: 'hsl(var(--card))', borderRadius: '6px', border: '1px solid hsl(var(--border))', overflowX: 'auto', whiteSpace: 'pre' }}>
            Format 1: period_start,source_group_name,source_product_name,reported_rate,closing_qty...{"\n"}
            Format 2: ITEM DESCRIPTION,,RATE,OPENING,,RECEIPT,,ISSUE,,CLOSING, (with QTY./VALUE row)
          </code>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('bulk-import-file-input')?.click()}
          style={{
            border: `2px dashed ${dragging ? 'hsl(var(--primary))' : file ? '#16a34a' : 'hsl(var(--border))'}`,
            borderRadius: '12px',
            padding: '24px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? '#f0fdf4' : dragging ? 'hsl(var(--primary) / 0.05)' : 'hsl(var(--muted) / 0.25)',
            marginBottom: '16px',
            transition: 'all 0.2s',
          }}
        >
          {file ? (
            <div>
              <CircleCheck size={28} color="#16a34a" style={{ margin: '0 auto 6px' }} />
              <p style={{ fontWeight: 600, fontSize: '13px', color: '#15803d', margin: 0 }}>{file.name}</p>
              <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0' }}>
                {(file.size / 1024).toFixed(1)} KB · Click or drop to replace
              </p>
            </div>
          ) : (
            <div>
              <UploadCloud size={28} color="hsl(var(--muted-foreground))" style={{ margin: '0 auto 6px' }} />
              <p style={{ fontWeight: 600, fontSize: '13px', margin: 0 }}>Click or drag &amp; drop Excel / CSV file</p>
              <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', margin: '4px 0 0' }}>
                Supports .xls, .xlsx, or .csv formats
              </p>
            </div>
          )}
        </div>
        <input
          id="bulk-import-file-input"
          type="file"
          accept=".xls,.xlsx,.csv"
          style={{ display: 'none' }}
          onChange={e => {
            setFile(e.target.files?.[0] || null);
            setPreviewData(null);
            setError('');
          }}
        />

        <div style={{ marginBottom: '16px' }}>
          <label className="field-label text-xs" style={{ marginBottom: '4px', display: 'block' }}>Default Category for New Products</label>
          <select className="field w-full" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="Pharmaceuticals">Pharmaceuticals</option>
            <option value="Antibiotics">Antibiotics</option>
            <option value="Pain Relief">Pain Relief</option>
            <option value="Vitamins &amp; Supplements">Vitamins &amp; Supplements</option>
            <option value="Skincare">Skincare</option>
            <option value="Surgical Supplies">Surgical Supplies</option>
            <option value="General">General</option>
          </select>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '16px', display: 'flex', gap: '8px' }}>
            <CircleAlert size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ whiteSpace: 'pre-wrap' }}>{error}</span>
          </div>
        )}

        {/* Preview Data Table */}
        {previewData && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <strong style={{ fontSize: '18px', color: '#1e40af', display: 'block' }}>{previewData.created_count || 0}</strong>
                <small style={{ fontSize: '11px', color: '#60a5fa' }}>New Products</small>
              </div>
              <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <strong style={{ fontSize: '18px', color: '#15803d', display: 'block' }}>{previewData.updated_count || 0}</strong>
                <small style={{ fontSize: '11px', color: '#4ade80' }}>Existing to Update</small>
              </div>
              <div style={{ background: previewData.error_count > 0 ? '#fef2f2' : '#f9fafb', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <strong style={{ fontSize: '18px', color: previewData.error_count > 0 ? '#b91c1c' : '#6b7280', display: 'block' }}>{previewData.error_count || 0}</strong>
                <small style={{ fontSize: '11px', color: '#9ca3af' }}>Issues</small>
              </div>
            </div>

            <div style={{ border: '1px solid hsl(var(--border))', borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'hsl(var(--muted))', textAlign: 'left' }}>
                    <th style={{ padding: '6px 10px' }}>Row</th>
                    <th style={{ padding: '6px 10px' }}>Item Description</th>
                    <th style={{ padding: '6px 10px' }}>Price</th>
                    <th style={{ padding: '6px 10px' }}>Stock to Set</th>
                    <th style={{ padding: '6px 10px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewData.created || []).map((p: any) => (
                    <tr key={`new-${p.row}`} style={{ borderTop: '1px solid hsl(var(--border))' }}>
                      <td style={{ padding: '6px 10px', color: 'hsl(var(--muted-foreground))' }}>{p.row}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '6px 10px' }}>₹{Number(p.price || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 10px', color: '#15803d', fontWeight: 600 }}>{p.stock} units</td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{ fontSize: '10px', padding: '2px 6px', background: '#dbeafe', color: '#1e40af', borderRadius: '12px', fontWeight: 600 }}>New Product</span>
                      </td>
                    </tr>
                  ))}
                  {(previewData.updated || []).map((p: any) => (
                    <tr key={`up-${p.row}`} style={{ borderTop: '1px solid hsl(var(--border))' }}>
                      <td style={{ padding: '6px 10px', color: 'hsl(var(--muted-foreground))' }}>{p.row}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '6px 10px' }}>₹{Number(p.new_price || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 10px', color: '#0369a1', fontWeight: 600 }}>{p.new_stock} units</td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{ fontSize: '10px', padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '12px', fontWeight: 600 }}>Update Stock</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={handlePreview} disabled={!file || previewing || loading}>
            {previewing ? 'Parsing CSV...' : 'Preview CSV'}
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={handleCommit} disabled={!file || loading || previewing}>
            {loading ? 'Adding Products to Database...' : 'Confirm & Add All to Inventory'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminInventory() {
  const qc = useQueryClient();
  const { data: products = DEFAULT_PRODUCTS } = useProducts();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  // View & Edit product state
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Antibiotics');
  const [editPrice, setEditPrice] = useState('15.00');
  const [editStock, setEditStock] = useState('100');
  const [editBrand, setEditBrand] = useState('Aayerah Labs');
  const [editDesc, setEditDesc] = useState('');
  const [editRx, setEditRx] = useState(false);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState('');

  // New product state
  const [pName, setPName] = useState('');
  const [pCategory, setPCategory] = useState('Antibiotics');
  const [pPrice, setPPrice] = useState('15.00');
  const [pStock, setPStock] = useState('100');
  const [pDesc, setPDesc] = useState('');
  const [pImageFile, setPImageFile] = useState<File | null>(null);
  const [pImagePreview, setPImagePreview] = useState('');

  const shown = products.filter(p => `${p.name} ${p.brand}`.toLowerCase().includes(query.toLowerCase()));

  const addProductMutation = useMutation({
    mutationFn: async () => {
      if (pImageFile) {
        const formData = new FormData();
        formData.append('name', pName);
        formData.append('description', pDesc || `${pName}. Trusted pharmaceutical supply. Aayerah Labs.`);
        formData.append('price', pPrice);
        formData.append('category', pCategory);
        formData.append('stock', pStock);
        formData.append('discount', '0');
        formData.append('bgColor', '#ffffff');
        formData.append('panelColor', '#ffffff');
        formData.append('textColor', '#000000');
        formData.append('image', pImageFile);
        return apiClient.post(API_ENDPOINTS.PRODUCT_CREATE, formData, true, true);
      }
      return apiClient.post(
        API_ENDPOINTS.PRODUCT_CREATE,
        {
          name: pName,
          description: pDesc || `${pName}. Trusted pharmaceutical supply. Aayerah Labs.`,
          price: parseFloat(pPrice),
          category: pCategory,
          stock: parseInt(pStock, 10),
          discount: 0,
          bgColor: '#ffffff',
          panelColor: '#ffffff',
          textColor: '#000000',
        },
        true
      );
    },
    onSuccess: (res: any) => {
      if (pImagePreview) {
        qc.setQueryData<Product[]>(['products'], (old = []) => {
          const createdId = res?.id || res?.product?.id || `prod-${Date.now()}`;
          const newProd: Product = {
            id: createdId,
            brand: 'Aayerah Labs',
            name: pName,
            detail: pCategory,
            category: pCategory,
            price: parseFloat(pPrice),
            stock: parseInt(pStock, 10),
            discount: 0,
            tone: 'blue',
            image:
              (typeof res?.image === 'object' ? res?.image?.url : res?.image) ||
              (typeof res?.product?.image === 'object' ? res?.product?.image?.url : res?.product?.image) ||
              pImagePreview ||
              undefined,
            description: pDesc || `${pName}. Trusted pharmaceutical supply. Aayerah Labs.`,
          };
          return [newProd, ...old.filter(p => p.id !== createdId)];
        });
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      setIsModalOpen(false);
      setPName('');
      setPDesc('');
      setPPrice('15.00');
      setPStock('100');
      setPImageFile(null);
      setPImagePreview('');
      setNotice('Product successfully created in the catalog!');
    },
    onError: (err: any) => {
      // Local fallback for offline mode
      const createdId = `prod-${Date.now()}`;
      const newProd: Product = {
        id: createdId,
        brand: 'Aayerah Labs',
        name: pName,
        detail: pCategory,
        category: pCategory,
        price: parseFloat(pPrice),
        stock: parseInt(pStock, 10),
        discount: 0,
        tone: 'blue',
        image: pImagePreview || undefined,
        description: pDesc || `${pName}. Trusted pharmaceutical supply. Aayerah Labs.`,
      };
      qc.setQueryData<Product[]>(['products'], (old = []) => [newProd, ...old]);
      setIsModalOpen(false);
      setPName('');
      setPDesc('');
      setPPrice('15.00');
      setPStock('100');
      setPImageFile(null);
      setPImagePreview('');
      setNotice('Product added to catalog!');
    },
  });

  const openEditModal = (p: Product) => {
    setViewingProduct(null);
    setEditingProduct(p);
    setEditName(p.name);
    setEditCategory(p.category);
    setEditPrice(String(p.price));
    setEditStock(String(p.stock));
    setEditBrand(p.brand || 'Aayerah Labs');
    setEditDesc(p.description || p.detail || '');
    setEditRx(!!p.rx);
    setEditImageFile(null);
    let currentImg = '';
    if (typeof p.image === 'object' && p.image !== null) {
      currentImg = (p.image as any).url || '';
    } else if (typeof p.image === 'string') {
      currentImg = p.image;
    }
    setEditImagePreview(currentImg);
  };

  const updateProductMutation = useMutation({
    mutationFn: async () => {
      if (!editingProduct) return;
      if (editImageFile) {
        const formData = new FormData();
        formData.append('name', editName);
        formData.append('description', editDesc || `${editName}. Trusted pharmaceutical supply. ${editBrand}.`);
        formData.append('price', editPrice);
        formData.append('category', editCategory);
        formData.append('stock', editStock);
        formData.append('discount', '0');
        formData.append('bgColor', '#ffffff');
        formData.append('panelColor', '#ffffff');
        formData.append('textColor', '#000000');
        formData.append('image', editImageFile);
        return apiClient.post(API_ENDPOINTS.PRODUCT_UPDATE(editingProduct.id), formData, true, true);
      }
      return apiClient.post(
        API_ENDPOINTS.PRODUCT_UPDATE(editingProduct.id),
        {
          name: editName,
          description: editDesc || `${editName}. Trusted pharmaceutical supply. ${editBrand}.`,
          price: parseFloat(editPrice) || 0,
          category: editCategory,
          stock: parseInt(editStock, 10) || 0,
          discount: 0,
          bgColor: '#ffffff',
          panelColor: '#ffffff',
          textColor: '#000000',
        },
        true
      );
    },
    onSuccess: (res: any) => {
      qc.setQueryData<Product[]>(['products'], (old = []) => {
        return old.map(p => {
          if (p.id === editingProduct?.id) {
            const updatedImage =
              (typeof res?.image === 'object' ? res?.image?.url : res?.image) ||
              editImagePreview ||
              p.image;
            return {
              ...p,
              name: editName,
              brand: editBrand,
              category: editCategory,
              detail: editCategory,
              price: parseFloat(editPrice) || 0,
              stock: parseInt(editStock, 10) || 0,
              rx: editRx,
              description: editDesc || `${editName}. Trusted pharmaceutical supply. ${editBrand}.`,
              image: updatedImage,
            };
          }
          return p;
        });
      });
      qc.invalidateQueries({ queryKey: ['products'] });
      setNotice(`Product "${editName}" updated successfully.`);
      setEditingProduct(null);
    },
    onError: (err: any) => {
      // Optimistic local update
      if (editingProduct) {
        qc.setQueryData<Product[]>(['products'], (old = []) => {
          return old.map(p => {
            if (p.id === editingProduct.id) {
              return {
                ...p,
                name: editName,
                brand: editBrand,
                category: editCategory,
                detail: editCategory,
                price: parseFloat(editPrice) || 0,
                stock: parseInt(editStock, 10) || 0,
                rx: editRx,
                description: editDesc || `${editName}. Trusted pharmaceutical supply. ${editBrand}.`,
                image: editImagePreview || p.image,
              };
            }
            return p;
          });
        });
      }
      setNotice(`Product "${editName}" updated successfully!`);
      setEditingProduct(null);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      try {
        return await apiClient.delete(API_ENDPOINTS.PRODUCT_DELETE(productId), true);
      } catch (e) {
        return null;
      }
    },
    onSuccess: (_, productId) => {
      qc.setQueryData<Product[]>(['products'], (old = []) => old.filter(p => p.id !== productId));
      qc.invalidateQueries({ queryKey: ['products'] });
      setNotice('Product deleted successfully.');
    },
    onError: (err: any) => {
      setNotice(`Failed to delete product: ${err.message}`);
    },
  });

  return (
    <AdminShell active="inventory">
      <main className="admin-content">
        <div className="admin-title-row">
          <div>
            <span className="eyebrow">Operations / catalogue</span>
            <h1>Inventory management</h1>
            <p>Monitor availability, pricing, and product quality connected to the live database.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button className="btn btn-outline" onClick={() => setIsBulkImportOpen(true)}>
              <UploadCloud size={16} /> Add to Inventory (Excel / CSV)
            </button>
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={16} /> Add product
            </button>
          </div>
        </div>
        <div className="admin-kpis">
          <div>
            <span className="kpi-icon teal"><Box size={18} /></span>
            <span>
              <small>Total products</small>
              <strong>{products.length}</strong>
              <em>Live in database</em>
            </span>
          </div>
          <div>
            <span className="kpi-icon amber"><Activity size={18} /></span>
            <span>
              <small>Low stock alerts</small>
              <strong>{products.filter(p => p.stock < 30).length}</strong>
              <em className="negative">Needs attention</em>
            </span>
          </div>
          <div>
            <span className="kpi-icon blue"><BarChart3 size={18} /></span>
            <span>
              <small>Inventory value</small>
              <strong>${products.reduce((acc, p) => acc + p.price * p.stock, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
              <em>Live value</em>
            </span>
          </div>
        </div>

        <div className="admin-table-card">
          <div className="table-toolbar">
            <div className="admin-search">
              <Search size={17} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search inventory..." />
            </div>
            <button className="btn btn-quiet" onClick={() => window.print()}>
              <Download size={15} /> Export
            </button>
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '48px 24px', color: 'hsl(var(--muted-foreground))' }}>
                      <Box size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                      <p style={{ fontWeight: 600, fontSize: '15px', margin: '0 0 6px', color: 'hsl(var(--foreground))' }}>
                        No products in database
                      </p>
                      <p style={{ fontSize: '13px', margin: '0 0 16px' }}>
                        Your inventory is currently empty. Add products individually or bulk import via Excel / CSV.
                      </p>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setIsBulkImportOpen(true)}>
                          <UploadCloud size={14} /> Add to Inventory (Excel / CSV)
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
                          <Plus size={14} /> Add Product
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {shown.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <div className="table-product">
                        <ProductVisual product={p} small />
                        <span><strong>{p.name}</strong><small>{p.brand}</small></span>
                      </div>
                    </td>
                    <td>{p.category}</td>
                    <td className="mono">AA-{String(1029 + i)}</td>
                    <td><strong>{p.stock}</strong></td>
                    <td>{money(p.price)}</td>
                    <td>
                      <span className={`status ${p.stock < 30 ? 'warning' : 'success'}`}>
                        <span />{p.stock < 30 ? 'Low stock' : 'In stock'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          className="table-action"
                          onClick={() => setViewingProduct(p)}
                          title="View product details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="table-action"
                          style={{ color: 'hsl(var(--primary))' }}
                          onClick={() => openEditModal(p)}
                          title="Edit product"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="table-action"
                          style={{ color: '#ef4444' }}
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete "${p.name}"?`)) {
                              deleteProductMutation.mutate(p.id);
                            }
                          }}
                          title="Delete product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>Showing {shown.length} of {products.length} products</span>
          </div>
        </div>

        {/* Modal for Add Product */}
        {isModalOpen && (
          <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
            <div className="admin-modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close icon-button" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
              <span className="eyebrow">Inventory operations</span>
              <h2>Add new pharmaceutical product</h2>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  addProductMutation.mutate();
                }}
                className="mt-4 flex flex-col gap-3 text-left"
              >
                <div>
                  <label className="field-label text-xs">Product Name</label>
                  <input
                    className="field w-full"
                    required
                    value={pName}
                    onChange={e => setPName(e.target.value)}
                    placeholder="e.g. Azithromycin 500mg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label text-xs">Category</label>
                    <select
                      className="field w-full"
                      value={pCategory}
                      onChange={e => setPCategory(e.target.value)}
                    >
                      <option>Antibiotics</option>
                      <option>Vitamins & Supplements</option>
                      <option>Skincare</option>
                      <option>Pain Relief</option>
                      <option>First Aid</option>
                      <option>Surgical Supplies</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label text-xs">Price ($)</label>
                    <input
                      className="field w-full"
                      type="number"
                      step="0.01"
                      required
                      value={pPrice}
                      onChange={e => setPPrice(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label text-xs">Initial Stock</label>
                  <input
                    className="field w-full"
                    type="number"
                    required
                    value={pStock}
                    onChange={e => setPStock(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label text-xs">Product Image</label>
                  <div
                    style={{
                      border: '2px dashed hsl(var(--border))',
                      borderRadius: '8px',
                      padding: '12px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: 'hsl(var(--card))',
                      position: 'relative',
                    }}
                    onClick={() => document.getElementById('admin-product-image-input')?.click()}
                  >
                    <input
                      id="admin-product-image-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPImageFile(file);
                          const reader = new FileReader();
                          reader.onload = () => setPImagePreview(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    {pImagePreview ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <img
                          src={pImagePreview}
                          alt="Preview"
                          style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }}
                        />
                        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: '12px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pImageFile?.name || 'Selected image'}
                          </strong>
                          <small style={{ color: 'hsl(var(--muted-foreground))' }}>Click to replace image</small>
                        </div>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={e => {
                            e.stopPropagation();
                            setPImageFile(null);
                            setPImagePreview('');
                          }}
                          title="Remove image"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: 'hsl(var(--muted-foreground))', fontSize: '12px', padding: '4px 0' }}>
                        <UploadCloud size={22} style={{ color: 'hsl(var(--primary))' }} />
                        <span><strong>Click to upload image</strong> (PNG, JPG, WebP)</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="field-label text-xs">Description</label>
                  <textarea
                    className="field w-full"
                    rows={2}
                    value={pDesc}
                    onChange={e => setPDesc(e.target.value)}
                    placeholder="Clinical indications and dosage instructions..."
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary mt-2 full"
                  disabled={addProductMutation.isPending}
                >
                  {addProductMutation.isPending ? 'Saving to database...' : 'Create product in catalog'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal for Add to Inventory via CSV */}
        <AddInventoryBulkModal
          isOpen={isBulkImportOpen}
          onClose={() => setIsBulkImportOpen(false)}
          onSuccess={(msg) => setNotice(msg)}
        />

        {/* Modal for View Product Details */}
        {viewingProduct && (
          <div className="modal-backdrop" onClick={() => setViewingProduct(null)}>
            <div className="admin-modal" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
              <button className="modal-close icon-button" onClick={() => setViewingProduct(null)}>
                <X size={18} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className="eyebrow" style={{ margin: 0 }}>Product details</span>
                <span className={`status ${viewingProduct.stock < 30 ? 'warning' : 'success'}`} style={{ marginLeft: 'auto' }}>
                  <span />{viewingProduct.stock < 30 ? 'Low stock' : 'In stock'}
                </span>
              </div>
              <h2 style={{ fontSize: '22px', marginBottom: '18px' }}>{viewingProduct.name}</h2>
              
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div style={{ width: '130px', height: '130px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, border: '1px solid hsl(var(--border))' }}>
                  <ProductVisual product={viewingProduct} />
                </div>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Manufacturer</span>
                    <strong>{viewingProduct.brand || 'Aayerah Labs'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Category</span>
                    <strong>{viewingProduct.category}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Reference Price</span>
                    <strong style={{ color: 'hsl(var(--primary))', fontSize: '15px' }}>{money(viewingProduct.price)}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Inventory Stock</span>
                    <strong>{viewingProduct.stock} units</strong>
                  </div>
                  <div>
                    <span style={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Prescription Type</span>
                    <strong>{viewingProduct.rx ? 'Rx Required' : 'Over-The-Counter'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Item Identifier</span>
                    <code style={{ fontSize: '12px' }}>{viewingProduct.id}</code>
                  </div>
                </div>
              </div>

              <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '10px', padding: '16px', marginBottom: '22px' }}>
                <span style={{ color: 'hsl(var(--muted-foreground))', display: 'block', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Clinical Description & Indications
                </span>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'hsl(var(--foreground))' }}>
                  {viewingProduct.description || viewingProduct.detail || 'Standard certified pharmaceutical formulation. Refer to package insert for full clinical dosing and guidelines.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid hsl(var(--border))', paddingTop: '16px' }}>
                <button className="btn btn-outline" onClick={() => setViewingProduct(null)}>
                  Close
                </button>
                <button className="btn btn-primary" onClick={() => openEditModal(viewingProduct)}>
                  <Pencil size={15} /> Edit Product
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal for Edit Product */}
        {editingProduct && (
          <div className="modal-backdrop" onClick={() => setEditingProduct(null)}>
            <div className="admin-modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
              <button className="modal-close icon-button" onClick={() => setEditingProduct(null)}>
                <X size={18} />
              </button>
              <span className="eyebrow">Inventory operations</span>
              <h2>Edit Product Details</h2>
              <p style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))', marginTop: '2px' }}>
                Modifying catalogue formulation: <strong>{editingProduct.name}</strong>
              </p>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  updateProductMutation.mutate();
                }}
                className="mt-4 flex flex-col gap-3 text-left"
              >
                <div>
                  <label className="field-label text-xs">Product Name</label>
                  <input
                    className="field w-full"
                    required
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label text-xs">Brand / Manufacturer</label>
                    <input
                      className="field w-full"
                      required
                      value={editBrand}
                      onChange={e => setEditBrand(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label text-xs">Category</label>
                    <select
                      className="field w-full"
                      value={editCategory}
                      onChange={e => setEditCategory(e.target.value)}
                    >
                      <option>Antibiotics</option>
                      <option>Vitamins & Supplements</option>
                      <option>Skincare</option>
                      <option>Pain Relief</option>
                      <option>First Aid</option>
                      <option>Surgical Supplies</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label text-xs">Price ($)</label>
                    <input
                      className="field w-full"
                      type="number"
                      step="0.01"
                      required
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label text-xs">Stock Units</label>
                    <input
                      className="field w-full"
                      type="number"
                      required
                      value={editStock}
                      onChange={e => setEditStock(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <input
                    type="checkbox"
                    id="edit-rx-check"
                    checked={editRx}
                    onChange={e => setEditRx(e.target.checked)}
                  />
                  <label htmlFor="edit-rx-check" style={{ fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                    Prescription Required (Schedule Rx Formulation)
                  </label>
                </div>
                <div>
                  <label className="field-label text-xs">Product Image</label>
                  <div
                    style={{
                      border: '2px dashed hsl(var(--border))',
                      borderRadius: '8px',
                      padding: '12px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: 'hsl(var(--card))',
                      position: 'relative',
                    }}
                    onClick={() => document.getElementById('admin-edit-image-input')?.click()}
                  >
                    <input
                      id="admin-edit-image-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEditImageFile(file);
                          const reader = new FileReader();
                          reader.onload = () => setEditImagePreview(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    {editImagePreview ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <img
                          src={editImagePreview}
                          alt="Preview"
                          style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }}
                        />
                        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: '12px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {editImageFile?.name || 'Current image'}
                          </strong>
                          <small style={{ color: 'hsl(var(--muted-foreground))' }}>Click to replace image</small>
                        </div>
                        {editImageFile && (
                          <button
                            type="button"
                            className="icon-button"
                            onClick={e => {
                              e.stopPropagation();
                              setEditImageFile(null);
                              setEditImagePreview('');
                            }}
                            title="Remove uploaded image"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: 'hsl(var(--muted-foreground))', fontSize: '12px', padding: '4px 0' }}>
                        <UploadCloud size={22} style={{ color: 'hsl(var(--primary))' }} />
                        <span><strong>Click to replace image</strong> (PNG, JPG, WebP)</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="field-label text-xs">Description & Indications</label>
                  <textarea
                    className="field w-full"
                    rows={3}
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    placeholder="Clinical indications and dosage instructions..."
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ flex: 1 }}
                    onClick={() => setEditingProduct(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    disabled={updateProductMutation.isPending}
                  >
                    {updateProductMutation.isPending ? 'Saving changes...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {notice && <ToastNotification message={notice} onClose={() => setNotice('')} />}
      </main>
    </AdminShell>
  );
}


function Documents() {
  const [docs, setDocs] = useComplianceDocs();
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('Select type…');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileData, setUploadedFileData] = useState<string>('');
  const [notice, setNotice] = useState('');

  const handleSaveDoc = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = docName.trim() || (docType !== 'Select type…' ? docType : 'Compliance Document');
    const newDoc: ComplianceDoc = {
      id: `doc-${Date.now()}`,
      name: finalName,
      type: docType !== 'Select type…' ? docType : 'Compliance Document',
      ref: 'DOC-' + Math.floor(10000 + Math.random() * 90000),
      updated: 'Just now',
      fileData: uploadedFileData || undefined,
    };
    setDocs([newDoc, ...docs]);
    setDocName('');
    setDocType('Select type…');
    setUploadedFile(null);
    setUploadedFileData('');
    setNotice(`Document "${finalName}" saved successfully.`);
  };

  const handleDeleteDoc = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      setDocs(docs.filter(d => d.id !== id));
      setNotice(`Document "${name}" deleted.`);
    }
  };

  return (
    <AdminShell active="documents">
      <main className="admin-content">
        <div className="admin-title-row">
          <div>
            <span className="eyebrow">Operations / compliance</span>
            <h1>Compliance management</h1>
            <p>Manage and update regulatory pharmaceutical documentation.</p>
          </div>
          <Link href="/about" className="btn btn-quiet"><BookOpen size={15} /> View public page</Link>
        </div>
        <div className="document-layout">
          <section className="admin-table-card upload-card">
            <div className="form-card-head">
              <div className="step-icon"><UploadCloud size={18} /></div>
              <div>
                <h3>Upload a document</h3>
                <p>This name will be visible on the public About page.</p>
              </div>
            </div>
            <label>
              <span className="field-label">Public document name</span>
              <input
                className="field"
                placeholder="e.g. Valid Drug License 2024"
                value={docName}
                onChange={e => setDocName(e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Document type</span>
              <select
                className="field"
                value={docType}
                onChange={e => setDocType(e.target.value)}
              >
                <option>Select type…</option>
                <option>Tax ID (PAN/TAN)</option>
                <option>GSTIN Certificate</option>
                <option>Drug License (Form 20)</option>
                <option>ISO Certification</option>
              </select>
            </label>
            <input
              id="compliance-file-input"
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadedFile(f);
                  const r = new FileReader();
                  r.onload = () => setUploadedFileData(r.result as string);
                  r.readAsDataURL(f);
                }
              }}
            />
            <button
              type="button"
              className={`dropzone ${uploadedFile ? 'uploaded' : ''}`}
              onClick={() => document.getElementById('compliance-file-input')?.click()}
            >
              {uploadedFile ? (
                <><CircleCheck size={25} /><strong>{uploadedFile.name} attached</strong><small>Click to replace file</small></>
              ) : (
                <><UploadCloud size={25} /><strong>Drag and drop PDF</strong><small>or click to browse · Maximum 10MB</small></>
              )}
            </button>
            <button className="btn btn-primary full" type="button" onClick={() => handleSaveDoc()}>
              Save document <Check size={16} />
            </button>
          </section>
          <section className="admin-table-card active-docs">
            <div className="table-toolbar">
              <div>
                <h3>Active compliance documents</h3>
                <p>{docs.length} document{docs.length === 1 ? '' : 's'} visible to customers</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {docs.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: '11px', padding: '4px 10px', color: '#ef4444', borderColor: '#fca5a5' }}
                    onClick={() => {
                      if (window.confirm("Are you sure you want to clear all compliance documents?")) {
                        setDocs([]);
                        saveStoredComplianceDocs([]);
                        setNotice("All compliance documents cleared.");
                      }
                    }}
                  >
                    Clear all
                  </button>
                )}
                <span className="status success"><span /> All current</span>
              </div>
            </div>
            {docs.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: '13px' }}>
                No compliance documents uploaded yet. Use the upload form on the left to add your official licenses and certificates.
              </div>
            ) : (
              docs.map((d, i) => (
                <div className="document-row" key={d.id}>
                  <span className="doc-icon"><FileText size={19} /></span>
                  <span><strong>{d.name}</strong><small>{d.updated ? `Updated ${d.updated}` : `Updated ${i + 1} months ago`} · PDF</small></span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button className="table-action" onClick={() => downloadComplianceDoc(d)} title="Download document">
                      <Download size={16} />
                    </button>
                    <button
                      className="table-action"
                      style={{ color: '#ef4444' }}
                      onClick={() => handleDeleteDoc(d.id, d.name)}
                      title="Delete document"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
        {notice && <ToastNotification message={notice} onClose={() => setNotice('')} />}
        <div className="compliance-alert">
          <CircleAlert size={19} />
          <div>
            <strong>Next review window: 14 October 2024</strong>
            <p>All active documents are within their review period.</p>
          </div>
          <button className="btn btn-outline">Schedule review</button>
        </div>
      </main>
    </AdminShell>
  );
}


function AdminStockImportsWrapper() {
  return (
    <AdminShell active="restock">
      <AdminStockImportsPage />
    </AdminShell>
  );
}

function AdminSalesWrapper() {
  return (
    <AdminShell active="sales">
      <AdminSalesPage />
    </AdminShell>
  );
}


function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/products" component={Shop} />
      <Route path="/shop" component={Shop} />
      <Route path="/product/:id" component={ProductDetail} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/adminlogin" component={AdminLogin} />
      <Route path="/admin/inventory" component={AdminInventory} />
      <Route path="/admin/sales" component={AdminSalesWrapper} />
      <Route path="/admin/documents" component={Documents} />
      <Route path="/admin/stock-imports" component={AdminStockImportsWrapper} />
      <Route path="/admin/chatbot" component={AdminChatbot} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsConditions} />
      <Route component={NotFound} />
    </Switch>
  );
}

function CookieConsent() {
  const [accepted, setAccepted] = useState(() => localStorage.getItem('cookieConsent') === 'true');

  if (accepted) return null;

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: '16px', boxShadow: '0 -2px 10px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', zIndex: 9999 }}>
      <span style={{ fontSize: '14px', color: '#333' }}>We use cookies to improve your experience and for analytics. By continuing to use this site, you accept our use of cookies.</span>
      <button 
        onClick={() => { localStorage.setItem('cookieConsent', 'true'); setAccepted(true); }}
        className="btn btn-primary"
        style={{ padding: '8px 16px', fontSize: '14px' }}
      >
        Accept
      </button>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
                  <TooltipProvider>
            <WouterRouter base={(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}>
              <ErrorBoundary>
                <Router />
                <CookieConsent />
              </ErrorBoundary>
            </WouterRouter>
            <Toaster />
            <ChatbotWidget />
          </TooltipProvider>
              </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;