import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export interface JewelryHeroItem {
  id: number;
  code: string;
  name: string;
  src: string;
}

export const YAMIKI_SHOWCASE: JewelryHeroItem[] = [
  {
    id: 1,
    code: 'A-01',
    name: 'Anillo Flor en Plata S925',
    src: 'img/products/A-01.jpg',
  },
  {
    id: 4,
    code: 'A-04',
    name: 'Anillo Zirconias Ajustable',
    src: 'img/products/A-04.jpg',
  },
  {
    id: 37,
    code: 'A-28',
    name: 'Collar y Cadena Plata S925',
    src: 'img/products/A-28.jpg',
  },
  {
    id: 2,
    code: 'A-02',
    name: 'Anillo Solitario S925',
    src: 'img/products/A-02.jpg',
  },
];

type Role = 'center' | 'left' | 'right' | 'back';

const GRAIN_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

interface YamikiHeroProps {
  onSelectProduct?: (productId: number) => void;
  onExploreCatalog?: () => void;
}

export const YamikiHero: React.FC<YamikiHeroProps> = ({
  onSelectProduct,
  onExploreCatalog,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Preload images on mount
  useEffect(() => {
    YAMIKI_SHOWCASE.forEach((item) => {
      const img = new Image();
      img.src = item.src;
    });

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const navigate = useCallback(
    (direction: 'next' | 'prev', userInitiated = true) => {
      if (isAnimating) return;

      setIsAnimating(true);
      setActiveIndex((prev) => {
        return direction === 'next' ? (prev + 1) % 4 : (prev + 3) % 4;
      });

      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 650);

      if (userInitiated) {
        startAutoPlay();
      }

      return () => clearTimeout(timer);
    },
    [isAnimating]
  );

  const startAutoPlay = useCallback(() => {
    stopAutoPlay();
    autoPlayTimerRef.current = setInterval(() => {
      navigate('next', false);
    }, 3500);
  }, [navigate]);

  const stopAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  }, []);

  // Autonomous rotation timer & visibility handling
  useEffect(() => {
    startAutoPlay();

    const handleVisibility = () => {
      if (document.hidden) {
        stopAutoPlay();
      } else {
        startAutoPlay();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopAutoPlay();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [startAutoPlay, stopAutoPlay]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') navigate('next');
      if (e.key === 'ArrowLeft') navigate('prev');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const getRole = (index: number): Role => {
    if (index === activeIndex) return 'center';
    if (index === (activeIndex + 3) % 4) return 'left';
    if (index === (activeIndex + 1) % 4) return 'right';
    return 'back';
  };

  const getRoleStyles = (role: Role): React.CSSProperties => {
    const baseTransition =
      'transform 650ms cubic-bezier(0.4,0,0.2,1), filter 650ms cubic-bezier(0.4,0,0.2,1), opacity 650ms cubic-bezier(0.4,0,0.2,1), left 650ms cubic-bezier(0.4,0,0.2,1), height 650ms cubic-bezier(0.4,0,0.2,1), bottom 650ms cubic-bezier(0.4,0,0.2,1)';

    switch (role) {
      case 'center':
        return {
          transform: `translateX(-50%) scale(${isMobile ? 1.05 : 1.10})`,
          filter: 'blur(0px)',
          opacity: 1,
          zIndex: 25,
          left: '50%',
          height: isMobile ? '32%' : '38%',
          bottom: isMobile ? '20%' : '12%',
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'left':
        return {
          transform: `translateX(-50%) scale(${isMobile ? 0.85 : 0.95})`,
          filter: 'blur(2px)',
          opacity: isMobile ? 0.65 : 0.75,
          zIndex: 10,
          left: isMobile ? '18%' : '28%',
          height: isMobile ? '18%' : '25%',
          bottom: isMobile ? '25%' : '18%',
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'right':
        return {
          transform: `translateX(-50%) scale(${isMobile ? 0.85 : 0.95})`,
          filter: 'blur(2px)',
          opacity: isMobile ? 0.65 : 0.75,
          zIndex: 10,
          left: isMobile ? '82%' : '72%',
          height: isMobile ? '18%' : '25%',
          bottom: isMobile ? '25%' : '18%',
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'back':
      default:
        return {
          transform: `translateX(-50%) scale(${isMobile ? 0.72 : 0.85})`,
          filter: 'blur(4px)',
          opacity: isMobile ? 0.35 : 0.38,
          zIndex: 5,
          left: '50%',
          height: isMobile ? '14%' : '18%',
          bottom: isMobile ? '28%' : '22%',
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
    }
  };

  return (
    <div
      className="relative w-full overflow-hidden select-none bg-[#18231E] font-sans"
      onMouseEnter={stopAutoPlay}
      onMouseLeave={startAutoPlay}
    >
      <div className="relative w-full h-[84svh] sm:h-[88vh] min-h-[500px] max-h-[860px] overflow-hidden">
        {/* 1. Grain overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 15,
            backgroundImage: `url("${GRAIN_DATA_URI}")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '200px 200px',
            opacity: 0.3,
          }}
        />

        {/* 2. Giant ghost text "YAMIKI" (Visible y prominente arriba con tipografía unificada) */}
        <div
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none select-none z-[2]"
          style={{ top: '8%' }}
        >
          <span
            className="font-sans font-extrabold text-white/90 uppercase tracking-[0.16em] sm:tracking-[0.22em] whitespace-nowrap leading-none select-none drop-shadow-xs"
            style={{
              fontSize: 'clamp(48px, 14vw, 170px)',
            }}
          >
            YAMIKI
          </span>
        </div>

        {/* 3. Etiqueta Superior Izquierda */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-8 z-[25]">
          <span className="inline-flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-[11px] sm:text-xs font-semibold uppercase tracking-[0.14em]">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
            Joyería Plata Ley S925
          </span>
        </div>

        {/* 4. Carrusel 3D de Joyas (Rotación automática, scroll natural libre en móvil) */}
        <div className="absolute inset-0 z-[10] pointer-events-auto">
          {YAMIKI_SHOWCASE.map((item, index) => {
            const role = getRole(index);
            const style = getRoleStyles(role);

            return (
              <div
                key={item.code}
                className="absolute"
                style={{
                  ...style,
                  aspectRatio: '0.72 / 1',
                }}
              >
                <div
                  onClick={() => {
                    if (role === 'center') {
                      onSelectProduct?.(item.id);
                    } else {
                      setActiveIndex(index);
                      startAutoPlay();
                    }
                  }}
                  className="w-full h-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-[0_16px_36px_rgba(0,0,0,0.6)] cursor-pointer select-none group transition-transform duration-300"
                >
                  <img
                    src={item.src}
                    alt={item.name}
                    draggable={false}
                    className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-500"
                    style={{ objectPosition: 'center' }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* 5. Controles Inferiores Izquierda */}
        <div className="absolute bottom-5 left-4 sm:bottom-10 sm:left-10 z-[25] flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('prev')}
              disabled={isAnimating}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-white/40 text-white flex items-center justify-center bg-white/10 backdrop-blur-xs transition-all hover:scale-108 hover:bg-white/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md"
              aria-label="Pieza anterior"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.25]" />
            </button>

            <button
              type="button"
              onClick={() => navigate('next')}
              disabled={isAnimating}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-white/40 text-white flex items-center justify-center bg-white/10 backdrop-blur-xs transition-all hover:scale-108 hover:bg-white/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md"
              aria-label="Siguiente pieza"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.25]" />
            </button>
          </div>
        </div>

        {/* 6. Enlace Inferior Derecho "EXPLORAR JOYAS" */}
        <div className="absolute bottom-5 right-4 sm:bottom-10 sm:right-10 z-[25]">
          <a
            href="#catalogo"
            onClick={(e) => {
              if (onExploreCatalog) {
                e.preventDefault();
                onExploreCatalog();
              }
            }}
            className="flex items-center gap-2 text-white uppercase no-underline transition-opacity duration-200 opacity-90 hover:opacity-100 group font-sans font-bold tracking-[0.1em] leading-none text-xs sm:text-sm md:text-base"
          >
            <span>EXPLORAR JOYAS</span>
            <ArrowRight
              className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.25] transition-transform duration-200 group-hover:translate-x-1"
            />
          </a>
        </div>
      </div>
    </div>
  );
};

export default YamikiHero;
