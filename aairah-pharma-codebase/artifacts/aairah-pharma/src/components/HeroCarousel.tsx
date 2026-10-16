import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, Sparkles, X, ZoomIn } from 'lucide-react';

export interface HeroPhoto {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  category: string;
  src: string;
  alt: string;
  description: string;
}

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

export const HERO_PHOTOS: HeroPhoto[] = [
  {
    id: 'clinical-care',
    number: '01',
    title: 'Clinical Care & Monitoring',
    subtitle: 'Diagnostic Vitals & Patient Care',
    category: 'Clinical Medicine',
    src: `${BASE}/hero/clinical-care.jpg`,
    alt: 'Healthcare provider performing clinical diagnostic blood pressure monitoring on patient',
    description: 'Direct healthcare protocols and diagnostic vitals monitoring handled by certified clinicians.',
  },
  {
    id: 'blood-testing',
    number: '02',
    title: 'Precision Pathology',
    subtitle: 'Specimen & Biochemical Analysis',
    category: 'Laboratory Diagnostics',
    src: `${BASE}/hero/blood-testing.jpg`,
    alt: 'Sterile gloved hand holding vacuum blood collection tube for clinical diagnostics',
    description: 'Rapid diagnostic screening, specimen integrity, and certified biochemistry testing.',
  },
  {
    id: 'research-lab',
    number: '03',
    title: 'Advanced R&D Cleanroom',
    subtitle: 'Formulation & Chemical Research',
    category: 'Pharmaceutical Research',
    src: `${BASE}/hero/research-lab.jpg`,
    alt: 'Medical research scientist working in high-tech cleanroom pharmaceutical laboratory',
    description: 'State-of-the-art cleanroom facilities dedicated to high-precision pharmaceutical formulations.',
  },
  {
    id: 'manufacturing',
    number: '04',
    title: 'GMP Sterile Manufacturing',
    subtitle: 'Bioreactor & Quality Processing',
    category: 'Industrial Production',
    src: `${BASE}/hero/manufacturing.jpg`,
    alt: 'Modern pharmaceutical manufacturing facility with industrial stainless steel bioreactor tanks',
    description: 'Automated sterile production lines adhering strictly to Good Manufacturing Practices (GMP).',
  },
  {
    id: 'microscopy',
    number: '05',
    title: 'Quality & Microbiology',
    subtitle: 'Microscopic Purity Verification',
    category: 'Quality Control',
    src: `${BASE}/hero/microscopy.jpg`,
    alt: 'Biomedical laboratory technician examining cultures and compounds through optical microscope',
    description: 'Rigorous microbiological screening and batch-testing ensuring absolute chemical purity.',
  },
];

export function HeroCarousel() {
  const [selectedPhoto, setSelectedPhoto] = useState<HeroPhoto | null>(null);

  useEffect(() => {
    if (!selectedPhoto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPhoto(null);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPhoto]);

  // Duplicate photos 3 times for a completely seamless, gap-free infinite scroll on any viewport width
  const carouselItems = [...HERO_PHOTOS, ...HERO_PHOTOS, ...HERO_PHOTOS];

  return (
    <>
      <style>{`
        @keyframes hero-scroll-left {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-33.333333%, 0, 0);
          }
        }

        .hero-infinite-track {
          display: flex;
          width: max-content;
          will-change: transform;
          animation: hero-scroll-left 36s linear infinite;
        }

        .hero-infinite-track:hover {
          animation-play-state: paused;
        }

        .hero-mask-fade {
          mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 7%,
            black 93%,
            transparent 100%
          );
          -webkit-mask-image: linear-gradient(
            to right,
            transparent 0%,
            black 7%,
            black 93%,
            transparent 100%
          );
        }

        .hero-photo-card {
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.35s ease;
        }

        .hero-photo-card:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 20px 35px -8px rgba(21, 57, 69, 0.22),
                      0 10px 18px -6px rgba(21, 57, 69, 0.12);
        }
      `}</style>

      <div className="relative w-full py-4 overflow-hidden select-none">
        {/* Top subtle live indicator */}
        <div className="shell flex items-center justify-between mb-4 px-4 text-xs">
          <div className="flex items-center gap-2 text-slate-500 font-mono">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#004953] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#004953]"></span>
            </span>
            <span className="font-semibold tracking-wide text-[12px] text-[#004953]">
              Verified Facilities & Diagnostics
            </span>
          </div>
          <span className="hidden sm:inline-block text-[11px] text-slate-400 font-mono">
            Hover to pause · Click photo to inspect
          </span>
        </div>

        {/* Masked scrolling track */}
        <div className="w-full hero-mask-fade overflow-hidden">
          <div className="hero-infinite-track flex gap-5 py-3 px-2">
            {carouselItems.map((item, index) => {
              const uniqueKey = `${item.id}-${index}`;
              return (
                <div
                  key={uniqueKey}
                  onClick={() => setSelectedPhoto(item)}
                  className="hero-photo-card group relative flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-white border border-slate-200/80 shadow-md w-[260px] h-[340px] sm:w-[300px] sm:h-[380px] lg:w-[340px] lg:h-[420px]"
                >
                  {/* Image */}
                  <img
                    src={item.src}
                    alt={item.alt}
                    loading="lazy"
                    className="h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
                  />

                  {/* Top category pill */}
                  <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between pointer-events-none z-10">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-white/95 backdrop-blur-md text-[#004953] shadow-sm border border-white/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#004953]" />
                      {item.category}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-900/60 text-white backdrop-blur-sm">
                      {item.number}
                    </span>
                  </div>

                  {/* Gradient shadow for text contrast */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent opacity-90 transition-opacity group-hover:opacity-95 z-10" />

                  {/* Bottom title and information */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 text-white z-20">
                    <div className="flex items-center gap-1.5 text-emerald-300 text-[11px] font-mono font-medium mb-1 uppercase tracking-wider">
                      <BadgeCheck size={13} className="text-emerald-400" />
                      <span>{item.subtitle}</span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold font-sans tracking-tight text-white leading-snug drop-shadow-sm">
                      {item.title}
                    </h2>
                    
                    {/* Hover reveal inspection hint */}
                    <div className="flex items-center gap-1 text-[11px] text-teal-200/90 font-medium mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <ZoomIn size={13} />
                      <span>Click to view details</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scroll indicator for affordance */}
        <div className="mt-4 flex justify-center items-center gap-2 text-slate-300">
           <div className="w-24 h-1 bg-slate-200 rounded-full overflow-hidden">
             <div className="h-full bg-[#004953]/30 w-1/3 rounded-full animate-[hero-scroll-left_12s_linear_infinite]" style={{ width: '100%' }}></div>
           </div>
        </div>
      </div>

      {/* Detail Modal mounted directly to body via portal to prevent container clipping */}
      {selectedPhoto && typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setSelectedPhoto(null)}
          >
            <div
              className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Photo preview header */}
              <div className="relative w-full h-52 sm:h-64 bg-slate-900 overflow-hidden flex-shrink-0">
                <img
                  src={selectedPhoto.src}
                  alt={selectedPhoto.alt}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="absolute top-3.5 right-3.5 w-9 h-9 flex items-center justify-center rounded-full bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md transition-colors cursor-pointer z-10"
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>
                <div className="absolute bottom-3 left-3 z-10">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#004953] text-white shadow-md">
                    {selectedPhoto.category}
                  </span>
                </div>
              </div>

              {/* Scrollable text body */}
              <div className="p-5 sm:p-6 overflow-y-auto flex-1">
                <div className="flex items-center justify-between text-xs text-slate-500 font-mono mb-2">
                  <span>FACILITY #{selectedPhoto.number}</span>
                  <span className="flex items-center gap-1 text-[#004953] font-semibold">
                    <Sparkles size={13} /> Certified Laboratory Standard
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
                  {selectedPhoto.title}
                </h2>
                <p className="text-xs sm:text-sm font-semibold text-[#004953] mb-3">
                  {selectedPhoto.subtitle}
                </p>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {selectedPhoto.description}
                </p>
              </div>

              {/* Action footer */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-slate-500 font-mono">
                  Aayerah Healthcare Standard
                </span>
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#004953] text-white hover:bg-[#003840] transition-colors cursor-pointer shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
export default HeroCarousel;
