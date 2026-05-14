
// Standalone animation definitions - no dependencies
export const fadeIn = {
  from: { opacity: 0 },
  to: { opacity: 1 },
  duration: 300,
};

export const slideUp = {
  from: { transform: 'translateY(20px)', opacity: 0 },
  to: { transform: 'translateY(0)', opacity: 1 },
  duration: 400,
};

export const scaleIn = {
  from: { transform: 'scale(0.9)', opacity: 0 },
  to: { transform: 'scale(1)', opacity: 1 },
  duration: 250,
};

export const EASING = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
};
