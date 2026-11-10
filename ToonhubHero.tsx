import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export interface ToonhubImage {
  src: string;
  bg: string;
  panel: string;
}

export const IMAGES: ToonhubImage[] = [
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png',
    bg: '#F4845F',
    panel: '#F79B7F',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/2.b977faab.png',
    bg: '#6BBF7A',
    panel: '#85CC92',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/3.4df853b4.png',
    bg: '#E882B4',
    panel: '#ED9DC4',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/4.4457fbce.png',
    bg: '#6EB5FF',
    panel: '#8DC4FF',
  },
];

type Role = 'center' | 'left' | 'right' | 'back';

const GRAIN_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

export const ToonhubHero: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Preload all 4 images on mount
  useEffect(() => {
    IMAGES.forEach((item) => {
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
    (direction: 'next' | 'prev') => {
      if (isAnimating) return;

      setIsAnimating(true);
      setActiveIndex((prev) => {
        return direction === 'next' ? (prev + 1) % 4 : (prev + 3) % 4;
      });

      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 650);

      return () => clearTimeout(timer);
    },
    [isAnimating]
  );

  // Keyboard navigation support (Arrow keys)
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
          transform: `translateX(-50%) scale(${isMobile ? 1.25 : 1.68})`,
          filter: 'blur(0px)',
          opacity: 1,
          zIndex: 20,
          left: '50%',
          height: isMobile ? '60%' : '92%',
          bottom: isMobile ? '22%' : 0,
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'left':
        return {
          transform: 'translateX(-50%) scale(1)',
          filter: 'blur(2px)',
          opacity: 0.85,
          zIndex: 10,
          left: isMobile ? '20%' : '30%',
          height: isMobile ? '16%' : '28%',
          bottom: isMobile ? '32%' : '12%',
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'right':
        return {
          transform: 'translateX(-50%) scale(1)',
          filter: 'blur(2px)',
          opacity: 0.85,
          zIndex: 10,
          left: isMobile ? '80%' : '70%',
          height: isMobile ? '16%' : '28%',
          bottom: isMobile ? '32%' : '12%',
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
      case 'back':
      default:
        return {
          transform: 'translateX(-50%) scale(1)',
          filter: 'blur(4px)',
          opacity: 1,
          zIndex: 5,
          left: '50%',
          height: isMobile ? '13%' : '22%',
          bottom: isMobile ? '32%' : '12%',
          transition: baseTransition,
          willChange: 'transform, filter, opacity, left, height, bottom',
        };
    }
  };

  const currentBg = IMAGES[activeIndex]?.bg ?? '#F4845F';

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{
        backgroundColor: currentBg,
        transition: 'background-color 650ms cubic-bezier(0.4, 0, 0.2, 1)',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div className="relative w-full h-screen overflow-hidden">
        {/* 1. Grain overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 50,
            backgroundImage: `url("${GRAIN_DATA_URI}")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '200px 200px',
            opacity: 0.4,
          }}
        />

        {/* 2. Giant ghost text "3D SHAPE" */}
        <div
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none select-none"
          style={{
            zIndex: 2,
            top: '18%',
          }}
        >
          <span
            style={{
              fontFamily: "'Anton', sans-serif",
              fontSize: 'clamp(90px, 28vw, 380px)',
              fontWeight: 900,
              color: '#FFFFFF',
              opacity: 1,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
            }}
          >
            3D SHAPE
          </span>
        </div>

        {/* 3. Top-left brand label "TOONHUB" */}
        <div
          className="absolute top-6 left-4 sm:left-8"
          style={{
            zIndex: 60,
          }}
        >
          <span
            className="text-xs font-semibold uppercase text-white"
            style={{
              opacity: 0.9,
              letterSpacing: '0.18em',
            }}
          >
            TOONHUB
          </span>
        </div>

        {/* 4. Carousel */}
        <div className="absolute inset-0" style={{ zIndex: 3 }}>
          {IMAGES.map((item, index) => {
            const role = getRole(index);
            const style = getRoleStyles(role);

            return (
              <div
                key={item.src}
                className="absolute"
                style={{
                  ...style,
                  aspectRatio: '0.6 / 1',
                }}
              >
                <img
                  src={item.src}
                  alt={`Toonhub Figurine ${index + 1}`}
                  draggable={false}
                  className="w-full h-full object-contain pointer-events-none"
                  style={{
                    objectPosition: 'bottom center',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* 5. Bottom-left text + nav buttons */}
        <div
          className="absolute bottom-6 left-4 sm:bottom-20 sm:left-24"
          style={{
            zIndex: 60,
            maxWidth: '320px',
          }}
        >
          <p
            className="font-bold uppercase tracking-widest text-white mb-2 sm:mb-3 text-base sm:text-[22px]"
            style={{
              opacity: 0.95,
              letterSpacing: '0.02em',
            }}
          >
            TOONHUB FIGURINES
          </p>

          <p
            className="hidden sm:block text-xs sm:text-sm text-white mb-4 sm:mb-5"
            style={{
              opacity: 0.85,
              lineHeight: 1.6,
            }}
          >
            The artwork is stunning, shipped fully prepared. The finish is a
            vision, the 3D craft is flawless. Many thanks! Wishing you the win.
            Order now.
          </p>

          {/* Navigation Buttons */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => navigate('prev')}
              disabled={isAnimating}
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 border-white text-white bg-transparent transition-all duration-150 hover:scale-108 hover:bg-white/[0.12] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Previous figurine"
            >
              <ArrowLeft className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.25} />
            </button>

            <button
              type="button"
              onClick={() => navigate('next')}
              disabled={isAnimating}
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 border-white text-white bg-transparent transition-all duration-150 hover:scale-108 hover:bg-white/[0.12] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Next figurine"
            >
              <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* 6. Bottom-right link "DISCOVER IT" */}
        <div
          className="absolute bottom-6 right-4 sm:bottom-20 sm:right-10"
          style={{
            zIndex: 60,
          }}
        >
          <a
            href="#discover"
            className="flex items-center gap-2 sm:gap-3 text-white uppercase no-underline transition-opacity duration-200 opacity-95 hover:opacity-100 group"
            style={{
              fontFamily: "'Anton', sans-serif",
              fontSize: 'clamp(20px, 4vw, 56px)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            <span>DISCOVER IT</span>
            <ArrowRight
              className="w-5 h-5 sm:w-8 sm:h-8 transition-transform duration-200 group-hover:translate-x-1"
              strokeWidth={2.25}
            />
          </a>
        </div>
      </div>
    </div>
  );
};

export default ToonhubHero;
